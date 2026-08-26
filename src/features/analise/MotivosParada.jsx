import { useEffect, useState } from 'react';
import { claro } from '../../theme/tokensAnalise.js';
import { elevacao, espaco, raio, rotulo, tipo, transicao } from '../../theme/escala.js';
import { MOTIVOS_PARADA } from '../../domain/cronoanalise.js';
import {
  atualizarMotivoParada, criarMotivoParada, listarMotivosParada, ordenarMotivosParada,
  removerMotivoParada, semearMotivosParada,
} from '../../lib/api.js';
import { adotarMotivos } from '../../lib/motivosParada.js';

/**
 * CADASTRO DOS MOTIVOS DE PARADA — trabalho de PC.
 *
 * A lista que o tablet oferece quando a maquina para ("por que parou?") e a
 * que o relatorio usa para recomendar o que fazer. Ela nasceu chumbada no
 * codigo: incluir "falta de energia" ou corrigir a acao de setup exigia
 * deploy, e quem conhece o processo nao tinha caminho nenhum ate' ela.
 *
 * Tres decisoes que a tela expoe de proposito:
 *
 *  - O CODIGO aparece, mas nao se edita. E' ele que fica gravado em cada
 *    parada; trocar depois transformaria historico em orfao. O nome que
 *    aparece na tela muda a' vontade — e a mudanca vale para tras.
 *  - DESATIVAR e' a saida normal para um motivo que caiu em desuso: some da
 *    coleta e continua nomeando as paradas antigas. Excluir so' passa
 *    quando nada aponta para ele, e o servidor recusa o resto.
 *  - A ACAO nao e' descricao: e' o que a aba Sugestoes recomenda quando
 *    aquele motivo domina o tempo parado. Motivo sem acao vira diagnostico
 *    sem tratamento, entao o campo pede para ser preenchido.
 */
