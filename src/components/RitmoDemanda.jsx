import { espaco, numeros, raio, rotulo, tipo } from '../theme/escala.js';
import { taktTime } from '../domain/cronoanalise.js';

/**
 * Painel Ritmo / Demanda — o MESMO no cadastro manual e na importacao.
 *
 * E' um componente unico de proposito: quando o formulario manual ganhar
 * um campo aqui, a importacao ganha junto. Duplicar este bloco foi o que
 * fez a importacao virar uma "versao simples" sem Takt.
 *
 * O Takt nao e' campo digitavel: e' resultado de quantidade x horas.
 */
export default function RitmoDemanda({ t, analise, calc, aoMudar, refQuantidade, aoFocar }) {
  const est = estilos(t, analise);
  const qtd = Number(calc.quantidade);
  const horas = horasDoCalculo(calc);
  const taktMs = qtd > 0 && horas > 0 ? taktTime(horas * 3600, qtd) : 0;

  return (
    <aside style={est.painel} onFocusCapture={aoFocar}>
      <div style={est.secaoRotulo}>Ritmo / Demanda</div>

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
    </aside>
  );
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
  };
}
