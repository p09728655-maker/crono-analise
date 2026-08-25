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
import { dataIso, inteiro, lista, texto, uuid } from './_lib/validar.js';

const MAX_ITENS = 500;

export default handler(async (req, res) => {
  permitir(req, ['POST']);
  const { empresaId } = await autenticar(req);
  const corpo = await lerCorpo(req);

  const observacoes = lista(corpo.observacoes || [], 'observacoes', { max: MAX_ITENS });
  const paradas = lista(corpo.paradas || [], 'paradas', { max: MAX_ITENS });

  if (!observacoes.length && !paradas.length) {
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

  // Toda operacao referenciada precisa pertencer a esta empresa. Sem esta
  // checagem, um token valido conseguiria escrever no estudo de outro cliente.
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

    return inseridos;
  });

  // Devolvemos TODOS os clientIds recebidos, nao apenas os recem-inseridos.
  // Um item ja existente tambem esta confirmado no servidor, e o app precisa
  // limpar a fila local nos dois casos — senao reenviaria para sempre.
  const clientIds = [...obsLimpas, ...parLimpas].map((x) => x.clientId);

  return json(res, 200, {
    recebidos: clientIds.length,
    novos,
    duplicadosIgnorados: clientIds.length - novos,
    clientIds,
  });
});
