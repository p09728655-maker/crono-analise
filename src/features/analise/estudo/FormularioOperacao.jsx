import { useState } from 'react';
import { FR_PRESETS } from '../../../domain/cronoanalise.js';
import { est } from './estilos.js';

/**
 * Cadastro de operacao — no PC, de proposito.
 *
 * Definir o que sera cronometrado e avaliar o fator de ritmo exige olhar o
 * processo com calma. E' trabalho de escritorio. O celular no posto serve
 * para coletar ciclo, nao para montar estudo.
 */
export default function FormularioOperacao({ aoSalvar, aoCancelar }) {
  const [nome, setNome] = useState('');
  const [descricao, setDescricao] = useState('');
  const [frPct, setFrPct] = useState(100);
  const [ciclosPorPeca, setCiclosPorPeca] = useState(1);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState(null);

  async function enviar(ev) {
    ev.preventDefault();
    if (!nome.trim()) { setErro('Informe o nome da operação.'); return; }
    setSalvando(true);
    setErro(null);
    try { await aoSalvar({ nome, descricao, frPct, ciclosPorPeca: Number(ciclosPorPeca) || 1 }); }
    catch (e) { setErro(e.message); setSalvando(false); }
  }

  return (
    <div style={est.modal} role="dialog" aria-label="Nova operacao">
      <form style={est.formulario} onSubmit={enviar}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Nova operação</h2>

        <label style={est.campo}>
          <span style={est.rotuloCampo}>Nome da operação *</span>
          <input style={est.input} value={nome} onChange={(e) => setNome(e.target.value)} autoFocus />
          <span style={est.dica}>Ex: Furar lateral direita</span>
        </label>

        <label style={est.campo}>
          <span style={est.rotuloCampo}>Descrição</span>
          <input style={est.input} value={descricao} onChange={(e) => setDescricao(e.target.value)} />
          <span style={est.dica}>Onde começa e onde termina o ciclo. Evita medir coisas diferentes.</span>
        </label>

        <label style={est.campo}>
          <span style={est.rotuloCampo}>Ciclos por peça</span>
          <input
            type="number" min="1" max="999" style={est.input}
            value={ciclosPorPeca}
            onChange={(e) => setCiclosPorPeca(e.target.value)}
          />
          <span style={est.dica}>
            Quantas vezes esta operação se repete para produzir <strong>uma peça</strong>.
            Uma peça com 3 furações leva 3× o tempo de uma com 1 — sem isso a
            capacidade sai superestimada.
          </span>
        </label>

        <fieldset style={est.fieldset}>
          <legend style={est.rotuloCampo}>Fator de ritmo (FR)</legend>
          <div style={est.grupoFr}>
            {FR_PRESETS.map((preset) => (
              <button
                key={preset.valor}
                type="button"
                onClick={() => setFrPct(preset.valor)}
                style={{ ...est.botaoFr, ...(frPct === preset.valor ? est.botaoFrAtivo : {}) }}
              >
                <strong>{preset.valor}%</strong>
                <span style={{ fontSize: 10 }}>{preset.rotulo}</span>
              </button>
            ))}
          </div>
          <span style={est.dica}>
            Avalie o ritmo do operador com honestidade. FR errado distorce o estudo inteiro:
            ele multiplica direto o tempo observado.
          </span>
        </fieldset>

        {erro && <div style={est.erroForm}>{erro}</div>}

        <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
          <button type="button" style={est.botaoSecundario} onClick={aoCancelar} disabled={salvando}>
            Cancelar
          </button>
          <button type="submit" style={{ ...est.botaoImprimir, flex: 1 }} disabled={salvando}>
            {salvando ? 'Salvando...' : 'Adicionar operação'}
          </button>
        </div>
      </form>
    </div>
  );
}

