import { useCallback, useEffect, useMemo, useState } from 'react';
import { tipo } from '../../theme/escala.js';
import MenuLateral from '../../components/MenuLateral.jsx';
import HistoricoVersoes from '../../components/HistoricoVersoes.jsx';
import { VERSAO } from '../../versao.js';
import { formatarDuracao, formatarSegundos } from '../../domain/cronoanalise.js';
import { analisarEstudo, lerEstudo } from '../../domain/analiseEstudo.js';
import {
  atualizarEstudo, criarOperacao, listarUsuarios, obterEstudo, removerOperacao,
} from '../../lib/api.js';
import { GraficoYamazumi } from './graficos.jsx';
import RelatorioImpressao from './RelatorioImpressao.jsx';
import ResumoExecutivo from './ResumoExecutivo.jsx';
import { est } from './estudo/estilos.js';
import AjustesDoEstudo from './estudo/AjustesDoEstudo.jsx';
import FormularioOperacao from './estudo/FormularioOperacao.jsx';
import Resposta from './estudo/Resposta.jsx';
import AnaliseIa from './estudo/AnaliseIa.jsx';
import { CapacidadeEsperadoReal } from './estudo/Capacidade.jsx';
import PainelOperadores from './estudo/PainelOperadores.jsx';
import PainelSugestoes from './estudo/PainelSugestoes.jsx';
import PainelParadas from './estudo/PainelParadas.jsx';
import TabelaOperacoes from './estudo/TabelaOperacoes.jsx';

/**
 * PAINEL DE ANALISE — desktop.
 *
 * Usuario: analista sentado, no escritorio, decidindo dimensionamento ou
 * levando o resultado para uma reuniao.
 *
 * Perguntas que a tela precisa responder, nesta ordem:
 *   1. O estudo tem base estatistica para decidir?
 *   2. Onde esta o gargalo?
 *   3. Quantos operadores a linha precisa — e como isso se compara com o
 *      time que existe hoje?
 *   4. Qual operacao esta instavel e por que?
 *   5. O que fazer com isso (sugestoes com acao, priorizadas).
 *
 * Este arquivo e' o ARRANJO: carga do estudo, a aba na URL, os dois
 * documentos de impressao e o que abre e fecha. As contas moram em
 * domain/analiseEstudo.js; cada quadro da tela mora em estudo/.
 */
