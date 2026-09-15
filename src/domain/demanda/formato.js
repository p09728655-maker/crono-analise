/**
 * COMO A TELA ESCREVE — data, horas e a conta que precisa FECHAR.
 *
 * Nao e' so' enfeite: `contaDasHoras` existe porque arredondar jornada,
 * setup e produtivas cada um a partir do valor exato NAO fecha a
 * subtracao que a pessoa confere de cabeca. Os numeros saem derivados uns
 * dos outros de proposito — o que a tela mostra pode ficar a um decimo do
 * exato, e "264 − 50 = 214" bate sempre.
 */

/**
 * A data do programa em pt-BR — SEM deslocar o dia.
 *
 * As datas do programa sao dias as 00h UTC. Formatadas no relogio local
 * (UTC-3 em Sao Paulo) elas voltam um dia: 08/09 aparece como 07/09, e o
 * periodo na tela deixa de bater com a planilha que o PCP tem aberta ao
 * lado. Por isso o fuso e' fixo em UTC aqui, e nao o do navegador.
 */
export const comoDia = (d, { ano = false } = {}) => (d instanceof Date && !Number.isNaN(d.getTime())
  ? d.toLocaleDateString('pt-BR', {
    timeZone: 'UTC', day: '2-digit', month: '2-digit', ...(ano ? { year: 'numeric' } : {}),
  })
  : '');

/**
 * HORAS como a tela escreve — e de um jeito que a conta FECHA.
 *
 * Arredondar jornada, setup e produtivas cada um para inteiro da
 * "132 − 38 = 95": 132,0 − 37,5 = 94,5, e ninguem confere de cabeca uma
 * subtracao que nao bate. Inteiro quando e' inteiro (a um decimo); uma
 * casa quando nao e' — nos tres numeros, sempre pela mesma regra.
 */
const umDecimo = (h) => Math.round(Number(h) * 10) / 10;
export const comoHoras = (h) => {
  // Dado ausente e' vazio, nunca "0 h": zero e' uma afirmacao.
  if (h == null || h === '' || !Number.isFinite(Number(h))) return '';
  const n = umDecimo(h);
  return Number.isInteger(n) ? n.toLocaleString('pt-BR') : n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
};

/**
 * A CONTA DAS HORAS, com os numeros DERIVADOS um do outro — e' a unica
 * regra que fecha sempre.
 *
 * Arredondar jornada, setup e produtivas cada um a partir do valor exato
 * nao fecha: 40 − 1,25 = 38,75 vira "40 − 1,3 = 38,8" (e 5% das
 * combinacoes reais de setup falham assim). Aqui o setup do grupo e' o
 * setup POR MAQUINA ja' arredondado vezes as maquinas, e as produtivas
 * sao a jornada exibida menos o setup exibido. O que a tela mostra pode
 * ficar ate' um decimo longe do exato que o ritmo exigido usou — e a
 * subtracao que a pessoa confere de cabeca bate, sempre.
 *
 * Devolve numeros (ja' a um decimo) e textos. `setup` e `porMaquina` sao
 * null sem setup informado; ai' produtivas = jornada.
 */
export function contaDasHoras({ horas, setupHoras = null, maquinas = 1 } = {}) {
  const m = Math.max(0, Math.floor(Number(maquinas) || 0));
  const h = Number(horas) || 0;
  if (h <= 0 || m <= 0) return null;
  const jornada = umDecimo(h * m);
  const porMaquina = setupHoras == null ? null : umDecimo(Math.max(0, Number(setupHoras) || 0));
  const setup = porMaquina == null ? null : umDecimo(porMaquina * m);
  const produtivas = umDecimo(jornada - (setup ?? 0));
  return {
    jornada, setup, porMaquina, produtivas,
    texto: {
      jornada: comoHoras(jornada),
      setup: setup == null ? '' : comoHoras(setup),
      porMaquina: porMaquina == null ? '' : comoHoras(porMaquina),
      produtivas: comoHoras(produtivas),
    },
  };
}

/** "31/08 a 04/09" — o periodo de uma semana, como a planilha o escreve. */
export const comoPeriodo = (periodo, { ano = false } = {}) => (periodo?.inicio && periodo?.fim
  ? `${comoDia(periodo.inicio)} a ${comoDia(periodo.fim, { ano })}`
  : '');
