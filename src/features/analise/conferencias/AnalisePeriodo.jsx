import { useState } from 'react';
import { analisarConferenciasComIa } from '../../../lib/api.js';
import { est } from './estilos.js';

/**
 * ANALISE DO PERIODO — o algoritmo primeiro, a IA como opcao.
 *
 * Ate' 31/08 a leitura dos numeros so' existia via IA: cada clique gastava
 * a chave do usuario para dizer o que os proprios numeros ja' diziam. A
 * analise agora e' GERADA POR REGRA (analisarConferencias, no dominio):
 * aparece na hora, de graca, offline — e identica para os mesmos numeros.
 *
 * A IA continua como botao OPCIONAL, discreto, para quem quer uma segunda
 * leitura em texto corrido: sobe o mesmo resumo por maquina de sempre
 * (incluindo `confiavel` e os motivos). Ambas seguem o filtro da lateral.
 */
export default function AnalisePeriodo({ secoes, resumo, noPapel, aoAlternarPapel }) {
  const [rodando, setRodando] = useState(false);
  const [resposta, setResposta] = useState(null);
  const [erro, setErro] = useState(null);

  async function analisar() {
    setRodando(true);
    setErro(null);
    try {
      setResposta(await analisarConferenciasComIa({
        maquinas: resumo.map((g) => ({
          maquina: g.maquina,
          n: g.n,
          pecas: g.totalPecas,
          minutos: +(g.totalMs / 60000).toFixed(1),
          minutosProdutivos: +(g.totalProdutivoMs / 60000).toFixed(1),
          minutosParados: +(g.totalParadaMs / 60000).toFixed(1),
          minutosSetup: +(g.totalSetupMs / 60000).toFixed(1),
          disponibilidadePct: +g.disponibilidadePct.toFixed(1),
          paradas: g.paradasPorMotivo.map((m) => ({ motivo: m.rotulo, minutos: +(m.ms / 60000).toFixed(1) })),
          ritmo: +g.ritmoMedio.toFixed(1),
          cicloSeg: +(g.cicloMedioMs / 1000).toFixed(2),
          acionamentos: g.totalAcionamentos,
          cicloMotorSeg: +(g.cicloMotorMs / 1000).toFixed(2),
          cvPct: g.cvPct != null ? +g.cvPct.toFixed(1) : null,
          melhor: g.melhor ? +g.melhor.ritmo.toFixed(1) : null,
          pior: g.pior ? +g.pior.ritmo.toFixed(1) : null,
          confiavel: g.confiavel,
          motivos: g.motivos,
        })),
      }));
    } catch (e) { setErro(e.message); }
    setRodando(false);
  }

  return (
    <section style={est.painelIa} aria-label="Análise do período">
      <div style={est.analiseTopo}>
        <div style={{ minWidth: 0 }}>
          <h2 style={est.iaTitulo}>Análise do período</h2>
          <p style={est.iaTexto}>
            Gerada na hora pelos números deste relatório — sem IA, sem custo, funciona sem internet.
          </p>
        </div>
        {/* A opcao mora ONDE a analise mora: quem le e quer levar para a
            reuniao marca aqui, e a folha A4 passa a sair com a analise.
            A escolha fica gravada no navegador. */}
        <label style={est.rotuloPapel}>
          <input
            type="checkbox"
            checked={noPapel}
            onChange={aoAlternarPapel}
            style={est.caixaPapel}
          />
          Sair na impressão
        </label>
      </div>

      {secoes.map((s) => (
        <div key={s.titulo} style={est.analiseSecao}>
          <h3 style={est.analiseTitulo}>{s.titulo}</h3>
          {s.linhas.map((l) => (
            <p key={l} style={est.analiseLinha}>{l}</p>
          ))}
        </div>
      ))}

      {/* A IA vira opcao, atras de um botao discreto: quem quiser uma
          segunda leitura em texto corrido paga o token; ninguem mais
          precisa da chave para ter analise. */}
      <div style={est.iaOpcional}>
        <span style={est.iaTexto}>
          Quer uma segunda leitura, em texto corrido? Opcional — usa a chave da IA.
        </span>
        <button type="button" style={est.botaoSecundario} onClick={analisar} disabled={rodando}>
          {rodando ? 'Analisando...' : 'Analisar com IA'}
        </button>
      </div>

      {erro && <div style={est.iaErro}>{erro}</div>}

      {resposta && (
        <div style={est.iaResposta}>
          <div style={est.iaRespostaTexto}>{resposta.analise}</div>
          <div style={est.iaMeta}>
            Gerada por {resposta.modelo}
            {resposta.uso?.saida ? ` · ${resposta.uso.saida} tokens` : ''} — confira antes de
            decidir: a IA lê os números, não o posto.
          </div>
        </div>
      )}
    </section>
  );
}
