/**
 * O MEDIDO NA LINHA em palavras — o mesmo texto na tela e nas duas folhas.
 *
 * Os numeros saem de medicaoDoEstudo; aqui so' se decide como cada caso se
 * escreve. Fica num lugar so' porque a tela, a Folha de Analise e o Resumo
 * Executivo precisam dizer a MESMA coisa: um papel que chama de "medido"
 * o que a tela chamou de "amostra curta" desmente a tela na reuniao.
 *
 * A unidade so' muda AQUI: o estudo inteiro fala em peca (na embalagem, a
 * peca do estudo e' o produto); o bloco do medido diz "produtos/h" quando
 * converteu volumes, e "vol/h" quando nao pode converter.
 */
import { CRITERIOS_CONFERENCIA, formatarDuracao, unidadeDoPosto } from '../../../domain/cronoanalise.js';

const POR_HORA = { 'peça': 'pç/h', produto: 'produtos/h', volume: 'vol/h' };
export const porHora = (unidade) => POR_HORA[unidade] || 'pç/h';

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
const dataCurta = (ms) => new Date(ms).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

/** "de 10/10 a 15/10", ou "em 12/10" quando foi tudo no mesmo dia. */
export function periodoDaMedicao(m) {
  if (!Number.isFinite(m?.desde) || !Number.isFinite(m?.ate)) return '';
  const de = dataCurta(m.desde);
  const ate = dataCurta(m.ate);
  return de === ate ? `em ${de}` : `de ${de} a ${ate}`;
}

/**
 * Onde o posto se mede, no tablet: o nome que o analista ve' no menu.
 * Posto fora do cadastro nao tem grupo que diga a unidade; ai' vale o
 * proprio nome do posto ("EMBALAGEM"), a mesma regra de unidadeDoPosto.
 */
export const ondeMedir = (m, recurso) => (
  m?.contada === 'volume' || unidadeDoPosto(recurso).singular === 'volume'
    ? 'Embalagem Takt Time'
    : 'Ritmo por máquina'
);

/** Do criterio do relatorio, so' o que faltou — em uma linha. */
function amostraCurta(m) {
  const c = CRITERIOS_CONFERENCIA;
  const f = m.faltas || {};
  const partes = [];
  if (f.medicoes) partes.push(`${m.n} de ${c.minConferencias} medições`);
  if (f.tempo) partes.push(`${formatarDuracao(m.produtivoMs)} de ${formatarDuracao(c.minTempoTotalMs)} com a linha rodando`);
  if (f.curtas) partes.push(`${plural(f.curtas, 'medição', 'medições')} com menos de ${formatarDuracao(c.minPeriodoMs)}`);
  return `amostra curta${partes.length ? ` (${partes.join('; ')})` : ''}`;
}

/**
 * O cartao "Medido na linha": valor, unidade, as linhas da nota, o nivel
 * (para a cor da barra) e uma frase CURTA para o papel.
 *
 * `carga` e' o que useMedicaoDoEstudo devolve: { estado, erro, medicao }.
 */
export function lerMedido(carga, { recurso, produto } = {}) {
  if (!carga || carga.estado === 'carregando') {
    return {
      valor: '…', unidade: '', nivel: 'neutro',
      linhas: ['buscando as medições do posto'], curto: 'medição da linha ainda carregando',
    };
  }
  if (carga.estado === 'erro' || !carga.medicao) {
    return {
      valor: '—', unidade: '', nivel: 'neutro',
      linhas: [`não deu para buscar a medição agora${carga.erro ? ` (${carga.erro})` : ''} — o resto da análise não depende dela`],
      curto: 'medição da linha indisponível',
    };
  }

  const m = carga.medicao;
  if (m.motivo === 'sem-posto') {
    return {
      valor: '—', unidade: '', nivel: 'neutro',
      linhas: ['o estudo não tem posto — informe o recurso em Editar estudo: a medição é casada por posto e produto'],
      curto: 'sem posto no estudo',
    };
  }
  if (m.motivo === 'sem-produto') {
    return {
      valor: '—', unidade: '', nivel: 'neutro',
      linhas: ['o estudo não tem produto — informe-o em Editar estudo: a medição é casada por posto e produto'],
      curto: 'sem produto no estudo',
    };
  }
  if (m.motivo === 'sem-medicao') {
    const onde = ondeMedir(m, recurso);
    const linhas = [
      `nenhuma medição de ${produto} em ${recurso} nos últimos ${m.dias} dias`,
      `para medir: no tablet, ${onde}, com este posto e este produto`,
    ];
    // O caso que mais acontece na embalagem: o estudo diz o GRUPO e a
    // medicao grava a MAQUINA. Nenhuma medicao vai casar ate' trocar.
    if (carga.postoNoCadastro === false) {
      linhas.push(`“${recurso}” não é uma máquina do cadastro, e a medição grava a máquina — escolha-a em Editar estudo`);
    }
    if (m.outrosProdutos) {
      linhas.push(`${plural(m.outrosProdutos, 'medição', 'medições')} do posto com outro produto — confira a grafia`);
    }
    if (m.antigas) {
      linhas.push(m.antigas === 1
        ? `1 medição mais antiga que ${m.dias} dias ficou de fora`
        : `${m.antigas} medições mais antigas que ${m.dias} dias ficaram de fora`);
    }
    return {
      valor: '—', unidade: '', nivel: 'neutro', linhas,
      curto: `sem medição nos últimos ${m.dias} dias (medir em ${onde})`,
    };
  }

  // Daqui para baixo ha' numero. Inteiro para baixo, como os outros dois.
  const u = porHora(m.unidade);
  const valor = String(Math.floor(m.ritmoRelogio));
  const rodando = `com a linha rodando: ${Math.floor(m.ritmoRodando)} ${u}`;
  const base = `${[plural(m.n, 'medição', 'medições'), periodoDaMedicao(m)].filter(Boolean).join(' ')} · no relógio, paradas dentro`;

  if (m.motivo === 'sem-volumes') {
    const linhas = [
      base,
      'informe os volumes do produto em Produtos para converter em produtos/h — até lá não entra no atingimento',
    ];
    if (!m.suficiente) linhas.push(amostraCurta(m));
    return {
      valor, unidade: u, nivel: 'atencao', linhas,
      curto: `${valor} ${u} (${base}) — sem os volumes do produto no cadastro: não convertido, fora do atingimento`,
    };
  }
  if (m.motivo === 'amostra-insuficiente') {
    return {
      valor, unidade: u, nivel: 'atencao',
      linhas: [base, `${amostraCurta(m)} — não entra no atingimento`, rodando],
      curto: `${valor} ${u} (${base}) — ${amostraCurta(m)}: fora do atingimento`,
    };
  }

  const linhas = [base, rodando];
  if (m.convertido) {
    linhas.push(`contados ${Math.floor(m.ritmoRelogioContado)} vol/h ÷ ${plural(m.volumes, 'volume', 'volumes')} por produto`);
  }
  return { valor, unidade: u, nivel: 'neutro', linhas, curto: `${valor} ${u} (${base})` };
}
