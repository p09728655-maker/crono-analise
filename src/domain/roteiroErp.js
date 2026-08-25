/**
 * Leitura do roteiro de producao do ERP Logica.
 *
 * O relatorio "Processos de Producao" traz, para um produto pai, cada peca
 * componente com a operacao, a maquina e — o que mais importa aqui — a
 * QUANTIDADE NA ESTRUTURA: quantas vezes aquela peca entra no produto.
 *
 * A lateral direita/esquerda entra 2x na mesa de cabeceira, e o ERP ja
 * multiplica: 5s por peca, 10s no total. E' o mesmo conceito de "ciclos por
 * peca" que o sistema usa — so' que disponivel de graca, sem digitacao.
 *
 * A extracao de texto do PDF devolve uma sequencia achatada de campos, sem
 * estrutura de tabela. O interpretador percorre essa sequencia procurando o
 * padrao do codigo de peca e lendo os campos seguintes por posicao.
 */

/** Codigo de peca do ERP: 778.001.001 */
const RE_CODIGO = /^\d{3}\.\d{3}\.\d{3}$/;
/** Duracao HH:MM:SS */
const RE_HORA = /^\d{2}:\d{2}:\d{2}$/;
/** Quantidade na estrutura: 1,0000 */
const RE_QTD = /^\d+,\d{4}$/;
/** Numero da operacao no roteiro: 020 */
const RE_NR_OP = /^\d{3}$/;

export const SEM_PROCESSO = 'SEM PROCESSO';

/**
 * O relatorio corta a descricao da peca nesta largura e derrama o resto
 * ("DP 2 BCO", "O") algumas linhas adiante, depois da quantidade.
 */
const LARGURA_DESCRICAO = 30;

/**
 * Emenda o pedaco derramado de volta na descricao.
 *
 * So' emenda quando a descricao tem exatamente a largura da coluna (sinal
 * de corte) e o pedaco nao e' nenhum campo conhecido. O espaco que o corte
 * engoliu ("...MDP" + "5 BCO") volta so' quando a emenda comecaria colando
 * digito em letra — colar "DP 2 BCO" em "...X215X15 M" nao leva espaco.
 */
function emendarDescricao(descricao, pedaco) {
  if (descricao.length !== LARGURA_DESCRICAO || !pedaco) return descricao;
  if (pedaco.length > 20 || /^Informa/.test(pedaco)) return descricao;
  if (RE_CODIGO.test(pedaco) || RE_HORA.test(pedaco) || RE_QTD.test(pedaco)) return descricao;
  const espaco = /^\d/.test(pedaco) && /[A-Za-z]$/.test(descricao) ? ' ' : '';
  return descricao + espaco + pedaco;
}

/** HH:MM:SS para milissegundos. */
export function horaParaMs(texto) {
  const m = /^(\d{2}):(\d{2}):(\d{2})$/.exec(texto || '');
  if (!m) return 0;
  return ((+m[1] * 3600) + (+m[2] * 60) + (+m[3])) * 1000;
}

/** "2,0000" para 2. */
export function quantidadeParaNumero(texto) {
  const n = Number(String(texto || '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/**
 * Normaliza o texto extraido do PDF.
 *
 * O extrator quebra rotulos verticais em uma letra por linha ("N", "i",
 * "v", "."). Linhas de ate' dois caracteres sao remontadas antes de
 * qualquer analise, senao o cabecalho vira centenas de linhas de lixo.
 */
export function normalizarLinhas(textoBruto) {
  const linhas = String(textoBruto || '').split('\n').map((l) => l.trim());
  const saida = [];
  let acumulado = [];

  for (const linha of linhas) {
    if (linha.length > 0 && linha.length <= 2) {
      acumulado.push(linha);
      continue;
    }
    if (acumulado.length) { saida.push(acumulado.join('')); acumulado = []; }
    if (linha) saida.push(linha);
  }
  if (acumulado.length) saida.push(acumulado.join(''));
  return saida;
}

/**
 * Interpreta o roteiro.
 *
 * Devolve o produto pai e as pecas com processo. Pecas "SEM PROCESSO" sao
 * reportadas a' parte: elas existem na estrutura mas nao passam pela
 * maquina, entao nao viram operacao a cronometrar — e esconder isso faria o
 * analista achar que o roteiro veio incompleto.
 */
export function interpretarRoteiro(textoBruto) {
  const linhas = normalizarLinhas(textoBruto);

  const produtos = [];
  for (let i = 0; i < linhas.length; i++) {
    if (!RE_CODIGO.test(linhas[i])) continue;

    const codigo = linhas[i];
    const descricao = linhas[i + 1] || '';
    if (!descricao || RE_CODIGO.test(descricao)) continue;

    if (linhas[i + 2] === SEM_PROCESSO) {
      produtos.push({
        codigo,
        descricao,
        semProcesso: true,
        quantidade: quantidadeParaNumero(linhas[i + 3]),
      });
      i += 3;
      continue;
    }

    // Peca com processo: numero da operacao, nome, funcionarios, maquina,
    // horas industriais, horas totais, e mais adiante a quantidade.
    if (!RE_NR_OP.test(linhas[i + 2])) continue;

    const janela = linhas.slice(i + 2, i + 14);
    const horas = janela.filter((l) => RE_HORA.test(l));
    const posQtd = janela.findIndex((l) => RE_QTD.test(l));
    const qtd = posQtd >= 0 ? janela[posQtd] : null;

    produtos.push({
      codigo,
      descricao: emendarDescricao(descricao, posQtd >= 0 ? janela[posQtd + 1] : null),
      semProcesso: false,
      numeroOperacao: janela[0],
      operacao: janela[1],
      funcionarios: Number(janela[2]) || null,
      maquina: janela[3],
      // horas[0] e' o total ja multiplicado pela quantidade; horas[1] e' a
      // hora unitaria da peca. E' dela que sai o tempo de referencia.
      msTotal: horaParaMs(horas[0]),
      msUnitario: horaParaMs(horas[1]),
      quantidade: quantidadeParaNumero(qtd),
    });
    i += 3;
  }

  // O produto pai e' o primeiro codigo do relatorio, sempre sem processo.
  const pai = produtos[0] || null;
  const pecas = produtos.slice(1);

  return {
    produtoPai: pai ? { codigo: pai.codigo, descricao: pai.descricao } : null,
    maquinas: [...new Set(pecas.filter((p) => !p.semProcesso).map((p) => p.maquina))],
    operacoes: pecas.filter((p) => !p.semProcesso),
    semProcesso: pecas.filter((p) => p.semProcesso),
  };
}
