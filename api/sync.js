/**
 * Sincronizacao em lote da coleta de campo.
 *
 * Este e' o endpoint mais critico do sistema. O tablet coleta na furadeira
 * com wifi instavel, acumula ciclos numa fila local e despeja tudo aqui
 * quando a rede volta. Duas garantias sao inegociaveis:
 *
 *   1. IDEMPOTENCIA — cada ciclo carrega um client_id gerado no dispositivo.
 *      Reenviar o mesmo lote nao duplica nada (ON CONFLICT DO NOTHING).
 *   2. ATOMICIDADE — o lote inteiro grava ou nada grava. Sem isso, uma falha
 *      no meio deixaria o estudo com metade dos ciclos e o app sem saber
 *      quais reenviar.
 */
import { sql } from './_lib/db.js';
import { autenticar } from './_lib/auth.js';
import { ErroHttp, handler, json, lerCorpo, permitir } from './_lib/http.js';
import { dataIso, hora, inteiro, lista, paradasDaConferencia, texto, uuid } from './_lib/validar.js';

const MAX_ITENS = 500;

/**
 * Fuso da fabrica.
 *
 * O analista digita "10:16" querendo dizer 10:16 no chao de fabrica. Para
 * virar instante, a data precisa ser lida no mesmo fuso — deixar isso a
 * cargo do TimeZone da sessao faria o mesmo dado cair em horas diferentes
 * conforme onde a funcao serverless subiu.
 */
const FUSO = 'America/Sao_Paulo';

