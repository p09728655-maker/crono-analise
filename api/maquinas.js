/**
 * Cadastro de maquinas E de grupos de maquina — a padronizacao na origem.
 *
 * Maquina era texto livre na conferencia rapida, e o mesmo posto saia
 * escrito de tres jeitos. O cadastro ataca a causa: o celular oferece a
 * lista e digitar vira excecao. Os GRUPOS levam o CODIGO da fabrica
 * (padrao ERP): 0001 SECCIONADORA, 0002 FURADEIRA... — o codigo identifica
 * e ordena, o nome aparece.
 *
 * Grupos moram NESTE endpoint de proposito: o plano da Vercel limita o
 * numero de funcoes e este projeto ja' esta' no teto. Sub-recurso via
 * query (?grupo=<id>) e corpo ({ grupo: {...} }) resolve sem funcao nova.
 *
 * Regras, espelhadas do cadastro de motivos:
 *  - Maquina em uso NAO se exclui, se DESATIVA: some da escolha do celular
 *    e continua nomeando o historico.
 *  - Excluir um GRUPO nunca apaga maquina: ela so' fica sem grupo (FK com
 *    ON DELETE SET NULL).
 *  - A conferencia continua gravando TEXTO — o cadastro padroniza a
 *    entrada, nao muda o formato da fila offline.
 */
import { autenticar, exigirPapel } from './_lib/auth.js';
import { ErroHttp, erroValidacao, handler, json, lerCorpo, naoEncontrado, permitir } from './_lib/http.js';
import { texto, uuid } from './_lib/validar.js';

// Nome canonico: apara e recolhe espaco repetido. Caixa e acento ficam —
// e' o nome EXIBIDO; a unicidade compara sem caixa (indice lower/btrim).
const nomeLimpo = (v) => String(v || '').trim().replace(/\s+/g, ' ');

// Codigo do grupo: so' digitos, como no ERP. "1" e "0001" sao codigos
// DIFERENTES de proposito — o codigo e' o que a fabrica diz que e'.
function codigoDe(valor) {
  const codigo = String(valor || '').trim();
  if (!/^[0-9]{1,10}$/.test(codigo)) {
    throw erroValidacao('O código do grupo é numérico (ex: 0001), com até 10 dígitos');
  }
  return codigo;
}

const listarGrupos = (db, empresaId) => db`
  SELECT id, codigo, nome FROM grupos_maquina
   WHERE empresa_id = ${empresaId}
   ORDER BY codigo`;

// Grupo (pelo codigo) antes do nome: e' a ordem da escolha no celular.
const listarMaquinas = (db, empresaId) => db`
  SELECT m.id, m.nome, m.ativa, m.grupo_id,
         g.codigo AS grupo_codigo, g.nome AS grupo_nome
    FROM maquinas m
    LEFT JOIN grupos_maquina g ON g.id = m.grupo_id
   WHERE m.empresa_id = ${empresaId}
   ORDER BY (g.codigo IS NULL), g.codigo, lower(m.nome)`;

const cadastro = async (db, empresaId) => ({
  maquinas: await listarMaquinas(db, empresaId),
  grupos: await listarGrupos(db, empresaId),
});

// "Em uso" olha as conferencias pela mesma comparacao da unicidade.
async function emUso(db, empresaId, nome) {
  const [usada] = await db`
    SELECT 1 AS usada FROM conferencias
     WHERE empresa_id = ${empresaId}
       AND lower(btrim(maquina)) = lower(btrim(${nome}))
     LIMIT 1`;
  return Boolean(usada);
}

async function grupoValido(db, empresaId, grupoId) {
  if (grupoId == null || grupoId === '') return null;
  const id = uuid(grupoId, 'grupoId');
  const [g] = await db`
    SELECT id FROM grupos_maquina WHERE id = ${id} AND empresa_id = ${empresaId}`;
  if (!g) throw naoEncontrado('Grupo de maquina nao encontrado');
  return id;
}

