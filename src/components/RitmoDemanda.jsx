import { espaco, numeros, raio, rotulo, tipo } from '../theme/escala.js';
import { formatarSegundos, taktTime } from '../domain/cronoanalise.js';

/**
 * Painel Ritmo / Demanda — o MESMO no cadastro manual e na importacao.
 *
 * E' um componente unico de proposito: quando o formulario manual ganhar
 * um campo aqui, a importacao ganha junto. Duplicar este bloco foi o que
 * fez a importacao virar uma "versao simples" sem Takt.
 *
 * O Takt nao e' campo digitavel: e' resultado de quantidade x horas.
 *
 * DUAS ORIGENS. Com o posto num grupo que tem programa desta semana, o
 * takt vem do PROGRAMA — o mesmo numero do quadro "Programa da semana" e
 * do tablet da embalagem — e o painel diz de onde ele saiu. A conta
 * digitada continua possivel, como SIMULACAO, e o painel lembra o que o
 * programa pede. Sem programa (ou sem posto), e' a conta digitada de
 * sempre, com o motivo escrito. Quem nao passa `programa` (a importacao)
 * segue so' com a conta digitada.
 */
export default function RitmoDemanda({
  t, analise, calc, aoMudar, refQuantidade, aoFocar,
  programa = null, origem = 'manual', aviso = null, aoUsarPrograma, aoSimular,
}) {
  const est = estilos(t, analise);
  const temPrograma = programa?.taktMs > 0;
  // A unidade e' a DO PROGRAMA (na embalagem, volume). A conta digitada
  // segue em pecas: e' o analista quem diz o que conta.
  const unidade = programa?.unidade || PECA;
  const conta = temPrograma ? contaDaMaquina(programa) : null;
  const segundos = temPrograma ? `${formatarSegundos(programa.taktMs, 1)} s por ${unidade.singular}` : '';

  if (origem === 'programa' && temPrograma) {
    return (
      <aside style={est.painel} onFocusCapture={aoFocar} aria-label="Ritmo / Demanda">
        <div style={est.secaoRotulo}>Ritmo / Demanda</div>
        <div style={est.origem}>
          <span style={est.origemRotulo}>Do programa da semana</span>
          <span style={est.origemTexto}>{programa.grupo} · semana {programa.semana}</span>
        </div>

        <div style={est.taktCartao}>
          <span style={est.taktRotulo}>Takt Time</span>
          <div style={est.taktValorLinha}>
            <span style={est.taktValor}>{formatarTakt(programa.taktMs)}</span>
            <span style={est.taktUnidade}>s/{unidade.singular}</span>
          </div>
          {/* Em segundos tambem, como o quadro "Programa da semana" escreve:
              o relogio grande e' leitura rapida, o segundo e' o que se confere. */}
          <span style={est.taktTexto}>
            {formatarSegundos(programa.taktMs, 1)} s por {unidade.singular}: o tempo de cada máquina
            para cumprir o programa desta semana.
          </span>
        </div>

        <div style={est.tiles}>
          <div style={est.tile}>
            <span style={est.tileRotulo}>Demanda da semana</span>
            <span style={est.tileValor}>
              {programa.demanda > 0 ? `${Number(programa.demanda).toLocaleString('pt-BR')} ${unidade.plural}` : '—'}
            </span>
          </div>
          <div style={est.tile}>
            <span style={est.tileRotulo}>Tempo por máquina</span>
            <span style={est.tileValor}>{conta ? formatarHorasMin(conta.produtivoMin / 60) : '—'}</span>
          </div>
        </div>
        {/* A conta inteira, para quem quer conferir: o tempo e' de UMA
            maquina, ja' sem o setup planejado, porque o programa e' do grupo
            e o estudo e' de um posto. */}
        {conta && <span style={est.dica}>{conta.texto}</span>}
        <span style={est.dica}>
          {programa.maquinas === 1
            ? '1 máquina no grupo: o takt é esse tempo dividido pela demanda.'
            : `${programa.maquinas} máquinas no grupo: o takt é esse tempo dividido pela parte de cada uma na demanda`
              + `${programa.demanda > 0 ? ` (${Math.round(programa.demanda / programa.maquinas).toLocaleString('pt-BR')} ${unidade.plural})` : ''}.`}
        </span>

        <button ref={refQuantidade} type="button" style={est.acao} onClick={aoSimular}>
          Simular outra demanda
        </button>
      </aside>
    );
  }

  const qtd = Number(calc.quantidade);
  const horas = horasDoCalculo(calc);
  const taktMs = qtd > 0 && horas > 0 ? taktTime(horas * 3600, qtd) : 0;

  return (
    <aside style={est.painel} onFocusCapture={aoFocar} aria-label="Ritmo / Demanda">
      <div style={est.secaoRotulo}>Ritmo / Demanda</div>
      {/* Por que o takt nao veio do programa — no topo, porque e' a
          primeira coisa que o analista precisa saber antes de digitar. */}
      {!temPrograma && aviso && <span style={est.dica}>{aviso}</span>}

      <div style={est.colunas}>
        <label style={est.campo}>
          <span style={est.rotuloCampo}>Quantidade por dia</span>
          <input
            ref={refQuantidade} type="number" min="1" style={est.input}
            value={calc.quantidade}
            onChange={(ev) => aoMudar({ ...calc, quantidade: ev.target.value })}
          />
          <span style={est.dica}>Peças que precisam sair.</span>
        </label>
        <label style={est.campo}>
          <span style={est.rotuloCampo}>Horas disponíveis</span>
          <input
            type="number" min="0.1" step="0.1" style={est.input}
            value={calc.horas}
            onChange={(ev) => aoMudar({ ...calc, horas: ev.target.value })}
          />
          <span style={est.dica}>Tempo produtivo do dia, sem paradas planejadas.</span>
        </label>
      </div>

      {/* Takt como RESULTADO, nao como campo: numero grande, calculado. */}
      <div style={est.taktCartao}>
        <span style={est.taktRotulo}>Takt Time</span>
        <div style={est.taktValorLinha}>
          <span style={est.taktValor}>{taktMs > 0 ? formatarTakt(taktMs) : '--:--'}</span>
          <span style={est.taktUnidade}>s/peça</span>
        </div>
        <span style={est.taktTexto}>
          {taktMs > 0
            ? 'Tempo disponível por peça para atender a meta diária.'
            : 'Preencha quantidade e horas para calcular o ritmo.'}
        </span>
      </div>

      <div style={est.tiles}>
        <div style={est.tile}>
          <span style={est.tileRotulo}>Demanda diária</span>
          <span style={est.tileValor}>{qtd > 0 ? `${qtd} peças` : '—'}</span>
        </div>
        <div style={est.tile}>
          <span style={est.tileRotulo}>Tempo disponível</span>
          <span style={est.tileValor}>{horas > 0 ? formatarHorasMin(horas) : '—'}</span>
        </div>
      </div>

      {/* Ha' programa e o takt e' outro: dizer o que o programa pede, para
          a simulacao nao ser confundida com ele — e voltar com um toque. */}
      {temPrograma && (
        <>
          <span style={est.dica}>
            {unidade.singular === 'volume'
              ? `O programa da semana ${programa.semana} é em volumes: ${segundos}. `
                + 'Use se cada ciclo deste estudo for um volume; se o ciclo for o produto inteiro, simule em produtos.'
              : `Simulação. O programa da semana ${programa.semana} pede ${segundos}.`}
          </span>
          <button type="button" style={est.acao} onClick={aoUsarPrograma}>
            Usar o takt do programa ({segundos})
          </button>
        </>
      )}
    </aside>
  );
}

