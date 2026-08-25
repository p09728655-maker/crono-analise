import { useCallback, useEffect, useMemo, useState } from 'react';
import { claro, fonteAnalise } from '../../theme/tokensAnalise.js';
import {
  amostraSuficiente, calcularOperacao, formatarSegundos, operadoresNecessarios,
} from '../../domain/cronoanalise.js';
import { obterEstudo } from '../../lib/api.js';
import { CartaControle, GraficoYamazumi } from './graficos.jsx';
import { LOGO_PATRIMAR } from '../../theme/logo.js';
import RelatorioImpressao from './RelatorioImpressao.jsx';

/**
 * PAINEL DE ANALISE — desktop.
 *
 * Usuario: analista sentado, no escritorio, decidindo dimensionamento ou
 * levando o resultado para uma reuniao.
 *
 * Perguntas que a tela precisa responder, nesta ordem:
 *   1. O estudo tem base estatistica para decidir?
 *   2. Onde esta o gargalo?
 *   3. Quantos operadores a linha precisa?
 *   4. Qual operacao esta instavel e por que?
 */
export default function PainelAnalise({ estudoId, aoVoltar, aoColetar }) {
  const [dados, setDados] = useState(null);
  const [estado, setEstado] = useState('carregando');
  const [erro, setErro] = useState(null);
  const [opSelecionada, setOpSelecionada] = useState(null);

  const carregar = useCallback(async () => {
    setEstado('carregando');
    try {
      setDados(await obterEstudo(estudoId));
      setEstado('pronto');
    } catch (e) {
      setErro(e.message);
      setEstado('erro');
    }
  }, [estudoId]);

  useEffect(() => { carregar(); }, [carregar]);

  const analise = useMemo(() => {
    if (!dados) return null;
    const tolerancia = Number(dados.estudo.tolerancia_pct);
    const taktMs = dados.estudo.takt_time_ms ? Number(dados.estudo.takt_time_ms) : 0;

    const operacoes = dados.operacoes.map((op) => ({
      ...op,
      resultado: calcularOperacao({ ...op, fr: Number(op.fr_pct) }, tolerancia),
    }));

    const comDados = operacoes.filter((o) => o.resultado);
    const somaTp = comDados.reduce((acc, o) => acc + o.resultado.tpVal, 0);
    const gargalo = comDados.reduce((pior, o) => (!pior || o.resultado.tpVal > pior.resultado.tpVal ? o : pior), null);

    return {
      tolerancia,
      taktMs,
      operacoes,
      comDados,
      somaTp,
      gargalo,
      // Capacidade da linha e' ditada pelo gargalo, nao pela media.
      capacidadeLinha: gargalo ? gargalo.resultado.cap : 0,
      operadores: taktMs > 0 ? operadoresNecessarios(somaTp, taktMs) : null,
      totalCiclos: comDados.reduce((acc, o) => acc + o.resultado.n, 0),
      pendencias: operacoes
        .map((o) => ({ op: o, s: amostraSuficiente(o.resultado, dados.estudo.meta_obs) }))
        .filter((x) => !x.s.ok),
    };
  }, [dados]);

  useEffect(() => {
    if (analise?.comDados.length && !opSelecionada) setOpSelecionada(analise.comDados[0].id);
  }, [analise, opSelecionada]);

  if (estado === 'carregando') return <Estado texto="Carregando estudo..." />;
  if (estado === 'erro') return <Estado texto={`Falha ao carregar: ${erro}`} acao={{ rotulo: 'Tentar de novo', aoClicar: carregar }} />;

  const { estudo } = dados;
  const opCarta = analise.comDados.find((o) => o.id === opSelecionada) || analise.comDados[0];

  return (
    <div style={est.tela}>
      {/* Versao de impressao: escondida na tela, e' a unica coisa visivel no papel. */}
      <RelatorioImpressao estudo={estudo} analise={analise} />

      <div className="somente-tela">
        <header style={est.cabecalho}>
          <button type="button" onClick={aoVoltar} style={est.botaoVoltar}>← Estudos</button>
          {/* Variante para fundo claro: o painel de analise usa tema claro. */}
          <img src={LOGO_PATRIMAR} alt="Patrimar Móveis" style={est.logo} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={est.titulo}>{estudo.nome}</h1>
            <p style={est.subtitulo}>
              {[estudo.recurso, estudo.produto, estudo.analista].filter(Boolean).join(' · ')}
              {' · '}Tolerância {analise.tolerancia}%
            </p>
          </div>
          <button type="button" onClick={() => window.print()} style={est.botaoImprimir}>
            Imprimir relatório
          </button>
        </header>

        {analise.pendencias.length > 0 && (
          <div style={est.avisoAmostra}>
            <strong>⚠ {analise.pendencias.length} operação(ões) sem amostra suficiente.</strong>
            <span> Os números abaixo já servem para orientar, mas não para fechar dimensionamento:</span>
            <ul style={est.listaPendencias}>
              {analise.pendencias.map(({ op, s }) => (
                <li key={op.id}>
                  <strong>{op.nome}</strong> — {s.motivo}
                  {aoColetar && (
                    <button type="button" style={est.linkColeta} onClick={() => aoColetar(estudo, op)}>
                      cronometrar
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        <section style={est.indicadores}>
          <Indicador rotulo="Operações" valor={analise.operacoes.length} />
          <Indicador rotulo="Ciclos coletados" valor={analise.totalCiclos} />
          <Indicador rotulo="Σ Tempo padrão" valor={formatarSegundos(analise.somaTp)} sufixo="s" />
          <Indicador
            rotulo="Capacidade da linha"
            valor={analise.capacidadeLinha || '—'}
            sufixo="pç/h"
            nota={analise.gargalo ? `limitada por ${analise.gargalo.nome}` : null}
          />
          <Indicador
            rotulo="Operadores necessários"
            valor={analise.operadores !== null ? analise.operadores.toFixed(2) : '—'}
            nota={analise.operadores !== null
              ? `arredondar para ${Math.ceil(analise.operadores)}`
              : 'informe o Takt Time'}
          />
        </section>

        <GraficoYamazumi operacoes={analise.comDados} taktMs={analise.taktMs} />

        <TabelaOperacoes analise={analise} metaObs={estudo.meta_obs} />

        {analise.comDados.length > 0 && (
          <section>
            <div style={est.seletor}>
              <span style={est.seletorRotulo}>Carta de controle:</span>
              {analise.comDados.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setOpSelecionada(o.id)}
                  style={{ ...est.aba, ...(o.id === opCarta?.id ? est.abaAtiva : {}) }}
                >
                  {o.nome}
                </button>
              ))}
            </div>
            {opCarta && <CartaControle operacao={opCarta} />}
          </section>
        )}
      </div>
    </div>
  );
}

function TabelaOperacoes({ analise, metaObs }) {
  return (
    <section style={est.blocoTabela}>
      <h2 style={est.tituloSecao}>Operações</h2>
      <div style={{ overflowX: 'auto' }}>
        <table style={est.tabela}>
          <thead>
            <tr>
              <th style={est.th}>Operação</th>
              <th style={est.thNum}>Ciclos</th>
              <th style={est.thNum}>FR</th>
              <th style={est.thNum}>TO (s)</th>
              <th style={est.thNum}>TN (s)</th>
              <th style={est.thNum}>TP (s)</th>
              <th style={est.thNum}>CV%</th>
              <th style={est.thNum}>Cap/h</th>
              <th style={est.th}>Estabilidade</th>
            </tr>
          </thead>
          <tbody>
            {analise.operacoes.map((op) => {
              const r = op.resultado;
              const ehGargalo = analise.gargalo?.id === op.id;
              return (
                <tr key={op.id} style={ehGargalo ? est.linhaGargalo : undefined}>
                  <td style={est.td}>
                    {op.nome}
                    {ehGargalo && <span style={est.selo}>GARGALO</span>}
                  </td>
                  <td style={est.tdNum}>
                    {r ? r.n : 0}
                    <span style={est.meta}>/{metaObs}</span>
                  </td>
                  <td style={est.tdNum}>{Number(op.fr_pct)}%</td>
                  <td style={est.tdNum}>{r ? formatarSegundos(r.toMed) : '—'}</td>
                  <td style={est.tdNum}>{r ? formatarSegundos(r.tnMed) : '—'}</td>
                  <td style={{ ...est.tdNum, fontWeight: 700 }}>{r ? formatarSegundos(r.tpVal) : '—'}</td>
                  <td style={est.tdNum}>{r ? r.cvPct.toFixed(1) : '—'}</td>
                  <td style={est.tdNum}>{r ? r.cap : '—'}</td>
                  <td style={est.td}>
                    {r ? (
                      <span style={est.estabilidade}>
                        <span style={{ ...est.ponto, background: corNivel(r.estabilidade.nivel) }} />
                        {r.estabilidade.rotulo}
                      </span>
                    ) : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Indicador({ rotulo, valor, sufixo, nota }) {
  return (
    <div style={est.indicador}>
      <span style={est.indicadorRotulo}>{rotulo}</span>
      <span style={est.indicadorValor}>
        {valor}{sufixo && <span style={est.indicadorSufixo}>{sufixo}</span>}
      </span>
      {nota && <span style={est.indicadorNota}>{nota}</span>}
    </div>
  );
}

function Estado({ texto, acao }) {
  return (
    <div style={est.estadoVazio}>
      <p>{texto}</p>
      {acao && <button type="button" style={est.botaoImprimir} onClick={acao.aoClicar}>{acao.rotulo}</button>}
    </div>
  );
}

const corNivel = (n) => ({ estavel: claro.ok, atencao: claro.atencao, critico: claro.critico }[n] || claro.neutro);

const est = {
  tela: { minHeight: '100vh', background: claro.fundo, color: claro.texto, fontFamily: fonteAnalise.familia, padding: 24 },
  cabecalho: { display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24, maxWidth: 1280, margin: '0 auto 24px' },
  botaoVoltar: {
    minHeight: 40, padding: '0 16px', background: claro.papel, border: `1px solid ${claro.borda}`,
    borderRadius: 8, color: claro.textoMedio, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit',
  },
  logo: { height: 36, width: 'auto', display: 'block', flexShrink: 0 },
  titulo: { margin: 0, fontSize: 22, fontWeight: 700 },
  subtitulo: { margin: '2px 0 0', fontSize: 13, color: claro.textoFraco },
  botaoImprimir: {
    minHeight: 40, padding: '0 20px', background: claro.vermelho, border: 'none',
    borderRadius: 8, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
  },
  avisoAmostra: {
    maxWidth: 1280, margin: '0 auto 20px', padding: 16, fontSize: 13, lineHeight: 1.6,
    background: claro.atencaoFundo, border: `1px solid ${claro.atencao}`, borderRadius: 8,
  },
  listaPendencias: { margin: '8px 0 0', paddingLeft: 20 },
  linkColeta: {
    marginLeft: 8, padding: '2px 8px', background: 'transparent', border: `1px solid ${claro.bordaForte}`,
    borderRadius: 4, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', color: claro.textoMedio,
  },
  indicadores: {
    maxWidth: 1280, margin: '0 auto 20px',
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12,
  },
  indicador: {
    background: claro.papel, border: `1px solid ${claro.borda}`, borderRadius: 10, padding: 16,
    display: 'flex', flexDirection: 'column', gap: 2,
  },
  indicadorRotulo: { fontSize: 11, letterSpacing: 0.6, color: claro.textoFraco, textTransform: 'uppercase', fontWeight: 600 },
  indicadorValor: { fontSize: 28, fontWeight: 700, fontFamily: fonteAnalise.numero, lineHeight: 1.2 },
  indicadorSufixo: { fontSize: 13, color: claro.textoFraco, marginLeft: 4, fontWeight: 400 },
  indicadorNota: { fontSize: 11, color: claro.textoFraco, fontStyle: 'italic' },
  blocoTabela: { maxWidth: 1280, margin: '20px auto', background: claro.papel, border: `1px solid ${claro.borda}`, borderRadius: 10, padding: 20 },
  tituloSecao: { margin: '0 0 12px', fontSize: 15, fontWeight: 700 },
  tabela: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: { textAlign: 'left', padding: '8px 10px', borderBottom: `2px solid ${claro.bordaForte}`, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: claro.textoFraco },
  thNum: { textAlign: 'right', padding: '8px 10px', borderBottom: `2px solid ${claro.bordaForte}`, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: claro.textoFraco },
  td: { padding: '10px', borderBottom: `1px solid ${claro.borda}` },
  tdNum: { padding: '10px', borderBottom: `1px solid ${claro.borda}`, textAlign: 'right', fontFamily: fonteAnalise.numero },
  linhaGargalo: { background: 'rgba(194,65,12,0.06)' },
  selo: { marginLeft: 8, padding: '2px 6px', background: claro.critico, color: '#fff', borderRadius: 3, fontSize: 9, fontWeight: 700, letterSpacing: 0.5 },
  meta: { color: claro.textoFraco, fontSize: 11 },
  estabilidade: { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 },
  ponto: { width: 8, height: 8, borderRadius: '50%' },
  seletor: { maxWidth: 1280, margin: '20px auto 12px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  seletorRotulo: { fontSize: 12, color: claro.textoFraco, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 },
  aba: {
    minHeight: 34, padding: '0 14px', background: claro.papel,
    // Longhand: `abaAtiva` troca so' o borderColor.
    borderWidth: 1, borderStyle: 'solid', borderColor: claro.borda,
    borderRadius: 6, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', color: claro.textoMedio,
  },
  abaAtiva: { borderColor: claro.vermelho, color: claro.texto, fontWeight: 700 },
  estadoVazio: { minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, background: claro.fundo, color: claro.textoMedio, fontFamily: fonteAnalise.familia },
};