export default function MotivosParada({ aoFechar }) {
  const [motivos, setMotivos] = useState(null);
  const [erro, setErro] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [editando, setEditando] = useState(null);   // id em edicao
  const [criando, setCriando] = useState(false);

  /**
   * Falha de carga deixa `motivos` em null de proposito.
   *
   * A versao anterior caia para lista vazia, e a tela mostrava "Nenhum
   * motivo cadastrado" JUNTO com o erro: duas afirmacoes que se contradizem
   * — uma diz que o cadastro esta vazio, a outra que nao deu para saber. E
   * ainda oferecia gravar os nove num banco que acabou de recusar a leitura.
   */
  useEffect(() => {
    listarMotivosParada()
      .then((lista) => setMotivos(lista))
      .catch((e) => setErro(e.message));
  }, []);

  /**
   * Toda escrita passa por aqui: um lugar so' para ocupado, erro e cache.
   *
   * Devolve se deu certo — e' o que o formulario usa para decidir se fecha.
   * Fechar mesmo com falha (codigo repetido, exclusao recusada) apagaria o
   * que a pessoa acabou de digitar junto com a mensagem que explica o erro.
   */
  async function aplicar(fn) {
    setOcupado(true);
    setErro(null);
    let ok = true;
    try {
      await fn();
      const lista = await listarMotivosParada();
      setMotivos(lista);
      adotarMotivos(lista);
    } catch (e) { setErro(e.message); ok = false; }
    setOcupado(false);
    return ok;
  }

  const recarregar = () => aplicar(() => Promise.resolve());

  const semear = () => aplicar(() => semearMotivosParada(
    MOTIVOS_PARADA.map((m) => ({ codigo: m.codigo, rotulo: m.rotulo, acao: m.acao })),
  ));

  const trocarOrdem = (indice, passo) => {
    const destino = indice + passo;
    if (destino < 0 || destino >= motivos.length) return;
    const ids = motivos.map((m) => m.id);
    [ids[indice], ids[destino]] = [ids[destino], ids[indice]];
    aplicar(() => ordenarMotivosParada(ids));
  };

  const vazio = motivos?.length === 0;
  const naoCarregou = motivos == null && erro;

  return (
    <div style={est.modal} role="dialog" aria-label="Motivos de parada">
      <div style={est.caixa}>
        <h2 style={est.titulo}>Motivos de parada</h2>
        <p style={est.texto}>
          É a lista que aparece no tablet quando a máquina para, e a que o
          relatório usa para recomendar o que fazer. Vale para o app inteiro.
        </p>

        {motivos == null && !erro && <p style={est.texto}>Carregando cadastro...</p>}

        {vazio && !naoCarregou && (
          <div style={est.vazio}>
            <div style={est.vazioTitulo}>Nenhum motivo cadastrado</div>
            <p style={est.vazioTexto}>
              Enquanto o cadastro estiver vazio, a coleta usa os
              {' '}{MOTIVOS_PARADA.length} motivos que já vinham no app. Traga-os para
              cá e ajuste o que quiser — nome, ação recomendada, ordem — ou
              comece do zero com os seus.
            </p>
            <div style={est.vazioAcoes}>
              <button type="button" style={est.botaoPrimario} onClick={semear} disabled={ocupado}>
                {ocupado ? 'Trazendo...' : `Trazer os ${MOTIVOS_PARADA.length} motivos atuais`}
              </button>
              <button type="button" style={est.botaoSecundario} onClick={() => setCriando(true)}>
                Começar do zero
              </button>
            </div>
          </div>
        )}

        {motivos?.length > 0 && (
          <div style={est.lista}>
            {motivos.map((m, i) => (
              editando === m.id ? (
                <Formulario
                  key={m.id}
                  motivo={m}
                  ocupado={ocupado}
                  aoCancelar={() => setEditando(null)}
                  aoSalvar={async (dados) => {
                    if (await aplicar(() => atualizarMotivoParada(m.id, dados))) setEditando(null);
                  }}
                />
              ) : (
                <div key={m.id} style={{ ...est.linha, ...(m.ativo ? {} : est.linhaInativa) }}>
                  <div style={est.ordemBotoes}>
                    <button
                      type="button" style={est.botaoOrdem} disabled={ocupado || i === 0}
                      onClick={() => trocarOrdem(i, -1)} aria-label={`Subir ${m.rotulo}`}
                    >
                      ↑
                    </button>
                    <button
                      type="button" style={est.botaoOrdem} disabled={ocupado || i === motivos.length - 1}
                      onClick={() => trocarOrdem(i, 1)} aria-label={`Descer ${m.rotulo}`}
                    >
                      ↓
                    </button>
                  </div>

                  <div style={est.linhaCorpo}>
                    <div style={est.linhaTopo}>
                      <span style={est.linhaRotulo}>{m.rotulo}</span>
                      <span style={est.codigo} title="Código gravado nas paradas — não muda">
                        {m.codigo}
                      </span>
                      {!m.ativo && <span style={est.seloInativo}>Desativado</span>}
                    </div>
                    <span style={m.acao ? est.linhaAcao : est.linhaSemAcao}>
                      {m.acao || 'Sem ação recomendada — a aba Sugestões fica sem o que propor para este motivo.'}
                    </span>
                  </div>

                  {/* O nome vai no aria-label: sao tres "Editar" por linha
                      numa lista de nove, e "Editar" sozinho nao diz o quê. */}
                  <div style={est.linhaBotoes}>
                    <button
                      type="button" style={est.botaoTexto}
                      onClick={() => setEditando(m.id)}
                      aria-label={`Editar ${m.rotulo}`}
                    >
                      Editar
                    </button>
                    <button
                      type="button" style={est.botaoTexto} disabled={ocupado}
                      onClick={() => aplicar(() => atualizarMotivoParada(m.id, { ativo: !m.ativo }))}
                      aria-label={`${m.ativo ? 'Desativar' : 'Reativar'} ${m.rotulo}`}
                    >
                      {m.ativo ? 'Desativar' : 'Reativar'}
                    </button>
                    <button
                      type="button" style={est.botaoTexto} disabled={ocupado}
                      onClick={() => aplicar(() => removerMotivoParada(m.id))}
                      aria-label={`Excluir ${m.rotulo}`}
                    >
                      Excluir
                    </button>
                  </div>
                </div>
              )
            ))}
          </div>
        )}

        {criando ? (
          <Formulario
            ocupado={ocupado}
            aoCancelar={() => setCriando(false)}
            aoSalvar={async (dados) => {
              if (await aplicar(() => criarMotivoParada(dados))) setCriando(false);
            }}
          />
        ) : motivos?.length > 0 && (
          <button type="button" style={est.botaoSecundario} onClick={() => setCriando(true)}>
            + Novo motivo
          </button>
        )}

        {erro && <div style={est.erro} role="alert">{erro}</div>}

        {naoCarregou && (
          <button type="button" style={est.botaoSecundario} onClick={recarregar} disabled={ocupado}>
            Tentar de novo
          </button>
        )}

        <div style={est.acoes}>
          <button type="button" style={{ ...est.botaoSecundario, flex: 1 }} onClick={aoFechar}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Formulario de um motivo — o mesmo para criar e para editar.
 *
 * O codigo aparece so' na edicao, desabilitado: quem edita precisa VER com
 * que nome as paradas foram gravadas, e precisa entender por que aquele
 * campo nao aceita digitacao.
 */
function Formulario({ motivo, ocupado, aoSalvar, aoCancelar }) {
  const [rotuloTexto, setRotulo] = useState(motivo?.rotulo || '');
  const [acao, setAcao] = useState(motivo?.acao || '');
  const novo = !motivo;

  return (
    <form
      style={est.form}
      onSubmit={(ev) => { ev.preventDefault(); aoSalvar({ rotulo: rotuloTexto.trim(), acao: acao.trim() }); }}
    >
      <label style={est.campo}>
        <span style={est.rotuloCampo}>Nome que aparece na tela</span>
        <input
          type="text"
          value={rotuloTexto}
          onChange={(ev) => setRotulo(ev.target.value)}
          placeholder="Ex: Falta de energia"
          style={est.input}
          maxLength={60}
          autoFocus
        />
      </label>

      {motivo && (
        <label style={est.campo}>
          <span style={est.rotuloCampo}>Código gravado nas paradas</span>
          <input type="text" value={motivo.codigo} style={est.inputTravado} disabled />
          <span style={est.dica}>
            Não muda: é por ele que as paradas já registradas encontram este motivo.
            Trocar o nome acima renomeia o histórico inteiro, sem risco.
          </span>
        </label>
      )}

      <label style={est.campo}>
        <span style={est.rotuloCampo}>Ação recomendada</span>
        <input
          type="text"
          value={acao}
          onChange={(ev) => setAcao(ev.target.value)}
          placeholder="Ex: Acionar a manutenção elétrica e registrar no plano de contingência."
          style={est.input}
          maxLength={300}
        />
        <span style={est.dica}>
          É o que a aba Sugestões vai propor quando este motivo dominar o tempo parado.
        </span>
      </label>

      <div style={est.formAcoes}>
        <button type="button" style={est.botaoTexto} onClick={aoCancelar}>Cancelar</button>
        <button type="submit" style={est.botaoPrimario} disabled={ocupado || !rotuloTexto.trim()}>
          {ocupado ? 'Salvando...' : novo ? 'Adicionar motivo' : 'Salvar'}
        </button>
      </div>
    </form>
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
    width: '100%', maxWidth: 680, background: t.papel,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.borda, borderRadius: raio.lg,
    padding: espaco.xxl, boxShadow: elevacao.alta,
    display: 'flex', flexDirection: 'column', gap: espaco.lg,
  },
  titulo: { ...tipo('titulo'), margin: 0, color: t.texto },
  texto: { ...tipo('corpo'), margin: 0, color: t.textoMedio },

  vazio: {
    display: 'flex', flexDirection: 'column', gap: espaco.sm,
    padding: espaco.lg, background: t.fundo, borderRadius: raio.md,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.borda,
  },
  vazioTitulo: { ...tipo('corpoF'), color: t.texto },
  vazioTexto: { ...tipo('legenda'), color: t.textoMedio, margin: 0 },
  vazioAcoes: { display: 'flex', gap: espaco.md, flexWrap: 'wrap', marginTop: espaco.sm },

  lista: { display: 'flex', flexDirection: 'column', gap: espaco.sm },
  linha: {
    display: 'flex', alignItems: 'flex-start', gap: espaco.md,
    padding: espaco.md, background: t.fundo, borderRadius: raio.md,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.borda,
  },
  // Desativado continua legivel: ele ainda nomeia parada antiga no relatorio.
  linhaInativa: { opacity: 0.62 },
  ordemBotoes: { display: 'flex', flexDirection: 'column', gap: 2, flexShrink: 0 },
  botaoOrdem: {
    width: 26, height: 22, padding: 0, background: t.papel,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.borda, borderRadius: raio.sm,
    color: t.textoMedio, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
    transition: `border-color ${transicao.rapida}`,
  },
  linhaCorpo: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 },
  linhaTopo: { display: 'flex', alignItems: 'center', gap: espaco.sm, flexWrap: 'wrap' },
  linhaRotulo: { ...tipo('corpoF'), color: t.texto },
  codigo: {
    padding: '1px 6px', borderRadius: raio.sm, background: t.papel,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.borda,
    color: t.textoFraco, ...tipo('micro'), textTransform: 'none', letterSpacing: 0,
    fontFamily: "'Roboto Mono', 'Consolas', monospace",
  },
  seloInativo: {
    padding: '1px 6px', borderRadius: raio.pill, background: t.papel,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.borda,
    color: t.textoFraco, ...tipo('micro'),
  },
  linhaAcao: { ...tipo('legenda'), color: t.textoMedio },
  linhaSemAcao: { ...tipo('legenda'), color: t.textoFraco, fontStyle: 'italic' },
  linhaBotoes: { display: 'flex', gap: espaco.md, flexShrink: 0, alignItems: 'center' },

  form: {
    display: 'flex', flexDirection: 'column', gap: espaco.md,
    padding: espaco.lg, background: t.fundo, borderRadius: raio.md,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.vermelho,
  },
  campo: { display: 'flex', flexDirection: 'column', gap: espaco.xs },
  rotuloCampo: rotulo(t.textoFraco),
  dica: { ...tipo('legenda'), color: t.textoFraco, fontStyle: 'italic' },
  input: {
    width: '100%', minHeight: 40, padding: `0 ${espaco.md}px`, background: t.papel,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.borda, borderRadius: raio.sm,
    color: t.texto, ...tipo('corpo'), fontFamily: 'inherit', outline: 'none',
  },
  inputTravado: {
    width: '100%', minHeight: 40, padding: `0 ${espaco.md}px`, background: t.fundo,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.borda, borderRadius: raio.sm,
    color: t.textoFraco, ...tipo('corpo'),
    fontFamily: "'Roboto Mono', 'Consolas', monospace",
  },
  formAcoes: { display: 'flex', gap: espaco.md, justifyContent: 'flex-end', alignItems: 'center' },

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
  acoes: { display: 'flex', gap: espaco.md },
};