const PECA = { singular: 'peça', plural: 'peças' };

/**
 * A CONTA DE UMA MAQUINA na semana, como o painel a escreve: jornada menos
 * o setup planejado. Os minutos saem DERIVADOS um do outro (a regra de
 * contaDasHoras): arredondar os tres a partir do exato faria "44h00min −
 * 8h20min = 35h41min" — e ninguem confere de cabeca uma subtracao que nao
 * bate. Sem setup cadastrado, diz que falta, como o quadro do programa.
 */
export function contaDaMaquina({ jornadaPorMaquina, setupPorMaquina } = {}) {
  if (!(Number(jornadaPorMaquina) > 0)) return null;
  const jornadaMin = Math.round(Number(jornadaPorMaquina) * 60);
  const setupMin = setupPorMaquina == null ? 0 : Math.round(Math.max(0, Number(setupPorMaquina) || 0) * 60);
  const produtivoMin = jornadaMin - setupMin;
  const hm = (min) => formatarHorasMin(min / 60);
  let texto;
  if (setupPorMaquina == null) {
    texto = `Por máquina: ${hm(jornadaMin)} de jornada. O setup planejado do grupo não está cadastrado.`;
  } else if (setupMin === 0) {
    texto = `Por máquina: ${hm(jornadaMin)} de jornada, sem setup planejado.`;
  } else {
    texto = `Por máquina: ${hm(jornadaMin)} de jornada − ${hm(setupMin)} de setup planejado = ${hm(produtivoMin)}.`;
  }
  return { jornadaMin, setupMin, produtivoMin, texto };
}

