import { useCallback, useEffect, useRef, useState } from 'react';
import { ALVO_MINIMO, cores as escuro } from '../../theme/tokens.js';
import { claro } from '../../theme/tokensAnalise.js';
import { elevacao, espaco, numeros, raio, rotulo, tipo, transicao } from '../../theme/escala.js';
import {
  atualizarEstudo, criarEstudo, excluirEstudoDeVez, listarArquivados, listarEstudos,
  listarUsuarios, quemSouEu, removerEstudo, restaurarEstudo,
} from '../../lib/api.js';
import { agruparPorProduto, produtosConhecidos, setoresConhecidos } from '../../domain/agrupamento.js';
import { proximasAcoes, situacao } from '../../domain/proximasAcoes.js';
import AvisoAtualizacao from '../../components/AvisoAtualizacao.jsx';
import ChaveIa from '../../components/ChaveIa.jsx';
import Cabecalho from '../../components/Cabecalho.jsx';
import HistoricoVersoes from '../../components/HistoricoVersoes.jsx';
import MenuLateral from '../../components/MenuLateral.jsx';
import RitmoDemanda, { CALC_PADRAO, taktMsDoCalculo } from '../../components/RitmoDemanda.jsx';
import ConfirmarSaida from '../../components/SairDoSistema.jsx';
import MotivosParada from '../analise/MotivosParada.jsx';
import Analistas from '../analise/Analistas.jsx';
import EstadoVazio from '../../components/EstadoVazio.jsx';
import ImportarRoteiro from './ImportarRoteiro.jsx';
import { VERSAO } from '../../versao.js';

/**
 * Lista de estudos — porta de entrada das duas experiencias.
 *
 *   coleta  (celular, no posto) — tema escuro, alvos grandes, cartoes.
 *   analise (PC, no escritorio) — tema claro igual ao do relatorio, tabela.
 */
