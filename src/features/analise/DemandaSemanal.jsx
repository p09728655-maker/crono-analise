import { useEffect, useMemo, useState } from 'react';
import { claro } from '../../theme/tokensAnalise.js';
import { elevacao, espaco, numeros, raio, rotulo, tipo } from '../../theme/escala.js';
import {
  chaveSemana, interpretarColagem, resumoDaDemanda, ritmoExigido,
} from '../../domain/demandaSemanal.js';
import {
  atualizarGrupoMaquina, gravarDemanda, limparDemanda, listarCadastroMaquinas, listarDemanda,
  removerSemanaDemanda,
} from '../../lib/api.js';

/**
 * DEMANDA SEMANAL — o programa de producao que falta para o relatorio
 * responder "isso basta?".
 *
 * O relatorio de ritmo sabe dizer quanto o posto ENTREGA. Sem a demanda ele
 * nunca diz se isso atende — que e' a pergunta da reuniao de producao. A
 * demanda mora na planilha do PCP e entra aqui por COLAGEM: redigitar 36
 * semanas e' onde nasce o numero trocado que ninguem confere.
 *
 * Tres decisoes que esta tela expoe de proposito:
 *
 *  - A demanda e' do GRUPO (0002 FURADEIRA), nao da peca nem da maquina.
 *    Takt e' tempo disponivel dividido pela demanda; numa furadeira que
 *    roda doze pecas, nenhuma delas tem o turno inteiro so' para si —
 *    calculado peca a peca, cada uma parece folgada e o posto estoura
 *    assim mesmo. E quem recebe o volume do PCP e' o grupo, que distribui
 *    entre as maquinas dele.
 *
 *  - Uma linha por SEMANA, e nao um numero fixo. E' o proprio programa que
 *    justifica: nas 36 semanas de 2026 as furadeiras foram de 64.750 a
 *    134.586 pecas. Um valor cravado na media erra 66% na semana fraca, e
 *    erra calado. Por isso a tela mostra a variacao ao lado da media.
 *
 *  - HORAS DISPONIVEIS nao tem padrao. Jornada e' decisao de turno; se a
 *    tela assumisse 44 h, o relatorio daria veredito sobre um turno que
 *    talvez nao exista. Enquanto nao for informada, nao ha' takt — e a
 *    tela diz o que falta em vez de inventar.
 */
