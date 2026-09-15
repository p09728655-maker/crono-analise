import { useEffect, useMemo, useState } from 'react';
import { claro } from '../../theme/tokensAnalise.js';
import { elevacao, espaco, numeros, raio, rotulo, tipo } from '../../theme/escala.js';
import {
  chaveSemana, comoDia, comoPeriodo, contaDasHoras, dataIso, emUtc, horasDeSetup, interpretarColagem,
  lerCodigoSemana, lerDataPtBr, numeroPtBr, periodosDoPrograma, resumoDaDemanda, ritmoExigido,
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
  const [diasSemana, setDiasSemana] = useState('');
  const [setupsDia, setSetupsDia] = useState('');
  const [setupMin, setSetupMin] = useState('');
  // Uma semana digitada a mao: para quem reprogramou uma semana so' ou
  // nao tem a planilha na mao. Mesma rota da colagem, mesma mescla.
  const [manual, setManual] = useState({ semana: '', inicio: '', pecas: '' });
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
  const comoTexto = (v) => (v != null ? String(v) : '');
  useEffect(() => {
    setHoras(comoTexto(grupo?.horas_semana));
    setDiasSemana(comoTexto(grupo?.dias_semana));
    setSetupsDia(comoTexto(grupo?.setups_dia));
    setSetupMin(comoTexto(grupo?.setup_min));
  }, [grupo?.id, grupo?.horas_semana, grupo?.dias_semana, grupo?.setups_dia, grupo?.setup_min]);

  /** Maquinas ATIVAS do grupo: sao elas que somam tempo disponivel. */
  const maquinasDoGrupo = (cadastro?.maquinas || [])
    .filter((m) => m.grupo_id === grupoId && m.ativa).length;

  const lido = useMemo(() => interpretarColagem(colagem), [colagem]);
  const resumo = useMemo(() => resumoDaDemanda(semanas || []), [semanas]);

  /**
   * O PERIODO de cada semana gravada, para a tabela dizer de que dias o
   * programa fala.
   *
   * E' a unica conferencia possivel contra a coluna INICIO vir da celula
   * errada na planilha: o PCP tem a planilha aberta ao lado e ve' na hora
   * se a 034-26 aqui diz 31/08 a 04/09 ou outra coisa. Numero de semana
   * ninguem confere de cabeca; data, sim.
   */
  const periodos = useMemo(
    () => new Map(periodosDoPrograma(semanas || []).map((x) => [chaveSemana(x.semana), x])),
    [semanas],
  );
  const horasNum = Number(String(horas).replace(',', '.')) || 0;
  const numero = (v) => (String(v).trim() === '' ? null : Number(String(v).replace(',', '.')));
  /**
   * A CONTA DO TEMPO DISPONIVEL, como a tela escreve: jornada cheia, o que
   * o setup come, e o que sobra para produzir. E' sobre o que sobra que o
   * ritmo exigido e' calculado. Feita aqui, a cada tecla, para a pessoa
   * ver o efeito do numero que esta' digitando ANTES de salvar.
   */
  const setupHoras = horasDeSetup({
    setupsDia: numero(setupsDia), dias: numero(diasSemana), minutos: numero(setupMin),
  });
  // Numeros DERIVADOS um do outro (dominio): setup do grupo = por maquina
  // exibido x maquinas; produtivas = jornada exibida − setup exibido. E' a
  // unica regra em que "264 − 50 = 214" fecha em toda combinacao.
  const conta = contaDasHoras({ horas: horasNum, setupHoras, maquinas: maquinasDoGrupo });
  const setupComeTudo = setupHoras != null && horasNum > 0 && setupHoras >= horasNum;
  const houveMudancaNoTempo = [
    [horas, grupo?.horas_semana], [diasSemana, grupo?.dias_semana],
    [setupsDia, grupo?.setups_dia], [setupMin, grupo?.setup_min],
  ].some(([campo, salvo]) => numero(campo) !== (salvo == null ? null : Number(salvo)));

  /**
   * A semana digitada, lida pelas MESMAS regras da colagem: "S38" ou
   * "038-26", data dd/mm/aaaa, pecas com ponto de milhar. Inicio e'
   * obrigatorio aqui de proposito — na colagem ele e' tolerado por causa
   * de planilha antiga; digitando uma semana, nao ha' desculpa para o
   * casamento por numero, que erra em toda semana com feriado.
   */
  const inicioManual = lerDataPtBr(manual.inicio);
  const semanaManual = lerCodigoSemana(manual.semana, {
    ano: inicioManual?.getUTCFullYear() ?? new Date().getFullYear(),
  });
  const pecasManual = numeroPtBr(manual.pecas);
  const manualPreenchido = [manual.semana, manual.inicio, manual.pecas].some((v) => v.trim() !== '');
  const problemasManual = [
    manual.semana.trim() !== '' && !semanaManual && 'Semana no formato S38 ou 038-26.',
    manual.inicio.trim() !== '' && !inicioManual && 'Início no formato dd/mm/aaaa.',
    manual.pecas.trim() !== '' && !(pecasManual > 0) && 'Peças precisa ser um número maior que zero.',
  ].filter(Boolean);
  const manualPronto = Boolean(semanaManual && inicioManual && pecasManual > 0);
  const jaGravada = manualPronto
    ? (semanas || []).find((s) => s.chave === chaveSemana(semanaManual)) || null
    : null;

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
      lido.semanas.map((s) => ({
        ano: s.ano, numero: s.numero, pecas: s.pecas, inicio: s.inicio,
      })),
    );
    setSemanas(lista.map((d) => ({ ...d, chave: chaveSemana(d) })));
    setColagem('');
  });

  const salvarTempo = () => aplicar(async () => {
    // Os quatro numeros sobem juntos: sao UMA decisao (o tempo disponivel
    // do grupo), e salvar um de cada vez deixaria a conta pela metade
    // entre dois cliques. Campo vazio apaga — e' como se diz "nao sei".
    const atualizado = await atualizarGrupoMaquina(grupoId, {
      horasSemana: numero(horas),
      diasSemana: numero(diasSemana),
      setupsDia: numero(setupsDia),
      setupMin: numero(setupMin),
    });
    setCadastro((c) => ({
      ...c,
      grupos: c.grupos.map((g) => (g.id === grupoId ? { ...g, ...atualizado } : g)),
    }));
  });

  const incluirManual = () => aplicar(async () => {
    const lista = await gravarDemanda(grupoId, [{
      ano: semanaManual.ano, numero: semanaManual.numero,
      pecas: pecasManual, inicio: dataIso(inicioManual),
    }]);
    setSemanas(lista.map((d) => ({ ...d, chave: chaveSemana(d) })));
    setManual({ semana: '', inicio: '', pecas: '' });
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

            {/* ---- o denominador do takt: jornada menos setup ---- */}
            <div style={est.bloco}>
              <div style={est.blocoTitulo}>Tempo disponível</div>
              <p style={est.blocoTexto}>
                O ritmo exigido é a demanda dividida pelo tempo que o grupo tem para produzir:
                a <strong>jornada</strong> de cada máquina menos o <strong>setup</strong> — a troca
                de peça (gabarito, batente, brocas), que acontece entre uma medição e outra e que
                o cronômetro não pega. Tudo por máquina; a tela multiplica pelas{' '}
                {maquinasDoGrupo} ativa(s) do grupo.
              </p>

              <div style={est.gradeTempo}>
                <fieldset style={est.grupoCampos}>
                  <legend style={est.legendaCampos}>Jornada</legend>
                  <div style={est.linhaCampos}>
                    <label style={est.campoCurto}>
                      <span style={est.rotuloCampo}>Horas por semana</span>
                      <input
                        type="number" min="0.5" max="168" step="0.1" style={est.input}
                        value={horas} disabled={ocupado}
                        onChange={(ev) => setHoras(ev.target.value)}
                        placeholder="ex.: 44"
                      />
                    </label>
                    <label style={est.campoCurto}>
                      <span style={est.rotuloCampo}>Dias de produção</span>
                      <input
                        type="number" min="1" max="7" step="1" style={est.input}
                        value={diasSemana} disabled={ocupado}
                        onChange={(ev) => setDiasSemana(ev.target.value)}
                        placeholder="ex.: 5"
                      />
                    </label>
                  </div>
                </fieldset>
                <fieldset style={est.grupoCampos}>
                  <legend style={est.legendaCampos}>Setup</legend>
                  <div style={est.linhaCampos}>
                    <label style={est.campoCurto}>
                      <span style={est.rotuloCampo}>Setups por dia</span>
                      <input
                        type="number" min="0" max="100" step="1" style={est.input}
                        value={setupsDia} disabled={ocupado}
                        onChange={(ev) => setSetupsDia(ev.target.value)}
                        placeholder="ex.: 5"
                      />
                    </label>
                    <label style={est.campoCurto}>
                      <span style={est.rotuloCampo}>Minutos por setup</span>
                      <input
                        type="number" min="0" max="600" step="1" style={est.input}
                        value={setupMin} disabled={ocupado}
                        onChange={(ev) => setSetupMin(ev.target.value)}
                        placeholder="ex.: 20"
                      />
                    </label>
                  </div>
                </fieldset>
              </div>

              {/* A CONTA, VISIVEL. Tres numeros lado a lado — jornada, setup,
                  produtivas — com a formula embaixo de cada um. E' o que permite
                  conferir de cabeca ("6 × 44 = 264, tirei 50, sobram 214") em
                  vez de confiar num numero que apareceu. Muda a cada tecla, antes
                  de salvar, para a pessoa ver o efeito do que esta' digitando. */}
              {maquinasDoGrupo > 0 && horasNum > 0 && (
                <div style={est.contaTempo}>
                  <div style={est.contaCaixa}>
                    <span style={est.contaRotulo}>Jornada</span>
                    <span style={est.contaValor}>
                      {conta.texto.jornada}<span style={est.contaUnidade}>h</span>
                    </span>
                    <span style={est.contaFormula}>
                      {maquinasDoGrupo} máq. × {horasNum.toLocaleString('pt-BR')} h
                    </span>
                  </div>
                  <div style={est.contaCaixa}>
                    <span style={est.contaRotulo}>Setup</span>
                    <span style={setupHoras == null ? est.contaValorVazio : est.contaValor}>
                      {setupHoras == null ? '?' : `− ${conta.texto.setup}`}
                      {setupHoras != null && <span style={est.contaUnidade}>h</span>}
                    </span>
                    <span style={est.contaFormula}>
                      {setupHoras == null
                        ? 'setups/dia × dias × minutos'
                        : (setupHoras === 0
                          ? 'sem troca de peça cadastrada'
                          : `${numero(setupsDia)}/dia × ${numero(diasSemana)} dias × ${numero(setupMin)} min = ${conta.texto.porMaquina} h/máq.`)}
                    </span>
                  </div>
                  <div style={setupComeTudo ? est.contaCaixaAlerta : est.contaCaixaResultado}>
                    <span style={est.contaRotulo}>Produtivas</span>
                    <span style={est.contaValor}>
                      {conta.texto.produtivas}<span style={est.contaUnidade}>h</span>
                    </span>
                    <span style={est.contaFormula}>
                      {setupComeTudo
                        ? 'o setup come a jornada inteira — confira os números'
                        : 'horas-máquina na semana — é sobre elas que o exigido é calculado'}
                    </span>
                  </div>
                </div>
              )}

              <div style={est.acoes}>
                <button
                  type="button" style={houveMudancaNoTempo ? est.botaoPrimario : est.botaoSecundario}
                  onClick={salvarTempo} disabled={ocupado || !houveMudancaNoTempo}
                >
                  {ocupado ? 'Salvando...' : 'Salvar tempo disponível'}
                </button>
                {houveMudancaNoTempo && !ocupado && (
                  <span style={est.dica}>a conta acima já usa o que você digitou; o relatório só muda depois de salvar</span>
                )}
              </div>

              <p style={est.blocoTexto}>
                {horasNum > 0 && maquinasDoGrupo > 0
                  ? (setupHoras == null
                    ? (
                      <>
                        <strong>Setup não informado.</strong> Sem ele o relatório usa a jornada cheia e
                        o veredito sai otimista exatamente pelo tempo de troca da semana — nas
                        furadeiras, cinco trocas de 20 min por dia são mais de 8 h por máquina.
                      </>
                    )
                    : (
                      <>
                        Setup entra <strong>uma vez só</strong>: aqui, planejado. Se alguma medição
                        também marcar parada de troca/setup, o relatório tira esse tempo do ritmo de
                        relógio para não contar duas vezes.
                      </>
                    ))
                  : 'Sem as horas não há takt: o ritmo exigido é a demanda dividida pelo tempo disponível. Não assumo 44 h por conta própria — jornada é decisão de turno.'}
              </p>
              {grupo?.horas_semana == null && (
                <p style={est.blocoAviso}>
                  Só administrador altera o cadastro de máquinas. Se o botão recusar, peça a
                  quem administra — ou troque o seu papel no cadastro de analistas.
                </p>
              )}
            </div>

            {/* ---- uma semana digitada ---- */}
            <div style={est.bloco}>
              <div style={est.blocoTitulo}>Incluir uma semana</div>
              <p style={est.blocoTexto}>
                Para uma semana reprogramada ou quando a planilha não está à mão. Semana como
                o PCP escreve (<strong>S38</strong>), início é o primeiro dia de produção dela
                (a data de CORTE MDF da aba), peças é o TOTAL SEMANA. Semana que já existe é
                substituída.
              </p>
              <div style={est.linhaCampos}>
                <label style={est.campoEstreito}>
                  <span style={est.rotuloCampo}>Semana</span>
                  <input
                    type="text" style={est.input} value={manual.semana} disabled={ocupado}
                    onChange={(ev) => setManual((m) => ({ ...m, semana: ev.target.value }))}
                    placeholder="S38" aria-label="Semana"
                  />
                </label>
                <label style={est.campoEstreito}>
                  <span style={est.rotuloCampo}>Início</span>
                  <input
                    type="text" style={est.input} value={manual.inicio} disabled={ocupado}
                    onChange={(ev) => setManual((m) => ({ ...m, inicio: ev.target.value }))}
                    placeholder="08/09/2026" aria-label="Início" inputMode="numeric"
                  />
                </label>
                <label style={est.campoEstreito}>
                  <span style={est.rotuloCampo}>Peças</span>
                  <input
                    type="text" style={est.input} value={manual.pecas} disabled={ocupado}
                    onChange={(ev) => setManual((m) => ({ ...m, pecas: ev.target.value }))}
                    placeholder="121.900" aria-label="Peças" inputMode="numeric"
                  />
                </label>
                <button
                  type="button" style={manualPronto ? est.botaoPrimario : est.botaoSecundario}
                  onClick={incluirManual} disabled={ocupado || !manualPronto}
                >
                  {ocupado ? 'Gravando...' : (jaGravada ? 'Substituir semana' : 'Incluir semana')}
                </button>
              </div>
              {manualPreenchido && (
                <div style={est.previa}>
                  {manualPronto ? (
                    <div style={est.previaTitulo}>
                      {chaveSemana(semanaManual)} · {comoDia(inicioManual)} a{' '}
                      {comoDia(new Date(inicioManual.getTime() + (6 * 86400000)), { ano: true })} ·{' '}
                      <strong>{pecasManual.toLocaleString('pt-BR')}</strong> peças
                      {jaGravada && (
                        <span style={est.previaItem}>
                          {' '}— hoje está com {jaGravada.pecas.toLocaleString('pt-BR')}
                          {jaGravada.inicio ? ` (início ${comoDia(emUtc(jaGravada.inicio))})` : ' (sem data)'}
                        </span>
                      )}
                    </div>
                  ) : (
                    <div style={est.previaTitulo}>
                      {problemasManual.length ? problemasManual.join(' ') : 'Preencha semana, início e peças.'}
                    </div>
                  )}
                </div>
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
                placeholder={'SEMANA\tINÍCIO\tLOTE 1\t...\tTOTAL SEMANA\nS02\t08/01/2026\t25.000\t...\t128.250'}
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
                          {/* A DATA na previa, ANTES de gravar: e' onde o PCP percebe
                              se a coluna INICIO da planilha aponta para a celula
                              certa. Depois de gravado, o erro ja' esta' no veredito. */}
                          {s.chave}{s.inicio ? ' ' + comoDia(emUtc(s.inicio)) : ''}:{' '}
                          <strong>{s.pecas.toLocaleString('pt-BR')}</strong>
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
                        <th style={est.th} title="Os dias que essa semana do programa cobre na fábrica">
                          Período
                        </th>
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
                          setupHoras: setupHoras ?? 0,
                        });
                        return (
                          <tr key={s.chave}>
                            <td style={est.td}>{s.chave}</td>
                            <td style={est.tdPeriodo}>
                              {comoPeriodo(periodos.get(s.chave)) || 'sem data'}
                            </td>
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
  campoEstreito: { display: 'flex', flexDirection: 'column', gap: espaco.xs, width: 150 },
  linhaCampos: { display: 'flex', gap: espaco.md, alignItems: 'flex-end', flexWrap: 'wrap' },

  /* ---- tempo disponivel: dois grupos de campos e a conta ---- */
  gradeTempo: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: espaco.md,
  },
  // fieldset com a moldura do navegador zerada: o agrupamento visual e' a
  // legenda em caixa alta, nao a borda cinza de formulario dos anos 90.
  grupoCampos: {
    margin: 0, padding: `${espaco.md}px ${espaco.md}px ${espaco.md}px`, minWidth: 0,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.borda, borderRadius: raio.sm,
    background: t.papel,
  },
  legendaCampos: { ...rotulo(t.textoMedio), padding: `0 ${espaco.xs}px` },
  contaTempo: {
    display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: espaco.sm,
  },
  contaCaixa: {
    display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0,
    padding: `${espaco.md}px ${espaco.md}px`, background: t.papel, borderRadius: raio.sm,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.borda,
  },
  // O resultado e' o unico dos tres que o relatorio usa: borda mais forte,
  // nao cor de alerta — produtivas nao e' problema, e' a resposta.
  contaCaixaResultado: {
    display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0,
    padding: `${espaco.md}px ${espaco.md}px`, background: t.papel, borderRadius: raio.sm,
    borderWidth: 2, borderStyle: 'solid', borderColor: t.bordaForte,
  },
  contaCaixaAlerta: {
    display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0,
    padding: `${espaco.md}px ${espaco.md}px`, background: t.criticoFundo, borderRadius: raio.sm,
    borderWidth: 2, borderStyle: 'solid', borderColor: t.critico,
  },
  contaRotulo: { ...rotulo(t.textoFraco) },
  contaValor: { ...tipo('titulo'), ...numeros, color: t.texto, lineHeight: 1.1 },
  contaValorVazio: { ...tipo('titulo'), ...numeros, color: t.textoFraco, lineHeight: 1.1 },
  contaUnidade: { ...tipo('legenda'), color: t.textoMedio, marginLeft: espaco.xs },
  contaFormula: { ...tipo('legenda'), ...numeros, color: t.textoMedio, lineHeight: 1.35 },

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
  tdPeriodo: {
    padding: `${espaco.sm}px ${espaco.md}px`, ...tipo('legenda'), ...numeros,
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