export default function ListaEstudos({
  aoAbrir, aoEditar, aoMedir, modo = 'coleta', aoTrocarModo, aoConferirRapido, aoVerConferencias,
  aoSairDoSistema,
}) {
  const [estudos, setEstudos] = useState([]);
  const [estado, setEstado] = useState('carregando');
  const [erro, setErro] = useState(null);
  const [criando, setCriando] = useState(false);
  const [importando, setImportando] = useState(false);
  const [removendo, setRemovendo] = useState(null);
  const [filtro, setFiltro] = useState(null);
  const [verVersoes, setVerVersoes] = useState(false);
  const [arquivados, setArquivados] = useState([]);
  const [verArquivados, setVerArquivados] = useState(false);
  const [verChaveIa, setVerChaveIa] = useState(false);
  const [verMotivos, setVerMotivos] = useState(false);
  const [verAnalistas, setVerAnalistas] = useState(false);
  // Cadastro de analistas e quem esta neste PC. So' no modo Analise: no
  // tablet nao ha ninguem para identificar nem estudo para criar.
  const [analistas, setAnalistas] = useState([]);
  const [eu, setEu] = useState(null);
  const [busca, setBusca] = useState('');
  const [saindo, setSaindo] = useState(false);

  const analise = modo === 'analise';
  const t = tema(analise);
  const est = estilos(t, analise);

  useEffect(() => { carregar(); }, []);

  const carregarIdentificacao = useCallback(() => {
    if (!analise) return;
    // Falha em silencio: cadastro de analista nao pode impedir de ver estudo.
    // Tablet pareado (papel coletor) mora na mesma tabela mas nao e' gente:
    // nao pode aparecer como opcao de analista.
    listarUsuarios()
      .then((lista) => setAnalistas(lista.filter((u) => u.ativo && u.papel !== 'coletor')))
      .catch(() => {});
    quemSouEu().then(setEu).catch(() => {});
  }, [analise]);

  useEffect(() => { carregarIdentificacao(); }, [carregarIdentificacao]);

  async function carregar() {
    setEstado('carregando');
    try {
      // As duas listas na mesma ida: assim a contagem de arquivados existe
      // antes do clique, e o botao so' aparece quando ha' o que restaurar.
      const [r, a] = await Promise.all([listarEstudos(), listarArquivados()]);
      // O tablet so' lista o que esta EM COLETA. Estudo concluido e' assunto
      // de analise: aparecer no chao de fabrica so' convida toque errado —
      // e restaurar um arquivado no PC nao pode reabri-lo para coleta.
      const lista = r.estudos || [];
      setEstudos(analise ? lista : lista.filter((e) => e.status !== 'concluido'));
      setArquivados(a.estudos || []);
      setEstado('pronto');
    } catch (e) {
      setErro(e.message);
      setEstado('erro');
    }
  }

  async function criar(dados) {
    const r = await criarEstudo(dados);
    setCriando(false);
    await carregar();
    // No celular, criar e' o primeiro passo da coleta: segue para o estudo.
    // No PC, um estudo recem-criado nao tem o que analisar — cair no painel
    // cheio de avisos de amostra vazia so' estranha. Fica na lista, com o
    // estudo aparecendo no grupo do produto.
    if (!analise) aoAbrir?.(r.estudo.id);
  }

  const temEstudos = estado === 'pronto' && estudos.length > 0;

  // Busca antes do agrupamento: quem procura "sleep" quer o produto, mas
  // quem procura "FUR16" quer a maquina — os dois caem no mesmo campo.
  const termo = busca.trim().toLowerCase();
  const encontrados = termo
    ? estudos.filter((e) => [e.nome, e.produto, e.recurso, e.setor, e.analista_nome || e.analista]
        .some((campo) => String(campo || '').toLowerCase().includes(termo)))
    : estudos;

  // Um estudo pertence a um produto; a lista plana misturava tudo.
  const grupos = agruparPorProduto(encontrados);
  const visiveis = filtro ? grupos.filter((g) => g.chave === filtro) : grupos;

  const lateral = analise && (
    <MenuLateral
      versao={VERSAO}
      aoVerVersao={() => setVerVersoes(true)}
      busca={busca}
      aoBuscar={setBusca}
      grupos={grupos}
      filtro={filtro}
      aoFiltrar={setFiltro}
      arquivados={arquivados.length}
      aoNovoEstudo={() => setCriando(true)}
      aoImportar={() => setImportando(true)}
      aoVerConferencias={aoVerConferencias}
      aoVerArquivados={() => setVerArquivados(true)}
      aoVerChaveIa={() => setVerChaveIa(true)}
      aoVerMotivos={() => setVerMotivos(true)}
      aoVerAnalistas={() => setVerAnalistas(true)}
      usuario={eu}
      aoTrocarModo={aoTrocarModo}
    />
  );

  return (
    <div style={analise ? est.telaComLateral : est.tela}>
      {lateral}
      {!analise && (
      <Cabecalho
        modo={modo}
        titulo="RitmoPatrimar"
        subtitulo="Estudo de Tempos"
        versao={VERSAO}
        aoVerVersao={() => setVerVersoes(true)}
        aoTrocarModo={aoTrocarModo}
        /* Coleta so'. Importar, Conferencias e Chave da IA sao trabalho de
           escritorio e vivem no menu lateral do PC — no posto so' se
           cronometra. O botao principal so' aparece quando ja' ha' lista:
           no estado vazio ele vive no proprio bloco vazio, e dois botoes
           identicos na mesma tela e' duplicacao, nao reforco. */
        acoes={(
          <>
            {estado === 'pronto' && arquivados.length > 0 && (
              <button type="button" style={est.botaoSecundario} onClick={() => setVerArquivados(true)}>
                Arquivados {arquivados.length}
              </button>
            )}
            {estado === 'pronto' && temEstudos && (
              <button type="button" style={est.botaoPrimario} onClick={() => setCriando(true)}>
                + Novo estudo
              </button>
            )}
            {/* SAIR fica FORA do `estado === 'pronto'`: se a lista falhou em
                carregar — que e' justamente quando alguem desiste e quer
                fechar o app — o botao precisa existir do mesmo jeito. */}
            {aoSairDoSistema && (
              <button
                type="button"
                style={est.botaoSair}
                onClick={() => setSaindo(true)}
                aria-label="Sair do sistema"
              >
                <span aria-hidden="true" style={est.iconeSair}>⏻</span>
                Sair
              </button>
            )}
          </>
        )}
      />
      )}

      <main style={analise ? est.conteudoLateral : est.conteudo}>
        {/* Acima de tudo: o aviso explica por que a tela amanheceu diferente,
            entao precisa vir antes do que mudou. Some ao ser visto. */}
        <AvisoAtualizacao modo={modo} aoVerNovidades={() => setVerVersoes(true)} />

        {/* Atalho da conferencia rapida — SEMPRE visivel na coleta, mesmo com
            a lista carregando ou com erro: ela nao depende do servidor, e o
            analista que so' quer conferir um ritmo nao pode ficar refem da
            rede nem de cadastro. */}
        {!analise && aoConferirRapido && (
          /* O rotulo FURADEIRAS vive DENTRO do botao, nao num cabecalho
             acima dele: a secao inteira e' este unico atalho, e um titulo
             separado so' repetiria em duas linhas o que a primeira ja' diz. */
          <button type="button" style={est.atalhoRapida} onClick={aoConferirRapido}>
            <Simbolo tipo="cronometro" cor={t.vermelho} tamanho={28} />
            <div style={{ minWidth: 0, flex: 1, textAlign: 'left' }}>
              <span style={est.atalhoRotulo}>Furadeiras</span>
              <div style={est.atalhoTitulo}>Ritmo da furadeira</div>
              <div style={est.atalhoTexto}>
                Peças/hora do posto: horários, peças e as paradas (setup, falta de peça). Sem cadastro.
              </div>
            </div>
            <span style={est.atalhoSeta} aria-hidden="true">→</span>
          </button>
        )}

        {/* A segunda seção da coleta. No tablet as duas coisas moram na
            mesma tela e o analista precisa saber, sem perguntar, qual delas
            e' a dele: a furadeira se confere por vazao (peças/hora), a
            embalagem se estuda ciclo a ciclo. O rotulo diz o posto; o titulo
            diz o metodo. */}
        {!analise && (
          <SecaoColeta
            est={est}
            rotulo="Embalagem e demais postos"
            titulo="Estudos de tempo"
            texto="Ciclo a ciclo, com fator de ritmo e tolerância — é o que vira tempo padrão. Precisa de estudo cadastrado."
          />
        )}

        {estado === 'carregando' && (
          <EstadoVazio
            modo={modo}
            titulo="Carregando estudos"
            texto="Buscando os estudos cadastrados no servidor."
          />
        )}

        {estado === 'erro' && (
          <EstadoVazio
            modo={modo}
            marca={<Simbolo tipo="alerta" cor={t.critico} />}
            titulo="Não foi possível carregar"
            texto={erro}
            acao={(
              <button type="button" style={est.botaoPrimario} onClick={carregar}>
                Tentar de novo
              </button>
            )}
          />
        )}

        {estado === 'pronto' && !estudos.length && (analise ? (
          /* No PC ha' espaco para o vazio APRESENTAR o sistema: o cartao
             central chama para a acao e a faixa abaixo explica, em tres
             passos, o que acontece depois de criar o estudo. */
          /* A tela vazia responde, em ordem: onde estou, o que faco agora,
             e qual e' o caminho depois disso. A acao principal fica sozinha
             no cartao; os tres pilares vem DEPOIS e numerados, como
             sequencia do estudo — nao como tres botoes concorrentes. */
          <div style={est.vazioArea}>
            <div style={est.vazioCartao}>
              <Simbolo tipo="cronometro" cor={t.fraco} />
              <div style={est.vazioRotulo}>Estudo de Tempos</div>
              <h2 style={est.vazioTitulo}>Nenhum estudo cadastrado</h2>
              <p style={est.vazioTexto}>
                {arquivados.length > 0
                  ? `Crie um estudo novo — ou abra "Estudos arquivados" no menu ao lado para restaurar um dos ${arquivados.length} que saíram da lista. Nenhum ciclo foi perdido.`
                  : 'Crie um estudo novo para começar. Ele reúne as operações de um posto e os ciclos cronometrados nele.'}
              </p>
              <button type="button" style={est.botaoGrande} onClick={() => setCriando(true)}>
                + Novo estudo
              </button>
            </div>

            <div style={est.fluxoRotulo}>Depois de criar, o caminho é este</div>
            <div style={est.vazioFaixa}>
              {[
                { icone: 'cronometro', titulo: 'Coleta', texto: 'Cronometre os ciclos das operações.' },
                { icone: 'grafico', titulo: 'Análise', texto: 'Calcule o tempo padrão e a performance.' },
                { icone: 'pessoas', titulo: 'Capacidade', texto: 'Dimensione o posto e a produção.' },
              ].map((bloco, i) => (
                <div key={bloco.titulo} style={est.fluxoEtapa}>
                  {/* A seta ANTES da etapa, nao depois: assim a ultima nao
                      fica apontando para lugar nenhum. */}
                  {i > 0 && <span style={est.fluxoSeta} aria-hidden="true">→</span>}
                  <div style={est.vazioBloco}>
                    <span style={est.fluxoNumero}>{i + 1}</span>
                    <Simbolo tipo={bloco.icone} cor={t.vermelho} tamanho={26} />
                    <div>
                      <div style={est.vazioBlocoTitulo}>{bloco.titulo}</div>
                      <div style={est.vazioBlocoTexto}>{bloco.texto}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <EstadoVazio
            modo={modo}
            marca={<Simbolo tipo="cronometro" cor={t.fraco} />}
            titulo="Nenhum estudo ainda"
            texto="Um estudo reúne as operações de um posto e os ciclos cronometrados nele. Depois de coletar, ele vira tempo padrão, capacidade e dimensionamento."
            acao={(
              <button type="button" style={est.botaoPrimario} onClick={() => setCriando(true)}>
                + Criar primeiro estudo
              </button>
            )}
          />
        ))}

        {temEstudos && (
          /* No PC a tabela nao ocupa a largura toda: sobrava um vazio enorme
             a direita, e linha comprida demais cansa de ler. A largura fica
             limitada e o espaco que sobra vira painel de informacao. */
          <div style={analise ? est.areaComPainel : undefined}>
            <div style={analise ? est.colunaTabela : undefined}>
              {/* Filtro so' aparece quando ha' mais de um produto: com um so',
                  ele seria um controle que nao controla nada. No PC ele vive
                  no menu lateral, entao aqui e' so' na coleta. */}
              {!analise && grupos.length > 1 && (
                <FiltroProduto grupos={grupos} filtro={filtro} aoFiltrar={setFiltro} est={est} />
              )}

              {/* Todos os grupos dentro de UM container de rolagem, com uma
                  largura minima so'. Se cada tabela rolasse por conta propria,
                  rolar uma desalinharia as outras — que e' justamente o que
                  esta grade veio consertar. */}
              <div style={analise ? est.areaRolagem : undefined}>
              <div style={analise ? est.grade : undefined}>
              {visiveis.map((grupo) => (
                <section key={grupo.chave} style={est.grupo}>
                  <div style={est.grupoCabecalho}>
                    <h2 style={{ ...est.grupoTitulo, ...(grupo.semProduto ? est.grupoTituloVazio : {}) }}>
                      {grupo.rotulo}
                    </h2>
                    <span style={est.grupoResumo}>
                      {grupo.estudos.length} estudo(s) · {grupo.totalCiclos} ciclo(s)
                    </span>
                  </div>

                  {analise
                    ? <TabelaEstudos
                        estudos={grupo.estudos} est={est} aoAbrir={aoAbrir}
                        aoEditar={aoEditar} aoRemover={setRemovendo}
                        aoTrocarColeta={async (e) => {
                          await atualizarEstudo(e.id, { status: e.status === 'coletando' ? 'concluido' : 'coletando' });
                          await carregar();
                        }}
                      />
                    : <CartoesEstudos estudos={grupo.estudos} est={est} aoAbrir={aoAbrir} aoRemover={setRemovendo} />}
                </section>
              ))}
              </div>
              </div>

              {/* O espaco abaixo da tabela era vazio numa tela de 1440px. Ele
                  vira a resposta da pergunta que a tabela nao responde: qual
                  estudo esta' esperando alguem, e qual botao resolve isso.
                  Nada de novo e' buscado — sai dos mesmos estudos ja' na tela. */}
              {analise && (
                <ProximasAcoes
                  estudos={encontrados} est={est} t={t}
                  aoMedir={aoMedir} aoAnalisar={aoAbrir}
                />
              )}
            </div>

            {analise && <PainelResumo estudos={encontrados} est={est} />}
          </div>
        )}
      </main>

      {saindo && (
        <ConfirmarSaida
          aoCancelar={() => setSaindo(false)}
          aoConfirmar={() => { setSaindo(false); aoSairDoSistema(); }}
        />
      )}

      {verVersoes && (
        <HistoricoVersoes modo={modo} aoFechar={() => setVerVersoes(false)} />
      )}

      {verChaveIa && (
        <ChaveIa modo={modo} aoFechar={() => setVerChaveIa(false)} />
      )}

      {/* Cadastro dos motivos de parada — trabalho de PC, so' no menu lateral. */}
      {verMotivos && <MotivosParada aoFechar={() => setVerMotivos(false)} />}

      {verAnalistas && (
        <Analistas
          aoFechar={() => { setVerAnalistas(false); carregarIdentificacao(); }}
          aoTrocarUsuario={setEu}
        />
      )}

      {verArquivados && (
        <EstudosArquivados
          est={est}
          arquivados={arquivados}
          analise={analise}
          aoRestaurar={async (id) => {
            // Restaurado NO PC volta para a analise; no tablet, para a
            // coleta — cada um devolve o estudo para o proprio contexto.
            await restaurarEstudo(id, analise ? 'concluido' : 'coletando');
            await carregar();
          }}
          aoExcluirDeVez={analise
            ? async (id) => { await excluirEstudoDeVez(id); await carregar(); }
            : undefined}
          aoFechar={() => setVerArquivados(false)}
        />
      )}

      {importando && (
        <ImportarRoteiro
          t={t}
          analise={analise}
          produtosExistentes={produtosConhecidos(estudos)}
          setoresConhecidos={setoresConhecidos(estudos)}
          aoConcluir={async (id) => { setImportando(false); await carregar(); if (!analise) aoAbrir?.(id); }}
          aoCancelar={() => setImportando(false)}
        />
      )}

      {criando && (
        <FormularioEstudo
          est={est}
          t={t}
          analise={analise}
          produtos={produtosConhecidos(estudos)}
          setores={setoresConhecidos(estudos)}
          analistas={analistas}
          eu={eu}
          aoSalvar={criar}
          aoCancelar={() => setCriando(false)}
        />
      )}

      {removendo && (
        <ConfirmarRemocao
          est={est}
          estudo={removendo}
          soArquiva={!analise}
          aoConfirmar={async () => { await removerEstudo(removendo.id); setRemovendo(null); await carregar(); }}
          aoCancelar={() => setRemovendo(null)}
        />
      )}
    </div>
  );
}

/**
 * Cabecalho de secao da COLETA.
 *
 * No tablet as duas coletas convivem na mesma tela, e sao coisas
 * diferentes: a furadeira se confere por vazao (peças/hora num periodo), a
 * embalagem se estuda ciclo a ciclo (com FR e tolerancia, virando tempo
 * padrao). Sem isto o analista abria a errada — o atalho da conferencia
 * ficava colado na lista de estudos, como se fosse mais um item dela.
 *
 * O rotulo nomeia o POSTO e o titulo nomeia o METODO, porque no chao de
 * fabrica a pergunta vem sempre na primeira ordem: "vim medir a furadeira".
 */
function SecaoColeta({ est, rotulo: nome, titulo, texto }) {
  return (
    <div style={est.secaoColeta}>
      <span style={est.secaoRotulo}>{nome}</span>
      <h2 style={est.secaoTitulo}>{titulo}</h2>
      <p style={est.secaoTexto}>{texto}</p>
    </div>
  );
}

/**
 * Filtro por produto.
 *
 * Uma linha de opcoes, nao um menu: com poucos produtos, esconder a lista
 * atras de um clique custa mais que mostra-la. Acima de um limite ela vira
 * rolagem horizontal em vez de crescer para baixo e empurrar o conteudo.
 */
function FiltroProduto({ grupos, filtro, aoFiltrar, est }) {
  const total = grupos.reduce((acc, g) => acc + g.estudos.length, 0);

  return (
    <div style={est.filtro} role="group" aria-label="Filtrar por produto">
      <button
        type="button"
        onClick={() => aoFiltrar(null)}
        aria-pressed={filtro === null}
        style={{ ...est.filtroItem, ...(filtro === null ? est.filtroAtivo : {}) }}
      >
        {/* "Todos os produtos", nao "Todos": o rotulo precisa se distinguir
            de um produto que por acaso tenha esse nome — e tem, porque quem
            cadastra usa a palavra para dizer "vale para todos os modelos". */}
        Todos os produtos
        <span style={est.filtroContagem}>{total}</span>
      </button>

      {grupos.map((g) => (
        <button
          key={g.chave}
          type="button"
          onClick={() => aoFiltrar(g.chave === filtro ? null : g.chave)}
          aria-pressed={g.chave === filtro}
          style={{ ...est.filtroItem, ...(g.chave === filtro ? est.filtroAtivo : {}) }}
        >
          {g.rotulo}
          <span style={est.filtroContagem}>{g.estudos.length}</span>
        </button>
      ))}
    </div>
  );
}

/** Marca grafica sobria, linear, sem ilustracao decorativa. */
function Simbolo({ tipo: qual, cor, tamanho = 36 }) {
  const base = { width: tamanho, height: tamanho, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': true };
  if (qual === 'alerta') {
    return (
      <svg {...base}>
        <circle cx="12" cy="12" r="9.25" stroke={cor} strokeWidth="1.5" />
        <path d="M12 7.5v5.5" stroke={cor} strokeWidth="1.75" strokeLinecap="round" />
        <circle cx="12" cy="16.25" r="1" fill={cor} />
      </svg>
    );
  }
  if (qual === 'grafico') {
    return (
      <svg {...base}>
        <path d="M5 19.5v-6M12 19.5V6.5M19 19.5v-9" stroke={cor} strokeWidth="1.75" strokeLinecap="round" />
        <path d="M3.5 21.5h17" stroke={cor} strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }
  if (qual === 'pessoas') {
    return (
      <svg {...base}>
        <circle cx="9" cy="8.5" r="3.25" stroke={cor} strokeWidth="1.5" />
        <path d="M3.5 19.5c0-3 2.4-5 5.5-5s5.5 2 5.5 5" stroke={cor} strokeWidth="1.5" strokeLinecap="round" />
        <path d="M15.5 5.7a3.25 3.25 0 1 1 0 5.7M17 14.7c2.1.5 3.5 2.2 3.5 4.8" stroke={cor} strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg {...base}>
      <circle cx="12" cy="13.5" r="8" stroke={cor} strokeWidth="1.5" />
      <path d="M12 9.5v4l2.5 1.8" stroke={cor} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9.5 3h5" stroke={cor} strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function TabelaEstudos({ estudos, est, aoAbrir, aoEditar, aoRemover, aoTrocarColeta }) {
  const [sobre, setSobre] = useState(null);

  return (
    <div style={est.painel}>
      <table style={est.tabela}>
        {/* Cada produto e' uma tabela sua, e com largura automatica cada uma
            media as proprias colunas: "EMBALGEM" empurrava Recurso num grupo
            e "FUR16" encolhia no outro, e as colunas de dois grupos vizinhos
            nao se alinhavam. Com colgroup + table-layout fixo, a grade e' a
            mesma em toda a lista — o olho desce a coluna sem tropecar. */}
        <colgroup>
          {/* O nome do estudo fica com o que sobra: e' o unico texto que
              cresce de verdade, e as demais colunas tem tamanho conhecido. */}
          <col />
          <col style={{ width: 140 }} />
          <col style={{ width: 112 }} />
          <col style={{ width: 100 }} />
          <col style={{ width: 84 }} />
          <col style={{ width: 112 }} />
          {/* Acoes: eram quatro botoes em 320px. "Analisar" mudou-se para o
              proprio nome do estudo, na primeira coluna, e os tres que
              sobraram cabem com folga em 240 — a largura que sobra vai para
              o nome, que e' o texto que de fato cresce. */}
          <col style={{ width: 240 }} />
        </colgroup>
        <thead>
          <tr>
            <th style={est.th}>Estudo</th>
            <th style={est.th}>Recurso</th>
            <th style={est.th}>Analista</th>
            <th style={est.thNum}>Operações</th>
            <th style={est.thNum}>Ciclos</th>
            <th style={est.th}>Atualizado</th>
            <th style={est.th} aria-label="Ações" />
          </tr>
        </thead>
        <tbody>
          {estudos.map((e) => (
            <tr
              key={e.id}
              style={{ ...est.linha, ...(sobre === e.id ? est.linhaSobre : {}) }}
              onMouseEnter={() => setSobre(e.id)}
              onMouseLeave={() => setSobre(null)}
            >
              {/* O NOME e' o caminho para a analise — nao um botao a mais na
                  ponta da linha. O botao "Analisar" saiu daqui quando a area
                  de Proximas acoes passou a oferecer o mesmo destino logo
                  abaixo: eram dois alvos identicos para o mesmo estudo. Mas
                  a area so' mostra os primeiros; sem isto, todo estudo fora
                  dela ficaria sem porta de entrada.

                  title: com largura fixa o nome longo corta com reticencias,
                  e o texto inteiro tem de continuar alcancavel. */}
              <td style={est.tdNome}>
                <button
                  type="button"
                  style={{ ...est.linkNome, ...(sobre === e.id ? est.linkNomeSobre : {}) }}
                  onClick={() => aoAbrir?.(e.id)}
                  title={`Analisar ${e.nome}`}
                >
                  {e.nome}
                </button>
              </td>
              <td style={est.td} title={e.recurso || ''}>{e.recurso || '—'}</td>
              <td style={est.td} title={e.analista_nome || e.analista || ''}>{e.analista_nome || e.analista || '—'}</td>
              <td style={est.tdNum}>{e.total_operacoes}</td>
              <td style={est.tdNum}>{e.total_observacoes}</td>
              <td style={est.tdFraco}>{formatarData(e.atualizado_em)}</td>
              <td style={est.tdAcoes}>
                <span style={est.acoesLinha}>
                {/* Editar leva ao mesmo painel com a edicao ja aberta: nome
                    digitado errado tinha de ser descoberto la dentro. */}
                <button type="button" style={est.botaoLinha} onClick={() => aoEditar?.(e.id)}>
                  Editar
                </button>
                {/* Quem decide o que o TABLET ve e' o PC. Concluido some da
                    coleta; este botao e' o unico caminho de ida e volta. */}
                <button
                  type="button"
                  style={est.botaoLinha}
                  onClick={() => aoTrocarColeta?.(e)}
                  title={e.status === 'coletando'
                    ? 'O estudo some da lista do tablet e fica só na análise'
                    : 'O estudo volta à lista do tablet para coletar mais tempos'}
                >
                  {/* Texto curto de proposito: com "Enviar ao tablet" os quatro
                      botoes nao cabiam na linha e quebravam em duas, deixando
                      cada linha da tabela com altura diferente. O title diz o
                      resto, e o rotulo diz ONDE o estudo passa a viver. */}
                  {e.status === 'coletando' ? 'Só no PC' : 'Ao tablet'}
                </button>
                <button
                  type="button"
                  style={est.botaoRemover}
                  onClick={() => aoRemover?.(e)}
                  title={Number(e.total_observacoes) > 0 ? 'Arquivar estudo' : 'Excluir estudo'}
                  aria-label={`Remover ${e.nome}`}
                >
                  ×
                </button>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CartoesEstudos({ estudos, est, aoAbrir, aoRemover }) {
  return (
    <ul style={est.lista}>
      {estudos.map((e) => (
        <li key={e.id} style={est.itemLista}>
          <button type="button" style={est.cartao} onClick={() => aoAbrir?.(e.id)}>
            <div style={{ minWidth: 0, flex: 1, textAlign: 'left' }}>
              <div style={est.cartaoTitulo}>{e.nome}</div>
              <div style={est.cartaoSub}>
                {/* Sem o produto: ele ja' nomeia o grupo logo acima. */}
                {[e.recurso, e.analista_nome || e.analista].filter(Boolean).join(' · ') || 'Sem detalhes'}
              </div>
            </div>
            <div style={est.cartaoNumeros}>
              <span style={est.cartaoNumero}>{e.total_observacoes}</span>
              <span style={est.cartaoRotulo}>ciclos</span>
            </div>
          </button>
          {/* Fora do cartao: encostado no alvo principal, o dedo removeria por engano.
              "Arquivar", nao "Excluir": no tablet este botao nunca apaga. */}
          <button
            type="button"
            style={est.botaoRemoverCartao}
            onClick={() => aoRemover?.(e)}
            aria-label={`Arquivar ${e.nome}`}
          >
            ×
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * Estudos arquivados — a volta do caminho que so' tinha ida.
 *
 * Arquivar preserva o dado (ciclo cronometrado nao se refaz), mas o estudo
 * sumia da lista sem nenhum lugar onde reve-lo: quem arquivou por engano
 * ficava sem saida dentro do app. Aqui ele reaparece com a contagem de
 * ciclos intacta e volta para a lista num clique.
 */
function EstudosArquivados({ est, arquivados, analise, aoRestaurar, aoExcluirDeVez, aoFechar }) {
  const [restaurando, setRestaurando] = useState(null);
  const [confirmando, setConfirmando] = useState(null);
  const [excluindo, setExcluindo] = useState(null);
  const [erro, setErro] = useState(null);

  async function restaurar(id) {
    setRestaurando(id);
    setErro(null);
    try { await aoRestaurar(id); }
    catch (e) { setErro(e.message); setRestaurando(null); }
  }

  async function excluirDeVez(id) {
    setExcluindo(id);
    setErro(null);
    try { await aoExcluirDeVez(id); setConfirmando(null); }
    catch (e) { setErro(e.message); }
    setExcluindo(null);
  }

  return (
    <div style={est.modal} role="dialog" aria-label="Estudos arquivados">
      <div style={est.formulario}>
        <h2 style={est.formTitulo}>Estudos arquivados</h2>
        <p style={est.textoModal}>
          Arquivar tira o estudo da lista, mas <strong>não apaga nada</strong> —
          os ciclos continuam no banco.
          {analise
            ? ' Restaurar devolve o estudo à análise, sem reabri-lo na coleta do tablet. Excluir de vez é para estudo de teste: apaga tudo, sem volta.'
            : ' Restaurar traz o estudo de volta para a coleta.'}
        </p>

        <ul style={est.listaArquivados}>
          {arquivados.map((e) => (
            <li key={e.id} style={est.itemArquivado}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={est.arquivadoNome}>{e.nome}</div>
                <div style={est.arquivadoSub}>
                  {[e.recurso, e.analista_nome || e.analista].filter(Boolean).join(' · ') || 'Sem detalhes'}
                  {' · '}{e.total_observacoes} ciclo(s)
                </div>
              </div>
              {confirmando === e.id ? (
                <span style={est.confirmarExclusao}>
                  {/* O numero na pergunta e' o custo real do clique. */}
                  <span style={est.confirmarTexto}>
                    Apagar {e.total_observacoes} ciclo(s) para sempre?
                  </span>
                  <button
                    type="button" style={est.botaoExcluirDeVez} disabled={excluindo === e.id}
                    onClick={() => excluirDeVez(e.id)}
                  >
                    {excluindo === e.id ? 'Apagando...' : 'Apagar tudo'}
                  </button>
                  <button type="button" style={est.botaoLinha} onClick={() => setConfirmando(null)}>
                    Cancelar
                  </button>
                </span>
              ) : (
                <span style={est.confirmarExclusao}>
                  <button
                    type="button"
                    style={est.botaoLinha}
                    onClick={() => restaurar(e.id)}
                    disabled={restaurando === e.id}
                  >
                    {restaurando === e.id ? 'Restaurando...' : 'Restaurar'}
                  </button>
                  {aoExcluirDeVez && (
                    <button
                      type="button" style={est.botaoLinha}
                      onClick={() => setConfirmando(e.id)}
                      aria-label={`Excluir de vez ${e.nome}`}
                    >
                      Excluir de vez
                    </button>
                  )}
                </span>
              )}
            </li>
          ))}
        </ul>

        {erro && <div style={est.erroForm}>{erro}</div>}

        <div style={est.acoesModal}>
          <button type="button" style={{ ...est.botaoSecundario, flex: 1 }} onClick={aoFechar}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Proximas acoes — o que fazer agora, logo abaixo da tabela.
 *
 * A tabela responde "o que existe". Ela nao responde "o que esta' esperando
 * por mim", e essa era a pergunta que o analista trazia de manha': percorrer
 * linha a linha comparando ciclos com status e' trabalho que a tela pode
 * fazer sozinha.
 *
 * A regra de quem entra e em que ordem mora em src/domain/proximasAcoes.js —
 * aqui so' se desenha. A area some inteira quando nao ha nada a fazer: uma
 * secao vazia com titulo e' pior que secao nenhuma.
 */
function ProximasAcoes({ estudos, est, t, aoMedir, aoAnalisar }) {
  const { itens, restantes, pendentes, emAndamento } = proximasAcoes(estudos);
  if (!itens.length) return null;

  // Resumo da direita: so' o que exige acao. Se nada exige, a linha some em
  // vez de anunciar "0 pendencias" — a ausencia ja' e' a boa noticia.
  const resumo = [
    pendentes > 0 && `${pendentes} aguardando medição`,
    emAndamento > 0 && `${emAndamento} em andamento`,
  ].filter(Boolean).join(' · ');

  return (
    <section style={est.acoesSecao} aria-label="Próximas ações">
      <div style={est.acoesCabecalho}>
        <span style={est.acoesRotulo}>Próximas ações</span>
        {resumo && <span style={est.acoesResumo}>{resumo}</span>}
      </div>

      <div style={est.acoesLista}>
        {itens.map((item, i) => {
          const cor = t[item.tom];
          const executar = item.acao === 'medir' ? aoMedir : aoAnalisar;
          // Numeros do estudo em UMA linha fraca: contexto e tamanho sao a
          // mesma pergunta ("que estudo e' esse?"), e separa-los em duas
          // linhas dobrava a altura do cartao sem acrescentar nada.
          const detalhe = [
            item.contexto,
            plural(item.operacoes, 'operação', 'operações'),
            plural(item.ciclos, 'ciclo', 'ciclos'),
            item.faltam > 0 && `faltam ${item.faltam} para a meta`,
          ].filter(Boolean).join(' · ');

          return (
            <div key={item.id} style={{ ...est.acaoCartao, borderLeftColor: cor }}>
              <div style={est.acaoTexto}>
                <span style={{ ...est.acaoEstado, color: cor }}>
                  <span style={{ ...est.acaoPonto, background: cor }} aria-hidden="true" />
                  {item.rotulo}
                </span>
                <div style={est.acaoNome} title={item.nome}>{item.nome}</div>
                <div style={est.acaoDetalhe}>{detalhe}</div>
              </div>

              {/* Um unico botao vermelho na area: o primeiro da fila, que e'
                  o mais urgente. Os demais ficam contornados — quatro
                  chamadas com o mesmo peso nao chamam para nada. */}
              {executar && (
                <button
                  type="button"
                  style={i === 0 ? est.acaoBotaoPrimario : est.acaoBotao}
                  onClick={() => executar(item.id)}
                >
                  {item.acaoRotulo}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {restantes > 0 && (
        <div style={est.acoesNota}>
          e mais {plural(restantes, 'estudo', 'estudos')} esperando medição — a lista completa está na tabela acima.
        </div>
      )}
    </section>
  );
}

/**
 * Painel de informacao ao lado da tabela.
 *
 * O espaco a direita estava vazio numa tela de 1440px. Em vez de esticar a
 * tabela — linha comprida demais e' pior de ler — ele responde o que o
 * analista pergunta antes de abrir estudo nenhum: quanto ja' foi medido e
 * em quais postos.
 *
 * O painel CONTA as pendencias; quem as NOMEIA e' a area de Proximas acoes,
 * abaixo da tabela, onde cada uma vem com o botao que a resolve. Enquanto os
 * dois listavam os mesmos estudos, a tela dizia duas vezes a mesma coisa —
 * e com cortes diferentes ("5 e mais 4" de um lado, "4 e mais 5" do outro).
 *
 * Tudo sai dos estudos ja' carregados: nenhuma requisicao a mais.
 */
function PainelResumo({ estudos, est }) {
  const totalCiclos = estudos.reduce((acc, e) => acc + (Number(e.total_observacoes) || 0), 0);
  const totalOperacoes = estudos.reduce((acc, e) => acc + (Number(e.total_operacoes) || 0), 0);
  // Mesma regra das Proximas acoes, num lugar so': o que manda e' o CICLO.
  // Estudo sem nenhum e' pendencia mesmo marcado 'concluido' — esse status
  // diz que ele saiu do tablet, nao que a medicao aconteceu.
  const pendencias = estudos.filter((e) => situacao(e) === 'pendente').length;

  // Postos ordenados por ciclos: onde a medicao realmente aconteceu.
  const porPosto = new Map();
  for (const e of estudos) {
    const chave = String(e.recurso || '').trim() || 'Sem posto';
    porPosto.set(chave, (porPosto.get(chave) || 0) + (Number(e.total_observacoes) || 0));
  }
  const postos = [...porPosto.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);

  const maior = estudos.reduce(
    (melhor, e) => (Number(e.total_observacoes) > Number(melhor?.total_observacoes ?? -1) ? e : melhor),
    null,
  );

  return (
    <aside style={est.painelInfo} aria-label="Visão geral">
      <div style={est.painelBloco}>
        <div style={est.painelRotulo}>Visão geral</div>
        {/* Quatro numeros em 2x2, nao tres numa fila: o quarto e' o unico que
            pede acao, e espremer quatro colunas em 280px deixaria cada valor
            menor que o rotulo embaixo dele. A pendencia so' ganha cor quando
            existe — "0" colorido treinaria o olho a ignorar a cor. */}
        <div style={est.painelNumeros}>
          {[
            ['Estudos', estudos.length, false],
            ['Ciclos', totalCiclos, false],
            ['Operações', totalOperacoes, false],
            ['Pendências', pendencias, pendencias > 0],
          ].map(([k, v, alerta]) => (
            <div key={k} style={est.painelNumero}>
              <span style={alerta ? est.painelValorAtencao : est.painelValor}>{v}</span>
              <span style={est.painelChave}>{k}</span>
            </div>
          ))}
        </div>
      </div>

      {postos.length > 0 && (
        <div style={est.painelBloco}>
          <div style={est.painelRotulo}>Ciclos por posto</div>
          {postos.map(([posto, n]) => (
            <div key={posto} style={est.painelLinha}>
              <span style={est.painelLinhaTexto}>{posto}</span>
              <span style={est.painelLinhaNum}>{n}</span>
            </div>
          ))}
        </div>
      )}

      {maior && Number(maior.total_observacoes) > 0 && (
        <div style={est.painelBloco}>
          <div style={est.painelRotulo}>Mais medido</div>
          <div style={est.painelDestaque}>{maior.nome}</div>
          <div style={est.painelNota}>
            {maior.total_observacoes} ciclo(s){maior.recurso ? ` · ${maior.recurso}` : ''}
          </div>
        </div>
      )}

    </aside>
  );
}

/**
 * Remover estudo — e o que "remover" quer dizer em cada aparelho.
 *
 * No PC: estudo com ciclos arquiva, estudo sem ciclo e' apagado. Rascunho
 * e teste nao merecem virar lixo eterno na lista de arquivados.
 *
 * No TABLET (soArquiva): arquiva sempre, nunca apaga. "Sem ciclo" nao quer
 * dizer "sem trabalho" — o analista monta operacoes, fator de ritmo, meta e
 * roteiro do ERP no PC e manda para o posto ANTES da primeira
 * cronometragem. Um toque no chao de fabrica apagava esse preparo inteiro,
 * e a tela ainda prometia isso por escrito: "apagado definitivamente".
 * A API e a RLS repetem a regra; aqui a tela para de oferecer o que o
 * aparelho nao pode mais fazer.
 */
function ConfirmarRemocao({ est, estudo, soArquiva, aoConfirmar, aoCancelar }) {
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState(null);
  const ciclos = Number(estudo.total_observacoes) || 0;
  const temDados = ciclos > 0;
  const arquiva = temDados || soArquiva;

  async function executar() {
    setProcessando(true);
    setErro(null);
    try { await aoConfirmar(); }
    catch (e) { setErro(e.message); setProcessando(false); }
  }

  return (
    <div style={est.modal} role="dialog" aria-label="Confirmar remoção">
      <div style={est.formulario}>
        <h2 style={est.formTitulo}>{arquiva ? 'Arquivar estudo?' : 'Excluir estudo?'}</h2>
        <p style={est.textoModal}><strong>{estudo.nome}</strong></p>
        <p style={est.textoModal}>
          {temDados ? (
            <>
              Este estudo tem <strong>{ciclos} ciclo(s) cronometrado(s)</strong>. Ele sai da
              lista mas <strong>não é apagado</strong> — os dados continuam no banco.
              Tempo de cronometragem não se refaz.
            </>
          ) : soArquiva ? (
            <>
              Ainda não há ciclo coletado, mas o estudo já vem montado do PC —
              operações, fator de ritmo e meta. Ele sai desta lista
              e <strong>não é apagado</strong>: fica em Arquivados, aqui e no PC.
            </>
          ) : (
            <>Nenhum ciclo foi coletado, então não há nada a preservar. O estudo
            será <strong>apagado definitivamente</strong>.</>
          )}
        </p>
        {erro && <div style={est.erroForm}>{erro}</div>}
        <div style={est.acoesModal}>
          <button type="button" style={est.botaoSecundario} onClick={aoCancelar} disabled={processando}>
            Cancelar
          </button>
          <button type="button" style={{ ...est.botaoPerigo, flex: 1 }} onClick={executar} disabled={processando}>
            {processando ? 'Removendo...' : (arquiva ? 'Arquivar' : 'Excluir')}
          </button>
        </div>
      </div>
    </div>
  );
}

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
function FormularioEstudo({
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
                <Campo est={est} label="Recurso / Posto" dica="Ex: Furadeira 03">
                  <input style={est.input} {...campo('recurso')} />
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

/**
 * Plural por extenso — "1 ciclo", "8 ciclos".
 *
 * A tabela usa "ciclo(s)" porque a coluna e' estreita e o rotulo se repete
 * em toda linha. Nos cartoes de acao a linha e' de leitura corrida, e ali
 * "8 operação(ões)" trava o olho no meio da frase.
 */
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

const formatarData = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR');
};

/* -------------------------------------------------------------------- tema */

function tema(analise) {
  // ok/atencao/critico sao os tons de ESTADO — nunca o vermelho, que aqui e'
  // identidade da marca (ver src/theme/tokens.js).
  return analise
    ? { fundo: claro.fundo, superficie: claro.papel, borda: claro.borda, realce: '#F8F9FB',
        texto: claro.texto, medio: claro.textoMedio, fraco: claro.textoFraco,
        vermelho: claro.vermelho, critico: claro.critico, criticoFundo: claro.criticoFundo,
        atencao: claro.atencao, ok: claro.ok,
        sombra: elevacao.baixa }
    : { fundo: escuro.fundo, superficie: escuro.superficie, borda: escuro.borda, realce: escuro.superficieAlta,
        texto: escuro.texto, medio: escuro.textoFraco, fraco: escuro.textoFraco,
        vermelho: escuro.vermelho, critico: escuro.critico, criticoFundo: escuro.criticoFundo,
        atencao: escuro.atencao, ok: escuro.ok,
        sombra: elevacao.escuraMedia };
}

function estilos(t, analise) {
  const alvo = analise ? 40 : ALVO_MINIMO;

  return {
    tela: { minHeight: '100dvh', background: t.fundo, color: t.texto },
    // Lateral fixa + conteudo rolando: a navegacao nao sai da tela quando o
    // analista desce numa lista longa.
    telaComLateral: {
      minHeight: '100dvh', background: t.fundo, color: t.texto,
      display: 'flex', alignItems: 'flex-start',
    },
    conteudoLateral: {
      // Precisa comportar tabela (1180) + respiro + painel (280) + padding:
      // com 1400 sobrava faixa vazia a direita e a tabela nem chegava ao teto.
      flex: 1, minWidth: 0, maxWidth: 1560,
      padding: `${espaco.xl}px ${espaco.xl}px ${espaco.gigante}px`,
    },
    conteudo: {
      maxWidth: 1400, margin: '0 auto',
      padding: analise ? `${espaco.xl}px ${espaco.xl}px ${espaco.gigante}px` : espaco.lg,
      // So' no aparelho: no iPhone (viewport-fit=cover) o conteudo passa por
      // baixo da barra de status e o topo da lista sumia sob o relogio.
      ...(analise ? {} : { paddingTop: `calc(${espaco.lg}px + env(safe-area-inset-top, 0px))` }),
    },

    botaoPrimario: {
      minHeight: analise ? 40 : ALVO_MINIMO, padding: `0 ${espaco.lg}px`,
      background: t.vermelho, border: 'none', borderRadius: raio.md, color: '#fff',
      ...tipo('corpoF'), cursor: 'pointer', fontFamily: 'inherit',
      boxShadow: analise ? elevacao.baixa : 'none',
      transition: `filter ${transicao.rapida}`,
    },
    botaoSecundario: {
      minHeight: alvo, padding: `0 ${espaco.lg}px`, background: 'transparent',
      borderWidth: 1, borderStyle: 'solid', borderColor: t.borda, borderRadius: raio.md,
      color: t.medio, ...tipo('corpo'), cursor: 'pointer', fontFamily: 'inherit',
    },
    botaoPerigo: {
      minHeight: alvo, padding: `0 ${espaco.lg}px`, background: t.critico,
      border: 'none', borderRadius: raio.md, color: '#fff',
      ...tipo('corpoF'), cursor: 'pointer', fontFamily: 'inherit',
    },
    /* Sair do sistema — so' aparece no tablet. Contornado, nao preenchido:
       encerrar o turno nao pode competir com "+ Novo estudo", que e' o que
       a tela existe para oferecer. */
    botaoSair: {
      minHeight: alvo, padding: `0 ${espaco.lg}px`,
      display: 'inline-flex', alignItems: 'center', gap: espaco.sm,
      background: 'transparent',
      borderWidth: 1, borderStyle: 'solid', borderColor: t.borda, borderRadius: raio.md,
      color: t.texto, ...tipo('corpoF'), cursor: 'pointer', fontFamily: 'inherit',
    },
    iconeSair: { fontSize: 18, lineHeight: 1 },

    /* ---- atalho da conferencia rapida (so' coleta) ---- */
    atalhoRapida: {
      width: '100%', minHeight: ALVO_MINIMO,
      display: 'flex', alignItems: 'center', gap: espaco.md,
      padding: espaco.lg, marginBottom: espaco.xl,
      background: t.superficie,
      // Borda na cor da marca para destacar do resto da lista sem gritar:
      // e' a unica acao da tela que funciona sem rede e sem cadastro.
      borderWidth: 1, borderStyle: 'solid', borderColor: t.vermelho,
      borderRadius: raio.md,
      color: t.texto, cursor: 'pointer', fontFamily: 'inherit',
    },
    secaoColeta: {
      display: 'flex', flexDirection: 'column', gap: 2,
      margin: `${espaco.xl}px 0 ${espaco.md}px`,
      paddingLeft: espaco.md,
      // Barra na cor da marca a esquerda: separa as duas secoes sem gastar
      // uma linha inteira de divisor em tela de tablet.
      borderLeftWidth: 3, borderLeftStyle: 'solid', borderLeftColor: t.vermelho,
    },
    secaoRotulo: { ...rotulo(t.vermelho) },
    atalhoRotulo: { ...rotulo(t.vermelho), display: 'block', marginBottom: 2 },
    secaoTitulo: { ...tipo('destaque'), margin: 0 },
    secaoTexto: { ...tipo('legenda'), color: t.fraco, margin: 0, lineHeight: 1.45 },

    atalhoTitulo: { ...tipo('corpoF'), overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
    atalhoTexto: { ...tipo('legenda'), color: t.fraco, marginTop: 2 },
    atalhoSeta: { fontSize: 20, color: t.vermelho, flexShrink: 0 },

    /* ---- tabela + painel de informacao (PC) ---- */
    areaComPainel: { display: 'flex', alignItems: 'flex-start', gap: espaco.xl },
    // A tabela para de crescer: linha larga demais obriga o olho a viajar
    // do nome ate' o numero e perde a linha no caminho. O teto subiu de 1040
    // para 1180 quando a coluna de acoes ganhou o quarto botao — o bastante
    // para ele caber, sem transformar a linha numa travessia.
    colunaTabela: { flex: 1, minWidth: 0, maxWidth: 1180 },
    painelInfo: {
      width: 280, flexShrink: 0, position: 'sticky', top: espaco.xl,
      display: 'flex', flexDirection: 'column', gap: espaco.md,
    },
    painelBloco: {
      background: t.superficie, borderRadius: raio.lg,
      borderWidth: 1, borderStyle: 'solid', borderColor: t.borda,
      padding: espaco.lg, display: 'flex', flexDirection: 'column', gap: espaco.sm,
      boxShadow: t.sombra,
    },
    painelRotulo: rotulo(t.fraco),
    painelNumeros: {
      display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)',
      gap: `${espaco.md}px ${espaco.sm}px`,
    },
    painelNumero: { display: 'flex', flexDirection: 'column', minWidth: 0 },
    painelValor: { ...tipo('destaque'), ...numeros, color: t.texto },
    painelValorAtencao: { ...tipo('destaque'), ...numeros, color: t.critico },
    painelChave: { ...tipo('legenda'), color: t.fraco },
    painelLinha: {
      display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
      gap: espaco.sm, ...tipo('legenda'), color: t.medio,
    },
    painelLinhaTexto: { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
    painelLinhaNum: { flexShrink: 0, ...numeros, fontWeight: 700, color: t.texto },
    painelDestaque: { ...tipo('corpoF'), color: t.texto },
    painelNota: { ...tipo('legenda'), color: t.fraco },

    /* ---- proximas acoes (abaixo da tabela, so' no PC) ---- */
    // Filete no topo: a area e' outra coisa que a tabela, e sem a linha ela
    // parecia um rodape solto da ultima linha do ultimo grupo.
    acoesSecao: {
      marginTop: espaco.sm, paddingTop: espaco.xl,
      borderTopWidth: 1, borderTopStyle: 'solid', borderTopColor: t.borda,
      display: 'flex', flexDirection: 'column', gap: espaco.md,
    },
    acoesCabecalho: {
      display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
      gap: espaco.md, flexWrap: 'wrap',
    },
    acoesRotulo: rotulo(t.fraco),
    acoesResumo: { ...tipo('legenda'), color: t.fraco },
    acoesLista: { display: 'flex', flexDirection: 'column', gap: espaco.sm },
    // Barra de estado a esquerda, o resto neutro: quatro cartoes contornados
    // de laranja transformariam a area num alarme continuo. A cor entra so'
    // onde ela informa — filete, ponto e rotulo do estado.
    acaoCartao: {
      display: 'flex', alignItems: 'center', flexWrap: 'wrap',
      gap: `${espaco.md}px ${espaco.lg}px`,
      padding: `${espaco.md}px ${espaco.lg}px`,
      background: t.superficie, borderRadius: raio.md,
      borderWidth: 1, borderStyle: 'solid', borderColor: t.borda,
      borderLeftWidth: 3,
      boxShadow: t.sombra,
    },
    // 320 nao e' o tamanho do texto: e' o ponto de quebra. Com base menor,
    // o cartao de botao curto ("Analisar") continuava em uma linha enquanto
    // os vizinhos ja' tinham quebrado — quatro cartoes, dois desenhos.
    acaoTexto: { flex: '1 1 320px', minWidth: 0 },
    acaoEstado: {
      display: 'inline-flex', alignItems: 'center', gap: espaco.xs,
      ...tipo('micro'), textTransform: 'uppercase',
    },
    acaoPonto: { width: 7, height: 7, borderRadius: raio.pill, flexShrink: 0 },
    acaoNome: {
      ...tipo('corpoF'), color: t.texto, marginTop: 2,
      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    },
    // Sem `nowrap`: numa tela estreita esta linha quebra em duas em vez de
    // cortar justamente os numeros que justificam a acao.
    acaoDetalhe: { ...tipo('legenda'), color: t.fraco, marginTop: 2 },
    acaoBotao: {
      flexShrink: 0, minHeight: 36, minWidth: 150, padding: `0 ${espaco.lg}px`,
      background: 'transparent',
      borderWidth: 1, borderStyle: 'solid', borderColor: t.borda, borderRadius: raio.sm,
      color: t.texto, ...tipo('legenda'), fontWeight: 700,
      cursor: 'pointer', fontFamily: 'inherit',
    },
    acaoBotaoPrimario: {
      flexShrink: 0, minHeight: 36, minWidth: 150, padding: `0 ${espaco.lg}px`,
      background: t.vermelho, border: 'none', borderRadius: raio.sm, color: '#fff',
      ...tipo('legenda'), fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
      boxShadow: elevacao.baixa,
    },
    acoesNota: { ...tipo('legenda'), color: t.fraco },

    /* ---- agrupamento por produto ---- */
    filtro: {
      display: 'flex', gap: espaco.sm, marginBottom: espaco.xl,
      overflowX: 'auto', paddingBottom: espaco.xs,
    },
    filtroItem: {
      display: 'inline-flex', alignItems: 'center', gap: espaco.sm, flexShrink: 0,
      minHeight: analise ? 34 : 44, padding: `0 ${espaco.md}px`,
      background: t.superficie, borderRadius: raio.pill,
      borderWidth: 1, borderStyle: 'solid', borderColor: t.borda,
      color: t.medio, ...tipo('legenda'), fontWeight: 600,
      cursor: 'pointer', fontFamily: 'inherit',
      transition: `border-color ${transicao.rapida}, color ${transicao.rapida}`,
    },
    filtroAtivo: { borderColor: t.vermelho, color: t.texto },
    filtroContagem: {
      minWidth: 18, padding: '0 5px', borderRadius: raio.pill,
      background: t.realce, color: t.fraco, ...tipo('micro'),
      textTransform: 'none', letterSpacing: 0,
    },
    grupo: { marginBottom: espaco.xxl },
    grupoCabecalho: {
      display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
      gap: espaco.md, flexWrap: 'wrap', marginBottom: espaco.md,
    },
    grupoTitulo: { ...tipo('destaque'), margin: 0, color: t.texto },
    grupoTituloVazio: { color: t.fraco, fontStyle: 'italic' },
    grupoResumo: { ...tipo('legenda'), color: t.fraco },

    /* ---- tabela (analise) ---- */
    painel: {
      background: t.superficie, borderRadius: raio.lg, boxShadow: t.sombra,
      border: `1px solid ${t.borda}`, overflow: 'hidden',
    },
    areaRolagem: { overflowX: 'auto' },
    // A largura minima mora AQUI, uma vez so': abaixo dela a lista inteira
    // rola junto e a grade continua sendo a mesma para todos os grupos.
    // 980: abaixo disto o nome do estudo — a coluna que mais importa — ficaria
    // menor que o proprio nome. Melhor rolar a lista inteira que espremer.
    grade: { minWidth: 980 },
    // tableLayout fixo: a grade vem do colgroup, nao do conteudo de cada
    // grupo — e' o que mantem os grupos alinhados entre si.
    tabela: { width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' },
    th: {
      textAlign: 'left', padding: `${espaco.md}px ${espaco.lg}px`,
      ...rotulo(t.fraco), background: t.realce,
      borderBottom: `1px solid ${t.borda}`, whiteSpace: 'nowrap',
    },
    thNum: {
      textAlign: 'right', padding: `${espaco.md}px ${espaco.lg}px`,
      ...rotulo(t.fraco), background: t.realce,
      borderBottom: `1px solid ${t.borda}`, whiteSpace: 'nowrap',
    },
    linha: { transition: `background ${transicao.rapida}` },
    linhaSobre: { background: t.realce },
    td: {
      padding: `${espaco.lg}px`, ...tipo('corpo'), color: t.medio,
      borderBottom: `1px solid ${t.borda}`,
      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    },
    tdNome: {
      padding: `${espaco.lg}px`, ...tipo('corpoF'), color: t.texto,
      borderBottom: `1px solid ${t.borda}`,
      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    },
    // Parece texto, nao botao: a linha inteira ja' reage ao mouse, e um
    // contorno em volta de cada nome viraria uma coluna de caixas. O
    // sublinhado so' aparece com o cursor em cima — e' ele que promete o
    // clique. Sem `display: block` o botao encolhe ao texto e o alvo fica
    // menor que a celula.
    linkNome: {
      display: 'block', width: '100%', padding: 0, textAlign: 'left',
      background: 'transparent', border: 'none',
      color: 'inherit', font: 'inherit', cursor: 'pointer',
      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    },
    linkNomeSobre: { textDecoration: 'underline' },
    tdFraco: { padding: `${espaco.lg}px`, ...tipo('legenda'), color: t.fraco, borderBottom: `1px solid ${t.borda}`, whiteSpace: 'nowrap' },
    tdNum: {
      padding: `${espaco.lg}px`, textAlign: 'right', ...tipo('corpoF'), ...numeros,
      color: t.texto, borderBottom: `1px solid ${t.borda}`,
    },
    tdAcoes: {
      padding: `${espaco.sm}px ${espaco.lg}px`, textAlign: 'right',
      borderBottom: `1px solid ${t.borda}`,
    },
    // Sem `nowrap`: numa tela estreita os botoes descem para a linha de
    // baixo em vez de sumirem cortados na borda direita.
    acoesLinha: {
      display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end',
      alignItems: 'center', gap: espaco.xs,
    },
    botaoLinha: {
      minHeight: 34, padding: `0 ${espaco.md}px`, background: 'transparent',
      borderWidth: 1, borderStyle: 'solid', borderColor: t.borda, borderRadius: raio.sm,
      color: t.texto, ...tipo('legenda'), fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
    },
    botaoRemover: {
      width: 32, height: 32, background: 'transparent', border: 'none',
      borderRadius: raio.sm, color: t.fraco, fontSize: 18, lineHeight: 1,
      cursor: 'pointer', fontFamily: 'inherit',
    },

    /* ---- cartoes (coleta) ---- */
    lista: { listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: espaco.sm },
    itemLista: { position: 'relative' },
    cartao: {
      width: '100%', minHeight: 76, display: 'flex', alignItems: 'center', gap: espaco.md,
      // Faixa reservada a direita para o botao de remover. Sem ela o × cai
      // em cima da contagem de ciclos — o absolute nao empurra conteudo.
      padding: espaco.lg, paddingRight: 56,
      background: t.superficie,
      borderWidth: 1, borderStyle: 'solid', borderColor: t.borda, borderRadius: raio.md,
      color: t.texto, cursor: 'pointer', fontFamily: 'inherit',
    },
    cartaoTitulo: { ...tipo('corpoF'), overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
    cartaoSub: { ...tipo('legenda'), color: t.fraco, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
    cartaoNumeros: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0 },
    cartaoNumero: { ...tipo('destaque'), ...numeros },
    cartaoRotulo: rotulo(t.fraco),
    botaoRemoverCartao: {
      // Centralizado na faixa reservada, nao no canto: no canto ele disputa
      // espaco com o numero e fica menor que o dedo precisa.
      position: 'absolute', top: '50%', right: espaco.sm, transform: 'translateY(-50%)',
      width: 40, height: 40,
      background: 'transparent', border: 'none', borderRadius: raio.sm,
      color: t.fraco, fontSize: 20, lineHeight: 1, cursor: 'pointer', fontFamily: 'inherit',
    },

    /* ---- estado vazio estruturado (PC) ---- */
    vazioArea: {
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: espaco.xl,
      paddingTop: espaco.xxxl,
    },
    vazioCartao: {
      width: '100%', maxWidth: 560,
      padding: `${espaco.xxxl}px ${espaco.xxl}px`,
      background: t.superficie, borderRadius: raio.lg, boxShadow: t.sombra,
      borderWidth: 1, borderStyle: 'solid', borderColor: t.borda,
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      gap: espaco.md, textAlign: 'center',
    },
    vazioTitulo: { ...tipo('titulo'), margin: 0 },
    vazioTexto: { ...tipo('corpo'), margin: 0, color: t.medio, maxWidth: 400 },
    // Rotulo do sistema acima do titulo: responde "onde estou" antes de
    // "o que faco".
    vazioRotulo: rotulo(t.fraco),
    // Acao principal: maior que os botoes de ferramenta, sozinha no cartao.
    botaoGrande: {
      minHeight: 52, padding: `0 ${espaco.xxl}px`, marginTop: espaco.sm,
      background: t.vermelho, border: 'none', borderRadius: raio.md, color: '#fff',
      ...tipo('destaque'), cursor: 'pointer', fontFamily: 'inherit',
      boxShadow: elevacao.baixa,
    },

    fluxoRotulo: { ...rotulo(t.fraco), marginTop: espaco.xl },
    vazioFaixa: {
      width: '100%', maxWidth: 1080, marginTop: espaco.sm,
      display: 'flex', alignItems: 'stretch', justifyContent: 'center',
    },
    fluxoEtapa: { display: 'flex', alignItems: 'center', flex: 1, minWidth: 0 },
    fluxoSeta: { flexShrink: 0, padding: `0 ${espaco.sm}px`, color: t.fraco, fontSize: 18 },
    fluxoNumero: {
      flexShrink: 0, width: 22, height: 22, borderRadius: raio.pill,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      background: t.realce, borderWidth: 1, borderStyle: 'solid', borderColor: t.borda,
      color: t.medio, ...tipo('micro'), fontWeight: 700,
    },
    vazioBloco: {
      flex: 1, minWidth: 0,
      display: 'flex', alignItems: 'center', gap: espaco.md, padding: espaco.lg,
      background: t.superficie, borderRadius: raio.lg,
      borderWidth: 1, borderStyle: 'solid', borderColor: t.borda,
    },
    vazioBlocoTitulo: { ...tipo('corpoF') },
    vazioBlocoTexto: { ...tipo('legenda'), color: t.fraco, marginTop: 2 },

    /* ---- estudos arquivados ---- */
    listaArquivados: {
      listStyle: 'none', margin: 0, padding: 0,
      display: 'flex', flexDirection: 'column', gap: espaco.sm,
      maxHeight: '50vh', overflowY: 'auto',
    },
    itemArquivado: {
      display: 'flex', alignItems: 'center', gap: espaco.md,
      padding: espaco.md, background: t.realce, borderRadius: raio.md,
      borderWidth: 1, borderStyle: 'solid', borderColor: t.borda,
    },
    arquivadoNome: {
      ...tipo('corpoF'), overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    },
    arquivadoSub: { ...tipo('legenda'), color: t.fraco, marginTop: 2 },
    confirmarExclusao: { display: 'flex', alignItems: 'center', gap: espaco.sm, flexShrink: 0 },
    confirmarTexto: { ...tipo('legenda'), color: t.critico, fontWeight: 600 },
    // Laranja de estado critico, nao o vermelho da marca: isto e' perigo,
    // e o vermelho Patrimar e' identidade — nunca aviso.
    botaoExcluirDeVez: {
      minHeight: 32, padding: `0 ${espaco.md}px`, background: t.critico,
      border: 'none', borderRadius: raio.sm, color: '#fff',
      ...tipo('legenda'), fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
    },

    /* ---- modal ---- */
    modal: {
      position: 'fixed', inset: 0, zIndex: 30, background: 'rgba(15, 18, 22, 0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: espaco.lg, overflowY: 'auto',
    },
    formulario: {
      width: '100%', maxWidth: 520, background: t.superficie,
      borderWidth: 1, borderStyle: 'solid', borderColor: t.borda, borderRadius: raio.lg,
      padding: espaco.xxl, boxShadow: elevacao.alta,
      display: 'flex', flexDirection: 'column', gap: espaco.lg,
      maxHeight: '92dvh', overflowY: 'auto',
    },
    formularioLargo: { maxWidth: 960 },
    formTitulo: { ...tipo('titulo'), margin: 0 },
    textoModal: { ...tipo('corpo'), margin: 0, color: t.medio },
    acoesModal: { display: 'flex', gap: espaco.md, marginTop: espaco.xs },
    // minmax(0, 1fr): input tem largura minima intrinseca e, sem o 0, a
    // coluna recusa encolher e estoura o painel no celular.
    duasColunas: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: espaco.lg },
    umaColuna: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: espaco.lg },

    /* ---- novo estudo em etapas ---- */
    formCabecalho: {
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: espaco.lg, flexWrap: 'wrap',
    },
    formCorpo: { display: 'flex', flexDirection: 'column', gap: espaco.xl },
    formCorpoDuplo: {
      display: 'grid', gridTemplateColumns: '1.25fr 1fr', gap: espaco.xl,
      alignItems: 'start',
    },
    formEsquerda: { display: 'flex', flexDirection: 'column', gap: espaco.xl, minWidth: 0 },
    secao: { display: 'flex', flexDirection: 'column', gap: espaco.md },
    campoLargo: { gridColumn: '1 / -1' },
    secaoSeparada: {
      display: 'flex', flexDirection: 'column', gap: espaco.md,
      paddingTop: espaco.lg,
      borderTopWidth: 1, borderTopStyle: 'solid', borderTopColor: t.borda,
    },
    formRotulo: rotulo(t.fraco),

    etapas: {
      display: 'flex', alignItems: 'center', gap: espaco.sm,
      listStyle: 'none', margin: 0, padding: 0, flexWrap: 'wrap',
    },
    etapaItem: { display: 'flex', alignItems: 'center', gap: espaco.sm },
    etapaTraco: { width: 18, height: 1, background: t.borda },
    etapaBotao: {
      display: 'inline-flex', alignItems: 'center', gap: espaco.xs,
      background: 'transparent', border: 'none', padding: 2,
      cursor: 'pointer', fontFamily: 'inherit',
    },
    etapaNumero: {
      width: 22, height: 22, borderRadius: raio.pill,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      background: t.realce, borderWidth: 1, borderStyle: 'solid', borderColor: t.borda,
      color: t.fraco, ...tipo('micro'), fontWeight: 700,
    },
    etapaNumeroAtivo: { background: t.vermelho, borderColor: t.vermelho, color: '#fff' },
    etapaRotulo: { ...tipo('legenda'), fontWeight: 600, color: t.fraco },
    etapaRotuloAtivo: { color: t.texto },

    campo: { display: 'flex', flexDirection: 'column', gap: espaco.xs },
    rotuloCampo: rotulo(t.fraco),
    obrigatorio: { color: t.critico },
    dica: { ...tipo('legenda'), color: t.fraco, fontStyle: 'italic' },
    input: {
      width: '100%', minHeight: 44, padding: `0 ${espaco.md}px`, background: t.fundo,
      borderWidth: 1, borderStyle: 'solid', borderColor: t.borda, borderRadius: raio.sm,
      color: t.texto, ...tipo('corpo'), fontFamily: 'inherit', outline: 'none',
      transition: `border-color ${transicao.rapida}`,
    },
    erroForm: {
      padding: espaco.md, background: t.criticoFundo,
      borderWidth: 1, borderStyle: 'solid', borderColor: t.critico,
      borderRadius: raio.sm, ...tipo('legenda'), color: t.texto,
    },
  };
}
