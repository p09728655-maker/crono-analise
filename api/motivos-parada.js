/**
 * Cadastro dos motivos de parada.
 *
 * A lista mestre que a coleta oferece ("por que parou?") e o relatorio
 * interpreta. Antes ela vivia no codigo, e incluir um motivo novo exigia
 * deploy — quem conhece a fabrica nao tinha caminho nenhum ate' ela.
 *
 * Duas regras dao forma a esta API:
 *
 *  - O CODIGO nao muda depois de criado. Ele e' o que fica gravado em cada
 *    parada ja' registrada; troca-lo transformaria historico em orfao. O
 *    rotulo e a acao mudam a' vontade, e a mudanca vale para tras.
 *
 *  - Motivo em uso NAO se exclui, se DESATIVA. Desativado some da coleta e
 *    continua nomeando as paradas antigas. Excluir so' passa quando nada no
 *    banco aponta para aquele codigo — e' o caso do motivo criado errado.
 */
import { sql } from './_lib/db.js';
import { autenticar } from './_lib/auth.js';
import { ErroHttp, erroValidacao, handler, json, lerCorpo, naoEncontrado, permitir } from './_lib/http.js';
import { inteiro, lista, texto, uuid } from './_lib/validar.js';

const RE_CODIGO = /^[a-z][a-z0-9_]{1,39}$/;

/**
 * Codigo canonico a partir do que o usuario digitou.
 *
 * O analista digita "Falta de energia"; o banco guarda "falta_de_energia".
 * Sem isso ele teria de entender a diferenca entre codigo e rotulo para
 * cadastrar um motivo — que e' exatamente o tipo de exigencia que faz
 * ninguem usar a tela.
 */
function codigoDe(valor) {
  const bruto = String(valor || '').trim().toLowerCase();
  const limpo = bruto
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // tira acento
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  if (!RE_CODIGO.test(limpo)) {
    throw erroValidacao(
      'Nao foi possivel gerar um codigo para este motivo. Use letras e numeros no nome.',
    );
  }
  return limpo;
}

/** Motivo ja' usado por alguma parada — de estudo ou de conferencia. */
async function estaEmUso(empresaId, codigo, rotulo) {
  const [daColeta] = await sql`
    SELECT 1 AS usado
      FROM paradas p
      JOIN operacoes o ON o.id = p.operacao_id
      JOIN estudos e   ON e.id = o.estudo_id
     WHERE e.empresa_id = ${empresaId} AND p.motivo IN (${codigo}, ${rotulo})
     LIMIT 1`;
  if (daColeta) return true;

  // A parada da conferencia mora no jsonb da propria linha.
  const [daConferencia] = await sql`
    SELECT 1 AS usado
      FROM conferencias
     WHERE empresa_id = ${empresaId}
       AND (paradas @> ${JSON.stringify([{ motivo: codigo }])}::jsonb
         OR paradas @> ${JSON.stringify([{ motivo: rotulo }])}::jsonb)
     LIMIT 1`;
  return Boolean(daConferencia);
}

const listar = (empresaId) => sql`
  SELECT id, codigo, rotulo, acao, ordem, ativo
    FROM motivos_parada
   WHERE empresa_id = ${empresaId}
   ORDER BY ordem, criado_em`;

