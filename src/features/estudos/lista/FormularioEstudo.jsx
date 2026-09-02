import { useRef, useState } from 'react';
import SeletorMaquina from '../../../components/SeletorMaquina.jsx';
import RitmoDemanda, { CALC_PADRAO, taktMsDoCalculo } from '../../../components/RitmoDemanda.jsx';

/**
 * Novo estudo em tres etapas visuais: quem e' (identificacao), como coletar
 * (meta e tolerancia) e que ritmo a demanda exige (Takt).
 *
 * As etapas nao sao paginas de assistente — tudo fica visivel de uma vez,
 * e o indicador no topo acompanha onde o usuario esta digitando. Esconder
 * campos atras de "proximo" so' faria o analista clicar mais para conferir
 * o que ja' preencheu.
 *
 * O Takt NAO e' campo editavel: e' resultado. Quase ninguem sabe o Takt de
 * cabeca, mas todo mundo sabe quanto precisa produzir e em quanto tempo —
 * entao o formulario pede esses dois numeros e mostra o ritmo calculado.
 * (Quem souber o Takt direto ajusta depois, em Ajustes do estudo.)
 */
export default function FormularioEstudo({
  est, t, analise, produtos = [], setores = [], analistas = [], eu, aoSalvar, aoCancelar,
}) {
  const [dados, setDados] = useState({
    nome: '', setor: '', recurso: '', produto: '', analista: '',
    // Ja' vem preenchido com quem esta neste computador: quem cria o estudo
    // e' quase sempre quem vai conduzi-lo, e um campo certo por padrao e'
    // melhor que um campo vazio pedindo atencao.
    analistaId: eu?.id || '',
    toleranciaPct: 15, metaObs: 12,
  });
  const [calc, setCalc] = useState({ ...CALC_PADRAO });
  const [etapa, setEtapa] = useState(1);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState(null);

  const refNome = useRef(null);
  const refMeta = useRef(null);
  const refQtd = useRef(null);

  const campo = (k) => ({
    value: dados[k],
    onChange: (ev) => setDados((d) => ({ ...d, [k]: ev.target.value })),
  });

  function irParaEtapa(n) {
    setEtapa(n);
    ({ 1: refNome, 2: refMeta, 3: refQtd })[n]?.current?.focus();
  }

  async function enviar(ev) {
    ev.preventDefault();
    if (!dados.nome.trim()) { setErro('Informe o nome do estudo.'); irParaEtapa(1); return; }
    setSalvando(true);
    setErro(null);
    try { await aoSalvar({ ...dados, taktTimeMs: taktMsDoCalculo(calc) }); }
    catch (e) { setErro(e.message); setSalvando(false); }
  }

  return (
    <div style={est.modal} role="dialog" aria-label="Novo estudo">
      <form
        style={{ ...est.formulario, ...(analise ? est.formularioLargo : {}) }}
        onSubmit={enviar}
      >
        <div style={est.formCabecalho}>
          <h2 style={est.formTitulo}>Novo estudo</h2>
          <Etapas etapa={etapa} aoIr={irParaEtapa} est={est} compacto={!analise} />
        </div>

        <div style={analise ? est.formCorpoDuplo : est.formCorpo}>
          <div style={est.formEsquerda}>
            <section style={est.secao} onFocusCapture={() => setEtapa(1)}>
              <div style={est.formRotulo}>Identificação</div>
              <div style={analise ? est.duasColunas : est.umaColuna}>
                <div style={analise ? est.campoLargo : undefined}>
                  <Campo est={est} label="Nome do estudo" obrigatorio dica="Ex: Furação lateral — linha 2">
                    <input ref={refNome} style={est.input} {...campo('nome')} autoFocus />
                  </Campo>
                </div>
                <Campo est={est} label="Setor" dica="Ex: Usinagem">
                  {/* Sugere setores ja usados: "USINAGEM" ao lado de
                      "Usinagem" fragmentaria filtro e relatorio. */}
                  <input style={est.input} list="setores-conhecidos" {...campo('setor')} />
                  <datalist id="setores-conhecidos">
                    {setores.map((nome) => <option key={nome} value={nome} />)}
                  </datalist>
                </Campo>
                {/* O posto vem do CADASTRO, como no celular: estudo criado
                    com "Furadeira 03" digitado a mao nao encontra a
                    "FURADEIRA 03" da lista, e o mesmo posto vira dois em
                    todo relatorio que cruzar os dois lados. Quem ainda nao
                    cadastrou (ou mede um posto novo) usa "Outra máquina…". */}
                <Campo est={est} label="Recurso / Posto"
                       dica="Do cadastro de máquinas. Não achou? Use “Outra máquina…”.">
                  <SeletorMaquina
                    valor={dados.recurso || ''}
                    aoTrocar={(v) => setDados((d) => ({ ...d, recurso: v }))}
                    aria="Recurso / Posto"
                    estilos={{ input: est.input, select: est.input, link: est.linkCadastro }}
                    vazio="Escolha o posto…"
                  />
                </Campo>
                <Campo est={est} label="Produto / Referência"
                       dica={produtos.length ? 'Escolha um já usado para agrupar corretamente.' : 'Ex: Mesa Cabeceira Sleep'}>
                  {/* datalist sugere sem impedir texto novo: o analista continua
                      livre para cadastrar produto inedito, mas nao cria "SLEEP
                      BASE" ao lado de "Sleep Base" por descuido. */}
                  <input style={est.input} list="produtos-conhecidos" {...campo('produto')} />
                  <datalist id="produtos-conhecidos">
                    {produtos.map((nome) => <option key={nome} value={nome} />)}
                  </datalist>
                </Campo>
                {/* Com cadastro, o analista vira LISTA: e' o que impede a
                    mesma pessoa de virar "ODERLI", "ODERLI GARCIA" e
                    "ODERLI SERGIO GARCIA" em tres estudos. Sem cadastro
                    ainda, segue texto livre — a tela nao pode travar quem
                    nunca abriu Ferramentas > Analistas. */}
                {analistas.length > 0 ? (
                  <Campo est={est} label="Analista" dica="Cadastre em Ferramentas → Analistas.">
                    <select style={est.input} {...campo('analistaId')}>
                      <option value="">Escolha o analista</option>
                      {analistas.map((u) => (
                        <option key={u.id} value={u.id}>{u.nome}</option>
                      ))}
                    </select>
                  </Campo>
                ) : (
                  <Campo est={est} label="Analista" dica="Quem conduz o estudo.">
                    <input style={est.input} {...campo('analista')} />
                  </Campo>
                )}
              </div>
            </section>

            <section style={est.secaoSeparada} onFocusCapture={() => setEtapa(2)}>
              <div style={est.formRotulo}>Configuração da coleta</div>
              <div style={est.duasColunas}>
                <Campo est={est} label="Meta de ciclos" dica="Recomendado: 12 ciclos ou mais.">
                  <input ref={refMeta} type="number" min="1" max="999" style={est.input} {...campo('metaObs')} />
                </Campo>
                <Campo est={est} label="Tolerância (%)" dica="Fadiga e necessidades. Faixa típica: 10 a 15%.">
                  <input type="number" min="0" max="100" style={est.input} {...campo('toleranciaPct')} />
                </Campo>
              </div>
            </section>
          </div>

          <RitmoDemanda
            t={t}
            analise={analise}
            calc={calc}
            aoMudar={setCalc}
            refQuantidade={refQtd}
            aoFocar={() => setEtapa(3)}
          />
        </div>

        {erro && <div style={est.erroForm}>{erro}</div>}

        <div style={est.acoesModal}>
          <button type="button" style={est.botaoSecundario} onClick={aoCancelar} disabled={salvando}>
            Cancelar
          </button>
          <button type="submit" style={{ ...est.botaoPrimario, flex: 1 }} disabled={salvando}>
            {salvando ? 'Salvando...' : (analise ? 'Criar estudo' : 'Criar e iniciar coleta →')}
          </button>
        </div>
      </form>
    </div>
  );
}

