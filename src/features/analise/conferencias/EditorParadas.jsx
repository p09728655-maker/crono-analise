import { useState } from 'react';
import {
  faixaHoraria, formatarDuracao, numeroDecimal, rotuloMotivo, textoDecimal,
} from '../../../domain/cronoanalise.js';
import { codigoPreferido, useMotivosParada } from '../../../lib/motivosParada.js';
import { est } from './estilos.js';

/**
 * CADASTRO DE PARADAS de uma medicao — no PC.
 *
 * Quem confere no corredor raramente para para digitar o setup; quem monta
 * o relatorio, sim. Aqui a parada e' reconstituida depois, com o
 * apontamento na mao: motivo, minutos e uma observacao livre.
 *
 * A lista e' gravada INTEIRA (nao incremental): o que esta na tela vira o
 * estado final das paradas daquela medicao, entao corrigir um numero e
 * apagar uma linha usam o mesmo caminho e o mesmo botao.
 *
 * A soma nao pode alcancar o periodo: sem tempo de maquina rodando nao ha
 * ritmo, e a medicao sairia dos calculos sem dizer por que. O aviso
 * aparece antes de gravar — o servidor recusa igual, mas errar no botao e'
 * pior que errar antes dele.
 */
export default function EditorParadas({ conferencia, erro, ocupado, aoFechar, aoGravar }) {
  const motivos = useMotivosParada();
  const duracaoMs = Number(conferencia.duracao_ms) || 0;
  const [linhas, setLinhas] = useState(() => (conferencia.paradas || []).map((p, i) => ({
    chave: `p${i}`,
    motivo: p.motivo || 'outro',
    minutos: String(+((Number(p.duracaoMs ?? p.duracao_ms) || 0) / 60000).toFixed(2)),
    observacao: p.observacao || '',
  })));
  const [proxima, setProxima] = useState(0);

  const limpas = linhas
    .map((l) => ({
      motivo: l.motivo,
      duracaoMs: Math.round(numeroDecimal(l.minutos) * 60000),
      observacao: l.observacao.trim() || null,
    }))
    .filter((l) => l.duracaoMs > 0);

  const somaMs = limpas.reduce((acc, l) => acc + l.duracaoMs, 0);
  const excede = somaMs >= duracaoMs;
  const produtivoMs = Math.max(0, duracaoMs - somaMs);

  const adicionar = (motivo) => {
    setLinhas((l) => [...l, { chave: `n${proxima}`, motivo, minutos: '', observacao: '' }]);
    setProxima((n) => n + 1);
  };
  const alterar = (chave, campo, valor) =>
    setLinhas((l) => l.map((x) => (x.chave === chave ? { ...x, [campo]: valor } : x)));
  const remover = (chave) => setLinhas((l) => l.filter((x) => x.chave !== chave));

  return (
    <div style={est.modal} role="dialog" aria-label="Paradas da medição">
      <div style={{ ...est.caixaModal, maxWidth: 620 }}>
        <h2 style={est.tituloModal}>Paradas do período</h2>
        <p style={est.textoModal}>
          <strong>{[conferencia.maquina, conferencia.peca].filter(Boolean).join(' · ') || 'Sem identificação'}</strong>
          {faixaHoraria(conferencia) ? ` · ${faixaHoraria(conferencia)}` : ''}
          {' · '}{formatarDuracao(duracaoMs)} · {conferencia.pecas} pç
        </p>
        <p style={est.textoModal}>
          Marque quanto tempo a máquina ficou parada dentro deste período. O ritmo
          passa a ser calculado sobre o tempo em que ela <strong>rodou</strong> — e a
          medição continua contando, em vez de ser arquivada.
        </p>

        <div style={est.linhaBotoesParada}>
          <button
            type="button" style={est.botaoSetup}
            onClick={() => adicionar(codigoPreferido(motivos, 'setup'))}
          >
            + Setup / troca
          </button>
          <button
            type="button" style={est.botaoSecundario}
            onClick={() => adicionar(codigoPreferido(motivos, 'falta_material'))}
          >
            + Outra parada
          </button>
        </div>

        {linhas.length === 0 ? (
          <p style={est.textoModal}>
            Nenhuma parada marcada — o período inteiro conta como máquina rodando.
          </p>
        ) : (
          <div style={est.listaParadas}>
            {linhas.map((l) => (
              <div key={l.chave} style={est.linhaParada}>
                <select
                  value={l.motivo}
                  onChange={(ev) => alterar(l.chave, 'motivo', ev.target.value)}
                  style={est.selectMotivo}
                  aria-label="Motivo da parada"
                >
                  {motivos.map((m) => (
                    <option key={m.codigo} value={m.codigo}>{m.rotulo}</option>
                  ))}
                </select>
                {/* TEXTO, nao `type="number"`: o teclado numerico brasileiro
                    manda VIRGULA e o campo numerico a descarta em silencio —
                    "1,25" virava 125. Mesma correcao do celular. */}
                <input
                  type="text"
                  inputMode="decimal"
                  value={l.minutos}
                  onChange={(ev) => alterar(l.chave, 'minutos', textoDecimal(ev.target.value))}
                  style={est.inputMinutos}
                  aria-label={`Minutos parada — ${rotuloMotivo(l.motivo)}`}
                />
                <span style={est.sufixoMinutos}>min</span>
                <input
                  type="text"
                  placeholder="Observação (opcional)"
                  value={l.observacao}
                  onChange={(ev) => alterar(l.chave, 'observacao', ev.target.value)}
                  style={est.inputObs}
                  aria-label="Observação da parada"
                />
                <button
                  type="button"
                  style={est.botaoExcluir}
                  onClick={() => remover(l.chave)}
                  aria-label={`Remover parada ${rotuloMotivo(l.motivo)}`}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        <p style={est.textoModal}>
          Período {formatarDuracao(duracaoMs)} · parado {somaMs > 0 ? formatarDuracao(somaMs) : '—'}
          {' · '}máquina rodando {produtivoMs > 0 ? formatarDuracao(produtivoMs) : '—'}
        </p>

        {excede && (
          <div style={est.faixaErro} role="alert">
            As paradas somam o período inteiro — não sobraria tempo de máquina rodando.
          </div>
        )}
        {erro && <div style={est.faixaErro} role="alert">{erro}</div>}

        <div style={est.acoesModal}>
          <button type="button" style={est.botaoSecundario} onClick={aoFechar}>
            Cancelar
          </button>
          <button
            type="button"
            style={{ ...est.botaoImprimir, flex: 1 }}
            onClick={() => aoGravar(limpas)}
            disabled={ocupado || excede}
          >
            {ocupado ? 'Gravando...' : 'Gravar paradas'}
          </button>
        </div>
      </div>
    </div>
  );
}
