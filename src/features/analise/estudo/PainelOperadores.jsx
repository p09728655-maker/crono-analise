import { useEffect, useState } from 'react';
import { Kpi } from './Capacidade.jsx';
import { claro } from '../../../theme/tokensAnalise.js';
import { dimensionarOperadores, formatarSegundos } from '../../../domain/cronoanalise.js';
import { est } from './estilos.js';

/**
 * QUANTOS OPERADORES — necessario x atual.
 *
 * A formula fica escrita na tela de proposito. Este e' o numero que vai a'
 * reuniao pedir ou devolver gente, e quem defende precisa mostrar a conta,
 * nao so' o resultado.
 *
 * O "quantos voce tem hoje" e' um E-SE do analista, nao um cadastro: fica
 * neste navegador (localStorage), por estudo, e nao sobe para o banco.
 */
export default function PainelOperadores({ estudoId, analise, aoDefinirTakt }) {
  const chave = `ritmopatrimar.operadores.${estudoId}`;
  const [atuais, setAtuais] = useState(() => {
    try { return localStorage.getItem(chave) || ''; } catch { return ''; }
  });

  useEffect(() => {
    try {
      if (atuais) localStorage.setItem(chave, atuais);
      else localStorage.removeItem(chave);
    } catch { /* navegador sem storage: o e-se vale so' nesta sessao */ }
  }, [chave, atuais]);

  const dim = dimensionarOperadores({
    somaTpMs: analise.somaTp, taktMs: analise.taktMs, operadoresAtuais: atuais,
  });

  if (!dim) {
    return (
      <section style={est.blocoTabela} aria-label="Dimensionamento de operadores">
        <div style={est.cabecalhoSecao}>
          <h2 style={est.tituloSecao}>Quantos operadores preciso?</h2>
          <button type="button" style={est.botaoImprimir} onClick={aoDefinirTakt}>
            Definir Takt Time
          </button>
        </div>
        <p style={est.vazioParadas}>
          O dimensionamento é <strong>Σ TP ÷ Takt Time</strong>: sem o Takt não há
          ritmo exigido com que comparar o tempo padrão, e o número de operadores
          não existe. O Takt sai da demanda do período — quantas peças, em quantas
          horas — e se configura em <strong>Editar estudo</strong>.
        </p>
      </section>
    );
  }

  const maiorTp = Math.max(...analise.comDados.map((o) => o.resultado.tpPorPeca), 1);

  return (
    <section style={est.blocoTabela} aria-label="Dimensionamento de operadores">
      <div style={est.cabecalhoSecao}>
        <h2 style={est.tituloSecao}>Quantos operadores preciso?</h2>
      </div>

      <div style={est.blocoFormula}>
        <div style={est.formulaTitulo}>N° de operadores = Σ TP ÷ Takt Time</div>
        <div style={est.formulaConta}>
          {formatarSegundos(analise.somaTp)} s ÷ {formatarSegundos(analise.taktMs)} s
          {' = '}{dim.exato.toFixed(2)} → arredonda para cima ={' '}
          <strong style={est.formulaResultado}>{dim.necessarios}</strong>
        </div>
      </div>

      <div style={est.gradeKpi}>
        <Kpi
          rotuloKpi="Operadores necessários"
          valor={String(dim.necessarios)}
          nota={`cálculo exato: ${dim.exato.toFixed(2)} — meio operador não existe no posto`}
          cor={claro.vermelho}
        />
        <Kpi
          rotuloKpi="Ocupação com esse nº"
          valor={`${dim.eficienciaPct.toFixed(1)}%`}
          nota={dim.eficienciaPct >= 85 ? 'time bem aproveitado' : 'sobra tempo do arredondamento'}
          cor={dim.eficienciaPct >= 85 ? claro.ok : claro.atencao}
        />
        <Kpi
          rotuloKpi="Σ Tempo padrão"
          valor={formatarSegundos(analise.somaTp)}
          unidade="s"
          nota={`${analise.comDados.length} operação(ões) somadas`}
          cor={claro.borda}
        />
        <Kpi
          rotuloKpi="Takt Time"
          valor={formatarSegundos(analise.taktMs)}
          unidade="s"
          nota="ritmo exigido pela demanda"
          cor={claro.borda}
        />
      </div>

      <div style={est.listaContribuicao} aria-label="Contribuição de cada operação">
        <span style={est.rotuloBloco}>Contribuição de cada operação</span>
        {analise.comDados.map((o) => {
          const ops = o.resultado.tpPorPeca / analise.taktMs;
          return (
            <div key={o.id} style={est.linhaContribuicao}>
              <span style={est.contribNome} title={o.nome}>{o.nome}</span>
              <span style={est.contribTempo}>{formatarSegundos(o.resultado.tpPorPeca)} s</span>
              <div style={est.barraTrilho}>
                <div style={{ ...est.barraValor, width: `${Math.max(2, (o.resultado.tpPorPeca / maiorTp) * 100)}%`, background: claro.textoMedio }} />
              </div>
              <span style={est.contribOps}>{ops.toFixed(2)} op</span>
            </div>
          );
        })}
      </div>

      <div style={est.blocoAtual}>
        <label style={est.rotuloBloco} htmlFor="operadores-hoje">Quantos operadores você tem hoje?</label>
        <div style={est.linhaAtual}>
          <input
            id="operadores-hoje"
            type="number"
            min="0"
            step="1"
            inputMode="numeric"
            placeholder="—"
            value={atuais}
            onChange={(ev) => setAtuais(ev.target.value)}
            style={est.inputOperadores}
          />
          {dim.diferenca !== null && <VereditoTime dim={dim} />}
        </div>
        <span style={est.notaAtual}>
          Fica guardado neste computador, por estudo. É simulação do analista — não
          vai para o banco nem sai no relatório.
        </span>
      </div>
    </section>
  );
}

/** O veredito do time atual: sobra, falta ou fecha. */
function VereditoTime({ dim }) {
  const sobra = dim.diferenca > 0;
  const fecha = dim.diferenca === 0;
  const cor = fecha ? claro.ok : (sobra ? claro.atencao : claro.critico);

  return (
    <div style={{ ...est.veredito, borderColor: cor }} role="status">
      <strong style={{ color: cor }}>
        {fecha && 'Time dimensionado'}
        {sobra && `Sobra${dim.diferenca > 1 ? 'm' : ''} ${dim.diferenca} operador${dim.diferenca > 1 ? 'es' : ''}`}
        {!fecha && !sobra && `Falta${dim.diferenca < -1 ? 'm' : ''} ${Math.abs(dim.diferenca)} operador${dim.diferenca < -1 ? 'es' : ''}`}
      </strong>
      <span style={est.vereditoTexto}>
        Tem {dim.atuais}, precisa de {dim.necessarios}.
        {' '}Ocupação do time atual: {dim.eficienciaAtualPct.toFixed(1)}%.
        {sobra && ' Avalie realocar — ou rever o Takt, se a demanda usada no cálculo já não é a atual.'}
        {!fecha && !sobra && ' Com esse time a linha não atinge o ritmo da demanda.'}
      </span>
    </div>
  );
}