export default handler(async (req, res) => {
  permitir(req, ['POST']);
  const { empresaId } = await autenticar(req);
  const corpo = await lerCorpo(req);

  const observacoes = lista(corpo.observacoes || [], 'observacoes', { max: MAX_ITENS });
  const paradas = lista(corpo.paradas || [], 'paradas', { max: MAX_ITENS });
  const conferencias = lista(corpo.conferencias || [], 'conferencias', { max: MAX_ITENS });

  if (!observacoes.length && !paradas.length && !conferencias.length) {
    return json(res, 200, { observacoesGravadas: 0, paradasGravadas: 0, clientIds: [] });
  }

  // Valida ANTES de abrir transacao — evita rollback por dado malformado.
  const obsLimpas = observacoes.map((o, i) => ({
    clientId: uuid(o.clientId, `observacoes[${i}].clientId`),
    operacaoId: uuid(o.operacaoId, `observacoes[${i}].operacaoId`),
    duracaoMs: inteiro(o.duracaoMs, `observacoes[${i}].duracaoMs`, { min: 1, max: 86_400_000 }),
    rodada: inteiro(o.rodada, `observacoes[${i}].rodada`, { min: 1, max: 99, padrao: 1 }),
    coletadoEm: dataIso(o.coletadoEm, `observacoes[${i}].coletadoEm`, { padrao: new Date().toISOString() }),
  }));

  const parLimpas = paradas.map((p, i) => ({
    clientId: uuid(p.clientId, `paradas[${i}].clientId`),
    operacaoId: uuid(p.operacaoId, `paradas[${i}].operacaoId`),
    motivo: texto(p.motivo, `paradas[${i}].motivo`, { obrigatorio: true, max: 120 }),
    observacao: texto(p.observacao, `paradas[${i}].observacao`, { max: 1000 }),
    duracaoMs: inteiro(p.duracaoMs, `paradas[${i}].duracaoMs`, { min: 1, max: 86_400_000 }),
    iniciadoEm: dataIso(p.iniciadoEm, `paradas[${i}].iniciadoEm`, { padrao: new Date().toISOString() }),
  }));

  // Conferencia rapida: vazao avulsa de um posto, sem estudo nem operacao.
  // Vai para a mesma fila porque a garantia e' a mesma — o dado nasceu no
  // aparelho e nao pode se perder nem duplicar. Ate' 24h de periodo: e' o
  // maior turno concebivel; acima disso e' hora digitada errada.
  //
  // O QUE O APARELHO MANDA NAO MUDOU: ele continua enviando "HH:MM" e a
  // lista de paradas embutida. Quem converte para instante e quem quebra as
  // paradas em linhas e' o servidor. Isso e' de proposito — a fila offline e'
  // o caminho mais critico do sistema, e mexer no formato dela obrigaria o
  // tablet que passou dias sem rede a falar uma lingua que ele nao conhece.
  const confLimpas = conferencias.map((c, i) => ({
    clientId: uuid(c.clientId, `conferencias[${i}].clientId`),
    maquina: texto(c.maquina, `conferencias[${i}].maquina`, { max: 120 }),
    peca: texto(c.peca, `conferencias[${i}].peca`, { max: 120 }),
    horaInicial: hora(c.horaInicial, `conferencias[${i}].horaInicial`),
    horaFinal: hora(c.horaFinal, `conferencias[${i}].horaFinal`),
    duracaoMs: inteiro(c.duracaoMs, `conferencias[${i}].duracaoMs`, { min: 1, max: 86_400_000 }),
    pecas: inteiro(c.pecas, `conferencias[${i}].pecas`, { min: 1, max: 1_000_000 }),
    // Paradas do periodo (setup, falta de material...). Sobem NA conferencia,
    // no mesmo INSERT: o dado nasceu junto e nao pode chegar pela metade.
    paradas: paradasDaConferencia(c.paradas, `conferencias[${i}]`),
    salvoEm: dataIso(c.salvoEm, `conferencias[${i}].salvoEm`, { padrao: new Date().toISOString() }),
  }));

  // Toda operacao referenciada precisa pertencer a esta empresa. Sem esta
  // checagem, um token valido conseguiria escrever no estudo de outro cliente.
  // (Conferencias ficam fora: pertencem direto a' empresa autenticada.)
  const operacaoIds = [...new Set([...obsLimpas, ...parLimpas].map((x) => x.operacaoId))];
  const permitidas = await sql`
    SELECT o.id FROM operacoes o
      JOIN estudos e ON e.id = o.estudo_id
     WHERE o.id = ANY(${operacaoIds}) AND e.empresa_id = ${empresaId}`;
  const idsPermitidos = new Set(permitidas.map((o) => o.id));
  const invalidas = operacaoIds.filter((id) => !idsPermitidos.has(id));
  if (invalidas.length) {
    throw new ErroHttp(404, 'Operacao inexistente ou de outra empresa', { operacoes: invalidas });
  }

  // Uma unica transacao: o lote inteiro grava ou nada grava.
  const novos = await sql.begin(async (tx) => {
    let inseridos = 0;

    for (const o of obsLimpas) {
      const r = await tx`
        INSERT INTO observacoes (client_id, operacao_id, duracao_ms, rodada, coletado_em)
        VALUES (${o.clientId}, ${o.operacaoId}, ${o.duracaoMs}, ${o.rodada}, ${o.coletadoEm})
        ON CONFLICT (client_id) DO NOTHING
        RETURNING client_id`;
      inseridos += r.length;
    }

    for (const p of parLimpas) {
      const r = await tx`
        INSERT INTO paradas (client_id, operacao_id, motivo, observacao, duracao_ms, iniciado_em)
        VALUES (${p.clientId}, ${p.operacaoId}, ${p.motivo}, ${p.observacao}, ${p.duracaoMs}, ${p.iniciadoEm})
        ON CONFLICT (client_id) DO NOTHING
        RETURNING client_id`;
      inseridos += r.length;
    }

    for (const c of confLimpas) {
      const temHorario = Boolean(c.horaInicial && c.horaFinal);

      /**
       * O periodo vira INSTANTE aqui dentro.
       *
       * Com horario digitado, a data sai de salvo_em lida no fuso da fabrica
       * — "10:16" e' 10:16 no chao de fabrica, nao em UTC. Sem horario (o
       * caminho do cronometro ao vivo), o fim e' o proprio salvo_em e o
       * inicio sai dele menos a duracao cronometrada: e' literalmente o que
       * aconteceu, e antes essa conferencia ficava sem periodo nenhum.
       *
       * O aparelho continua MANDANDO "HH:MM" — e' o que ele sabe dizer, e
       * mexer nisso obrigaria o tablet que passou dias sem rede a falar uma
       * lingua nova. O que muda e' que o servidor nao GUARDA mais o texto:
       * ele compoe o instante e grava so' isso. hora_inicial/hora_final e
       * `paradas` (jsonb) deixam de ser escritas aqui — e' o que libera o
       * passo 3 da migracao a derruba-las sem quebrar a sincronizacao.
       */
      const [linha] = await tx`
        WITH periodo AS (
          SELECT
            CASE WHEN ${temHorario}
              THEN ((${c.salvoEm}::timestamptz AT TIME ZONE ${FUSO})::date
                    + ${c.horaInicial || '00:00'}::time) AT TIME ZONE ${FUSO}
              ELSE ${c.salvoEm}::timestamptz - make_interval(secs => ${c.duracaoMs} / 1000.0)
            END AS ini,
            CASE WHEN ${temHorario}
              THEN ((${c.salvoEm}::timestamptz AT TIME ZONE ${FUSO})::date
                    + ${c.horaFinal || '00:00'}::time) AT TIME ZONE ${FUSO}
              ELSE ${c.salvoEm}::timestamptz
            END AS fim
        )
        INSERT INTO conferencias
          (client_id, empresa_id, maquina, peca,
           iniciado_em, finalizado_em, duracao_ms, pecas, salvo_em)
        SELECT ${c.clientId}, ${empresaId}, ${c.maquina}, ${c.peca},
               p.ini,
               -- Periodo que atravessa a meia-noite: o fim caiu no dia seguinte.
               CASE WHEN p.fim < p.ini THEN p.fim + interval '1 day' ELSE p.fim END,
               ${c.duracaoMs}, ${c.pecas}, ${c.salvoEm}
          FROM periodo p
        ON CONFLICT (client_id) DO NOTHING
        RETURNING id`;

      // Sem linha = a conferencia ja' estava la'. E' reenvio da fila, e as
      // paradas dela ja' entraram junto na primeira vez: inserir de novo
      // duplicaria o tempo parado do posto.
      if (!linha) continue;
      inseridos += 1;

      for (const parada of c.paradas) {
        await tx`
          INSERT INTO paradas (client_id, conferencia_id, motivo, observacao, duracao_ms, iniciado_em)
          VALUES (${crypto.randomUUID()}, ${linha.id}, ${parada.motivo},
                  ${parada.observacao}, ${parada.duracaoMs}, ${c.salvoEm})`;
      }
    }

    return inseridos;
  });

  // Devolvemos TODOS os clientIds recebidos, nao apenas os recem-inseridos.
  // Um item ja existente tambem esta confirmado no servidor, e o app precisa
  // limpar a fila local nos dois casos — senao reenviaria para sempre.
  const clientIds = [...obsLimpas, ...parLimpas, ...confLimpas].map((x) => x.clientId);

  return json(res, 200, {
    recebidos: clientIds.length,
    novos,
    duplicadosIgnorados: clientIds.length - novos,
    clientIds,
  });
});
