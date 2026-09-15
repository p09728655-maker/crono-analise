import { formatarDataHora } from '../../../domain/relatorioConferencias.js';
import { est } from './estilos.js';

/**
 * A JANELA DE TEMPO do relatorio, e o carimbo dela ao lado dos numeros.
 *
 * Ate' aqui o relatorio somava TODAS as medicoes nao arquivadas, para
 * sempre. Com vinte medicoes a tela ja' incomodava; o problema serio e'
 * outro: o "ritmo no relogio" do topo era a media ponderada de tudo o que
 * ja' foi medido. Em seis meses isso mistura pecas, operadores e o antes
 * e o depois de cada melhoria — um numero que nao e' o ritmo de nada, e
 * que ainda assim sustenta o veredito contra a demanda da semana.
 *
 * O PERIODO FICA ESCRITO AO LADO DO SELETOR, com quantas medicoes e de
 * que dias. Numero de producao sem periodo declarado e' a mesma classe de
 * problema do ritmo sem base: quem le' nao tem como saber do que ele fala.
 */
export const PERIODOS = [
  { dias: 7, rotulo: 'Últimos 7 dias' },
  { dias: 30, rotulo: 'Últimos 30 dias' },
  { dias: 90, rotulo: 'Últimos 90 dias' },
  // Zero e' "sem janela": a serie inteira, para quem quer olhar o historico.
  { dias: 0, rotulo: 'Tudo' },
];

const soData = (iso) => formatarDataHora(iso).split(' ')[0];

export default function SeletorPeriodo({ dias, aoTrocar, linhas, quandoMediu }) {
  /* De quando ate' quando, do que esta' EM TELA — nao do que a janela
     promete. Janela de 30 dias com medicao so' na ultima semana tem de
     dizer a ultima semana. */
  const carimbos = (linhas || [])
    .map((c) => quandoMediu(c))
    .filter((ts) => Number.isFinite(ts))
    .sort((a, b) => a - b);
  const de = carimbos.length ? soData(new Date(carimbos[0]).toISOString()) : null;
  const ate = carimbos.length ? soData(new Date(carimbos[carimbos.length - 1]).toISOString()) : null;

  return (
    <div style={est.periodoLinha}>
      <label style={est.demandaSeletor}>
        <span style={est.comparativoRotulo}>Período</span>
        <select
          style={est.demandaSelect}
          value={String(dias)}
          onChange={(ev) => aoTrocar(Number(ev.target.value))}
        >
          {PERIODOS.map((p) => (
            <option key={p.dias} value={String(p.dias)}>{p.rotulo}</option>
          ))}
        </select>
      </label>
      <span style={est.periodoCarimbo}>
        {linhas.length === 0
          ? 'nenhuma medição nesta janela'
          : (
            <>
              {linhas.length} medição(ões)
              {de && ate && (de === ate ? ` em ${de}` : ` de ${de} a ${ate}`)}
            </>
          )}
      </span>
    </div>
  );
}
