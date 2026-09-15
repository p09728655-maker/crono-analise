/**
 * PARADAS — o catalogo de motivos e o tempo que cada um comeu.
 *
 * O catalogo e' estado de modulo de proposito: quem precisa do nome de um
 * motivo e' o CALCULO (resumirParadas, o relatorio impresso, as
 * sugestoes), e nenhum deles recebe props. Por isso ele mora aqui inteiro
 * — quebrar o catalogo e quem o le' em arquivos diferentes faria duas
 * copias da mesma verdade.
 */
import { temposValidos } from '../estatistica.js';

/**
 * Motivos de parada de FABRICA — o ponto de partida.
 *
 * Esta lista deixou de ser a verdade e virou o padrao: a fabrica cadastra a
 * dela em Ferramentas > Motivos de parada, e o app passa a usar aquela. Os
 * nove daqui continuam existindo por dois motivos concretos:
 *
 *  - Enquanto nada foi cadastrado (instalacao nova) e sempre que o tablet
 *    esta' sem rede e sem cache, a coleta precisa de algo para oferecer.
 *  - Parada gravada com um codigo que depois saiu do cadastro ainda precisa
 *    de nome no relatorio. Codigo daqui sempre resolve.
 */
export const MOTIVOS_PARADA = [
  { codigo: 'setup', rotulo: 'Setup / Troca', acao: 'Aplicar SMED e padronizar o plano de troca.' },
  { codigo: 'manutencao', rotulo: 'Manutenção corretiva', acao: 'Implantar TPM e analisar histórico de falhas.' },
  { codigo: 'falta_material', rotulo: 'Falta de material', acao: 'Revisar kanban, ponto de pedido e lead time.' },
  { codigo: 'qualidade', rotulo: 'Problema de qualidade', acao: 'Reforçar CEP e inspeção de início de lote.' },
  { codigo: 'ferramenta', rotulo: 'Troca de broca / ferramenta', acao: 'Monitorar vida útil da broca e criar plano de troca programada.' },
  { codigo: 'ajuste_maquina', rotulo: 'Ajuste de máquina', acao: 'Padronizar gabarito e batente para eliminar ajuste manual.' },
  { codigo: 'reuniao', rotulo: 'Reunião / Treinamento', acao: 'Agendar fora do horário produtivo.' },
  { codigo: 'pessoal', rotulo: 'Necessidade pessoal', acao: 'Já coberto pela tolerância; não tratar como perda.' },
  { codigo: 'outro', rotulo: 'Outro', acao: 'Detalhar na observação para permitir classificação posterior.' },
];

/**
 * Catalogo em vigor.
 *
 * Comeca nos motivos de fabrica e e' trocado por src/lib/motivosParada.js
 * assim que o cadastro da empresa chega (do cache do aparelho ou do
 * servidor). Mora aqui, e nao no React, porque quem precisa do nome de um
 * motivo e' o CALCULO — resumirParadas, sugerirMelhorias, o relatorio
 * impresso — e nenhum deles recebe props.
 */
let catalogo = MOTIVOS_PARADA;

/** Troca o catalogo em vigor. Lista vazia volta para os motivos de fabrica. */
export function definirCatalogoParadas(motivos) {
  catalogo = Array.isArray(motivos) && motivos.length ? motivos : MOTIVOS_PARADA;
}

/**
 * Procura primeiro no cadastro da empresa, depois nos motivos de fabrica.
 *
 * A segunda busca e' o que impede parada antiga de virar codigo cru na tela
 * quando um motivo padrao e' removido do cadastro.
 */
function acharMotivo(valor) {
  const casa = (m) => m.codigo === valor || m.rotulo === valor;
  return catalogo.find(casa) || MOTIVOS_PARADA.find(casa) || null;
}

/**
 * Rotulo legivel de um motivo de parada. Codigo desconhecido volta como veio.
 *
 * Aceita tambem o proprio rotulo: a coleta de ciclos gravou o texto ("Setup
 * / Troca") antes de passar a gravar o codigo, e parada velha no banco nao
 * pode virar "Parada" generica so' porque a convencao mudou.
 */
export function rotuloMotivo(codigo) {
  const achado = acharMotivo(codigo);
  return achado ? achado.rotulo : String(codigo || 'Parada');
}

