import { useRef, useState } from 'react';
import { elevacao, espaco, numeros, raio, rotulo, tipo } from '../../theme/escala.js';
import { extrairTextoPdf } from '../../lib/pdfTexto.js';
import { interpretarRoteiro } from '../../domain/roteiroErp.js';
import { chaveProduto } from '../../domain/agrupamento.js';
import { criarEstudo } from '../../lib/api.js';

/**
 * Importa o roteiro de producao do ERP (PDF "Processos de Producao") e cria
 * o estudo pronto: um estudo por maquina, uma operacao por peca, com os
 * ciclos por peca vindos da quantidade na estrutura.
 *
 * Digitar isso a mao e' o que o analista faz hoje: seis pecas, seis nomes
 * compridos, seis quantidades — e um erro de digitacao na quantidade
 * distorce a capacidade calculada. O ERP ja' sabe tudo isso.
 */
export default function ImportarRoteiro({ t, analise, produtosExistentes = [], aoConcluir, aoCancelar }) {
  const est = estilos(t, analise);
  const inputRef = useRef(null);

  const [lendo, setLendo] = useState(false);
  const [erro, setErro] = useState(null);
  const [roteiro, setRoteiro] = useState(null);
  const [nomeArquivo, setNomeArquivo] = useState('');
  const [nome, setNome] = useState('');
  const [campos, setCampos] = useState({ analista: '', toleranciaPct: 15, metaObs: 12 });
  const [criando, setCriando] = useState(false);

  async function aoEscolher(ev) {
    const arquivo = ev.target.files?.[0];
    if (!arquivo) return;
    setLendo(true);
    setErro(null);
    try {
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
      setNome(`${r.produtoPai.descricao} — ${r.maquinas.join(' / ')}`);
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

  async function criar() {
    setCriando(true);
    setErro(null);
    try {
      const ids = [];
      for (const grupo of grupos) {
        const r = await criarEstudo({
          nome: grupos.length === 1 ? nome.trim() || nomePadrao(roteiro, grupo) : nomePadrao(roteiro, grupo),
          produto: roteiro.produtoPai.descricao,
          recurso: grupo.maquina,
          analista: campos.analista,
          toleranciaPct: Number(campos.toleranciaPct) || 15,
          metaObs: Number(campos.metaObs) || 12,
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
    <div style={est.modal} role="dialog" aria-label="Importar roteiro do ERP">
      <div style={est.caixa}>
        <h2 style={est.titulo}>Importar roteiro do ERP</h2>

        {!roteiro && (
          <>
            <p style={est.texto}>
              Escolha o PDF <strong>Processos de Produção</strong> gerado pelo ERP.
              As peças, as máquinas e os ciclos por peça entram sem digitação.
            </p>
            <label style={est.zonaArquivo}>
              <input
                ref={inputRef}
                type="file"
                accept="application/pdf,.pdf"
                onChange={aoEscolher}
                disabled={lendo}
                style={est.inputArquivo}
              />
              <span style={est.zonaTitulo}>{lendo ? 'Lendo o PDF...' : 'Escolher arquivo PDF'}</span>
              <span style={est.zonaDica}>O arquivo é lido aqui no aparelho — nada é enviado até você confirmar.</span>
            </label>
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

            {grupos.length === 1 && (
              <label style={est.campo}>
                <span style={est.rotuloCampo}>Nome do estudo</span>
                <input style={est.input} value={nome} onChange={(ev) => setNome(ev.target.value)} />
              </label>
            )}

            <div style={est.tresColunas}>
              <label style={{ ...est.campo, ...(analise ? {} : est.campoLargo) }}>
                <span style={est.rotuloCampo}>Analista</span>
                <input
                  style={est.input}
                  value={campos.analista}
                  onChange={(ev) => setCampos((c) => ({ ...c, analista: ev.target.value }))}
                />
              </label>
              <label style={est.campo}>
                <span style={est.rotuloCampo}>Tolerância (%)</span>
                <input
                  type="number" min="0" max="100" style={est.input}
                  value={campos.toleranciaPct}
                  onChange={(ev) => setCampos((c) => ({ ...c, toleranciaPct: ev.target.value }))}
                />
              </label>
              <label style={est.campo}>
                <span style={est.rotuloCampo}>Meta de ciclos</span>
                <input
                  type="number" min="1" max="999" style={est.input}
                  value={campos.metaObs}
                  onChange={(ev) => setCampos((c) => ({ ...c, metaObs: ev.target.value }))}
                />
              </label>
            </div>

            <p style={est.dica}>
              O tempo do ERP é a previsão de engenharia — a cronoanálise vai medir o real
              no posto e mostrar a diferença.
            </p>
          </>
        )}

        {erro && <div style={est.erroBloco}>{erro}</div>}

        <div style={est.acoes}>
          <button type="button" style={est.botaoSecundario} onClick={aoCancelar} disabled={criando}>
            Cancelar
          </button>
          {roteiro && (
            <button type="button" style={est.botaoPrimario} onClick={criar} disabled={criando}>
              {criando
                ? 'Criando...'
                : (grupos.length > 1 ? `Criar ${grupos.length} estudos` : 'Criar estudo')}
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
      width: '100%', maxWidth: 620, background: t.superficie,
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
    // No PC o analista divide a linha com os numeros; no celular ele ocupa
    // a linha inteira (campoLargo) e os numeros dividem a de baixo.
    tresColunas: {
      display: 'grid', gap: espaco.md,
      gridTemplateColumns: analise
        ? 'minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr)'
        : 'minmax(0, 1fr) minmax(0, 1fr)',
    },
    campoLargo: { gridColumn: '1 / -1' },
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
