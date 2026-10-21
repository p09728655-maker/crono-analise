/**
 * APRESENTACAO — duracao, decimal e cronometro, como a tela escreve.
 *
 * Nada aqui decide nada: sao as regras de como um numero vira texto. Elas
 * moram juntas porque erram juntas — "< 1 min" em vez de "1 min" para 30 s
 * e' a mesma decisao de nao arredondar para cima o que nao aconteceu.
 */

/**
 * Periodo conferido, como "10:16–10:36".
 *
 * Le os INSTANTES (iniciado_em/finalizado_em). O texto "HH:MM" das colunas
 * antigas segue como ultimo recurso: elas ja' foram derrubadas do banco, mas
 * um servidor REVERTIDO para antes da migracao voltaria a devolver so' o
 * texto — e ai' a tela mostraria um travessao no lugar do periodo, que e'
 * pior do que a hora sem o dia.
 *
 * A hora sai no fuso do computador que esta' olhando, que e' o da fabrica.
 */
export function faixaHoraria(conferencia) {
  const c = conferencia || {};
  if (c.iniciado_em && c.finalizado_em) {
    const hm = (v) => new Date(v).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return `${hm(c.iniciado_em)}–${hm(c.finalizado_em)}`;
  }
  if (c.hora_inicial && c.hora_final) return `${c.hora_inicial}–${c.hora_final}`;
  return null;
}

/**
 * Duracao entre dois horarios de relogio ("HH:MM"), em ms.
 *
 * E' assim que a conferencia acontece de verdade: o analista passa pela
 * maquina as 7:00, volta as 7:10 e le o contador — ninguem fica parado
 * segurando cronometro. Virada de meia-noite conta como dia seguinte
 * (23:50 -> 00:10 = 20 min), porque turno da noite tambem confere ritmo.
 * Horarios iguais ou invalidos devolvem 0 — campo ainda nao preenchido,
 * nao "24 horas".
 */
export function duracaoEntreHoras(horaInicial, horaFinal) {
  const minutos = (s) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(s ?? '').trim());
    if (!m) return null;
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (h > 23 || min > 59) return null;
    return h * 60 + min;
  };
  const inicio = minutos(horaInicial);
  const fim = minutos(horaFinal);
  if (inicio === null || fim === null) return 0;
  const diff = fim - inicio;
  if (diff === 0) return 0;
  return (diff > 0 ? diff : diff + 24 * 60) * 60000;
}

/** Formata duracao em ms como "10 min" / "1 h" / "2 h 30 min" — apresentacao. */
export function formatarDuracao(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return '—';
  // Antes do arredondamento: 30s arredondaria para "1 min" e mentiria.
  if (ms < 60000) return '< 1 min';
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const min = totalMin % 60;
  if (!h) return `${min} min`;
  return min ? `${h} h ${min} min` : `${h} h`;
}

/**
 * O QUE PODE ENTRAR NUM CAMPO DECIMAL DIGITADO.
 *
 * `<input type="number">` parece a escolha obvia e e' uma armadilha aqui: o
 * teclado numerico brasileiro entrega VIRGULA, e o navegador simplesmente
 * descarta o caractere que nao pertence ao formato dele. O analista digita
 * "1,25" no campo de minutos de parada e fica gravado 125 — cem vezes o
 * valor, sem aviso nenhum. Em periodo curto o resultado quebra e alguem
 * percebe; em periodo de 4 h passa liso (auditoria de 31/08).
 *
 * Entao o campo e' de TEXTO, com inputMode decimal (o teclado continua o
 * numerico), e o que se digita passa por aqui: sobram digitos e UM separador,
 * virgula ou ponto. A conversao para numero continua sendo de quem calcula.
 */
export function textoDecimal(valor) {
  const so = String(valor ?? '').replace(/[^\d.,]/g, '');
  // Segundo separador em diante nao entra: "1,2,5" nao e' numero nenhum.
  const i = so.search(/[.,]/);
  if (i === -1) return so;
  return so.slice(0, i + 1) + so.slice(i + 1).replace(/[.,]/g, '');
}

/** Numero a partir do que foi digitado num campo decimal (aceita virgula). */
export function numeroDecimal(valor) {
  const n = Number(String(valor ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

const UMA_CASA = { maximumFractionDigits: 1, useGrouping: false };

/**
 * Quanto passou de um limite, em %, com uma casa — e NUNCA "0%" quando
 * passou: o gargalo 0,3% acima do takt era "0% acima do Takt" ao lado de
 * um quadro com deficit. Abaixo de 0,1, escreve 0,1.
 */
export function formatarPctAcima(pct) {
  if (!Number.isFinite(pct)) return '—';
  return `${(pct > 0 ? Math.max(0.1, pct) : pct).toLocaleString('pt-BR', UMA_CASA)}%`;
}

/**
 * Ocupacao de uma operacao contra o takt, em %, com uma casa: acima de 100
 * nunca escreve "100%" (o "Ocupacao 100% do Takt — gargalo" de um TP 0,3%
 * acima), e abaixo de 100 nunca chega a ele.
 */
export function formatarOcupacao(pct) {
  if (!Number.isFinite(pct)) return '—';
  const v = pct > 100 ? Math.max(pct, 100.1) : (pct < 100 ? Math.min(pct, 99.9) : pct);
  return `${v.toLocaleString('pt-BR', UMA_CASA)}%`;
}

/** Formata ms como segundos com casas decimais — uso exclusivo de apresentacao. */
export function formatarSegundos(ms, casas = 1) {
  if (!Number.isFinite(ms)) return '—';
  return (ms / 1000).toFixed(casas);
}

/** Formata ms como cronometro mm:ss.d para leitura a distancia. */
export function formatarCronometro(ms) {
  if (!Number.isFinite(ms) || ms < 0) ms = 0;
  const totalDecimos = Math.floor(ms / 100);
  const decimos = totalDecimos % 10;
  const totalSeg = Math.floor(totalDecimos / 10);
  const seg = totalSeg % 60;
  const min = Math.floor(totalSeg / 60);
  return `${String(min).padStart(2, '0')}:${String(seg).padStart(2, '0')}.${decimos}`;
}

/**
 * O QUE O TOQUE CONTA, pelo grupo da maquina.
 *
 * Na embalagem o que sai do posto e' VOLUME embalado — o rack de dois
 * volumes conta dois —, e o programa que o PCP cola para esse grupo vem em
 * volumes. Chamar de "peca" ali convidava o erro que mais custa nesta
 * conta: colar o programa em produtos e comparar com volumes contados, um
 * takt que sai o dobro do real e uma linha que parece folgada sem estar.
 *
 * Pelo NOME do grupo, e nao por um campo de cadastro: e' o unico posto que
 * conta outra coisa. Grupo renomeado para algo sem "embalagem" volta a
 * dizer peca — erro de rotulo, nunca de conta.
 */
export function unidadeDoPosto(grupo) {
  const nome = String(grupo || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLocaleLowerCase('pt-BR');
  return nome.includes('embalagem')
    ? { singular: 'volume', plural: 'volumes', abrev: 'vol', comArtigo: 'um volume' }
    : { singular: 'peça', plural: 'peças', abrev: 'pç', comArtigo: 'uma peça' };
}