/**
 * DE ONDE VEM O TAKT DO ESTUDO: 'programa' ou 'manual'.
 *
 * `escolha` e' o que o analista pediu com os botoes PARA ESTE GRUPO (null
 * enquanto nao pediu nada; quem chama zera ao trocar de grupo, para o
 * clique dado na furadeira nao valer na embalagem). Sem escolha, o
 * programa entra sozinho — mas nunca depois de o analista ter mexido na
 * conta (`digitou`: apagar a quantidade para corrigi-la nao entrega o
 * painel ao programa), e nunca na embalagem: la' o programa e' em VOLUMES
 * e o ciclo do estudo pode ser o produto inteiro (um rack de dois
 * volumes), e o takt por volume faria a linha parecer o dobro mais
 * carregada do que esta'. Ali o programa e' oferecido, nao imposto.
 */
export function origemDoTakt({ programa, escolha = null, digitou = false } = {}) {
  if (!(programa?.taktMs > 0)) return 'manual';
  if (escolha) return escolha;
  if (programa.unidade?.singular === 'volume') return 'manual';
  return digitou ? 'manual' : 'programa';
}

/**
 * Por que o takt NAO veio do programa, para a conta digitada nao parecer
 * a regra. Neutro de proposito: quem le e' o analista, que so' precisa
 * saber que a demanda e' com ele — nao de quem e' a pendencia.
 */
export function avisoSemPrograma({ recurso, grupo, estado }) {
  if (!String(recurso || '').trim()) return 'Escolha o posto para trazer o takt do programa da semana.';
  if (!grupo) return 'Posto sem grupo no cadastro de máquinas: digite a demanda.';
  const nome = [grupo.codigo, grupo.nome].filter(Boolean).join(' · ');
  switch (estado) {
    case 'carregando': return `Buscando o programa da semana de ${nome}…`;
    case 'sem-rede': return 'Sem rede: o programa da semana não chegou. Digite a demanda.';
    case 'sem-demanda': return `${nome} não tem programa da semana: digite a demanda.`;
    case 'sem-semana': return `O programa de ${nome} não cobre esta semana: digite a demanda.`;
    case 'sem-horas': return `Faltam as horas da semana de ${nome} no cadastro: digite a demanda.`;
    case 'setup-excede': return `O setup cadastrado de ${nome} passa da jornada: digite a demanda.`;
    default: return null;
  }
}

/** O takt que o estudo grava, em ms, conforme a origem — null sem conta. */
export function taktMsDoEstudo({ origem, programa, calc }) {
  if (origem === 'programa' && programa?.taktMs > 0) return Math.round(programa.taktMs);
  return taktMsDoCalculo(calc);
}

/**
 * Ponto de partida do painel: jornada padrao da fabrica de 8,8 h/dia
 * (8h48min — 44h semanais em 5 dias). O analista so digita a quantidade;
 * quem tiver turno diferente ajusta as horas na hora.
 */
export const CALC_PADRAO = { quantidade: '', horas: '8.8' };

