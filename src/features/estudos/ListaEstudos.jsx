import { useEffect, useMemo, useState } from 'react';
import {
  atualizarEstudo, criarEstudo, excluirEstudoDeVez, removerEstudo, restaurarEstudo,
} from '../../lib/api.js';
import { agruparPorProduto, produtosConhecidos, setoresConhecidos } from '../../domain/agrupamento.js';
import AvisoAtualizacao from '../../components/AvisoAtualizacao.jsx';
import ChaveIa from '../../components/ChaveIa.jsx';
import Cabecalho from '../../components/Cabecalho.jsx';
import HistoricoVersoes from '../../components/HistoricoVersoes.jsx';
import MenuLateral from '../../components/MenuLateral.jsx';
import ConfirmarSaida from '../../components/SairDoSistema.jsx';
import MotivosParada from '../analise/MotivosParada.jsx';
import Maquinas from '../analise/Maquinas.jsx';
import Analistas from '../analise/Analistas.jsx';
import EstadoVazio from '../../components/EstadoVazio.jsx';
import ImportarRoteiro from './ImportarRoteiro.jsx';
import { VERSAO } from '../../versao.js';
import { useEstudos } from './lista/useEstudos.js';
import { estilos, tema } from './lista/estilos.js';
import { FiltroProduto, SecaoColeta, Simbolo } from './lista/Elementos.jsx';
import TabelaEstudos from './lista/TabelaEstudos.jsx';
import CartoesEstudos from './lista/CartoesEstudos.jsx';
import EstudosArquivados from './lista/EstudosArquivados.jsx';
import ProximasAcoes from './lista/ProximasAcoes.jsx';
import PainelResumo from './lista/PainelResumo.jsx';
import ConfirmarRemocao from './lista/ConfirmarRemocao.jsx';
import FormularioEstudo from './lista/FormularioEstudo.jsx';
import VazioAnalise from './lista/VazioAnalise.jsx';

/**
 * Lista de estudos — porta de entrada das duas experiencias.
 *
 *   coleta  (celular, no posto) — tema escuro, alvos grandes, cartoes.
 *   analise (PC, no escritorio) — tema claro igual ao do relatorio, tabela.
 *
 * Este arquivo e' o ARRANJO: o que abre e fecha, a busca e o filtro, e a
 * ordem das secoes nas duas experiencias. Os dados vem de useEstudos; cada
 * quadro mora em lista/, recebendo o tema (`t`) e os estilos (`est`) que o
 * container calcula uma vez para o modo em que esta'.
 */
export default function ListaEstudos({
  aoAbrir, aoEditar, aoMedir, modo = 'coleta', aoTrocarModo, aoConferirRapido, aoVerConferencias,
  aoSairDoSistema, aoVerInicio,
}) {
  const [criando, setCriando] = useState(false);
  const [importando, setImportando] = useState(false);
  const [removendo, setRemovendo] = useState(null);
  const [filtro, setFiltro] = useState(null);
  const [verVersoes, setVerVersoes] = useState(false);
  const [verArquivados, setVerArquivados] = useState(false);
  const [verChaveIa, setVerChaveIa] = useState(false);
  const [verMotivos, setVerMotivos] = useState(false);
  const [verMaquinas, setVerMaquinas] = useState(false);
  const [verAnalistas, setVerAnalistas] = useState(false);
  const [busca, setBusca] = useState('');
  const [saindo, setSaindo] = useState(false);

  const analise = modo === 'analise';
  const t = useMemo(() => tema(analise), [analise]);
  const est = useMemo(() => estilos(t, analise), [t, analise]);

  const {
    estudos, arquivados, estado, erro, carregar, analistas, eu, setEu, carregarIdentificacao,
  } = useEstudos({ analise });


  /**
   * `?novo=1` abre o criador direto.
   *
   * O botao "+ Novo estudo" do INICIO precisa cair no formulario, nao na
   * lista com o formulario fechado — clicar em "novo" e chegar numa tabela
   * obriga a procurar o mesmo botao de novo. A query e' limpa da URL logo em
   * seguida: recarregar a pagina depois de fechar o formulario nao pode
   * reabri-lo.
   */
  useEffect(() => {
    if (!analise) return;
    if (new URLSearchParams(window.location.search).get('novo') !== '1') return;
    setCriando(true);
    window.history.replaceState({}, '', window.location.pathname);
  }, [analise]);

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
      aoVerInicio={aoVerInicio}
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
      aoVerMaquinas={() => setVerMaquinas(true)}
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
          /* O rotulo vive DENTRO do botao, nao num cabecalho acima dele: a
             secao inteira e' este unico atalho, e um titulo separado so'
             repetiria em duas linhas o que a primeira ja' diz.
             Nao se chama mais "Furadeiras": o cadastro tem fresadora,
             embalagem e o que mais entrar, e o atalho serve a todos. */
          <button type="button" style={est.atalhoRapida} onClick={aoConferirRapido}>
            <Simbolo tipo="cronometro" cor={t.vermelho} tamanho={28} />
            <div style={{ minWidth: 0, flex: 1, textAlign: 'left' }}>
              <span style={est.atalhoRotulo}>Ritmo por máquina</span>
              <div style={est.atalhoTitulo}>Ritmo da máquina</div>
              <div style={est.atalhoTexto}>
                Peças/hora de qualquer posto: horários, peças e as paradas (setup, falta de peça).
                Sem cronometrar ciclo.
              </div>
            </div>
            <span style={est.atalhoSeta} aria-hidden="true">→</span>
          </button>
        )}

        {/* A segunda seção da coleta. No tablet as duas coisas moram na
            mesma tela e o analista precisa saber, sem perguntar, qual delas
            e' a dele: um posto se confere por vazao (peças/hora), outro se
            estuda ciclo a ciclo. O rotulo diz a natureza da medicao; o
            titulo diz o metodo. */}
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
          <VazioAnalise est={est} t={t} arquivados={arquivados.length} aoCriar={() => setCriando(true)} />
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
      {verMaquinas && <Maquinas aoFechar={() => setVerMaquinas(false)} />}

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

