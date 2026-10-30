/**
 * PRODUTOS — o cadastro do que vai para cronoanalise, por grupo de maquina.
 *
 * POR QUE AQUI DENTRO, E NAO NUM api/produtos.js PROPRIO: o plano da Vercel
 * aceita 12 funcoes por deploy e o projeto esta' no teto — o arquivo
 * proprio seria a 13a e derrubaria o deploy inteiro (PR #73, ver
 * api/_lib/demanda.js). Quem expoe a rota e' api/maquinas.js, com
 * ?produtos=1; e o assunto casa: o produto e' de um GRUPO de maquina.
 *
 * Regras, espelhadas do cadastro de maquinas:
 *  - O tablet grava o NOME (texto) na conferencia; o cadastro padroniza a
 *    entrada, nao muda o formato da fila offline.
 *  - Produto em uso NAO se exclui, se DESATIVA: some do tablet e o
 *    historico continua com o nome certo.
 *  - Quem faz analise mantem (admin ou analista): escolher o que vai para
 *    cronoanalise e' trabalho de PCP, como o programa da semana — a mesma
 *    regra de pode_escrever() que a RLS aplica no banco.
 *  - O TABLET (coletor) so' CADASTRA, e so' o nome (v2.97.0): o produto
 *    que nao esta' na lista entra antes de medir, em vez de virar texto
 *    livre. Codigo do ERP, renomear, desativar e excluir ficam com o PCP —
 *    a politica produtos_coleta_cadastra diz o mesmo no banco.
 */
import { exigirPapel } from './auth.js';
import { ErroHttp, erroValidacao, json, lerCorpo, naoEncontrado } from './http.js';
import { texto, uuid } from './validar.js';

// Nome canonico: apara e recolhe espaco repetido. Caixa e acento ficam —
// e' o nome EXIBIDO; a unicidade compara sem caixa (indice lower/btrim).
const nomeLimpo = (v) => String(v || '').trim().replace(/\s+/g, ' ');

/** Codigo do ERP: opcional; vazio apaga. */
const codigoLimpo = (v) => nomeLimpo(texto(v, 'codigo', { max: 30 })) || null;

/** Na ordem da escolha no tablet: grupo (pelo codigo), depois o nome. */
export const listarProdutos = (db, empresaId) => db`
  SELECT p.id, p.nome, p.codigo, p.ativo, p.grupo_id
    FROM produtos p
    JOIN grupos_maquina g ON g.id = p.grupo_id
   WHERE p.empresa_id = ${empresaId}
   ORDER BY g.codigo, lower(p.nome)`;

async function grupoValido(db, empresaId, valor) {
  if (valor == null || valor === '') throw erroValidacao('Escolha o grupo de máquina do produto');
  const id = uuid(valor, 'grupoId');
  const [g] = await db`SELECT id FROM grupos_maquina WHERE id = ${id} AND empresa_id = ${empresaId}`;
  if (!g) throw naoEncontrado('Grupo de maquina nao encontrado');
  return id;
}

async function repetido(db, empresaId, grupoId, nome, outroQue = null) {
  const [existe] = await db`
    SELECT nome FROM produtos
     WHERE empresa_id = ${empresaId} AND grupo_id = ${grupoId}
       AND lower(btrim(nome)) = lower(${nome})
       AND (${outroQue}::uuid IS NULL OR id <> ${outroQue}::uuid)`;
  if (existe) throw new ErroHttp(409, `Ja existe este produto no grupo: "${existe.nome}"`);
}

// "Em uso" olha as conferencias pela mesma comparacao da unicidade.
async function emUso(db, empresaId, nome) {
  const [usado] = await db`
    SELECT 1 AS usado FROM conferencias
     WHERE empresa_id = ${empresaId} AND lower(btrim(peca)) = lower(btrim(${nome}))
     LIMIT 1`;
  return Boolean(usado);
}