const horasDoCalculo = (calc) => Number(String(calc?.horas ?? '').replace(',', '.'));

/** Takt em ms para gravar no estudo — null quando a conta nao fecha. */
export function taktMsDoCalculo(calc) {
  const qtd = Number(calc?.quantidade);
  const horas = horasDoCalculo(calc);
  const ms = qtd > 0 && horas > 0 ? taktTime(horas * 3600, qtd) : 0;
  return ms > 0 ? Math.round(ms) : null;
}

/** 42000ms -> "00:42". O Takt e' lido como relogio, nao como decimal. */
export function formatarTakt(ms) {
  const s = Math.round(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** 5.6 horas -> "5h36min". Confirma que "5,60" nao significa 5h60. */
export function formatarHorasMin(horas) {
  const min = Math.round(horas * 60);
  return `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}min`;
}

/* -------------------------------------------------------------------- estilos */

function estilos(t, analise) {
  return {
    /* O painel de ritmo e' a etapa em destaque: superficie propria. */
    painel: {
      display: 'flex', flexDirection: 'column', gap: espaco.lg,
      padding: espaco.lg, background: t.realce,
      borderWidth: 1, borderStyle: 'solid', borderColor: t.borda, borderRadius: raio.md,
    },
    secaoRotulo: rotulo(t.fraco),
    colunas: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: espaco.lg },
    campo: { display: 'flex', flexDirection: 'column', gap: espaco.xs },
    rotuloCampo: rotulo(t.fraco),
    dica: { ...tipo('legenda'), color: t.fraco, fontStyle: 'italic' },
    input: {
      width: '100%', minHeight: 44, padding: `0 ${espaco.md}px`, background: t.fundo,
      borderWidth: 1, borderStyle: 'solid', borderColor: t.borda, borderRadius: raio.sm,
      color: t.texto, ...tipo('corpo'), fontFamily: 'inherit', outline: 'none',
    },
    taktCartao: {
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: espaco.xs,
      padding: `${espaco.lg}px ${espaco.md}px`,
      background: t.superficie,
      borderWidth: 1, borderStyle: 'solid', borderColor: t.borda, borderRadius: raio.md,
      textAlign: 'center',
    },
    taktRotulo: rotulo(t.fraco),
    taktValorLinha: { display: 'flex', alignItems: 'baseline', gap: espaco.sm },
    taktValor: { ...tipo('display'), ...numeros, color: t.texto },
    taktUnidade: { ...tipo('corpoF'), color: t.fraco },
    taktTexto: { ...tipo('legenda'), color: t.fraco, maxWidth: 300 },
    tiles: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: espaco.md },
    tile: {
      display: 'flex', flexDirection: 'column', gap: 2, padding: espaco.md,
      background: t.superficie,
      borderWidth: 1, borderStyle: 'solid', borderColor: t.borda, borderRadius: raio.sm,
    },
    tileRotulo: rotulo(t.fraco),
    tileValor: { ...tipo('corpoF'), ...numeros, color: t.texto },
    /* A ORIGEM do takt, logo abaixo do titulo: e' o que diferencia o numero
       do programa de uma conta digitada, que tem a mesma cara. */
    origem: {
      display: 'flex', flexDirection: 'column', gap: 2,
      padding: `${espaco.sm}px ${espaco.md}px`, background: t.superficie,
      borderWidth: 1, borderStyle: 'solid', borderColor: t.borda, borderLeftWidth: 3,
      borderLeftColor: t.ok, borderRadius: raio.sm,
    },
    origemRotulo: rotulo(t.ok),
    origemTexto: { ...tipo('corpoF'), color: t.texto },
    /* Botao, nao link sublinhado: troca a origem do takt, e no tablet e'
       tocado de dedo. */
    acao: {
      minHeight: 44, padding: `0 ${espaco.md}px`, background: 'transparent',
      borderWidth: 1, borderStyle: 'solid', borderColor: t.borda, borderRadius: raio.sm,
      color: t.texto, ...tipo('corpoF'), fontFamily: 'inherit', cursor: 'pointer',
    },
  };
}
