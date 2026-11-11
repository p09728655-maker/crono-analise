import {
  formatarDuracao, formatarSegundos, paradasPorMotivo, somarParadas,
} from '../../../domain/cronoanalise.js';
import {
  deixaramDe, frasesDasParadas, frasesVolumeAVolume, numerosDaLeitura, pctDoParado, porHoraDaMedicao, qtdParadas,
  tempoSomado,
} from '../../../domain/volumeAVolume.js';
import { GraficoIntervalos } from '../../analise/graficos/Intervalos.jsx';
import { cores } from '../../../theme/tokens.js';
import { est } from '../rapida/estilos.js';
import { dataCurta } from '../rapida/formato.js';
import { inicioDaSalva, leituraDaSalva } from './leituraSalva.js';
import { explicacaoDoAlvo } from '../../../domain/tempoAlvo.js';

/** A cor da faixa do veredito. Falha e' o laranja de status, nunca o vermelho da marca. */
const COR_DO_TOM = { atende: cores.ok, falha: cores.critico, atencao: cores.atencao };

const seg = (ms) => (Number.isFinite(ms) && ms > 0 ? `${formatarSegundos(ms)} s` : '—');
const hora = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/**
 * O RESULTADO DE UMA MEDICAO SALVA, NO TABLET (v2.100.0).
 *
 * Pedido do chao de fabrica, com foto do tablet: as medicoes salvas eram
 * so' uma lista de volumes/hora, e o resultado inteiro so' existia no PC.
 * Tocar na linha abre aqui o mesmo volume a volume do PC — o veredito
 * contra o tempo-alvo do produto (v2.106.0), os cartoes, o que deixou de ser
 * embalado, o grafico e as lacunas —, com as mesmas contas e as mesmas
 * frases (domain/volumeAVolume.js). Leitura, nao edicao: corrigir produto
 * ou parada e salvar a analise do PCP continuam no PC.
 *
 * E' a COPIA deste aparelho: o que o PC mudou depois nao volta para ca', e
 * a tela diz isso no pe' em vez de deixar dois numeros sem explicacao.
 */
export default function ResultadoSalvo({
  registro, takt: doPrograma, alvo = {}, unidade, mostrarMaquina = true, aoVoltar,
}) {
  /* Sem rede, o programa guardado no aparelho pode ser so' de outra semana:
     "o programa nao cobre a semana" culparia o PCP pelo que e' falta de
     rede — o cartao do takt ao vivo ja' trata assim (motivoSemTakt). */
  const takt = doPrograma.semRede && doPrograma.estado === 'sem-semana'
    ? { ...doPrograma, estado: 'sem-rede' }
    : doPrograma;
  const r = leituraDaSalva(registro, takt, alvo);
  const { leitura, conferencia } = r;
  const inicio = inicioDaSalva(registro);
  const quando = [
    mostrarMaquina ? registro.maquina : null,
    dataCurta(registro.salvoEm).split(' ')[0],
    inicio ? `${hora(inicio)}–${hora(registro.salvoEm)}` : null,
    `${formatarDuracao(registro.duracaoMs)} de medição`,
  ].filter(Boolean).join(' · ');
  const frases = leitura ? frasesVolumeAVolume({ leitura, alvo, unidade }) : null;

  return (
    <section style={est.salva} aria-label="Resultado da medição salva">
      <div style={est.salvaCab}>
        <span style={est.salvaProduto}>{registro.peca || 'Produto não informado'}</span>
        <span style={est.salvaQuando}>{quando}</span>
      </div>

      {frases ? (
        <div
          style={{ ...est.veredito, boxShadow: `inset 5px 0 0 ${COR_DO_TOM[frases.tom] || cores.borda}` }}
          aria-label="Leitura da medição"
        >
          <p style={est.vereditoManchete}>{frases.manchete}</p>
          {frases.linhas.map((l) => <p key={l} style={est.vereditoLinha}>{l}</p>)}
          {explicacaoDoAlvo(alvo) && <p style={{ ...est.linhaConta, textAlign: 'left', marginTop: 6 }}>{explicacaoDoAlvo(alvo)}</p>}
          {frases.carga && <p style={{ ...est.linhaCarga, textAlign: 'left', marginTop: 6 }}>{frases.carga}</p>}
        </div>
      ) : (
        <section style={est.aviso} role="status">
          Sem intervalo entre {unidade.plural} nesta medição (medida por horários, com a contagem corrigida à
          {' '}mão ou com um {unidade.singular} só): não há o que comparar com o tempo-alvo. Os {unidade.plural}/hora e
          {' '}as paradas valem.
        </section>
      )}

      <Cartoes r={r} alvo={alvo} unidade={unidade} tom={frases?.tom} />

      <PerdaDaMedicao r={r} unidade={unidade} />

      <MotivosDasParadas r={r} unidade={unidade} />

      {leitura && <GraficoIntervalos leitura={leitura} unidade={unidade} altura={240} pisoLargura={240} />}

      {leitura?.suficiente && leitura.lacunas.length > 0 && (
        <section style={est.blocoSalva} aria-label="Lacunas">
          <h3 style={est.secaoSalva}>Onde a linha parou sem parada marcada</h3>
          <p style={est.notaSalva}>
            Intervalos acima de {leitura.criterios.fatorLacuna}× o normal ({seg(leitura.normalMs)}), na ordem em
            que aconteceram. O nº é o do eixo do gráfico.
          </p>
          {leitura.lacunas.map((l) => (
            <div key={l.indice} style={est.lacunaSalva}>
              <span>{unidade.singular.charAt(0).toUpperCase()}{unidade.singular.slice(1)} {l.indice + 2}</span>
              <span style={est.lacunaValor}>{seg(l.ms)}</span>
              <span style={est.lacunaAlem}>+{seg(l.ms - leitura.normalMs)}</span>
            </div>
          ))}
        </section>
      )}

      {registro.observacao && <div style={est.itemObservacao}>Obs.: {registro.observacao}</div>}

      <p style={est.notaSalva}>
        Resultado da cópia salva neste aparelho
        {leitura?.alvoMs ? ', contra o tempo-alvo de hoje do produto (o cadastro do painel agora)' : ''}.
        {' '}Se o produto ou as
        paradas foram corrigidos no PC, os números de lá valem: a correção não volta para cá. A análise
        do PCP continua sendo salva no PC, em Embalagem Takt Time.
        {conferencia.paradas.length > 0 && leitura
          ? ' A parada anotada depois, no resultado, fica dentro dos intervalos — pode aparecer como lacuna.'
          : ''}
      </p>

      <button type="button" style={est.botaoVoltarLista} onClick={aoVoltar}>
        ← Voltar às medições salvas
      </button>
    </section>
  );
}

