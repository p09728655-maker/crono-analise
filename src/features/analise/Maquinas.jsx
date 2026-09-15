import { semearMaquinasDasConferencias } from '../../lib/api.js';
import ImpressaoCadastro from './maquinas/ImpressaoCadastro.jsx';
import ListaGrupos from './maquinas/ListaGrupos.jsx';
import ListaMaquinas from './maquinas/ListaMaquinas.jsx';
import { est, t } from './maquinas/estilos.js';
import { useCadastroMaquinas } from './maquinas/useCadastroMaquinas.js';
import { useSelecao } from './maquinas/useSelecao.js';

/**
 * CADASTRO DE MAQUINAS E GRUPOS — trabalho de PC.
 *
 * Maquina era texto livre no celular, e o mesmo posto saia escrito de tres
 * jeitos. Com o cadastro preenchido, o celular OFERECE as maquinas e
 * digitar vira excecao. Os GRUPOS levam o CODIGO da fabrica (padrao ERP):
 * 0001 SECCIONADORA, 0002 FURADEIRA... — o codigo identifica e ordena, o
 * nome aparece.
 *
 * Decisoes que a tela expoe de proposito:
 *  - Maquina com conferencia registrada nao se exclui, se DESATIVA. O
 *    servidor recusa a exclusao e explica.
 *  - Excluir um grupo NAO apaga maquina: ela so' fica sem grupo.
 *  - Renomear vale para as PROXIMAS medicoes; as antigas ficam com o nome
 *    gravado — a dica diz isso antes de a pessoa descobrir sozinha.
 *
 * Esta tela e' a moldura: carrega o cadastro, guarda o que esta' escolhido
 * e poe as duas colunas lado a lado. Cada coluna cuida dos proprios
 * formularios; o que as duas dividem — o cadastro, o grupo escolhido e
 * qual confirmacao esta' armada — mora aqui.
 */
export default function Maquinas({ aoFechar }) {
  const { maquinas, grupos, erro, ocupado, aplicar, recarregar } = useCadastroMaquinas();
  const selecao = useSelecao({ grupos, maquinas, ocupado, aoFechar });
  const { escolhido, setEscolhido, busca, setBusca } = selecao;

  const naoCarregou = maquinas == null && erro;
  const vazio = maquinas?.length === 0;
  const lista = maquinas || [];

  return (
    <div style={est.modal} role="dialog" aria-label="Cadastro de máquinas">
      {/* Estado de mouse por classe: estilo inline nao faz :hover. O grupo
          aberto fica de fora — ele ja' esta' marcado, e escurecer por cima
          confundiria "aqui" com "por cima". */}
      <style>{`
        /* Cinza, nao branco: branco e' a cor do grupo ABERTO, e o hover
           com a mesma cor punha dois itens com cara de escolhido. */
        .item-grupo:not([aria-current]):hover { background: #EDF0F3; color: ${t.texto}; }
      `}</style>
      <div style={est.caixa}>
        <header style={est.topo}>
          <div>
            <h2 style={est.titulo}>Máquinas</h2>
            <p style={est.texto}>
              A lista que o celular oferece na medição. Com ela preenchida, o nome sai
              igual em toda medição — e os <strong>grupos</strong> (código da fábrica:
              0002 FURADEIRA) organizam a escolha e a leitura dos relatórios.
            </p>
          </div>
          {maquinas?.length > 0 && (
            <button type="button" style={est.botaoSecundario} onClick={() => window.print()}>
              Imprimir
            </button>
          )}
        </header>

        {maquinas == null && !erro && <p style={est.texto}>Carregando cadastro...</p>}

        {vazio && !naoCarregou && (
          <div style={est.vazio}>
            <div style={est.vazioTitulo}>Nenhuma máquina cadastrada</div>
            <p style={est.vazioTexto}>
              Enquanto o cadastro estiver vazio, o celular segue com o campo de texto
              livre. Traga de uma vez as máquinas que as conferências já usaram — uma
              grafia por máquina — ou cadastre abaixo.
            </p>
            <div style={est.vazioAcoes}>
              <button
                type="button" style={est.botaoPrimario} disabled={ocupado}
                onClick={() => aplicar(semearMaquinasDasConferencias)}
              >
                {ocupado ? 'Trazendo...' : 'Trazer das conferências'}
              </button>
            </div>
          </div>
        )}

        {maquinas != null && (
          <div style={est.colunas}>
            <ListaGrupos
              grupos={grupos} lista={lista} escolhido={escolhido} aoEscolher={setEscolhido}
              ocupado={ocupado} aplicar={aplicar}
              excluindoGrupo={selecao.excluindoGrupo} setExcluindoGrupo={selecao.setExcluindoGrupo}
            />
            <ListaMaquinas
              lista={lista} grupos={grupos} escolhido={escolhido}
              busca={busca} setBusca={setBusca} ocupado={ocupado} aplicar={aplicar}
              excluindo={selecao.excluindo} setExcluindo={selecao.setExcluindo}
            />
          </div>
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

      {maquinas?.length > 0 && <ImpressaoCadastro grupos={grupos} maquinas={maquinas} />}
    </div>
  );
}
