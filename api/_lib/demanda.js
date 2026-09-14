/**
 * DEMANDA SEMANAL — o programa de producao por grupo de maquina.
 *
 * POR QUE AQUI DENTRO, E NAO NUM api/demanda.js PROPRIO: o plano Hobby da
 * Vercel aceita 12 funcoes serverless por deploy, e o projeto ja' estava
 * exatamente nas 12. O arquivo proprio virava a 13a e derrubava o DEPLOY
 * INTEIRO — nao so' o endpoint novo, o app todo parava de publicar (foi o
 * que aconteceu no deploy do PR #73). Mesma razao pela qual a recuperacao
 * de senha mora dentro de api/sessao.js.
 *
 * Este arquivo esta' em `_lib` de proposito: pasta com underscore nao vira
 * funcao na Vercel. Quem expoe a rota e' api/maquinas.js, com ?demanda=1 —
 * e o assunto casa: a demanda e' de um GRUPO de maquina, e a jornada do
 * grupo (horas_semana) ja' mora naquele cadastro.
 *
 * Guarda o que a planilha do PCP ja' diz: quantas pecas o grupo (0002
 * FURADEIRA, por exemplo) tem de entregar em cada semana. E' o numerador do
 * ritmo exigido; o denominador (horas disponiveis) mora no proprio grupo,
 * em `grupos_maquina.horas_semana`, porque e' decisao de turno e nao muda
 * toda semana.
 *
 * Tres regras dao forma a esta API:
 *
 *  - A gravacao e' um LOTE e ela MESCLA: a colagem traz as semanas que o
 *    PCP tem na mao e sobrescreve as de mesmo numero. Semana que nao veio
 *    na colagem fica como estava. Substituir tudo apagaria o historico de
 *    quem colasse so' o mes corrente — e o relatorio de uma medicao de
 *    marco ficaria sem o programa de marco.
 *
 *  - Quantidade ZERO nao existe: semana sem producao programada nao se
 *    cadastra com 0, se deixa de fora. Zero no denominador de um takt
 *    produz infinito, e infinito na tela vira "atende folgado".
 *
 *  - Quem faz analise mantem o programa (admin ou analista) — e' trabalho
 *    de PCP, nao configuracao de administrador. A mesma regra de
 *    pode_escrever() que a RLS aplica no banco.
 */
import { exigirPapel } from './auth.js';
import { erroValidacao, json, lerCorpo, naoEncontrado } from './http.js';
import { inteiro, lista, uuid } from './validar.js';

/** Duas planilhas de ano cheio numa colagem so' — teto do que faz sentido. */
const MAX_SEMANAS = 120;

const listar = (db, empresaId, grupoId) => (grupoId
  ? db`
    SELECT id, grupo_id, ano, numero, pecas
      FROM demanda_semanal
     WHERE empresa_id = ${empresaId} AND grupo_id = ${grupoId}
     ORDER BY ano, numero`
  : db`
    SELECT id, grupo_id, ano, numero, pecas
      FROM demanda_semanal
     WHERE empresa_id = ${empresaId}
     ORDER BY grupo_id, ano, numero`);

/** O grupo tem de existir NESTA empresa — id de outra volta como 404. */
async function grupoDaEmpresa(db, empresaId, valor, campo = 'grupo') {
  const id = uuid(valor, campo);
  const [grupo] = await db`
    SELECT id FROM grupos_maquina WHERE id = ${id} AND empresa_id = ${empresaId}`;
  if (!grupo) throw naoEncontrado('Grupo de maquina nao encontrado');
  return id;
}

export async function demandaSemanal(req, res, auth) {
  const { empresaId } = auth;

  if (req.method === 'GET') {
    return auth.rls(async (db) => {
      const grupoId = req.query?.grupo
        ? await grupoDaEmpresa(db, empresaId, req.query.grupo)
        : null;
      return json(res, 200, { demandas: await listar(db, empresaId, grupoId) });
    });
  }

  exigirPapel(auth, ['admin', 'analista'], 'So quem faz analise mantem o programa de producao');
  return auth.rls(async (db) => {
    const grupoId = await grupoDaEmpresa(db, empresaId, req.query?.grupo);

    if (req.method === 'POST') {
      const corpo = await lerCorpo(req);
      const cruas = lista(corpo.semanas, 'semanas', { max: MAX_SEMANAS });
      if (!cruas.length) throw erroValidacao('Nenhuma semana para gravar');

      /**
       * `inteiro` devolve null no campo ausente em vez de recusar — o que
       * serve para campo opcional e nao serve aqui: os tres sao a linha
       * inteira. Sem esta conferencia, semana sem quantidade chegaria ao
       * INSERT como NULL e o erro sairia como falha de banco, longe de
       * quem colou a planilha torta.
       */
      const obrigatorio = (valor, campo, faixa) => {
        const n = inteiro(valor, campo, faixa);
        if (n === null) throw erroValidacao(`Campo "${campo}" e obrigatorio`);
        return n;
      };
      const semanas = cruas.map((s, i) => ({
        ano: obrigatorio(s?.ano, `semanas[${i}].ano`, { min: 2000, max: 2099 }),
        numero: obrigatorio(s?.numero, `semanas[${i}].numero`, { min: 1, max: 53 }),
        // Teto de 10 milhoes de pecas na semana: acima disso e' quase certo
        // que alguem colou a coluna do acumulado do ano no lugar da semana.
        pecas: obrigatorio(s?.pecas, `semanas[${i}].pecas`, { min: 1, max: 10000000 }),
      }));

      // Colagem com a mesma semana duas vezes: fica a ultima, como a tela
      // ja' avisa ao interpretar. Sem isto o INSERT em lote se atropela.
      const porSemana = new Map(semanas.map((s) => [`${s.ano}-${s.numero}`, s]));

      for (const s of porSemana.values()) {
        await db`
          INSERT INTO demanda_semanal (empresa_id, grupo_id, ano, numero, pecas)
          VALUES (${empresaId}, ${grupoId}, ${s.ano}, ${s.numero}, ${s.pecas})
          ON CONFLICT (empresa_id, grupo_id, ano, numero)
          DO UPDATE SET pecas = EXCLUDED.pecas`;
      }
      return json(res, 201, { demandas: await listar(db, empresaId, grupoId) });
    }

    /**
     * DELETE apaga UMA semana (?grupo=&ano=&numero=) ou o programa inteiro
     * do grupo (?grupo=&tudo=1). O "tudo" existe porque quem colou a
     * planilha errada precisa de um caminho de volta que nao seja apagar
     * semana por semana; e ele exige o grupo, entao nunca alcanca outro.
     */
    if (req.query?.tudo === '1') {
      const apagadas = await db`
        DELETE FROM demanda_semanal
         WHERE empresa_id = ${empresaId} AND grupo_id = ${grupoId}
         RETURNING id`;
      return json(res, 200, { apagadas: apagadas.length, demandas: [] });
    }

    const ano = inteiro(req.query?.ano, 'ano', { min: 2000, max: 2099 });
    const numero = inteiro(req.query?.numero, 'numero', { min: 1, max: 53 });
    if (ano === null || numero === null) {
      throw erroValidacao('Informe a semana a apagar (ano e numero) ou tudo=1');
    }
    const [apagada] = await db`
      DELETE FROM demanda_semanal
       WHERE empresa_id = ${empresaId} AND grupo_id = ${grupoId}
         AND ano = ${ano} AND numero = ${numero}
       RETURNING id`;
    if (!apagada) throw naoEncontrado('Semana nao encontrada neste grupo');
    return json(res, 200, { demandas: await listar(db, empresaId, grupoId) });
  });
}