/**
 * Os cartoes, na ordem do PC (Indicadores do VolumeAVolume): o veredito e
 * as camadas do "se nao parasse" em cima; volumes, paradas, lacunas e
 * volumes/hora embaixo. Volumes/hora e' o MESMO numero da linha da lista.
 */
function Cartoes({
  r, alvo, unidade, tom,
}) {
  const { leitura, conferencia } = r;
  const par = somarParadas(conferencia.paradas);
  const volumes = {
    chave: 'volumes',
    rotulo: unidade.plural,
    valor: String(conferencia.pecas),
    sub: leitura?.suficiente ? `${leitura.n} ${leitura.n === 1 ? 'intervalo medido' : 'intervalos medidos'}` : null,
  };
  const paradas = {
    chave: 'paradas',
    rotulo: 'Paradas marcadas',
    valor: par.totalMs > 0 ? formatarDuracao(par.totalMs) : '—',
    sub: par.n > 0
      ? `${par.n} ${par.n === 1 ? 'parada' : 'paradas'} na medição inteira, também fora dos toques`
      : 'nenhuma parada marcada',
  };
  const doDominio = porHoraDaMedicao(conferencia, unidade);
  const porHora = { ...doDominio, sub: `${doDominio.sub} — o mesmo da lista` };
  let lista;
  if (!leitura) lista = [volumes, paradas, porHora];
  else {
    const numeros = numerosDaLeitura(leitura, alvo, unidade);
    const k = Object.fromEntries(numeros.map((x) => [x.chave, x]));
    lista = leitura.suficiente
      ? [k.periodo, k.alvo, k.rodando, k.normal, volumes, paradas, k.lacunas, porHora]
      : [volumes, ...numeros, paradas, porHora];
  }
  const corVeredito = COR_DO_TOM[tom];
  return (
    <div style={est.gradeSalva}>
      {lista.map((x) => (
        <div
          key={x.chave}
          style={x.chave === 'periodo' && corVeredito
            ? { ...est.cartaoSalva, boxShadow: `inset 0 4px 0 ${corVeredito}` }
            : est.cartaoSalva}
        >
          <span style={est.cartaoRotulo}>{x.rotulo}</span>
          <ValorComUnidade valor={x.valor} />
          {x.sub && <span style={est.cartaoSub}>{x.sub}</span>}
        </div>
      ))}
    </div>
  );
}

/** "21.7 s" -> 21.7 grande e o "s" menor ao lado; o resto sai inteiro. */
function ValorComUnidade({ valor }) {
  const m = /^(\d[\d.,]*) ?(s|min|h)$/.exec(valor);
  if (!m) return <span style={est.cartaoValor}>{valor}</span>;
  return (
    <span style={est.cartaoValor}>
      {m[1]}<span style={est.cartaoUnidade}>{m[2]}</span>
    </span>
  );
}

/**
 * POR QUE A LINHA PAROU (v2.104.0) — as paradas desta medicao por motivo,
 * como no volume a volume do PC (ParadasPorMotivo), com a mesma conta
 * (paradasPorMotivo) e a mesma frase (frasesDasParadas). Logo depois do
 * "De onde veio", que diz quanto as paradas custaram; aqui, por qual
 * motivo. Vale tambem sem toques (medicao por horarios ou contagem
 * corrigida): o motivo nao depende de toque. Sem parada, nada — o cartao
 * Paradas marcadas ja' diz "nenhuma".
 *
 * Um motivo por linha, e nao o grid do PC: no tablet em pe' (400 a 800 px)
 * rotulo e tempo vao em cima e a barra embaixo, na largura toda. E' a
 * copia do aparelho: o motivo corrigido no PC nao volta para ca' (o pe' da
 * tela ja' avisa).
 */