export default function DemandaSemanal({ aoFechar, grupoInicial = null }) {
  const [cadastro, setCadastro] = useState(null);      // { maquinas, grupos }
  const [grupoId, setGrupoId] = useState(grupoInicial);
  const [semanas, setSemanas] = useState(null);        // as gravadas, do banco
  const [colagem, setColagem] = useState('');
  const [horas, setHoras] = useState('');
  const [erro, setErro] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [confirmarLimpeza, setConfirmarLimpeza] = useState(false);

  /**
   * Falha de carga deixa a lista em null, nao em vazio. "Nenhuma semana
   * cadastrada" junto de um erro sao duas afirmacoes que se contradizem —
   * uma diz que o cadastro esta' vazio, a outra que nao deu para saber.
   */
  useEffect(() => {
    listarCadastroMaquinas()
      .then((c) => {
        setCadastro(c);
        setGrupoId((atual) => atual || c.grupos?.[0]?.id || null);
      })
      .catch((e) => setErro(e.message));
  }, []);

  useEffect(() => {
    if (!grupoId) return;
    setSemanas(null);
    listarDemanda(grupoId)
      .then((lista) => setSemanas(lista.map((d) => ({ ...d, chave: chaveSemana(d) }))))
      .catch((e) => setErro(e.message));
  }, [grupoId]);

  const grupo = cadastro?.grupos?.find((g) => g.id === grupoId) || null;
  useEffect(() => {
    setHoras(grupo?.horas_semana != null ? String(grupo.horas_semana) : '');
  }, [grupo?.id, grupo?.horas_semana]);

  /** Maquinas ATIVAS do grupo: sao elas que somam tempo disponivel. */
  const maquinasDoGrupo = (cadastro?.maquinas || [])
    .filter((m) => m.grupo_id === grupoId && m.ativa).length;

  const lido = useMemo(() => interpretarColagem(colagem), [colagem]);
  const resumo = useMemo(() => resumoDaDemanda(semanas || []), [semanas]);
  const horasNum = Number(String(horas).replace(',', '.')) || 0;

  async function aplicar(fn) {
    setOcupado(true);
    setErro(null);
    let ok = true;
    try { await fn(); } catch (e) { setErro(e.message); ok = false; }
    setOcupado(false);
    return ok;
  }

  const gravarColagem = () => aplicar(async () => {
    const lista = await gravarDemanda(
      grupoId,
      lido.semanas.map((s) => ({ ano: s.ano, numero: s.numero, pecas: s.pecas })),
    );
    setSemanas(lista.map((d) => ({ ...d, chave: chaveSemana(d) })));
    setColagem('');
  });

  const salvarHoras = () => aplicar(async () => {
    const valor = horas.trim() === '' ? null : horasNum;
    const atualizado = await atualizarGrupoMaquina(grupoId, { horasSemana: valor });
    setCadastro((c) => ({
      ...c,
      grupos: c.grupos.map((g) => (g.id === grupoId ? { ...g, horas_semana: atualizado.horas_semana } : g)),
    }));
  });

  const apagarSemana = (s) => aplicar(async () => {
    const lista = await removerSemanaDemanda(grupoId, s);
    setSemanas(lista.map((d) => ({ ...d, chave: chaveSemana(d) })));
  });

  const apagarTudo = () => aplicar(async () => {
    await limparDemanda(grupoId);
    setSemanas([]);
    setConfirmarLimpeza(false);
  });

  const semGrupo = cadastro && !cadastro.grupos?.length;

  return (
    <div style={est.modal} role="dialog" aria-label="Demanda semanal">
      <div style={est.caixa}>
        <h2 style={est.titulo}>Demanda semanal</h2>
        <p style={est.texto}>
          O programa de produção do grupo, semana a semana. É com ele que o relatório
          deixa de responder só <em>quanto o posto entrega</em> e passa a responder
          <strong> se isso atende</strong>.
        </p>

        {erro && <div style={est.erro}>{erro}</div>}
        {!cadastro && !erro && <p style={est.texto}>Carregando cadastro...</p>}

        {semGrupo && (
          <div style={est.vazio}>
            <div style={est.vazioTitulo}>Nenhum grupo de máquina cadastrado</div>
            <p style={est.vazioTexto}>
              A demanda é de um grupo (por exemplo <strong>0002 FURADEIRA</strong>), porque é
              o grupo que recebe o volume do PCP e distribui entre as máquinas dele.
              Cadastre os grupos em <strong>Máquinas</strong> e volte aqui.
            </p>
          </div>
        )}

        {cadastro?.grupos?.length > 0 && (
          <>
            <label style={est.campo}>
              <span style={est.rotuloCampo}>Grupo de máquina</span>
              <select
                style={est.input} value={grupoId || ''} disabled={ocupado}
                onChange={(ev) => setGrupoId(ev.target.value)}
              >
                {cadastro.grupos.map((g) => (
                  <option key={g.id} value={g.id}>{g.codigo} · {g.nome}</option>
                ))}
              </select>
              <span style={est.dica}>
                {maquinasDoGrupo === 0
                  ? 'Nenhuma máquina ativa neste grupo — sem elas não há tempo disponível para comparar.'
                  : `${maquinasDoGrupo} máquina(s) ativa(s) no grupo.`}
              </span>
            </label>

            {/* ---- o denominador do takt ---- */}
            <div style={est.bloco}>
              <div style={est.blocoTitulo}>Tempo disponível</div>
              <div style={est.linhaCampos}>
                <label style={est.campoCurto}>
                  <span style={est.rotuloCampo}>Horas por máquina, por semana</span>
                  <input
                    type="number" min="0.5" max="168" step="0.1" style={est.input}
                    value={horas} disabled={ocupado}
                    onChange={(ev) => setHoras(ev.target.value)}
                    placeholder="ex.: 44"
                  />
                </label>
                <button type="button" style={est.botaoSecundario} onClick={salvarHoras} disabled={ocupado}>
                  {ocupado ? 'Salvando...' : 'Salvar horas'}
                </button>
              </div>
              <p style={est.blocoTexto}>
                {horasNum > 0 && maquinasDoGrupo > 0
                  ? (
                    <>
                      {maquinasDoGrupo} × {horasNum.toLocaleString('pt-BR')} h ={' '}
                      <strong>{(horasNum * maquinasDoGrupo).toLocaleString('pt-BR')} horas-máquina</strong>
                      {' '}na semana. É o tempo que o grupo tem para atender o programa — sem
                      descontar paradas, que o relatório mede à parte.
                    </>
                  )
                  : 'Sem as horas não há takt: o ritmo exigido é a demanda dividida pelo tempo disponível. Não assumo 44 h por conta própria — jornada é decisão de turno.'}
              </p>
              {grupo?.horas_semana == null && (
                <p style={est.blocoAviso}>
                  Só administrador altera o cadastro de máquinas. Se o botão recusar, peça a
                  quem administra — ou troque o seu papel no cadastro de analistas.
                </p>
              )}
            </div>

            {/* ---- a colagem da planilha ---- */}
            <div style={est.bloco}>
              <div style={est.blocoTitulo}>Colar da planilha do PCP</div>
              <p style={est.blocoTexto}>
                Copie as linhas da planilha (com o cabeçalho, se quiser) e cole aqui.
                Entendo as colunas <strong>SEMANA</strong> e <strong>TOTAL SEMANA</strong>,
                ignoro os totalizadores do rodapé e confiro o total contra a soma dos lotes.
                Gravar <strong>mescla</strong>: semana que não veio na colagem fica como está.
              </p>
              <textarea
                style={est.areaColagem} value={colagem} disabled={ocupado}
                onChange={(ev) => setColagem(ev.target.value)}
                placeholder={'SEMANA\tLOTE 1\t...\tTOTAL SEMANA\n001-26\t25.000\t...\t128.250'}
                rows={6}
              />

              {colagem.trim() !== '' && (
                <div style={est.previa}>
                  <div style={est.previaTitulo}>
                    {lido.semanas.length === 0
                      ? 'Nenhuma semana reconhecida nessa colagem'
                      : `${lido.semanas.length} semana(s) reconhecida(s): ${lido.semanas[0].chave} a ${lido.semanas[lido.semanas.length - 1].chave}`}
                  </div>
                  {lido.semanas.length > 0 && (
                    <div style={est.previaLinhas}>
                      {lido.semanas.slice(0, 4).map((s) => (
                        <span key={s.chave} style={est.previaItem}>
                          {s.chave}: <strong>{s.pecas.toLocaleString('pt-BR')}</strong>
                        </span>
                      ))}
                      {lido.semanas.length > 4 && (
                        <span style={est.previaItem}>e mais {lido.semanas.length - 4}</span>
                      )}
                    </div>
                  )}
                  {lido.avisos.map((a) => <div key={a} style={est.aviso}>{a}</div>)}
                </div>
              )}

              <div style={est.acoes}>
                <button
                  type="button" style={est.botaoPrimario} onClick={gravarColagem}
                  disabled={ocupado || lido.semanas.length === 0}
                >
                  {ocupado ? 'Gravando...' : `Gravar ${lido.semanas.length || ''} semana(s)`}
                </button>
                {colagem.trim() !== '' && (
                  <button type="button" style={est.botaoTexto} onClick={() => setColagem('')} disabled={ocupado}>
                    Limpar colagem
                  </button>
                )}
              </div>
            </div>

            {/* ---- o que ja esta gravado ---- */}
            {semanas == null && !erro && <p style={est.texto}>Carregando programa...</p>}

            {semanas?.length === 0 && (
              <div style={est.vazio}>
                <div style={est.vazioTitulo}>Nenhuma semana cadastrada neste grupo</div>
                <p style={est.vazioTexto}>
                  Enquanto não houver programa, o relatório continua mostrando o ritmo medido
                  e não dá veredito de atendimento. É melhor assim: veredito sobre demanda
                  que ninguém informou seria chute com cara de indicador.
                </p>
              </div>
            )}

            {semanas?.length > 0 && (
              <div style={est.bloco}>
                <div style={est.blocoTitulo}>Programa gravado</div>
                {resumo && (
                  <p style={est.blocoTexto}>
                    {resumo.n} semanas, de {resumo.primeira.chave} a {resumo.ultima.chave}.
                    Média de <strong>{Math.round(resumo.media).toLocaleString('pt-BR')}</strong> peças,
                    variação de <strong>{resumo.cvPct.toFixed(1)}%</strong> —
                    da menor ({resumo.menor.chave}, {resumo.menor.pecas.toLocaleString('pt-BR')})
                    para a maior ({resumo.maior.chave}, {resumo.maior.pecas.toLocaleString('pt-BR')})
                    são {(resumo.maior.pecas / resumo.menor.pecas).toFixed(2)}x.
                    {resumo.cvPct >= 10 && ' É essa variação que impede um takt fixo: o número tem de vir com a semana.'}
                  </p>
                )}
                <div style={est.tabelaBox}>
                  <table style={est.tabela}>
                    <thead>
                      <tr>
                        <th style={est.th}>Semana</th>
                        <th style={est.thNum}>Peças</th>
                        <th style={est.thNum} title="Peças por hora que cada máquina do grupo precisa fazer">
                          Exigido por máquina
                        </th>
                        <th style={est.thNum} title="Tempo que cada máquina tem para cada peça">Takt</th>
                        <th style={est.th} aria-label="Ações" />
                      </tr>
                    </thead>
                    <tbody>
                      {[...semanas].reverse().map((s) => {
                        const r = ritmoExigido({
                          pecas: s.pecas, horas: horasNum, maquinas: maquinasDoGrupo,
                        });
                        return (
                          <tr key={s.chave}>
                            <td style={est.td}>{s.chave}</td>
                            <td style={est.tdNum}>{s.pecas.toLocaleString('pt-BR')}</td>
                            <td style={est.tdNum}>
                              {r ? `${Math.round(r.pecasPorHoraMaquina).toLocaleString('pt-BR')} pç/h` : '—'}
                            </td>
                            <td style={est.tdNum}>{r ? `${(r.taktMs / 1000).toFixed(1)}s` : '—'}</td>
                            <td style={est.tdAcoes}>
                              <button
                                type="button" style={est.botaoTexto} disabled={ocupado}
                                onClick={() => apagarSemana(s)}
                              >
                                Apagar
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {!(horasNum > 0 && maquinasDoGrupo > 0) && (
                  <p style={est.blocoAviso}>
                    O ritmo exigido e o takt aparecem quando o grupo tiver horas por semana e
                    pelo menos uma máquina ativa.
                  </p>
                )}
                <div style={est.acoes}>
                  {confirmarLimpeza ? (
                    <>
                      <span style={est.blocoTexto}>Apagar o programa inteiro deste grupo?</span>
                      <button type="button" style={est.botaoPerigo} onClick={apagarTudo} disabled={ocupado}>
                        Apagar tudo
                      </button>
                      <button type="button" style={est.botaoTexto} onClick={() => setConfirmarLimpeza(false)}>
                        Cancelar
                      </button>
                    </>
                  ) : (
                    <button type="button" style={est.botaoTexto} onClick={() => setConfirmarLimpeza(true)}>
                      Apagar o programa deste grupo
                    </button>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        <div style={est.acoes}>
          <button type="button" style={est.botaoSecundario} onClick={aoFechar}>Fechar</button>
        </div>
      </div>
    </div>
  );
}

const t = claro;

const est = {
  modal: {
    position: 'fixed', inset: 0, zIndex: 30, background: 'rgba(15, 18, 22, 0.55)',
    display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
    padding: espaco.xl, overflowY: 'auto',
  },
  caixa: {
    width: '100%', maxWidth: 760, background: t.papel,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.borda, borderRadius: raio.lg,
    padding: espaco.xxl, boxShadow: elevacao.alta,
    display: 'flex', flexDirection: 'column', gap: espaco.lg,
  },
  titulo: { ...tipo('titulo'), margin: 0, color: t.texto },
  texto: { ...tipo('corpo'), margin: 0, color: t.textoMedio },

  campo: { display: 'flex', flexDirection: 'column', gap: espaco.xs },
  campoCurto: { display: 'flex', flexDirection: 'column', gap: espaco.xs, maxWidth: 260, flex: 1 },
  rotuloCampo: rotulo(t.textoFraco),
  dica: { ...tipo('legenda'), color: t.textoFraco, fontStyle: 'italic' },
  input: {
    width: '100%', minHeight: 40, padding: `0 ${espaco.md}px`, background: t.papel,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.borda, borderRadius: raio.sm,
    color: t.texto, ...tipo('corpo'), fontFamily: 'inherit', outline: 'none',
  },
  linhaCampos: { display: 'flex', gap: espaco.md, alignItems: 'flex-end', flexWrap: 'wrap' },

  bloco: {
    display: 'flex', flexDirection: 'column', gap: espaco.md,
    padding: espaco.lg, background: t.fundo, borderRadius: raio.md,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.borda,
  },
  blocoTitulo: { ...rotulo(t.textoFraco) },
  blocoTexto: { ...tipo('legenda'), color: t.textoMedio, margin: 0, lineHeight: 1.55 },
  blocoAviso: { ...tipo('legenda'), color: t.textoFraco, margin: 0, fontStyle: 'italic' },

  areaColagem: {
    width: '100%', minHeight: 120, padding: espaco.md, background: t.papel,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.borda, borderRadius: raio.sm,
    color: t.texto, ...tipo('legenda'),
    fontFamily: "'Roboto Mono', 'Consolas', monospace", outline: 'none', resize: 'vertical',
  },
  previa: {
    display: 'flex', flexDirection: 'column', gap: espaco.xs,
    padding: espaco.md, background: t.papel, borderRadius: raio.sm,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.borda,
  },
  previaTitulo: { ...tipo('corpoF'), color: t.texto },
  previaLinhas: { display: 'flex', gap: espaco.md, flexWrap: 'wrap' },
  previaItem: { ...tipo('legenda'), ...numeros, color: t.textoMedio },
  // Aviso NAO impede gravar: a planilha real tem linha torta, e recusar
  // tudo por causa de uma devolveria o trabalho sem motivo.
  aviso: {
    padding: `${espaco.xs}px ${espaco.sm}px`, background: t.fundo, borderRadius: raio.sm,
    borderLeftWidth: 3, borderLeftStyle: 'solid', borderLeftColor: '#D97706',
    ...tipo('legenda'), color: t.texto,
  },

  vazio: {
    display: 'flex', flexDirection: 'column', gap: espaco.sm,
    padding: espaco.lg, background: t.fundo, borderRadius: raio.md,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.borda,
  },
  vazioTitulo: { ...tipo('corpoF'), color: t.texto },
  vazioTexto: { ...tipo('legenda'), color: t.textoMedio, margin: 0, lineHeight: 1.55 },

  tabelaBox: { overflowX: 'auto' },
  tabela: { width: '100%', borderCollapse: 'collapse' },
  th: {
    textAlign: 'left', padding: `${espaco.sm}px ${espaco.md}px`,
    ...rotulo(t.textoFraco), borderBottom: `1px solid ${t.borda}`, whiteSpace: 'nowrap',
  },
  thNum: {
    textAlign: 'right', padding: `${espaco.sm}px ${espaco.md}px`,
    ...rotulo(t.textoFraco), borderBottom: `1px solid ${t.borda}`, whiteSpace: 'nowrap',
  },
  td: {
    padding: `${espaco.sm}px ${espaco.md}px`, ...tipo('corpo'), ...numeros,
    color: t.texto, borderBottom: `1px solid ${t.borda}`, whiteSpace: 'nowrap',
  },
  tdNum: {
    padding: `${espaco.sm}px ${espaco.md}px`, textAlign: 'right', ...tipo('corpo'), ...numeros,
    color: t.textoMedio, borderBottom: `1px solid ${t.borda}`, whiteSpace: 'nowrap',
  },
  tdAcoes: {
    padding: `${espaco.sm}px ${espaco.md}px`, textAlign: 'right',
    borderBottom: `1px solid ${t.borda}`, whiteSpace: 'nowrap',
  },

  botaoPrimario: {
    minHeight: 40, padding: `0 ${espaco.lg}px`,
    background: t.vermelho, border: 'none', borderRadius: raio.md, color: '#fff',
    ...tipo('corpoF'), cursor: 'pointer', fontFamily: 'inherit',
  },
  botaoSecundario: {
    minHeight: 40, padding: `0 ${espaco.lg}px`, background: 'transparent',
    borderWidth: 1, borderStyle: 'solid', borderColor: t.borda, borderRadius: raio.md,
    color: t.textoMedio, ...tipo('corpo'), cursor: 'pointer', fontFamily: 'inherit',
  },
  botaoPerigo: {
    minHeight: 36, padding: `0 ${espaco.lg}px`, background: t.critico,
    border: 'none', borderRadius: raio.md, color: '#fff',
    ...tipo('corpoF'), cursor: 'pointer', fontFamily: 'inherit',
  },
  botaoTexto: {
    minHeight: 32, padding: 0, background: 'transparent', border: 'none',
    color: t.textoMedio, ...tipo('legenda'), fontWeight: 600,
    cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline',
  },

  erro: {
    padding: espaco.md, background: t.criticoFundo,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.critico,
    borderRadius: raio.sm, ...tipo('legenda'), color: t.texto,
  },
  acoes: { display: 'flex', gap: espaco.md, alignItems: 'center', flexWrap: 'wrap' },
};