/** A acao que o motivo pede. Sai no relatorio: motivo sem acao nao vira melhoria. */
export function acaoDoMotivo(codigo) {
  const achado = acharMotivo(codigo);
  return achado?.acao || 'Detalhar na observação para permitir classificação posterior.';
}

/** Codigo canonico do motivo — aceita codigo ou rotulo (dado antigo). */
function codigoMotivo(valor) {
  const achado = acharMotivo(valor);
  return achado ? achado.codigo : String(valor || 'outro');
}

/**
 * Soma as paradas de um periodo, separando SETUP do resto.
 *
 * Setup sai separado porque e' a unica parada que o proprio processo
 * exige: trocar gabarito, programa ou broca faz parte de produzir lote
 * variado. As outras — falta de material, manutencao, qualidade — sao
 * perda a ser eliminada. Misturar as duas numa unica "parada" esconde
 * justamente a decisao que o PCP precisa tomar (reduzir setup com SMED x
 * atacar a causa da perda).
 *
 * Aceita paradas do aparelho (camelCase) e do banco (snake_case).
 */
export function somarParadas(paradas) {
  let totalMs = 0;
  let setupMs = 0;
  const porMotivo = new Map();

  let n = 0;

  for (const p of paradas || []) {
    // Tres nomes para o mesmo campo: conferencia (duracaoMs), banco
    // (duracao_ms) e o payload do estudo (duracao).
    const ms = Math.max(0, Number(p?.duracaoMs ?? p?.duracao_ms ?? p?.duracao) || 0);
    if (ms <= 0) continue;
    const motivo = codigoMotivo(p?.motivo);
    totalMs += ms;
    n += 1;
    if (motivo === 'setup') setupMs += ms;
    const atual = porMotivo.get(motivo) || { ms: 0, n: 0 };
    porMotivo.set(motivo, { ms: atual.ms + ms, n: atual.n + 1 });
  }

  return {
    totalMs,
    setupMs,
    outrasMs: totalMs - setupMs,
    n,
    // Maior perda primeiro: a lista ja' sai em ordem de Pareto.
    porMotivo: [...porMotivo.entries()]
      .map(([motivo, v]) => ({
        motivo,
        rotulo: rotuloMotivo(motivo),
        acao: acaoDoMotivo(motivo),
        ms: v.ms,
        n: v.n,
        pct: totalMs > 0 ? (v.ms / totalMs) * 100 : 0,
      }))
      .sort((a, b) => b.ms - a.ms),
  };
}

/**
 * Paradas do ESTUDO inteiro — o que a tela de analise e o papel mostram.
 *
 * A coleta ciclo a ciclo ja' registrava a parada (botao Parada, com motivo)
 * e ja' a descontava do ciclo, para nao inflar o TO. Mas o registro morria
 * no banco: nenhuma tela mostrava. Perda medida que ninguem le nao vira
 * melhoria — e' so' trabalho jogado fora.
 *
 * O denominador do percentual e' o tempo com o CRONOMETRO NA MAO (ciclos
 * validos + paradas), nao o turno: o estudo nao observou o turno inteiro, e
 * dizer "12% do turno" a partir de 25 ciclos seria inventar base.
 */
export function resumirParadasDoEstudo(operacoes) {
  const todas = [];
  const porOperacao = [];
  let cronometradoMs = 0;

  for (const op of operacoes || []) {
    const soma = somarParadas(op?.paradas);
    const tempos = temposValidos(op?.tempos);
    cronometradoMs += tempos.reduce((acc, t) => acc + t, 0);
    if (op?.paradas?.length) todas.push(...op.paradas);
    if (soma.totalMs > 0) {
      porOperacao.push({ id: op.id, nome: op.nome, ms: soma.totalMs, n: soma.n });
    }
  }

  const geral = somarParadas(todas);
  const base = geral.totalMs + cronometradoMs;

  return {
    totalMs: geral.totalMs,
    setupMs: geral.setupMs,
    n: geral.n,
    cronometradoMs,
    pctDoObservado: base > 0 ? (geral.totalMs / base) * 100 : 0,
    porMotivo: geral.porMotivo,
    porOperacao: porOperacao.sort((a, b) => b.ms - a.ms),
  };
}