export default handler(async (req, res) => {
  permitir(req, ['GET', 'POST', 'PATCH', 'DELETE']);
  const auth = await autenticar(req);
  const { empresaId } = auth;
  const id = req.query?.id;
  const grupoParam = req.query?.grupo;

  if (req.method === 'GET') {
    return auth.rls(async (db) => json(res, 200, await cadastro(db, empresaId)));
  }

  exigirPapel(auth, ['admin'], 'So o administrador altera o cadastro de maquinas');
  return auth.rls(async (db) => {

    if (req.method === 'POST') {
      const corpo = await lerCorpo(req);

      /**
       * Carga inicial: os nomes que as conferencias JA usaram.
       * Uma grafia por maquina (a mais recente); repetir nao duplica.
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
        return json(res, 201, await cadastro(db, empresaId));
      }

      // Criar GRUPO: corpo { grupo: { codigo, nome } }.
      if (corpo.grupo) {
        const codigo = codigoDe(corpo.grupo.codigo);
        const nome = nomeLimpo(texto(corpo.grupo.nome, 'grupo.nome', { obrigatorio: true, max: 60 }));
        if (!nome) throw erroValidacao('Informe o nome do grupo');

        const [existe] = await db`
          SELECT codigo, nome FROM grupos_maquina
           WHERE empresa_id = ${empresaId}
             AND (codigo = ${codigo} OR lower(btrim(nome)) = lower(${nome}))`;
        if (existe) {
          throw new ErroHttp(409, `Ja existe um grupo com este codigo ou nome: "${existe.codigo} ${existe.nome}"`);
        }

        const [grupo] = await db`
          INSERT INTO grupos_maquina (empresa_id, codigo, nome)
          VALUES (${empresaId}, ${codigo}, ${nome})
          RETURNING id, codigo, nome`;
        return json(res, 201, { grupo });
      }

      const nome = nomeLimpo(texto(corpo.nome, 'nome', { obrigatorio: true, max: 120 }));
      if (!nome) throw erroValidacao('Informe o nome da maquina');
      const grupoId = await grupoValido(db, empresaId, corpo.grupoId);

      const [existe] = await db`
        SELECT nome FROM maquinas
         WHERE empresa_id = ${empresaId} AND lower(btrim(nome)) = lower(${nome})`;
      if (existe) throw new ErroHttp(409, `Ja existe esta maquina no cadastro: "${existe.nome}"`);

      const [maquina] = await db`
        INSERT INTO maquinas (empresa_id, nome, grupo_id) VALUES (${empresaId}, ${nome}, ${grupoId})
        RETURNING id, nome, grupo_id, ativa`;
      return json(res, 201, { maquina });
    }

    if (req.method === 'PATCH') {
      const corpo = await lerCorpo(req);

      // PATCH de GRUPO: ?grupo=<id>, corpo { codigo?, nome? }.
      if (grupoParam) {
        const grupoId = uuid(grupoParam, 'grupo');
        const [atual] = await db`
          SELECT id FROM grupos_maquina WHERE id = ${grupoId} AND empresa_id = ${empresaId}`;
        if (!atual) throw naoEncontrado('Grupo de maquina nao encontrado');

        const tem = (chave) => Object.prototype.hasOwnProperty.call(corpo, chave);
        if (!tem('codigo') && !tem('nome')) {
          throw erroValidacao('Nada a atualizar: informe "codigo" ou "nome"');
        }
        if (tem('codigo')) {
          const codigo = codigoDe(corpo.codigo);
          const [outro] = await db`
            SELECT codigo FROM grupos_maquina
             WHERE empresa_id = ${empresaId} AND codigo = ${codigo} AND id <> ${grupoId}`;
          if (outro) throw new ErroHttp(409, `Ja existe um grupo com o codigo ${codigo}`);
          await db`UPDATE grupos_maquina SET codigo = ${codigo} WHERE id = ${grupoId}`;
        }
        if (tem('nome')) {
          const nome = nomeLimpo(texto(corpo.nome, 'nome', { obrigatorio: true, max: 60 }));
          if (!nome) throw erroValidacao('Informe o nome do grupo');
          const [outro] = await db`
            SELECT nome FROM grupos_maquina
             WHERE empresa_id = ${empresaId} AND lower(btrim(nome)) = lower(${nome}) AND id <> ${grupoId}`;
          if (outro) throw new ErroHttp(409, `Ja existe um grupo com este nome: "${outro.nome}"`);
          await db`UPDATE grupos_maquina SET nome = ${nome} WHERE id = ${grupoId}`;
        }
        const [grupo] = await db`SELECT id, codigo, nome FROM grupos_maquina WHERE id = ${grupoId}`;
        return json(res, 200, { grupo });
      }

      const maquinaId = uuid(id, 'id');
      const [atual] = await db`
        SELECT id FROM maquinas WHERE id = ${maquinaId} AND empresa_id = ${empresaId}`;
      if (!atual) throw naoEncontrado('Maquina nao encontrada');

      const tem = (chave) => Object.prototype.hasOwnProperty.call(corpo, chave);
      if (!tem('nome') && !tem('ativa') && !tem('grupoId')) {
        throw erroValidacao('Nada a atualizar: informe "nome", "grupoId" ou "ativa"');
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
      if (tem('grupoId')) {
        // null/vazio LIMPA: e' o caminho de tirar de um grupo errado.
        const grupoId = await grupoValido(db, empresaId, corpo.grupoId);
        await db`UPDATE maquinas SET grupo_id = ${grupoId} WHERE id = ${maquinaId}`;
      }
      if (tem('ativa')) {
        await db`UPDATE maquinas SET ativa = ${Boolean(corpo.ativa)} WHERE id = ${maquinaId}`;
      }

      const [maquina] = await db`
        SELECT m.id, m.nome, m.ativa, m.grupo_id, g.codigo AS grupo_codigo, g.nome AS grupo_nome
          FROM maquinas m LEFT JOIN grupos_maquina g ON g.id = m.grupo_id
         WHERE m.id = ${maquinaId}`;
      return json(res, 200, { maquina });
    }

    // DELETE de GRUPO: as maquinas dele so' ficam sem grupo (FK SET NULL).
    if (grupoParam) {
      const grupoId = uuid(grupoParam, 'grupo');
      const [grupo] = await db`
        SELECT id FROM grupos_maquina WHERE id = ${grupoId} AND empresa_id = ${empresaId}`;
      if (!grupo) throw naoEncontrado('Grupo de maquina nao encontrado');
      await db`DELETE FROM grupos_maquina WHERE id = ${grupoId} AND empresa_id = ${empresaId}`;
      return json(res, 200, { acao: 'excluido' });
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
