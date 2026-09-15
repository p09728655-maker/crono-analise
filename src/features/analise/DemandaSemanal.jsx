import ColarPlanilha from './demanda/ColarPlanilha.jsx';
import ProgramaGravado from './demanda/ProgramaGravado.jsx';
import SemanaManual from './demanda/SemanaManual.jsx';
import TempoDisponivel from './demanda/TempoDisponivel.jsx';
import { est } from './demanda/estilos.js';
import { useDemanda } from './demanda/useDemanda.js';
import { useTempoDisponivel } from './demanda/useTempoDisponivel.js';

/**
 * DEMANDA SEMANAL — o programa de producao que falta para o relatorio
 * responder "isso basta?".
 *
 * O relatorio de ritmo sabe dizer quanto o posto ENTREGA. Sem a demanda ele
 * nunca diz se isso atende — que e' a pergunta da reuniao de producao. A
 * demanda mora na planilha do PCP e entra aqui por COLAGEM: redigitar 36
 * semanas e' onde nasce o numero trocado que ninguem confere.
 *
 * A demanda e' do GRUPO (0002 FURADEIRA), nao da peca nem da maquina.
 * Takt e' tempo disponivel dividido pela demanda; numa furadeira que roda
 * doze pecas, nenhuma delas tem o turno inteiro so' para si — calculado
 * peca a peca, cada uma parece folgada e o posto estoura assim mesmo. E
 * quem recebe o volume do PCP e' o grupo, que distribui entre as maquinas
 * dele.
 *
 * Esta tela e' a moldura: escolhe o grupo e empilha os quadros. Cada
 * quadro cuida do proprio rascunho (o que foi colado, o que foi digitado)
 * e so' devolve o que vai para o servidor — as semanas gravadas e o tempo
 * disponivel sao os unicos estados que dois quadros dividem.
 */
export default function DemandaSemanal({ aoFechar, grupoInicial = null }) {
  const demanda = useDemanda(grupoInicial);
  const {
    cadastro, grupo, grupoId, escolherGrupo, maquinasDoGrupo, semanas, erro, ocupado,
  } = demanda;
  // O tempo disponivel e' de dois quadros: onde se digita e a tabela, que
  // calcula o exigido de cada semana com ele.
  const tempo = useTempoDisponivel(grupo, maquinasDoGrupo);

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
                onChange={(ev) => escolherGrupo(ev.target.value)}
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

            <TempoDisponivel
              tempo={tempo} grupo={grupo} maquinasDoGrupo={maquinasDoGrupo} ocupado={ocupado}
              aoSalvar={() => demanda.salvarTempo(tempo.valores)}
            />

            <SemanaManual
              semanas={semanas} ocupado={ocupado} aoIncluir={demanda.gravarSemanas}
            />

            <ColarPlanilha ocupado={ocupado} aoGravar={demanda.gravarSemanas} />

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
              <ProgramaGravado
                semanas={semanas} horasNum={tempo.horasNum} maquinasDoGrupo={maquinasDoGrupo}
                setupHoras={tempo.setupHoras} ocupado={ocupado}
                aoApagarSemana={demanda.apagarSemana} aoApagarTudo={demanda.apagarTudo}
              />
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
