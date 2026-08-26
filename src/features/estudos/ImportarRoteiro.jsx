import { useRef, useState } from 'react';
import { elevacao, espaco, numeros, raio, rotulo, tipo } from '../../theme/escala.js';
import { extrairTextoPdf } from '../../lib/pdfTexto.js';
import { lerPlanilhaXlsx } from '../../lib/xlsxTexto.js';
import { interpretarRoteiro } from '../../domain/roteiroErp.js';
import { interpretarTemplate } from '../../domain/templateTempos.js';
import { chaveProduto } from '../../domain/agrupamento.js';
import { criarEstudo, sincronizar } from '../../lib/api.js';
import { enfileirar, novoId } from '../../lib/filaOffline.js';
import RitmoDemanda, { CALC_PADRAO, taktMsDoCalculo } from '../../components/RitmoDemanda.jsx';

/**
 * Importa um estudo pronto a partir de arquivo — dois formatos:
 *
 *  - PDF "Processos de Producao" do ERP: um estudo por maquina, uma
 *    operacao por peca, ciclos por peca vindos da estrutura.
 *  - TEMPLATE DE TEMPOS (.xlsx, abas Config/Tempos/Paradas — o molde do
 *    RitmoProd antigo, usado na embalagem): as operacoes viram o estudo, e
 *    tempos ja' preenchidos entram como ciclos pela mesma fila offline da
 *    coleta (reenvio idempotente, nada duplica).
 *
 * Digitar isso a mao e' o que o analista faz hoje — e um erro de digitacao
 * na quantidade ou no tempo distorce a capacidade calculada.
 */
