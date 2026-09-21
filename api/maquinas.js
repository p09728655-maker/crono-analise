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
import { decimal, inteiro, texto, uuid } from './_lib/validar.js';
import { demandaSemanal } from './_lib/demanda.js';

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
  SELECT id, codigo, nome, horas_semana, setups_dia, setup_min, dias_semana FROM grupos_maquina
   WHERE empresa_id = ${empresaId}
   ORDER BY codigo`;

// Grupo (pelo codigo) antes do nome: e' a ordem da escolha no celular.
const listarMaquinas = (db, empresaId) => db`
  SELECT m.id, m.nome, m.ativa, m.grupo_id, m.nominal_ciclos_min, m.nominal_fonte,
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

  /**
   * A DEMANDA SEMANAL entra por aqui (?demanda=1), antes de tudo.
   *
   * O plano Hobby da Vercel aceita 12 funcoes serverless por deploy e o
   * projeto ja' estava exatamente nas 12: um api/demanda.js proprio virava
   * a 13a e derrubava o deploy INTEIRO — foi o que aconteceu no PR #73. O
   * assunto casa com esta funcao (a demanda e' de um GRUPO, e a jornada do
   * grupo ja' mora neste cadastro), e a regra de papel dela e' OUTRA: o
   * programa de producao e' trabalho de PCP (admin ou analista), enquanto o
   * cadastro de maquina e' so' do administrador. Por isso o desvio vem
   * ANTES do exigirPapel la' embaixo. Ver api/_lib/demanda.js.
   */
  if (req.query?.demanda === '1') return demandaSemanal(req, res, auth);

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
        const campos = ['codigo', 'nome', 'horasSemana', 'setupsDia', 'setupMin', 'diasSemana'];
        if (!campos.some(tem)) {
          throw erroValidacao(`Nada a atualizar: informe ${campos.map((c) => `"${c}"`).join(', ')}`);
        }
        /**
         * TUDO VALIDADO ANTES DO PRIMEIRO UPDATE — codigo e nome inclusive.
         * No modo de servico nao ha' transacao; validar entre gravacoes
         * deixaria metade da decisao no banco quando um campo viesse errado
         * (nome gravado, setup recusado). As consultas de unicidade sao
         * leituras: podem vir antes.
         */
        let codigo;
        if (tem('codigo')) {
          codigo = codigoDe(corpo.codigo);
          const [outro] = await db`
            SELECT codigo FROM grupos_maquina
             WHERE empresa_id = ${empresaId} AND codigo = ${codigo} AND id <> ${grupoId}`;
          if (outro) throw new ErroHttp(409, `Ja existe um grupo com o codigo ${codigo}`);
        }
        let nome;
        if (tem('nome')) {
          nome = nomeLimpo(texto(corpo.nome, 'nome', { obrigatorio: true, max: 60 }));
          if (!nome) throw erroValidacao('Informe o nome do grupo');
          const [outro] = await db`
            SELECT nome FROM grupos_maquina
             WHERE empresa_id = ${empresaId} AND lower(btrim(nome)) = lower(${nome}) AND id <> ${grupoId}`;
          if (outro) throw new ErroHttp(409, `Ja existe um grupo com este nome: "${outro.nome}"`);
        }
        /**
         * HORAS DISPONIVEIS por maquina por semana — o denominador do takt.
         *
         * Nulo APAGA a configuracao, de proposito: e' como o PCP diz "nao
         * sei" depois de ter dito 44. Sem isso, o unico jeito de desfazer um
         * numero errado seria digitar outro numero errado, e o relatorio
         * seguiria dando veredito sobre um turno que nao existe.
         */
        /**
         * SETUP PLANEJADO: trocas por dia, minutos por troca e dias de
         * producao na semana, por maquina. Mesma regra das horas — nulo
         * apaga. Zero e' valido e diferente de nulo: "este grupo nao faz
         * setup" e' informacao; "nao sei" nao e'.
         *
         * Os quatro numeros sobem juntos porque sao uma decisao so'; a
         * validacao de todos vem antes de qualquer UPDATE (ver acima).
         */
        const apagar = (v) => v === null || v === '';
        const tempo = {
          horas_semana: tem('horasSemana')
            ? (apagar(corpo.horasSemana) ? null : decimal(corpo.horasSemana, 'horasSemana', { min: 0.5, max: 168 }))
            : undefined,
          setups_dia: tem('setupsDia')
            ? (apagar(corpo.setupsDia) ? null : inteiro(corpo.setupsDia, 'setupsDia', { min: 0, max: 100 }))
            : undefined,
          setup_min: tem('setupMin')
            ? (apagar(corpo.setupMin) ? null : decimal(corpo.setupMin, 'setupMin', { min: 0, max: 600 }))
            : undefined,
          dias_semana: tem('diasSemana')
            ? (apagar(corpo.diasSemana) ? null : inteiro(corpo.diasSemana, 'diasSemana', { min: 1, max: 7 }))
            : undefined,
        };
        if (codigo !== undefined) {
          await db`UPDATE grupos_maquina SET codigo = ${codigo} WHERE id = ${grupoId}`;
        }
        if (nome !== undefined) {
          await db`UPDATE grupos_maquina SET nome = ${nome} WHERE id = ${grupoId}`;
        }
        if (tempo.horas_semana !== undefined) {
          await db`UPDATE grupos_maquina SET horas_semana = ${tempo.horas_semana} WHERE id = ${grupoId}`;
        }
        if (tempo.setups_dia !== undefined) {
          await db`UPDATE grupos_maquina SET setups_dia = ${tempo.setups_dia} WHERE id = ${grupoId}`;
        }
        if (tempo.setup_min !== undefined) {
          await db`UPDATE grupos_maquina SET setup_min = ${tempo.setup_min} WHERE id = ${grupoId}`;
        }
        if (tempo.dias_semana !== undefined) {
          await db`UPDATE grupos_maquina SET dias_semana = ${tempo.dias_semana} WHERE id = ${grupoId}`;
        }
        const [grupo] = await db`
          SELECT id, codigo, nome, horas_semana, setups_dia, setup_min, dias_semana
            FROM grupos_maquina WHERE id = ${grupoId}`;
        return json(res, 200, { grupo });
      }

      const maquinaId = uuid(id, 'id');
      const [atual] = await db`
        SELECT id FROM maquinas WHERE id = ${maquinaId} AND empresa_id = ${empresaId}`;
      if (!atual) throw naoEncontrado('Maquina nao encontrada');

      const tem = (chave) => Object.prototype.hasOwnProperty.call(corpo, chave);
      const campos = ['nome', 'grupoId', 'ativa', 'nominalCiclosMin', 'nominalFonte'];
      if (!campos.some(tem)) {
        throw erroValidacao(`Nada a atualizar: informe ${campos.map((c) => `"${c}"`).join(', ')}`);
      }

      /**
       * TUDO VALIDADO ANTES DO PRIMEIRO UPDATE — a mesma regra do PATCH de
       * grupo. Sem transacao no modo de servico, validar entre gravacoes
       * deixaria o nome novo no banco com o nominal recusado.
       */
      let nome;
      if (tem('nome')) {
        nome = nomeLimpo(texto(corpo.nome, 'nome', { obrigatorio: true, max: 120 }));
        if (!nome) throw erroValidacao('Informe o nome da maquina');
        const [outra] = await db`
          SELECT nome FROM maquinas
           WHERE empresa_id = ${empresaId} AND lower(btrim(nome)) = lower(${nome}) AND id <> ${maquinaId}`;
        if (outra) throw new ErroHttp(409, `Ja existe esta maquina no cadastro: "${outra.nome}"`);
      }
      // null/vazio LIMPA: e' o caminho de tirar de um grupo errado.
      const grupoId = tem('grupoId') ? await grupoValido(db, empresaId, corpo.grupoId) : undefined;

      /**
       * RITMO NOMINAL DO FABRICANTE, em ciclos por minuto, e a FONTE dele.
       *
       * Nulo APAGA (como a jornada do grupo): "nao sei" e' diferente de
       * qualquer numero. A fonte so' existe junto do numero — apagar o
       * nominal apaga a fonte, e fonte sem nominal nao grava: e' anotacao
       * de um numero, nao campo solto.
       */
      const apagar = (v) => v === null || v === '';
      const nominal = tem('nominalCiclosMin')
        ? (apagar(corpo.nominalCiclosMin)
          ? null
          : decimal(corpo.nominalCiclosMin, 'nominalCiclosMin', { min: 0.01, max: 10000 }))
        : undefined;
      let fonte = tem('nominalFonte')
        ? (apagar(corpo.nominalFonte) ? null : nomeLimpo(texto(corpo.nominalFonte, 'nominalFonte', { max: 120 })) || null)
        : undefined;
      if (nominal === null) fonte = null;
      if (fonte != null && nominal === undefined) {
        const [atualNominal] = await db`SELECT nominal_ciclos_min FROM maquinas WHERE id = ${maquinaId}`;
        if (atualNominal?.nominal_ciclos_min == null) {
          throw erroValidacao('Informe o ritmo nominal (ciclos/min) junto com a fonte');
        }
      }

      if (nome !== undefined) {
        await db`UPDATE maquinas SET nome = ${nome} WHERE id = ${maquinaId}`;
      }
      if (grupoId !== undefined) {
        await db`UPDATE maquinas SET grupo_id = ${grupoId} WHERE id = ${maquinaId}`;
      }
      if (tem('ativa')) {
        await db`UPDATE maquinas SET ativa = ${Boolean(corpo.ativa)} WHERE id = ${maquinaId}`;
      }
      if (nominal !== undefined) {
        await db`UPDATE maquinas SET nominal_ciclos_min = ${nominal} WHERE id = ${maquinaId}`;
      }
      if (fonte !== undefined) {
        await db`UPDATE maquinas SET nominal_fonte = ${fonte} WHERE id = ${maquinaId}`;
      }

      const [maquina] = await db`
        SELECT m.id, m.nome, m.ativa, m.grupo_id, m.nominal_ciclos_min, m.nominal_fonte,
               g.codigo AS grupo_codigo, g.nome AS grupo_nome
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
