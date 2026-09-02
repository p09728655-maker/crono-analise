import { useState } from 'react';
import { espaco, tipo } from '../../../theme/escala.js';
import { formatarSegundos, taktTime } from '../../../domain/cronoanalise.js';
import SeletorMaquina from '../../../components/SeletorMaquina.jsx';
import { est } from './estilos.js';

/**
 * Ajustes do estudo.
 *
 * Existe porque tolerancia, meta de observacoes e Takt Time sao decisoes que
 * mudam DEPOIS de comecar a coletar: o analista descobre a demanda real, ou
 * revisa a tolerancia ao ver as condicoes do posto. Sem isto, corrigir um
 * desses campos exigiria recriar o estudo e perder os ciclos ja coletados.
 */
export default function AjustesDoEstudo({ estudo, analistas = [], aoSalvar, aoCancelar }) {
  const [nome, setNome] = useState(estudo.nome || '');
  const [produto, setProduto] = useState(estudo.produto || '');
  const [recurso, setRecurso] = useState(estudo.recurso || '');
  const [setor, setSetor] = useState(estudo.setor || '');
  const [analista, setAnalista] = useState(estudo.analista || '');
  const [analistaId, setAnalistaId] = useState(estudo.analista_id || '');
  const [tolerancia, setTolerancia] = useState(Number(estudo.tolerancia_pct) || 15);
  const [metaObs, setMetaObs] = useState(Number(estudo.meta_obs) || 12);
  const [taktSeg, setTaktSeg] = useState(
    estudo.takt_time_ms ? formatarSegundos(Number(estudo.takt_time_ms), 1) : '',
  );
  const [calc, setCalc] = useState({ quantidade: '', horas: '' });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState(null);

  function aplicarCalculo(novo) {
    setCalc(novo);
    const qtd = Number(novo.quantidade);
    const horas = Number(novo.horas);
    if (qtd > 0 && horas > 0) setTaktSeg(formatarSegundos(taktTime(horas * 3600, qtd), 1));
  }

  async function enviar(ev) {
    ev.preventDefault();
    setSalvando(true);
    setErro(null);
    const ms = taktSeg ? Math.round(Number(taktSeg) * 1000) : null;
    if (!nome.trim()) { setErro('O estudo precisa de um nome.'); setSalvando(false); return; }
    try {
      await aoSalvar({
        nome: nome.trim(),
        produto: produto.trim() || null,
        recurso: recurso.trim() || null,
        setor: setor.trim() || null,
        analista: analista.trim() || null,
        analistaId: analistaId || null,
        toleranciaPct: Number(tolerancia),
        metaObs: Number(metaObs),
        taktTimeMs: ms && ms > 0 ? ms : null,
      });
    } catch (e) { setErro(e.message); setSalvando(false); }
  }

  return (
    <div style={est.modal} role="dialog" aria-label="Ajustes do estudo">
      <form style={est.formulario} onSubmit={enviar}>
        <h2 style={{ margin: 0, ...tipo('titulo') }}>Editar estudo</h2>
        <p style={est.dica}>
          Corrija a identificação ou os parâmetros. Os ciclos já coletados não são
          afetados — nome digitado errado se conserta aqui, sem refazer nada.
        </p>

        {/* Nome, produto e recurso: um erro de digitação na criação ficava
            para sempre no relatório impresso, e recriar o estudo custaria
            os ciclos já cronometrados. */}
        <label style={est.campo}>
          <span style={est.rotuloCampo}>Nome do estudo</span>
          <input style={est.input} value={nome} onChange={(e) => setNome(e.target.value)} autoFocus />
        </label>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: espaco.lg }}>
          <label style={est.campo}>
            <span style={est.rotuloCampo}>Produto / Referência</span>
            <input style={est.input} value={produto} onChange={(e) => setProduto(e.target.value)} />
            <span style={est.dica}>Agrupa os estudos na lista.</span>
          </label>
          <label style={est.campo}>
            <span style={est.rotuloCampo}>Recurso / Posto</span>
            {/* Mesmo campo do Novo estudo e do celular: o posto vem do
                cadastro. Estudo antigo com o nome digitado continua
                aparecendo como texto — e' o que esta' gravado. */}
            <SeletorMaquina
              valor={recurso}
              aoTrocar={setRecurso}
              aria="Recurso / Posto"
              estilos={{ input: est.input, select: est.input, link: est.linkCadastro }}
              vazio="Escolha o posto…"
            />
            <span style={est.dica}>Sai no relatório impresso.</span>
          </label>
        </div>

        {/* Setor e analista saem impressos na folha de análise — um estudo
            criado sem eles imprimia "—" e não havia onde corrigir. */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: espaco.lg }}>
          <label style={est.campo}>
            <span style={est.rotuloCampo}>Setor</span>
            <input style={est.input} value={setor}
                   onChange={(e) => setSetor(e.target.value)} />
            <span style={est.dica}>Ex: Usinagem. Sai no relatório impresso.</span>
          </label>
          {/* Com cadastro, aqui e' onde um estudo ANTIGO se liga ao
              analista de verdade — e' o caminho para desfazer as tres
              grafias de uma pessoa so'. O nome digitado continua a mostra
              embaixo enquanto o vinculo nao existir: sem ele nao daria para
              saber a quem o estudo se refere. */}
          {analistas.length > 0 ? (
            <label style={est.campo}>
              <span style={est.rotuloCampo}>Analista</span>
              <select style={est.input} value={analistaId}
                      onChange={(e) => setAnalistaId(e.target.value)}>
                <option value="">
                  {analista ? `Sem vínculo — digitado: ${analista}` : 'Escolha o analista'}
                </option>
                {analistas.map((u) => (
                  <option key={u.id} value={u.id}>{u.nome}</option>
                ))}
              </select>
              <span style={est.dica}>
                {analistaId
                  ? 'Assina a folha de análise.'
                  : 'Escolher aqui liga este estudo ao cadastro — é o que junta as grafias diferentes da mesma pessoa.'}
              </span>
            </label>
          ) : (
            <label style={est.campo}>
              <span style={est.rotuloCampo}>Analista</span>
              <input style={est.input} value={analista}
                     onChange={(e) => setAnalista(e.target.value)} />
              <span style={est.dica}>Assina a folha de análise.</span>
            </label>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: espaco.lg }}>
          <label style={est.campo}>
            <span style={est.rotuloCampo}>Tolerância (%)</span>
            <input type="number" min="0" max="100" style={est.input}
                   value={tolerancia} onChange={(e) => setTolerancia(e.target.value)} />
            <span style={est.dica}>Fadiga e necessidades. Típica: 10 a 15.</span>
          </label>
          <label style={est.campo}>
            <span style={est.rotuloCampo}>Meta de ciclos</span>
            <input type="number" min="1" max="999" style={est.input}
                   value={metaObs} onChange={(e) => setMetaObs(e.target.value)} />
            <span style={est.dica}>Recomendado: 12 ou mais.</span>
          </label>
        </div>

        <fieldset style={est.fieldset}>
          <legend style={est.rotuloCampo}>Takt Time</legend>
          <p style={est.dica}>
            Ritmo que a demanda exige. É o que permite dimensionar mão de obra
            e desenhar a linha de referência no Yamazumi.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: espaco.lg }}>
            <label style={est.campo}>
              <span style={est.rotuloCampo}>Quantidade por dia</span>
              <input type="number" min="1" style={est.input} value={calc.quantidade}
                     onChange={(e) => aplicarCalculo({ ...calc, quantidade: e.target.value })} />
            </label>
            <label style={est.campo}>
              <span style={est.rotuloCampo}>Horas disponíveis</span>
              <input type="number" min="0.1" step="0.1" style={est.input} value={calc.horas}
                     onChange={(e) => aplicarCalculo({ ...calc, horas: e.target.value })} />
            </label>
          </div>
          <label style={est.campo}>
            <span style={est.rotuloCampo}>Takt Time (segundos por peça)</span>
            <input type="number" min="0" step="0.1" style={est.input}
                   value={taktSeg} onChange={(e) => setTaktSeg(e.target.value)} />
            <span style={est.dica}>Preenchido pela conta acima, ou digite direto.</span>
          </label>
        </fieldset>

        {erro && <div style={est.erroForm}>{erro}</div>}

        <div style={{ display: 'flex', gap: espaco.md }}>
          <button type="button" style={est.botaoSecundario} onClick={aoCancelar} disabled={salvando}>
            Cancelar
          </button>
          <button type="submit" style={{ ...est.botaoImprimir, flex: 1 }} disabled={salvando}>
            {salvando ? 'Salvando...' : 'Salvar ajustes'}
          </button>
        </div>
      </form>
    </div>
  );
}

