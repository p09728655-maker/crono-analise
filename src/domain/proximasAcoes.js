/**
 * O que fazer agora — derivado dos estudos que a lista ja' carregou.
 *
 * A home respondia "quantos estudos existem" e parava ai'. Quem chega de
 * manha' precisa da pergunta seguinte: qual estudo esta' esperando alguem, e
 * qual botao resolve isso. A resposta ja' estava na tabela — status, ciclos,
 * operacoes — mas espalhada em linhas que o olho tinha de comparar uma a uma.
 *
 * Aqui ela vira uma lista curta e ordenada por urgencia. Nada e' inventado:
 * cada campo sai do proprio estudo, e o que nao existe simplesmente nao
 * aparece.
 */

/** Quantos cartoes cabem sem a area virar uma segunda tabela. */
export const LIMITE = 4;

const ciclosDe = (e) => Number(e.total_observacoes) || 0;
const metaDe = (e) => Number(e.meta_obs) || 0;
const quando = (e) => new Date(e.atualizado_em || 0).getTime() || 0;

/** Mais recente primeiro — a mesma ordem da tabela. */
const porRecencia = (a, b) => quando(b) - quando(a);

/**
 * Em que ponto do caminho o estudo esta'.
 *
 * O CICLO decide antes do status, e a razao e' o que 'concluido' quer dizer
 * neste app: nao e' "a medicao terminou", e' "o estudo saiu da lista do
 * tablet" — e' o que o botao Só no PC / Ao tablet alterna, e o que a lista
 * da coleta filtra. Um estudo preparado no PC e tirado do tablet fica
 * 'concluido' com zero ciclo, e ele nao tem nada de concluido: ninguem
 * cronometrou uma peca sequer.
 *
 * Sem nenhum ciclo, entao, o estudo esta' esperando medicao — venha de onde
 * vier o status.
 */
export function situacao(estudo) {
  if (ciclosDe(estudo) === 0) return 'pendente';
  if (estudo.status === 'concluido') return 'concluido';
  return 'andamento';
}

const RECEITA = {
  pendente: {
    rotulo: 'Aguardando medição',
    acaoRotulo: 'Iniciar medição',
    acao: 'medir',
    // Estado critico usa o laranja da paleta, nunca o vermelho da marca —
    // ver src/theme/tokens.js. Vermelho aqui e' identidade, nao alarme.
    tom: 'critico',
  },
  andamento: {
    rotulo: 'Medição em andamento',
    acaoRotulo: 'Continuar medição',
    acao: 'medir',
    tom: 'atencao',
  },
  concluido: {
    rotulo: 'Último estudo concluído',
    acaoRotulo: 'Analisar',
    acao: 'analisar',
    tom: 'ok',
  },
};

/**
 * Contexto do estudo numa linha: onde e com quem.
 *
 * Sem o produto — ele ja' nomeia o grupo na tabela logo acima, e repetir
 * gastaria a linha inteira dizendo o que o olho acabou de ler.
 */
const contextoDe = (e) => [e.recurso, e.analista_nome || e.analista]
  .map((v) => String(v || '').trim())
  .filter(Boolean)
  .join(' · ');

function cartao(estudo) {
  const tipo = situacao(estudo);
  const ciclos = ciclosDe(estudo);
  const meta = metaDe(estudo);

  return {
    ...RECEITA[tipo],
    tipo,
    id: estudo.id,
    nome: estudo.nome,
    contexto: contextoDe(estudo),
    operacoes: Number(estudo.total_operacoes) || 0,
    ciclos,
    // A meta so' vira informacao enquanto FALTA alguma coisa: depois de
    // batida ela vira ruido, e antes do primeiro ciclo o numero de ciclos
    // ja' diz tudo.
    faltam: meta > 0 && ciclos > 0 && ciclos < meta ? meta - ciclos : 0,
    meta,
  };
}

/**
 * A fila do dia.
 *
 * Ordem = urgencia: o que esta' parado sem nenhum ciclo vem antes do que
 * ja' anda, e o concluido fecha a lista como confirmacao — nao como tarefa.
 * So' UM concluido, o mais recente: a lista existe para o que falta fazer.
 */
export function proximasAcoes(estudos, { limite = LIMITE } = {}) {
  const vivos = (estudos || []).filter((e) => e && e.status !== 'arquivado');

  const pendentes = vivos.filter((e) => situacao(e) === 'pendente').sort(porRecencia);
  const andamento = vivos.filter((e) => situacao(e) === 'andamento').sort(porRecencia);
  const concluidos = vivos.filter((e) => situacao(e) === 'concluido').sort(porRecencia);

  const fila = [...pendentes, ...andamento, ...concluidos.slice(0, 1)];
  const itens = fila.slice(0, limite).map(cartao);

  // "e mais N" conta so' o que exige acao. Estudo concluido que ficou de
  // fora nao e' pendencia escondida — e' historico, e vive na tabela.
  const mostrados = itens.filter((i) => i.tipo !== 'concluido').length;
  const restantes = Math.max(0, pendentes.length + andamento.length - mostrados);

  return { itens, restantes, pendentes: pendentes.length, emAndamento: andamento.length };
}
