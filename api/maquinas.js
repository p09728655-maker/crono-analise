/**
 * Cadastro de maquinas — a lista que padroniza o nome digitado.
 *
 * Maquina era texto livre na conferencia rapida, e o mesmo posto saia
 * escrito de tres jeitos. O agrupamento por chave normalizada juntou o
 * historico; este cadastro ataca a causa: o celular oferece a lista e
 * digitar vira excecao. A conferencia continua GRAVANDO texto — o
 * cadastro padroniza a entrada, nao muda o formato da fila offline.
 *
 * Regras, espelhadas do cadastro de motivos:
 *  - Maquina em uso NAO se exclui, se DESATIVA: some da escolha do celular
 *    e continua nomeando o historico.
 *  - Renomear vale para as PROXIMAS medicoes; as antigas ficam com o nome
 *    gravado (e o agrupamento normalizado segue juntando o que for igual).
 */
import { autenticar, exigirPapel } from './_lib/auth.js';
import { ErroHttp, erroValidacao, handler, json, lerCorpo, naoEncontrado, permitir } from './_lib/http.js';
import { texto, uuid } from './_lib/validar.js';

// Nome canonico: apara e recolhe espaco repetido. Caixa e acento ficam —
// e' o nome EXIBIDO; a unicidade compara sem caixa (indice lower/btrim).
const nomeLimpo = (v) => String(v || '').trim().replace(/\s+/g, ' ');

// Grupo antes de nome: e' a ordem em que o celular monta a escolha
// (Furadeiras juntas, Seccionadoras juntas); sem grupo vai para o fim.
const listar = (db, empresaId) => db`
  SELECT id, nome, grupo, ativa FROM maquinas
   WHERE empresa_id = ${empresaId}
   ORDER BY (grupo IS NULL), lower(coalesce(grupo, '')), lower(nome)`;

// "Em uso" olha as conferencias pela mesma comparacao da unicidade.
async function emUso(db, empresaId, nome) {
  const [usada] = await db`
    SELECT 1 AS usada FROM conferencias
     WHERE empresa_id = ${empresaId}
       AND lower(btrim(maquina)) = lower(btrim(${nome}))
     LIMIT 1`;
  return Boolean(usada);
}

export default handler(async (req, res) => {
  permitir(req, ['GET', 'POST', 'PATCH', 'DELETE']);
  const auth = await autenticar(req);
  const { empresaId } = auth;
  const id = req.query?.id;

  if (req.method === 'GET') {
    return auth.rls(async (db) => json(res, 200, { maquinas: await listar(db, empresaId) }));
  }

  exigirPapel(auth, ['admin'], 'So o administrador altera o cadastro de maquinas');
  return auth.rls(async (db) => {

    if (req.method === 'POST') {
      const corpo = await lerCorpo(req);

      /**
       * Carga inicial: os nomes que as conferencias JA usaram.
       *
       * A primeira visita nao pode pedir redigitacao do que o banco ja
       * sabe. Uma grafia por maquina (a mais recente), espacos recolhidos;
       * repetir a carga nao duplica.
       */
      if (corpo.dasConferencias) {
        await db`
          INSERT INTO maquinas (empresa_id, nome)
          SELECT DISTINCT ON (lower(btrim(maquina)))
                 ${empresaId}, btrim(regexp_replace(maquina, '\\s+', ' ', 'g'))
            FROM conferencias
           WHERE empresa_id = ${empresaId} AND maquina IS NOT NULL AND btrim(maquina) <> ''
           ORDER BY lower(btrim(maquina)), salvo_em DESC
          ON CONFLICT DO NOTHING`;
        return json(res, 201, { maquinas: await listar(db, empresaId) });
      }

      const nome = nomeLimpo(texto(corpo.nome, 'nome', { obrigatorio: true, max: 120 }));
      if (!nome) throw erroValidacao('Informe o nome da maquina');
      const grupo = nomeLimpo(texto(corpo.grupo, 'grupo', { max: 60 })) || null;

      const [existe] = await db`
        SELECT nome FROM maquinas
         WHERE empresa_id = ${empresaId} AND lower(btrim(nome)) = lower(${nome})`;
      if (existe) throw new ErroHttp(409, `Ja existe esta maquina no cadastro: "${existe.nome}"`);

      const [maquina] = await db`
        INSERT INTO maquinas (empresa_id, nome, grupo) VALUES (${empresaId}, ${nome}, ${grupo})
        RETURNING id, nome, grupo, ativa`;
      return json(res, 201, { maquina });
    }

    if (req.method === 'PATCH') {
      const maquinaId = uuid(id, 'id');
      const corpo = await lerCorpo(req);
      const [atual] = await db`
        SELECT id FROM maquinas WHERE id = ${maquinaId} AND empresa_id = ${empresaId}`;
      if (!atual) throw naoEncontrado('Maquina nao encontrada');

      const tem = (chave) => Object.prototype.hasOwnProperty.call(corpo, chave);
      if (!tem('nome') && !tem('ativa') && !tem('grupo')) {
        throw erroValidacao('Nada a atualizar: informe "nome", "grupo" ou "ativa"');
      }

      if (tem('nome')) {
        const nome = nomeLimpo(texto(corpo.nome, 'nome', { obrigatorio: true, max: 120 }));
        if (!nome) throw erroValidacao('Informe o nome da maquina');
        const [outra] = await db`
          SELECT nome FROM maquinas
           WHERE empresa_id = ${empresaId} AND lower(btrim(nome)) = lower(${nome}) AND id <> ${maquinaId}`;
        if (outra) throw new ErroHttp(409, `Ja existe esta maquina no cadastro: "${outra.nome}"`);
        await db`UPDATE maquinas SET nome = ${nome} WHERE id = ${maquinaId}`;
      }
      if (tem('grupo')) {
        // Vazio LIMPA o grupo: e' o caminho de tirar uma maquina de um
        // grupo errado sem inventar um "sem grupo" literal.
        const grupo = nomeLimpo(texto(corpo.grupo, 'grupo', { max: 60 })) || null;
        await db`UPDATE maquinas SET grupo = ${grupo} WHERE id = ${maquinaId}`;
      }
      if (tem('ativa')) {
        await db`UPDATE maquinas SET ativa = ${Boolean(corpo.ativa)} WHERE id = ${maquinaId}`;
      }

      const [maquina] = await db`SELECT id, nome, grupo, ativa FROM maquinas WHERE id = ${maquinaId}`;
      return json(res, 200, { maquina });
    }

    const maquinaId = uuid(id, 'id');
    const [maquina] = await db`
      SELECT nome FROM maquinas WHERE id = ${maquinaId} AND empresa_id = ${empresaId}`;
    if (!maquina) throw naoEncontrado('Maquina nao encontrada');

    if (await emUso(db, empresaId, maquina.nome)) {
      throw erroValidacao(
        `"${maquina.nome}" ja tem conferencias registradas. Desative-a em vez de excluir: `
        + 'ela some da escolha do celular e o historico continua com o nome certo.',
      );
    }

    await db`DELETE FROM maquinas WHERE id = ${maquinaId} AND empresa_id = ${empresaId}`;
    return json(res, 200, { acao: 'excluida' });
  });
});