export default handler(async (req, res) => {
  permitir(req, ['GET', 'POST', 'PATCH', 'DELETE']);
  const { empresaId } = await autenticar(req);
  const id = req.query?.id;

  if (req.method === 'GET') {
    return json(res, 200, { motivos: await listar(empresaId) });
  }

  if (req.method === 'POST') {
    const corpo = await lerCorpo(req);

    /**
     * Carga inicial: grava de uma vez a lista que o app ja' usava.
     *
     * Sem ela a primeira visita a' tela mostraria um cadastro vazio e
     * pediria que o analista redigitasse os nove motivos que ele ja' via na
     * coleta — trabalho que o proprio app pode fazer.
     */
    if (Array.isArray(corpo.motivos)) {
      const itens = lista(corpo.motivos, 'motivos', { max: 100 }).map((m, i) => ({
        codigo: codigoDe(m?.codigo || m?.rotulo),
        rotulo: texto(m?.rotulo, `motivos[${i}].rotulo`, { obrigatorio: true, max: 60 }),
        acao: texto(m?.acao, `motivos[${i}].acao`, { max: 300 }),
        ordem: i,
      }));
      for (const m of itens) {
        // ON CONFLICT DO NOTHING: repetir a carga nao duplica nem sobrescreve
        // o que o analista ja' ajustou a mao.
        await sql`
          INSERT INTO motivos_parada (empresa_id, codigo, rotulo, acao, ordem)
          VALUES (${empresaId}, ${m.codigo}, ${m.rotulo}, ${m.acao}, ${m.ordem})
          ON CONFLICT (empresa_id, codigo) DO NOTHING`;
      }
      return json(res, 201, { motivos: await listar(empresaId) });
    }

    const rotulo = texto(corpo.rotulo, 'rotulo', { obrigatorio: true, max: 60 });
    const codigo = codigoDe(corpo.codigo || rotulo);
    const acao = texto(corpo.acao, 'acao', { max: 300 });

    const [existe] = await sql`
      SELECT rotulo FROM motivos_parada WHERE empresa_id = ${empresaId} AND codigo = ${codigo}`;
    if (existe) {
      throw new ErroHttp(409, `Ja existe um motivo com este codigo: "${existe.rotulo}"`);
    }

    const [{ proxima }] = await sql`
      SELECT coalesce(max(ordem) + 1, 0) AS proxima
        FROM motivos_parada WHERE empresa_id = ${empresaId}`;
    const [motivo] = await sql`
      INSERT INTO motivos_parada (empresa_id, codigo, rotulo, acao, ordem)
      VALUES (${empresaId}, ${codigo}, ${rotulo}, ${acao}, ${proxima})
      RETURNING id, codigo, rotulo, acao, ordem, ativo`;
    return json(res, 201, { motivo });
  }

  if (req.method === 'PATCH') {
    const corpo = await lerCorpo(req);

    /**
     * Reordenar chega SEM id, com a lista inteira na ordem final.
     *
     * Trocar dois vizinhos com dois PATCH separados deixaria a lista em
     * estado invalido entre as duas chamadas se a segunda falhasse.
     */
    if (!id && Array.isArray(corpo.ordem)) {
      const ids = lista(corpo.ordem, 'ordem', { max: 100 }).map((v, i) => uuid(v, `ordem[${i}]`));
      await sql.begin(async (tx) => {
        for (const [i, motivoId] of ids.entries()) {
          await tx`
            UPDATE motivos_parada SET ordem = ${i}
             WHERE id = ${motivoId} AND empresa_id = ${empresaId}`;
        }
      });
      return json(res, 200, { motivos: await listar(empresaId) });
    }

    const motivoId = uuid(id, 'id');
    const [atual] = await sql`
      SELECT id, codigo FROM motivos_parada WHERE id = ${motivoId} AND empresa_id = ${empresaId}`;
    if (!atual) throw naoEncontrado('Motivo de parada nao encontrado');

    const tem = (chave) => Object.prototype.hasOwnProperty.call(corpo, chave);
    if (tem('codigo')) {
      throw erroValidacao(
        'O codigo de um motivo nao muda: ele e o que identifica as paradas ja registradas. '
        + 'Para trocar o nome que aparece na tela, mande "rotulo".',
      );
    }
    if (!tem('rotulo') && !tem('acao') && !tem('ativo') && !tem('ordem')) {
      throw erroValidacao('Nada a atualizar: informe "rotulo", "acao", "ativo" ou "ordem"');
    }

    if (tem('rotulo')) {
      const rotulo = texto(corpo.rotulo, 'rotulo', { obrigatorio: true, max: 60 });
      await sql`UPDATE motivos_parada SET rotulo = ${rotulo} WHERE id = ${motivoId}`;
    }
    if (tem('acao')) {
      await sql`UPDATE motivos_parada SET acao = ${texto(corpo.acao, 'acao', { max: 300 })} WHERE id = ${motivoId}`;
    }
    if (tem('ativo')) {
      await sql`UPDATE motivos_parada SET ativo = ${Boolean(corpo.ativo)} WHERE id = ${motivoId}`;
    }
    if (tem('ordem')) {
      const ordem = inteiro(corpo.ordem, 'ordem', { min: 0, max: 999, padrao: 0 });
      await sql`UPDATE motivos_parada SET ordem = ${ordem} WHERE id = ${motivoId}`;
    }

    const [motivo] = await sql`
      SELECT id, codigo, rotulo, acao, ordem, ativo FROM motivos_parada WHERE id = ${motivoId}`;
    return json(res, 200, { motivo });
  }

  const motivoId = uuid(id, 'id');
  const [motivo] = await sql`
    SELECT codigo, rotulo FROM motivos_parada WHERE id = ${motivoId} AND empresa_id = ${empresaId}`;
  if (!motivo) throw naoEncontrado('Motivo de parada nao encontrado');

  if (await estaEmUso(empresaId, motivo.codigo, motivo.rotulo)) {
    throw erroValidacao(
      `"${motivo.rotulo}" ja foi usado em paradas registradas. Desative-o em vez de excluir: `
      + 'ele some da coleta e as paradas antigas continuam com o nome certo.',
    );
  }

  await sql`DELETE FROM motivos_parada WHERE id = ${motivoId} AND empresa_id = ${empresaId}`;
  return json(res, 200, { acao: 'excluido' });
});