/**
 * Indicador 1 → 2 → 3 do topo do formulario. Clique leva ao primeiro campo.
 * No celular so a etapa ativa carrega rotulo — tres rotulos completos
 * quebram em duas linhas com um traco orfao no comeco da segunda.
 */
function Etapas({ etapa, aoIr, est, compacto = false }) {
  return (
    <ol style={est.etapas}>
      {['Identificação', 'Coleta', 'Ritmo / Demanda'].map((nome, i) => {
        const n = i + 1;
        const ativa = etapa === n;
        return (
          <li key={nome} style={est.etapaItem}>
            {i > 0 && <span style={est.etapaTraco} aria-hidden="true" />}
            <button
              type="button"
              onClick={() => aoIr(n)}
              aria-current={ativa ? 'step' : undefined}
              aria-label={nome}
              style={est.etapaBotao}
            >
              <span style={{ ...est.etapaNumero, ...(ativa ? est.etapaNumeroAtivo : {}) }}>{n}</span>
              {(!compacto || ativa) && (
                <span style={{ ...est.etapaRotulo, ...(ativa ? est.etapaRotuloAtivo : {}) }}>{nome}</span>
              )}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function Campo({ est, label, obrigatorio, dica, children }) {
  return (
    <label style={est.campo}>
      <span style={est.rotuloCampo}>
        {label}
        {obrigatorio && <span style={est.obrigatorio}> *</span>}
      </span>
      {children}
      {dica && <span style={est.dica}>{dica}</span>}
    </label>
  );
}