export default function ImportarRoteiro({ t, analise, produtosExistentes = [], setoresConhecidos = [], aoConcluir, aoCancelar }) {
  const est = estilos(t, analise);
  const inputRef = useRef(null);

  const [lendo, setLendo] = useState(false);
  const [erro, setErro] = useState(null);
  const [roteiro, setRoteiro] = useState(null);
  const [planilha, setPlanilha] = useState(null);
  const [nomeArquivo, setNomeArquivo] = useState('');
  const [nome, setNome] = useState('');
  const [recurso, setRecurso] = useState('');
  const [campos, setCampos] = useState({ setor: '', analista: '', toleranciaPct: 15, metaObs: 12 });
  const [calc, setCalc] = useState({ ...CALC_PADRAO });
  const [criando, setCriando] = useState(false);

  async function aoEscolher(ev) {
    const arquivo = ev.target.files?.[0];
    if (!arquivo) return;
    setLendo(true);
    setErro(null);
    try {
      if (/\.(xlsx|xlsm)$/i.test(arquivo.name)) {
        const abas = await lerPlanilhaXlsx(await arquivo.arrayBuffer());
        const modelo = interpretarTemplate(abas);
        setPlanilha(modelo);
        setNomeArquivo(arquivo.name);
        setNome(modelo.config.nome || arquivo.name.replace(/\.[^.]+$/, ''));
        setRecurso('');
        setCampos((c) => ({
          ...c,
          analista: modelo.config.analista || c.analista,
          toleranciaPct: modelo.config.toleranciaPct ?? c.toleranciaPct,
          metaObs: modelo.config.metaObs ?? c.metaObs,
        }));
      } else {
        const texto = await extrairTextoPdf(await arquivo.arrayBuffer());
        const r = interpretarRoteiro(texto);
        if (!r.produtoPai || !r.operacoes.length) {
          throw new Error(
            'Não reconheci um roteiro de produção neste PDF. ' +
            'Ele precisa ser o relatório "Processos de Produção" gerado pelo ERP.',
          );
        }
        setRoteiro(r);
        setNomeArquivo(arquivo.name);
        // So o produto: a maquina tem campo proprio, e grudada ao nome ela
        // ainda ficava errada quando o usuario trocava o recurso.
        setNome(r.produtoPai.descricao);
        // O roteiro SUGERE a maquina; o estudo pode rodar em outra.
        setRecurso(r.maquinas.length === 1 ? r.maquinas[0] : '');
      }
    } catch (e) {
      setErro(e.message);
      // Permite escolher o mesmo arquivo de novo depois de corrigi-lo.
      if (inputRef.current) inputRef.current.value = '';
    } finally {
      setLendo(false);
    }
  }

  const grupos = roteiro ? agruparPorMaquina(roteiro.operacoes) : [];
  const jaExiste = roteiro && produtosExistentes
    .some((p) => chaveProduto(p) === chaveProduto(roteiro.produtoPai.descricao));

  /**
   * Cria o estudo do TEMPLATE e importa os ciclos/paradas ja' preenchidos.
   *
   * Os tempos entram pela MESMA fila offline da coleta: client_id novo por
   * item, reenvio idempotente. Se a rede cair no meio, nada se perde — a
   * barra de sincronizacao termina o envio depois.
   */
  async function criarDaPlanilha() {
    const r = await criarEstudo({
      nome: nome.trim() || 'Estudo importado',
      produto: planilha.config.produto,
      recurso: recurso.trim(),
      setor: campos.setor,
      analista: campos.analista,
      toleranciaPct: Number(campos.toleranciaPct) || 15,
      metaObs: Number(campos.metaObs) || 12,
      taktTimeMs: taktMsDoCalculo(calc),
      operacoes: planilha.operacoes.map((op) => ({ nome: op.nome, frPct: op.fr, ordem: op.ordem })),
    });

    const idPorNome = new Map((r.operacoes || []).map((op) => [op.nome.toLowerCase(), op.id]));
    let enfileirados = 0;
    for (const op of planilha.operacoes) {
      const operacaoId = idPorNome.get(op.nome.toLowerCase());
      if (!operacaoId) continue;
      const agora = new Date().toISOString();
      for (const duracaoMs of op.tempos) {
        await enfileirar({ tipo: 'observacao', clientId: novoId(), operacaoId, duracaoMs, rodada: 1, coletadoEm: agora });
        enfileirados += 1;
      }
      for (const parada of op.paradas) {
        await enfileirar({
          tipo: 'parada', clientId: novoId(), operacaoId,
          motivo: parada.motivo, observacao: parada.observacao,
          duracaoMs: parada.duracaoMs, iniciadoEm: agora,
        });
        enfileirados += 1;
      }
    }
    // Melhor esforco: se falhar, os itens seguem na fila e sobem sozinhos.
    if (enfileirados) await sincronizar().catch(() => {});
    return r.estudo.id;
  }

  async function criar() {
    setCriando(true);
    setErro(null);
    try {
      if (planilha) {
        const id = await criarDaPlanilha();
        aoConcluir?.(id);
        return;
      }
      const ids = [];
      for (const grupo of grupos) {
        const r = await criarEstudo({
          nome: grupos.length === 1 ? nome.trim() || nomePadrao(roteiro, grupo) : nomePadrao(roteiro, grupo),
          produto: roteiro.produtoPai.descricao,
          recurso: grupos.length === 1 ? (recurso.trim() || grupo.maquina) : grupo.maquina,
          setor: campos.setor,
          analista: campos.analista,
          toleranciaPct: Number(campos.toleranciaPct) || 15,
          metaObs: Number(campos.metaObs) || 12,
          taktTimeMs: taktMsDoCalculo(calc),
          operacoes: grupo.pecas.map((p, i) => ({
            nome: p.descricao,
            descricao: descricaoErp(p),
            ciclosPorPeca: Math.max(1, Math.round(p.quantidade)),
            ordem: i,
          })),
        });
        ids.push(r.estudo.id);
      }
      aoConcluir?.(ids[0]);
    } catch (e) {
      setErro(e.message);
      setCriando(false);
    }
  }

  return (
    <div style={est.modal} role="dialog" aria-label="Importar estudo">
      <div style={est.caixa}>
        <h2 style={est.titulo}>Importar estudo</h2>

        {!roteiro && !planilha && (
          <>
            <p style={est.texto}>
              Escolha o PDF <strong>Processos de Produção</strong> do ERP ou o{' '}
              <strong>template de tempos</strong> (.xlsx, abas Config/Tempos/Paradas —
              o da embalagem). Operações, FR e tempos já preenchidos entram sem digitação.
            </p>
            <label style={est.zonaArquivo}>
              <input
                ref={inputRef}
                type="file"
                accept="application/pdf,.pdf,.xlsx,.xlsm"
                onChange={aoEscolher}
                disabled={lendo}
                style={est.inputArquivo}
              />
              <span style={est.zonaTitulo}>{lendo ? 'Lendo o arquivo...' : 'Escolher PDF ou planilha'}</span>
              <span style={est.zonaDica}>O arquivo é lido aqui no aparelho — nada é enviado até você confirmar.</span>
            </label>
          </>
        )}

        {planilha && (
          <>
            <div style={est.resumoProduto}>
              <span style={est.rotuloCampo}>Template de tempos</span>
              <div style={est.produtoNome}>
                {planilha.operacoes.length} operação(ões) reconhecida(s)
              </div>
              <div style={est.produtoCodigo}>{nomeArquivo}</div>
            </div>

            <div style={est.tabelaCaixa}>
              <table style={est.tabela}>
                <thead>
                  <tr>
                    <th style={est.th}>Operação</th>
                    <th style={est.thNum}>FR%</th>
                    <th style={est.thNum}>Ciclos na planilha</th>
                    <th style={est.thNum}>Paradas</th>
                  </tr>
                </thead>
                <tbody>
                  {planilha.operacoes.map((op) => (
                    <tr key={op.nome}>
                      <td style={est.td}>{op.nome}</td>
                      <td style={est.tdNum}>{op.fr}</td>
                      <td style={est.tdNum}>{op.tempos.length}</td>
                      <td style={est.tdNum}>{op.paradas.length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {planilha.operacoes.every((op) => !op.tempos.length) ? (
              <p style={est.notaSem}>
                Planilha ainda sem tempos (molde): o estudo é criado pronto para
                cronometrar no celular, ciclo a ciclo.
              </p>
            ) : (
              <p style={est.notaSem}>
                Os tempos já preenchidos entram como ciclos do estudo — nada de
                digitar de novo o que já foi medido.
              </p>
            )}

            {planilha.avisos.map((aviso) => (
              <div key={aviso} style={est.aviso}>{aviso}</div>
            ))}
          </>
        )}

        {roteiro && (
          <>
            <div style={est.resumoProduto}>
              <span style={est.rotuloCampo}>Produto</span>
              <div style={est.produtoNome}>{roteiro.produtoPai.descricao}</div>
              <div style={est.produtoCodigo}>
                Código {roteiro.produtoPai.codigo} · {nomeArquivo}
              </div>
            </div>

            {jaExiste && (
              <div style={est.aviso}>
                Já existe estudo deste produto na lista. Importar de novo cria um estudo
                novo, do zero — os ciclos já cronometrados ficam no estudo antigo.
              </div>
            )}

            {grupos.map((grupo) => (
              <section key={grupo.maquina} style={est.blocoMaquina}>
                <div style={est.blocoTitulo}>
                  <span style={est.maquina}>{grupo.maquina}</span>
                  <span style={est.fraco}>
                    {grupo.pecas.length} peça(s) · ERP prevê {segundos(somaErp(grupo.pecas))} s por produto
                  </span>
                </div>
                <div style={est.tabelaCaixa}>
                <table style={est.tabela}>
                  <thead>
                    <tr>
                      <th style={est.th}>Peça</th>
                      <th style={est.thNum}>Ciclos/peça</th>
                      <th style={est.thNum}>ERP s/ciclo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {grupo.pecas.map((p) => (
                      <tr key={p.codigo}>
                        <td style={est.td}>{p.descricao}</td>
                        <td style={est.tdNum}>{Math.max(1, Math.round(p.quantidade))}</td>
                        <td style={est.tdNum}>{segundos(p.msUnitario)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </section>
            ))}

            {roteiro.semProcesso.length > 0 && (
              <p style={est.notaSem}>
                Fora do estudo (sem processo nesta máquina):{' '}
                {roteiro.semProcesso.map((p) => p.descricao).join(' · ')}
              </p>
            )}
          </>
        )}

        {(roteiro || planilha) && (
          <>
            {/* Daqui para baixo, as MESMAS informacoes do cadastro manual:
                Identificacao, Configuracao da coleta e Ritmo/Demanda. O que o
                arquivo ja responde (produto, operacoes, tempos) veio acima. */}
            <div style={analise ? est.corpoDuplo : est.corpoSimples}>
              <div style={est.colunaEsquerda}>
                <section style={est.secao}>
                  <div style={est.secaoRotulo}>Identificação</div>
                  {(planilha || grupos.length === 1) && (
                    <label style={est.campo}>
                      <span style={est.rotuloCampo}>Nome do estudo</span>
                      <input style={est.input} value={nome} onChange={(ev) => setNome(ev.target.value)} />
                    </label>
                  )}
                  <div style={est.grade}>
                    {(planilha || grupos.length === 1) && (
                      <label style={est.campo}>
                        <span style={est.rotuloCampo}>Recurso / Posto</span>
                        <input
                          style={est.input}
                          value={recurso}
                          onChange={(ev) => setRecurso(ev.target.value)}
                        />
                        <span style={est.dica}>
                          {planilha
                            ? 'Onde o estudo vai rodar. Ex: Embalagem — bancada 2.'
                            : `O roteiro indica ${grupos[0]?.maquina} — troque se o estudo for rodar em outra máquina.`}
                        </span>
                      </label>
                    )}
                    <label style={est.campo}>
                      <span style={est.rotuloCampo}>Setor</span>
                      <input
                        style={est.input} list="setores-conhecidos-importar"
                        value={campos.setor}
                        onChange={(ev) => setCampos((c) => ({ ...c, setor: ev.target.value }))}
                      />
                      <datalist id="setores-conhecidos-importar">
                        {setoresConhecidos.map((nomeSetor) => <option key={nomeSetor} value={nomeSetor} />)}
                      </datalist>
                    </label>
                    <label style={est.campo}>
                      <span style={est.rotuloCampo}>Analista</span>
                      <input
                        style={est.input}
                        value={campos.analista}
                        onChange={(ev) => setCampos((c) => ({ ...c, analista: ev.target.value }))}
                      />
                    </label>
                  </div>
                </section>

                <section style={est.secaoSeparada}>
                  <div style={est.secaoRotulo}>Configuração da coleta</div>
                  <div style={est.grade}>
                    <label style={est.campo}>
                      <span style={est.rotuloCampo}>Meta de ciclos</span>
                      <input
                        type="number" min="1" max="999" style={est.input}
                        value={campos.metaObs}
                        onChange={(ev) => setCampos((c) => ({ ...c, metaObs: ev.target.value }))}
                      />
                      <span style={est.dica}>Recomendado: 12 ciclos ou mais.</span>
                    </label>
                    <label style={est.campo}>
                      <span style={est.rotuloCampo}>Tolerância (%)</span>
                      <input
                        type="number" min="0" max="100" style={est.input}
                        value={campos.toleranciaPct}
                        onChange={(ev) => setCampos((c) => ({ ...c, toleranciaPct: ev.target.value }))}
                      />
                      <span style={est.dica}>Fadiga e necessidades. Faixa típica: 10 a 15%.</span>
                    </label>
                  </div>
                </section>

                {roteiro && (
                  <p style={est.dica}>
                    O tempo do ERP é a previsão de engenharia — a cronoanálise vai medir o real
                    no posto e mostrar a diferença.
                  </p>
                )}
              </div>

              <RitmoDemanda t={t} analise={analise} calc={calc} aoMudar={setCalc} />
            </div>
          </>
        )}

        {erro && <div style={est.erroBloco}>{erro}</div>}

        <div style={est.acoes}>
          <button type="button" style={est.botaoSecundario} onClick={aoCancelar} disabled={criando}>
            Cancelar
          </button>
          {(roteiro || planilha) && (
            <button type="button" style={est.botaoPrimario} onClick={criar} disabled={criando}>
              {criando
                ? 'Criando...'
                : (roteiro && grupos.length > 1 ? `Criar ${grupos.length} estudos` : 'Criar estudo')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Uma maquina = um posto = um estudo. */
function agruparPorMaquina(operacoes) {
  const grupos = new Map();
  for (const p of operacoes) {
    const chave = p.maquina || 'SEM MÁQUINA';
    if (!grupos.has(chave)) grupos.set(chave, { maquina: chave, pecas: [] });
    grupos.get(chave).pecas.push(p);
  }
  return [...grupos.values()];
}

const nomePadrao = (roteiro, grupo) => `${roteiro.produtoPai.descricao} — ${grupo.maquina}`;

/** Proveniencia gravada na operacao: de onde veio e o que o ERP previa. */
const descricaoErp = (p) =>
  `${p.operacao} em ${p.maquina} · ERP: ${segundos(p.msUnitario)} s/ciclo · cód. ${p.codigo}`;

const somaErp = (pecas) => pecas.reduce((acc, p) => acc + (p.msTotal || 0), 0);
const segundos = (ms) => String(Math.round((ms || 0) / 1000));

/* -------------------------------------------------------------------- estilos */

function estilos(t, analise) {
  return {
    modal: {
      position: 'fixed', inset: 0, zIndex: 30, background: 'rgba(15, 18, 22, 0.55)',
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
      padding: espaco.lg, overflowY: 'auto',
    },
    caixa: {
      width: '100%', maxWidth: analise ? 960 : 620, background: t.superficie,
      borderWidth: 1, borderStyle: 'solid', borderColor: t.borda, borderRadius: raio.lg,
      padding: espaco.xxl, boxShadow: elevacao.alta, margin: `${espaco.xl}px 0`,
      display: 'flex', flexDirection: 'column', gap: espaco.lg,
    },
    titulo: { ...tipo('titulo'), margin: 0 },
    texto: { ...tipo('corpo'), margin: 0, color: t.medio },
    fraco: { ...tipo('legenda'), color: t.fraco },

    zonaArquivo: {
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: espaco.sm,
      padding: `${espaco.xxl}px ${espaco.lg}px`,
      borderWidth: 2, borderStyle: 'dashed', borderColor: t.borda, borderRadius: raio.md,
      cursor: 'pointer', textAlign: 'center',
    },
    inputArquivo: {
      // Escondido sem display:none, para o teclado e o leitor de tela
      // continuarem alcancando o campo.
      position: 'absolute', width: 1, height: 1, opacity: 0, overflow: 'hidden',
    },
    zonaTitulo: { ...tipo('corpoF'), color: t.texto },
    zonaDica: { ...tipo('legenda'), color: t.fraco },

    resumoProduto: { display: 'flex', flexDirection: 'column', gap: 2 },
    produtoNome: { ...tipo('destaque') },
    produtoCodigo: { ...tipo('legenda'), color: t.fraco },

    aviso: {
      padding: espaco.md, borderRadius: raio.sm,
      background: analise ? '#FFF7E0' : '#3A3320',
      borderWidth: 1, borderStyle: 'solid', borderColor: analise ? '#E4C441' : '#6B5D22',
      ...tipo('legenda'), color: t.texto,
    },

    blocoMaquina: { display: 'flex', flexDirection: 'column', gap: espaco.sm },
    blocoTitulo: {
      display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
      gap: espaco.md, flexWrap: 'wrap',
    },
    maquina: { ...tipo('corpoF') },

    tabelaCaixa: { overflowX: 'auto' },
    tabela: { width: '100%', borderCollapse: 'collapse' },
    th: {
      textAlign: 'left', padding: `${espaco.sm}px ${espaco.md}px`,
      ...rotulo(t.fraco), background: t.realce,
      borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: t.borda,
    },
    thNum: {
      textAlign: 'right', padding: `${espaco.sm}px ${espaco.md}px`,
      ...rotulo(t.fraco), background: t.realce,
      borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: t.borda,
    },
    td: {
      padding: `${espaco.sm}px ${espaco.md}px`, ...tipo('corpo'), color: t.texto,
      borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: t.borda,
    },
    tdNum: {
      padding: `${espaco.sm}px ${espaco.md}px`, textAlign: 'right',
      ...tipo('corpoF'), ...numeros, color: t.texto,
      borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: t.borda,
    },

    notaSem: { ...tipo('legenda'), color: t.fraco, margin: 0 },

    campo: { display: 'flex', flexDirection: 'column', gap: espaco.xs },
    rotuloCampo: rotulo(t.fraco),
    dica: { ...tipo('legenda'), color: t.fraco, fontStyle: 'italic', margin: 0 },
    // Duas colunas nos dois modos: Setor+Analista, Meta+Tolerancia.
    grade: { display: 'grid', gap: espaco.md, gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)' },
    corpoDuplo: {
      display: 'grid', gridTemplateColumns: '1.25fr 1fr', gap: espaco.xl,
      alignItems: 'start', paddingTop: espaco.md,
      borderTopWidth: 1, borderTopStyle: 'solid', borderTopColor: t.borda,
    },
    corpoSimples: {
      display: 'flex', flexDirection: 'column', gap: espaco.xl, paddingTop: espaco.md,
      borderTopWidth: 1, borderTopStyle: 'solid', borderTopColor: t.borda,
    },
    colunaEsquerda: { display: 'flex', flexDirection: 'column', gap: espaco.xl, minWidth: 0 },
    secao: { display: 'flex', flexDirection: 'column', gap: espaco.md },
    secaoSeparada: {
      display: 'flex', flexDirection: 'column', gap: espaco.md, paddingTop: espaco.lg,
      borderTopWidth: 1, borderTopStyle: 'solid', borderTopColor: t.borda,
    },
    secaoRotulo: rotulo(t.fraco),
    input: {
      width: '100%', minHeight: 44, padding: `0 ${espaco.md}px`, background: t.fundo,
      borderWidth: 1, borderStyle: 'solid', borderColor: t.borda, borderRadius: raio.sm,
      color: t.texto, ...tipo('corpo'), fontFamily: 'inherit', outline: 'none',
    },

    erroBloco: {
      padding: espaco.md, background: t.criticoFundo,
      borderWidth: 1, borderStyle: 'solid', borderColor: t.critico,
      borderRadius: raio.sm, ...tipo('legenda'), color: t.texto,
    },
    acoes: { display: 'flex', gap: espaco.md, marginTop: espaco.xs },
    botaoPrimario: {
      flex: 1, minHeight: analise ? 40 : 48, padding: `0 ${espaco.lg}px`,
      background: t.vermelho, border: 'none', borderRadius: raio.md, color: '#fff',
      ...tipo('corpoF'), cursor: 'pointer', fontFamily: 'inherit',
    },
    botaoSecundario: {
      minHeight: analise ? 40 : 48, padding: `0 ${espaco.lg}px`, background: 'transparent',
      borderWidth: 1, borderStyle: 'solid', borderColor: t.borda, borderRadius: raio.md,
      color: t.medio, ...tipo('corpo'), cursor: 'pointer', fontFamily: 'inherit',
    },
  };
}