function MotivosDasParadas({ r, unidade }) {
  const pm = paradasPorMotivo(r.conferencia.paradas);
  if (!pm) return null;
  // O "Paradas marcadas" do De onde veio, so' quando a linha dele aparece.
  const entreToquesMs = r.deixou?.partes.paradas > 0 ? r.deixou.partes.paradasMs : null;
  return (
    <section style={est.blocoSalva} aria-label="Paradas marcadas, por motivo">
      <h3 style={est.secaoSalva}>Por que a linha parou — paradas marcadas, por motivo</h3>
      {/* A copia do tablet nao recebe a parada anotada no PC: a frase diz
          "no resultado deste tablet". Sem toques, sem "fora dos toques". */}
      <p style={est.motivoNota}>
        {frasesDasParadas(pm, {
          unidade, saida: 'tablet', entreToquesMs, comToques: Boolean(r.leitura),
        })}
      </p>
      {pm.motivos.map((m) => (
        <div key={m.motivo} style={est.motivoSalva}>
          <div style={est.motivoLinha}>
            <span style={est.motivoRotulo}>{m.rotulo}</span>
            <span style={est.motivoValor}>{tempoSomado(m.ms)}</span>
          </div>
          <div style={est.motivoTrilha}>
            <div style={{ ...est.motivoBarra, width: `${Math.max(4, m.pct)}%` }} />
          </div>
          <span style={est.motivoSub}>{qtdParadas(m.n)} · {pctDoParado(m.pct)} do parado</span>
          {m.observacoes.length > 0 && <span style={est.motivoObs}>Obs.: {m.observacoes.join(' · ')}</span>}
        </div>
      ))}
    </section>
  );
}

/**
 * O que deixou de ser embalado: o total num passo so' e de onde veio, como
 * no PC (BlocoDeixou). Medicao sem o relogio entre os toques fica so' com
 * os roubados pelas paradas; o PC poe ao lado os das lacunas, que aqui
 * aparecem no cartao Lacunas (o mesmo numero, de roubadosPelasLacunas).
 */
function PerdaDaMedicao({ r, unidade }) {
  const qtd = (n) => (n === 1 ? unidade.singular : unidade.plural);
  const d = r.deixou;
  if (d?.total > 0) {
    const pct = d.saiu > 0 ? Math.round((d.total / d.saiu) * 100) : null;
    const causas = [
      ['Paradas marcadas', `${formatarDuracao(d.partes.paradasMs)} no cronômetro, entre o 1º e o último ${unidade.singular}`, d.partes.paradas],
      ['Lacunas', `paradas que ninguém marcou: ${tempoSomado(d.partes.lacunasMs)} além do normal`, d.partes.lacunas],
      [`Antes do 1º e depois do último ${unidade.singular}`, `${tempoSomado(d.partes.foraMs)} fora dos toques, além do ${unidade.singular} da largada`, d.partes.fora],
    ].filter(([, , n]) => n > 0);
    return (
      <section style={est.blocoSalva} aria-label={`${unidade.plural} que ${deixaramDe(unidade)}`}>
        <div style={est.deixouCab}>
          <span style={est.deixouNumero}>{d.total}</span>
          <span style={est.deixouTitulo}>{qtd(d.total)} {deixaramDe(unidade, d.total)} nesta medição</span>
        </div>
        <p style={est.deixouSub}>
          Saíram {d.saiu}. No passo da linha sem parada nem lacuna ({seg(d.passoMs)} por {unidade.singular}),
          {' '}teriam saído {d.potencial} no mesmo tempo{pct > 0 ? `: ${pct}% a mais.` : '.'}
        </p>
        <h3 style={est.secaoSalva}>De onde veio</h3>
        <div>
          {causas.map(([rotulo, sub, n]) => (
            <div key={rotulo} style={est.causa}>
              <span style={est.causaTexto}>
                <span style={est.causaRotulo}>{rotulo}</span>
                <span style={est.causaSub}>{sub}</span>
              </span>
              <span style={est.causaValor}>≈{n}</span>
            </div>
          ))}
        </div>
      </section>
    );
  }
  if (!d && r.roubo?.roubados > 0) {
    const { saiu, roubados, potencial } = r.roubo;
    const pct = saiu > 0 ? Math.round((roubados / saiu) * 100) : null;
    return (
      <section style={est.blocoSalva} aria-label={`${unidade.plural} que ${deixaramDe(unidade)}`}>
        <div style={est.deixouCab}>
          <span style={est.deixouNumero}>{roubados}</span>
          <span style={est.deixouTitulo}>{qtd(roubados)} {deixaramDe(unidade, roubados)} por causa das paradas</span>
        </div>
        <p style={est.deixouSub}>
          Saíram {saiu}. No passo da linha rodando, teriam saído {potencial} no mesmo tempo
          {pct > 0 ? `: ${pct}% a mais.` : '.'}
        </p>
      </section>
    );
  }
  return null;
}
