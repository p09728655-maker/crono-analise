/**
 * Interpreta o TEMPLATE DE TEMPOS (planilha .xlsx do RitmoProd antigo) e o
 * transforma em estudo: abas Config, Tempos e Paradas.
 *
 * E' o molde que os analistas ja' usam no chao de fabrica (ex.: embalagem,
 * com "CAIXA, TAMPO, ISOMANTA" e "LATERAL, ISOMANTA, LATERAL"): cada linha
 * da aba Tempos e' uma observacao planejada de uma operacao; tempo zero
 * significa "ainda nao cronometrado" e nao vira dado. Planilha preenchida
 * importa os ciclos junto — digitar de novo o que ja' foi medido e' pedir
 * erro de transcricao.
 *
 * Funcao pura sobre matrizes de celulas (ver lib/xlsxTexto.js para a
 * leitura do arquivo); tudo aqui e' testavel sem arquivo nenhum.
 */

/** "Ex: Linha de Montagem A" e' instrucao do molde, nao valor preenchido. */
const limparValor = (v) => {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s || /^ex\s*:/i.test(s)) return null;
  return s;
};

const numeroOuNull = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const acharAba = (abas, alvo) => {
  for (const [nome, linhas] of Object.entries(abas || {})) {
    if (nome.trim().toLowerCase() === alvo) return linhas;
  }
  return null;
};

const indiceColuna = (cabecalho, trecho) =>
  cabecalho.findIndex((c) => String(c ?? '').toLowerCase().includes(trecho));

/**
 * abas: { nomeDaAba: linhas[][] } ->
 * { config, operacoes: [{ nome, fr, ordem, tempos[ms], paradas[] }], avisos }
 */
export function interpretarTemplate(abas) {
  const tempos = acharAba(abas, 'tempos');
  if (!tempos || tempos.length < 2) {
    throw new Error(
      'Não reconheci um template de tempos nesta planilha. '
      + 'Ela precisa ter a aba "Tempos" com as colunas OPERAÇÃO, FR% e TEMPO (s).',
    );
  }

  const cab = (tempos[0] || []).map((c) => String(c ?? ''));
  const colOp = indiceColuna(cab, 'opera');
  const colFr = indiceColuna(cab, 'fr');
  const colTempo = indiceColuna(cab, 'tempo');
  if (colOp < 0 || colTempo < 0) {
    throw new Error('A aba "Tempos" precisa das colunas OPERAÇÃO e TEMPO (s).');
  }

  const avisos = new Set();
  const operacoes = new Map();

  for (const linha of tempos.slice(1)) {
    const nome = limparValor(linha?.[colOp]);
    if (!nome) continue;
    const chave = nome.toLowerCase();
    if (!operacoes.has(chave)) {
      operacoes.set(chave, { nome, fr: null, ordem: operacoes.size, tempos: [], paradas: [] });
    }
    const op = operacoes.get(chave);

    const fr = colFr >= 0 ? numeroOuNull(linha?.[colFr]) : null;
    if (fr != null && fr > 0) {
      if (op.fr == null) op.fr = fr;
      else if (op.fr !== fr) {
        avisos.add(`FR%% diferente entre linhas de "${nome}" — mantive ${op.fr}.`.replace('%%', '%'));
      }
    }

    // Zero e' molde (linha reservada, ainda sem cronometragem), nao dado.
    const seg = numeroOuNull(linha?.[colTempo]);
    if (seg != null && seg > 0) op.tempos.push(Math.round(seg * 1000));
  }

  if (!operacoes.size) {
    throw new Error('A aba "Tempos" não tem nenhuma operação preenchida.');
  }

  const config = { nome: null, produto: null, analista: null, toleranciaPct: null, metaObs: null };
  const abaConfig = acharAba(abas, 'config');
  if (abaConfig) {
    for (const linha of abaConfig) {
      const campo = String(linha?.[0] ?? '').toLowerCase();
      const valor = limparValor(linha?.[1]);
      if (!campo || valor == null) continue;
      if (campo.includes('opera') || campo.includes('área') || campo.includes('area')) config.nome = valor;
      else if (campo.includes('produto')) config.produto = valor;
      else if (campo.includes('analista')) config.analista = valor;
      else if (campo.includes('toler')) config.toleranciaPct = numeroOuNull(valor);
      else if (campo.includes('meta')) config.metaObs = numeroOuNull(valor);
    }
  }

  const abaParadas = acharAba(abas, 'paradas');
  if (abaParadas && abaParadas.length > 1) {
    const cabP = (abaParadas[0] || []).map((c) => String(c ?? ''));
    const pOp = indiceColuna(cabP, 'opera');
    const pMotivo = indiceColuna(cabP, 'motivo');
    const pDur = indiceColuna(cabP, 'dura');
    const pObs = indiceColuna(cabP, 'observa');

    for (const linha of abaParadas.slice(1)) {
      const nomeOp = limparValor(pOp >= 0 ? linha?.[pOp] : null);
      const motivo = limparValor(pMotivo >= 0 ? linha?.[pMotivo] : null);
      const seg = numeroOuNull(pDur >= 0 ? linha?.[pDur] : null);
      if (!motivo || seg == null || seg <= 0) continue;

      const op = nomeOp ? operacoes.get(nomeOp.toLowerCase()) : null;
      if (!op) {
        // Parada de operacao que nao esta na aba Tempos: descartar em
        // silencio esconderia dado; entra como aviso para o analista decidir.
        avisos.add(`Parada de "${nomeOp || 'operação sem nome'}" ignorada: a operação não está na aba Tempos.`);
        continue;
      }
      op.paradas.push({
        motivo,
        duracaoMs: Math.round(seg * 1000),
        observacao: limparValor(pObs >= 0 ? linha?.[pObs] : null),
      });
    }
  }

  return {
    config,
    operacoes: [...operacoes.values()].map((o) => ({ ...o, fr: o.fr ?? 100 })),
    avisos: [...avisos],
  };
}