export default function PainelAnalise({ estudoId, aoVoltar, aoColetar }) {
  const [dados, setDados] = useState(null);
  const [estado, setEstado] = useState('carregando');
  const [erro, setErro] = useState(null);
  const [adicionandoOp, setAdicionandoOp] = useState(false);
  /* Falha de uma ACAO (remover operacao) e' diferente de falha ao
     CARREGAR: a tela continua de pe' e cheia de dados, entao a recusa nao
     pode substituir o painel — ela flutua sobre a pagina, visivel de
     qualquer altura da rolagem, perto de quem clicou. */
  const [erroAcao, setErroAcao] = useState(null);

  /**
   * Dois documentos, um botao cada.
   *
   * A Folha de Analise e' o tecnico (quatro paginas, formulas, assinatura);
   * o Resumo Executivo e' o de reuniao (uma pagina: entrega, gargalo, o que
   * tratar primeiro). Qual deles vai ao papel e' escolha no momento de
   * imprimir — o outro nem e' renderizado, para nao sair junto.
   *
   * O print() nao acontece no clique: espera o efeito, depois do commit, ou
   * o navegador imprimiria o documento anterior.
   */
  const [documento, setDocumento] = useState('folha');
  const [imprimindo, setImprimindo] = useState(false);
  const [verVersoes, setVerVersoes] = useState(false);
  // Cadastro de analistas, para a edicao do estudo poder LIGAR um estudo
  // antigo — que e' como as tres grafias de uma pessoa so' se resolvem.
  const [analistas, setAnalistas] = useState([]);
  useEffect(() => {
    // Sem os tablets pareados (papel coletor): aparelho nao assina estudo.
    listarUsuarios()
      .then((l) => setAnalistas(l.filter((u) => u.ativo && u.papel !== 'coletor')))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!imprimindo) return;
    window.print();
    setImprimindo(false);
  }, [imprimindo]);

  const imprimir = useCallback((qual) => {
    setDocumento(qual);
    setImprimindo(true);
  }, []);
  // ?editar=1 abre a edicao direto: e' como a lista manda o analista
  // consertar um nome errado sem precisar descobrir onde fica o botao.
  const [editandoEstudo, setEditandoEstudo] = useState(
    () => new URLSearchParams(window.location.search).get('editar') === '1',
  );
  // Aba na URL: recarregar e compartilhar link preservam a vista.
  const [aba, setAba] = useState(() => {
    const q = new URLSearchParams(window.location.search).get('aba');
    return ['yamazumi', 'operacoes', 'operadores', 'paradas', 'sugestoes'].includes(q) ? q : 'yamazumi';
  });

  const trocarAba = useCallback((id) => {
    setAba(id);
    const url = new URL(window.location.href);
    url.searchParams.set('aba', id);
    // replaceState: aba e' vista do mesmo estudo, nao lugar por onde se passou.
    window.history.replaceState({}, '', url);
  }, []);

  const carregar = useCallback(async () => {
    setEstado('carregando');
    try {
      setDados(await obterEstudo(estudoId));
      setEstado('pronto');
    } catch (e) {
      setErro(e.message);
      setEstado('erro');
    }
  }, [estudoId]);

  useEffect(() => { carregar(); }, [carregar]);

  const analise = useMemo(() => analisarEstudo(dados), [dados]);
  const leitura = useMemo(() => lerEstudo(analise), [analise]);

  if (estado === 'carregando') return <Estado texto="Carregando estudo..." />;
  if (estado === 'erro') return <Estado texto={`Falha ao carregar: ${erro}`} acao={{ rotulo: 'Tentar de novo', aoClicar: carregar }} />;

  const { estudo } = dados;

  return (
    <div style={est.tela}>
      {/* Versao de impressao: escondida na tela, e' a unica coisa visivel no papel. */}
      {documento === 'resumo'
        ? <ResumoExecutivo estudo={estudo} analise={analise} leitura={leitura} />
        : <RelatorioImpressao estudo={estudo} analise={analise} leitura={leitura} />}

      <div className="somente-tela" style={est.telaComLateral}>
        {/* A MESMA navegacao da primeira tela: lateral fixa, com o estudo
            aberto no lugar onde a lista mostra os produtos. As secoes da
            analise eram abas horizontais no topo, logo abaixo de uma barra
            que ja' trazia voltar, titulo e tres botoes — duas faixas de
            navegacao empilhadas, nenhuma delas igual a tela anterior. */}
        <MenuLateral
          versao={VERSAO}
          aoVerVersao={() => setVerVersoes(true)}
          aoVoltar={aoVoltar}
          voltarRotulo="Estudos"
          contexto={{
            rotulo: 'Estudo aberto',
            titulo: estudo.nome,
            subtitulo: [estudo.recurso, estudo.produto, estudo.analista_nome || estudo.analista]
              .filter(Boolean).join(' · ') + ` · Tolerância ${analise.tolerancia}%`,
          }}
          acaoPrimaria={{ rotulo: 'Imprimir relatório', aoClicar: () => imprimir('folha') }}
          secoes={analise.operacoes.length ? [
            { id: 'yamazumi', rotulo: 'Yamazumi' },
            { id: 'operacoes', rotulo: 'Operações', contador: analise.operacoes.length },
            { id: 'operadores', rotulo: 'Operadores' },
            { id: 'paradas', rotulo: 'Paradas', contador: analise.paradas.n },
            { id: 'sugestoes', rotulo: 'Sugestões', contador: leitura.sugestoes.length },
          ] : []}
          secaoAtiva={aba}
          aoTrocarSecao={trocarAba}
          acoes={[
            { rotulo: 'Editar estudo', aoClicar: () => setEditandoEstudo(true) },
            { rotulo: 'Resumo executivo', aoClicar: () => imprimir('resumo') },
          ]}
        />

        <main style={est.conteudoLateral}>
          {/* Ressalva importante, mas e' ressalva — nao pode competir com o
              resultado. Uma linha, com o detalhe sob demanda. */}
          {analise.pendencias.length > 0 && (
            <details style={est.avisoAmostra}>
              <summary style={est.avisoResumo}>
                <span style={est.avisoIcone} aria-hidden="true">!</span>
                {analise.pendencias.length} operação(ões) ainda sem amostra suficiente —
                os números orientam, mas não fecham dimensionamento
              </summary>
              <ul style={est.listaPendencias}>
                {analise.pendencias.map(({ op, s: suf }) => (
                  <li key={op.id} style={est.itemPendencia}>
                    <strong>{op.nome}</strong> — {suf.motivo}
                    {aoColetar && (
                      <button type="button" style={est.linkColeta} onClick={() => aoColetar(estudo, op)}>
                        cronometrar
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </details>
          )}

          {!analise.operacoes.length ? (
            <div style={est.primeiroPasso}>
              <h2 style={est.primeiroPassoTitulo}>Este estudo ainda não tem operações</h2>
              <p style={est.primeiroPassoTexto}>
                Cadastre aqui as operações que serão cronometradas — é trabalho de
                escritório, não de chão de fábrica. Depois, no celular, o analista
                abre a operação no posto e coleta os ciclos.
              </p>
              <button type="button" style={est.botaoImprimir} onClick={() => setAdicionandoOp(true)}>
                + Cadastrar primeira operação
              </button>
            </div>
          ) : (
            <>
          <Resposta analise={analise} />

          <section style={est.contexto} aria-label="Números de apoio">
            {[
              ['Operações', analise.operacoes.length, ''],
              ['Ciclos coletados', analise.totalCiclos, ''],
              ['Σ TP por peça', formatarSegundos(analise.somaTp), ' s'],
              ['Takt Time', analise.taktMs ? formatarSegundos(analise.taktMs) : '—', analise.taktMs ? ' s' : ''],
              ['Tempo parado', analise.paradas.totalMs ? formatarDuracao(analise.paradas.totalMs) : '—', ''],
            ].map(([rot, valor, sufixo]) => (
              <div key={rot} style={est.contextoItem}>
                <span style={est.contextoRotulo}>{rot}</span>
                <span style={est.contextoValor}>{valor}{sufixo}</span>
              </div>
            ))}
          </section>

          {/* A resposta fica ACIMA da secao escolhida, nunca dentro dela.
              Se ela sumisse enquanto o analista olha o Yamazumi, ele perderia
              a conclusao justo ao examinar a evidencia dela. Cada secao ja'
              se apresenta com o proprio titulo — nao ha' cabecalho aqui. */}

          {aba === 'yamazumi' && (
            <>
              <GraficoYamazumi operacoes={analise.comDados} taktMs={analise.taktMs} />
              <CapacidadeEsperadoReal
                capacidade={leitura.capacidade}
                gargalo={analise.gargalo}
                aoDefinirTakt={() => setEditandoEstudo(true)}
              />
            </>
          )}

          {aba === 'operacoes' && (
            <TabelaOperacoes
              analise={analise}
              metaObs={estudo.meta_obs}
              estudo={estudo}
              aoAdicionar={() => setAdicionandoOp(true)}
              aoColetar={aoColetar}
              aoRemover={async (op) => {
                if (!window.confirm(`Remover a operação "${op.nome}" e todos os seus ciclos?`)) return;
                setErroAcao(null);
                try {
                  await removerOperacao(op.id);
                  await carregar();
                } catch (e) {
                  // Sem isto a recusa do servidor morria no console: a
                  // linha continuava na tabela e o analista concluia que o
                  // botao nao fazia nada.
                  setErroAcao(e.message);
                }
              }}
            />
          )}

          {aba === 'operadores' && (
            <PainelOperadores estudoId={estudoId} analise={analise} aoDefinirTakt={() => setEditandoEstudo(true)} />
          )}

          {aba === 'paradas' && (
            <PainelParadas
              resumo={analise.paradas}
              capacidadeLinha={analise.capacidadeLinha}
              gargalo={analise.gargalo}
              operacoes={analise.comDados}
            />
          )}

          {aba === 'sugestoes' && <PainelSugestoes sugestoes={leitura.sugestoes} />}

          <AnaliseIa estudo={estudo} analise={analise} />
            </>
          )}
        </main>

        {erroAcao && (
          <div style={est.avisoFlutuante} role="alert">
            <span style={{ flex: 1, minWidth: 0 }}>{erroAcao}</span>
            <button type="button" style={est.botaoSecundario} onClick={() => setErroAcao(null)}>
              Fechar
            </button>
          </div>
        )}

        {verVersoes && (
          <HistoricoVersoes modo="analise" aoFechar={() => setVerVersoes(false)} />
        )}

        {editandoEstudo && (
          <AjustesDoEstudo
            estudo={estudo}
            analistas={analistas}
            aoCancelar={() => setEditandoEstudo(false)}
            aoSalvar={async (dados) => {
              await atualizarEstudo(estudoId, dados);
              setEditandoEstudo(false);
              carregar();
            }}
          />
        )}

        {adicionandoOp && (
          <FormularioOperacao
            aoCancelar={() => setAdicionandoOp(false)}
            aoSalvar={async (dados) => {
              await criarOperacao({ ...dados, estudoId, ordem: analise.operacoes.length });
              setAdicionandoOp(false);
              carregar();
            }}
          />
        )}
      </div>
    </div>
  );
}


function Estado({ texto, acao }) {
  return (
    <div style={est.estadoVazio}>
      <p style={{ margin: 0, ...tipo('corpo') }}>{texto}</p>
      {acao && <button type="button" style={est.botaoImprimir} onClick={acao.aoClicar}>{acao.rotulo}</button>}
    </div>
  );
}