export async function produtos(req, res, auth) {
  const { empresaId } = auth;
  const id = req.query?.id;

  if (req.method === 'GET') {
    return auth.rls(async (db) => json(res, 200, { produtos: await listarProdutos(db, empresaId) }));
  }

  const cadastrando = req.method === 'POST';
  exigirPapel(
    auth,
    cadastrando ? ['admin', 'analista', 'coletor'] : ['admin', 'analista'],
    cadastrando ? 'Seu acesso não cadastra produto' : 'So quem faz analise altera o cadastro de produtos',
  );
  return auth.rls(async (db) => {
    if (cadastrando) {
      const corpo = await lerCorpo(req);
      const nome = nomeLimpo(texto(corpo.nome, 'nome', { obrigatorio: true, max: 120 }));
      if (!nome) throw erroValidacao('Informe o nome do produto');
      const grupoId = await grupoValido(db, empresaId, corpo.grupoId);
      const codigo = codigoLimpo(corpo.codigo);
      // Recusado com o porque, nao ignorado: codigo que some sem aviso
      // parece gravado. O tablet nunca manda; quem manda e' outro cliente.
      if (codigo && auth.papel === 'coletor') {
        throw new ErroHttp(403, 'O código do ERP é cadastrado no PC, pelo PCP');
      }
      await repetido(db, empresaId, grupoId, nome);

      const [produto] = await db`
        INSERT INTO produtos (empresa_id, grupo_id, nome, codigo)
        VALUES (${empresaId}, ${grupoId}, ${nome}, ${codigo})
        RETURNING id, nome, codigo, ativo, grupo_id`;
      return json(res, 201, { produto });
    }

    const produtoId = uuid(id, 'id');
    const [atual] = await db`
      SELECT id, nome, grupo_id FROM produtos WHERE id = ${produtoId} AND empresa_id = ${empresaId}`;
    if (!atual) throw naoEncontrado('Produto nao encontrado');

    if (req.method === 'PATCH') {
      const corpo = await lerCorpo(req);
      const tem = (chave) => Object.prototype.hasOwnProperty.call(corpo, chave);
      const campos = ['nome', 'codigo', 'grupoId', 'ativo'];
      if (!campos.some(tem)) {
        throw erroValidacao(`Nada a atualizar: informe ${campos.map((c) => `"${c}"`).join(', ')}`);
      }

      // TUDO VALIDADO ANTES DO PRIMEIRO UPDATE (a regra do cadastro de
      // maquinas): nome novo nao fica gravado com o grupo recusado.
      let nome;
      if (tem('nome')) {
        nome = nomeLimpo(texto(corpo.nome, 'nome', { obrigatorio: true, max: 120 }));
        if (!nome) throw erroValidacao('Informe o nome do produto');
      }
      const grupoId = tem('grupoId') ? await grupoValido(db, empresaId, corpo.grupoId) : undefined;
      if (nome !== undefined || grupoId !== undefined) {
        await repetido(db, empresaId, grupoId ?? atual.grupo_id, nome ?? atual.nome, produtoId);
      }
      const codigo = tem('codigo') ? codigoLimpo(corpo.codigo) : undefined;

      if (nome !== undefined) await db`UPDATE produtos SET nome = ${nome} WHERE id = ${produtoId}`;
      if (grupoId !== undefined) await db`UPDATE produtos SET grupo_id = ${grupoId} WHERE id = ${produtoId}`;
      if (codigo !== undefined) await db`UPDATE produtos SET codigo = ${codigo} WHERE id = ${produtoId}`;
      if (tem('ativo')) await db`UPDATE produtos SET ativo = ${Boolean(corpo.ativo)} WHERE id = ${produtoId}`;

      const [produto] = await db`
        SELECT id, nome, codigo, ativo, grupo_id FROM produtos WHERE id = ${produtoId}`;
      return json(res, 200, { produto });
    }

    if (await emUso(db, empresaId, atual.nome)) {
      throw erroValidacao(
        `"${atual.nome}" ja tem medicoes registradas. Desative-o em vez de excluir: `
        + 'ele some do tablet e o historico continua com o nome certo.',
      );
    }
    await db`DELETE FROM produtos WHERE id = ${produtoId} AND empresa_id = ${empresaId}`;
    return json(res, 200, { acao: 'excluido' });
  });
}
