import { useEffect, useState } from 'react';
import { claro } from '../../theme/tokensAnalise.js';
import { elevacao, espaco, numeros, raio, rotulo, tipo, transicao } from '../../theme/escala.js';
import { VERSAO } from '../../versao.js';
import { listarEstudos, quemSouEu, resumoConferencias } from '../../lib/api.js';
import { proximasAcoes, situacao } from '../../domain/proximasAcoes.js';
import MenuLateral from '../../components/MenuLateral.jsx';
import HistoricoVersoes from '../../components/HistoricoVersoes.jsx';
import ChaveIa from '../../components/ChaveIa.jsx';
import Cronometro from '../../components/Cronometro.jsx';
import MotivosParada from './MotivosParada.jsx';
import Maquinas from './Maquinas.jsx';
import Analistas from './Analistas.jsx';


/**
 * INÍCIO — a casa da análise.
 *
 * O app abria direto no conteudo: a lista de estudos fazia de casa. Com
 * estudo, ela era uma tabela; sem estudo, um convite a criar o primeiro.
 * Nunca a mesma tela duas vezes, e nenhum lugar estavel de onde partir — a
 * lista acumulava tres papeis (ser a casa, listar e resumir) e nao fazia
 * bem nenhum dos tres.
 *
 * Esta tela e' o ponto de partida, e o menu lateral e' o que leva a cada
 * lugar: escolheu, abriu. E' a navegacao que o usuario esperava e que a
 * lista, sendo casa, impedia de existir.
 *
 * O QUE ELA NAO E': uma tela de boas-vindas. Tela de abertura que so'
 * cumprimenta cobra um clique por dia e some da atencao em duas semanas —
 * o analista aprende a atravessar sem ler. Esta responde a pergunta de quem
 * chega de manha: o que precisa de mim agora. A identidade da cronoanalise
 * ocupa a faixa de cima; o resto e' trabalho.
 *
 * Nada aqui e' calculado duas vezes: os numeros e a fila de acoes saem dos
 * MESMOS estudos, numa unica chamada, pelas mesmas funcoes de dominio que a
 * lista usa (proximasAcoes, situacao).
 */
export default function Inicio({
  aoAbrirEstudos, aoAbrirRelatorio, aoNovoEstudo, aoMedir, aoAnalisar, aoTrocarModo,
}) {
  const [estudos, setEstudos] = useState(null);
  const [erro, setErro] = useState(null);
  const [eu, setEu] = useState(null);
  // As medicoes de RITMO sao a outra natureza de medicao do sistema. Vem
  // por um resumo (dois counts), nao pela lista: contar mil linhas com as
  // paradas de cada uma para exibir um numero seria trafego a toa.
  const [ritmo, setRitmo] = useState(null);

  const [verVersoes, setVerVersoes] = useState(false);
  const [verChaveIa, setVerChaveIa] = useState(false);
  const [verMotivos, setVerMotivos] = useState(false);
  const [verMaquinas, setVerMaquinas] = useState(false);
  const [verAnalistas, setVerAnalistas] = useState(false);

  useEffect(() => {
    listarEstudos()
      .then((r) => setEstudos(r.estudos || []))
      .catch((e) => setErro(e.message));
    // Falha em silencio, como na lista: nao saber quem esta' no PC nao pode
    // impedir de ver o que precisa de medicao.
    quemSouEu().then(setEu).catch(() => {});
    // Falha em silencio: o relatorio de ritmo tem tela propria, e nao
    // saber o total dele nao pode esconder os estudos.
    resumoConferencias().then(setRitmo).catch(() => {});
  }, []);

  const vivos = (estudos || []).filter((e) => e.status !== 'arquivado');
  const numeros = {
    estudos: vivos.length,
    ciclos: vivos.reduce((acc, e) => acc + (Number(e.total_observacoes) || 0), 0),
    operacoes: vivos.reduce((acc, e) => acc + (Number(e.total_operacoes) || 0), 0),
    pendencias: vivos.filter((e) => situacao(e) === 'pendente').length,
  };
  const { itens, restantes } = proximasAcoes(vivos);
  // O outro caminho do sistema existe? E' o que separa "a casa esta
  // vazia" de "a casa nao tem ESTUDO" — duas frases bem diferentes
  // para quem mede ritmo todo dia.
  const temRitmo = (ritmo?.medicoes || 0) > 0;

  return (
    <div style={est.telaComLateral}>
      <MenuLateral
        versao={VERSAO}
        aoVerVersao={() => setVerVersoes(true)}
        /* Sem `secoes`: o Inicio nao tem subtela. A lateral aqui e' o mapa
           do sistema — os dois caminhos e as ferramentas. */
        inicioAtivo
        aoVerInicio={() => {}}
        aoVerEstudos={aoAbrirEstudos}
        aoVerConferencias={aoAbrirRelatorio}
        aoNovoEstudo={aoNovoEstudo}
        aoVerChaveIa={() => setVerChaveIa(true)}
        aoVerMotivos={() => setVerMotivos(true)}
        aoVerMaquinas={() => setVerMaquinas(true)}
        aoVerAnalistas={() => setVerAnalistas(true)}
        usuario={eu}
        aoTrocarModo={aoTrocarModo}
      />

      <main style={est.conteudo}>
        {/* A FAIXA DE ABERTURA: o tema da cronoanalise, uma vez, no alto.
            Nao repete o nome do sistema (a lateral ja' o traz) — diz o que
            se faz aqui. */}
        <header style={est.capa}>
          <div style={est.capaTexto}>
            <span style={est.capaRotulo}>Cronoanálise</span>
            <h1 style={est.capaTitulo}>Medir o tempo para poder planejar</h1>
            <p style={est.capaDica}>
              Estudos de tempo ciclo a ciclo, ritmo dos postos, tempo padrão e capacidade.
              Cada medição responde a quem a registrou.
            </p>
          </div>
          <span style={est.capaMarca} aria-hidden="true">
            <Cronometro tamanho={92} />
          </span>
        </header>

        {erro && <div style={est.erro} role="alert">Não foi possível carregar os estudos: {erro}</div>}

        {/* Os numeros do que existe. Vem antes da fila de acoes porque
            respondem "onde estou" — a fila responde "o que faco". */}
        <section style={est.numeros} aria-label="Visão geral">
          {[
            ['Estudos', numeros.estudos, 'cadastrados'],
            ['Ciclos', numeros.ciclos, 'cronometrados'],
            ['Operações', numeros.operacoes, 'nos estudos'],
            /* A outra natureza de medicao, ao lado da primeira: o sistema
               tem dois caminhos, e o painel que so' contasse estudos daria
               a entender que o ritmo por maquina e' acessorio. */
            ['Medições de ritmo', ritmo?.medicoes, ritmo?.maquinas != null
              ? `em ${ritmo.maquinas} ${ritmo.maquinas === 1 ? 'máquina' : 'máquinas'}`
              : 'peças/hora dos postos'],
            ['Pendências', numeros.pendencias, 'sem nenhum ciclo'],
          ].map(([rot, val, sub], i) => (
            <div key={rot} style={est.numero}>
              <span style={est.numeroRotulo}>{rot}</span>
              {/* Pendencia so' ganha cor quando existe: "0" colorido treina
                  o olho a ignorar a cor. Mesma regra do painel da lista. */}
              <span style={i === 4 && val > 0 ? est.numeroValorAtencao : est.numeroValor}>
                {/* Cada numero espera o SEU carregamento: o de ritmo vem
                    de outra chamada, e prende-lo a dos estudos deixaria um
                    traco onde ja' ha' resposta. */}
                {val == null ? '—' : val}
              </span>
              <span style={est.numeroSub}>{sub}</span>
            </div>
          ))}
        </section>

        {/* O QUE PRECISA DE MIM AGORA. E' por isto que a casa existe: sem
            esta fila, ela seria um cartaz. */}
        {itens.length > 0 && (
          <section style={est.painel} aria-label="Próximas ações">
            <div style={est.painelTopo}>
              <h2 style={est.painelTitulo}>O que precisa de você</h2>
              <button type="button" style={est.link} onClick={aoAbrirEstudos}>
                Ver todos os estudos →
              </button>
            </div>
            <div style={est.acoes}>
              {itens.map((item, i) => {
                const cor = claro[item.tom];
                const executar = item.acao === 'medir' ? aoMedir : aoAnalisar;
                return (
                  <div key={item.id} style={{ ...est.acao, borderLeftColor: cor }}>
                    <div style={est.acaoTexto}>
                      <span style={{ ...est.acaoEstado, color: cor }}>
                        <span style={{ ...est.acaoPonto, background: cor }} aria-hidden="true" />
                        {item.rotulo}
                      </span>
                      <div style={est.acaoNome} title={item.nome}>{item.nome}</div>
                      <div style={est.acaoDetalhe}>
                        {[item.contexto, `${item.operacoes} operações`, `${item.ciclos} ciclos`]
                          .filter(Boolean).join(' · ')}
                      </div>
                    </div>
                    {executar && (
                      <button
                        type="button"
                        style={i === 0 ? est.botaoPrimario : est.botaoSecundario}
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
              <p style={est.nota}>
                e mais {restantes} estudo(s) esperando medição — a lista completa está em Estudos.
              </p>
            )}
          </section>
        )}

        {/* Nada pendente nao e' tela vazia: e' a boa noticia, e ela precisa
            ser dita. Sem isto, quem abre com tudo em dia acha que a tela
            nao carregou.

            E "sem estudo" NAO E' "sem nada". O sistema tem dois caminhos, e
            este bloco so' olhava um: a fabrica com dez medicoes de ritmo da
            furadeira e nenhum estudo cadastrado lia "Nenhum estudo ainda"
            num painel de zeros, como se nunca tivesse medido nada. Quem usa
            principalmente o ritmo por maquina abria a casa e via o proprio
            trabalho negado. */}
        {estudos != null && !itens.length && (
          <section style={est.painel} aria-label="Próximas ações">
            <h2 style={est.painelTitulo}>
              {numeros.estudos > 0
                ? 'Nada esperando medição'
                : (temRitmo
                  ? 'Nenhum estudo de tempos — o que há é medição de ritmo'
                  : 'Nenhum estudo ainda')}
            </h2>
            <p style={est.painelDica}>
              {numeros.estudos > 0
                ? 'Todos os estudos cadastrados já têm ciclos cronometrados. O próximo passo é analisar.'
                : (temRitmo
                  ? `${ritmo.medicoes} ${ritmo.medicoes === 1 ? 'medição de ritmo já chegou' : 'medições de ritmo já chegaram'} do celular`
                    + `${ritmo.maquinas ? `, em ${ritmo.maquinas} ${ritmo.maquinas === 1 ? 'máquina' : 'máquinas'}` : ''}`
                    + ' — o relatório de peças/hora já responde por elas, sem precisar de estudo cadastrado. '
                    + 'O estudo de tempos é a outra medição: ciclo a ciclo, com fator de ritmo e tolerância, para chegar ao tempo padrão.'
                  : 'Comece criando um estudo de tempos, ou meça o ritmo de um posto pelo celular — o relatório de peças/hora vive dessas medições, sem precisar de estudo cadastrado.')}
            </p>
            {/* Com medicao de ritmo na casa, o caminho para ela vem junto do
                texto: mandar "abrir o relatorio" e deixar o botao tres
                blocos abaixo e' mandar procurar. */}
            {numeros.estudos === 0 && temRitmo && (
              <div>
                <button type="button" style={est.botaoPrimario} onClick={aoAbrirRelatorio}>
                  Abrir o relatório de ritmo
                </button>
              </div>
            )}
          </section>
        )}

        {/* OS DOIS CAMINHOS. As duas naturezas de medicao do sistema, lado a
            lado e nomeadas pelo POSTO — a mesma leitura da lateral. */}
        <section style={est.caminhos} aria-label="Por onde começar">
          <button type="button" style={est.caminho} onClick={aoAbrirEstudos}>
            <span style={est.caminhoRotulo}>Embalagem e demais postos</span>
            <span style={est.caminhoTitulo}>Estudos de tempo</span>
            <span style={est.caminhoTexto}>
              Ciclo a ciclo, com fator de ritmo e tolerância — é o que vira tempo padrão,
              capacidade e balanceamento de linha.
            </span>
            <span style={est.caminhoSeta} aria-hidden="true">→</span>
          </button>

          <button type="button" style={est.caminho} onClick={aoAbrirRelatorio}>
            <span style={est.caminhoRotulo}>Ritmo por máquina</span>
            <span style={est.caminhoTitulo}>Peças por hora do posto</span>
            <span style={est.caminhoTexto}>
              Sem cronometrar ciclo: horários, peças e paradas. Responde quanto o posto rende,
              quanto ficou parado e qual máquina do grupo está melhor.
            </span>
            <span style={est.caminhoSeta} aria-hidden="true">→</span>
          </button>
        </section>
      </main>

      {verVersoes && <HistoricoVersoes modo="analise" aoFechar={() => setVerVersoes(false)} />}
      {verChaveIa && <ChaveIa modo="analise" aoFechar={() => setVerChaveIa(false)} />}
      {verMotivos && <MotivosParada aoFechar={() => setVerMotivos(false)} />}
      {verMaquinas && <Maquinas aoFechar={() => setVerMaquinas(false)} />}
      {verAnalistas && (
        <Analistas
          aoFechar={() => { setVerAnalistas(false); quemSouEu().then(setEu).catch(() => {}); }}
          aoTrocarUsuario={setEu}
        />
      )}
    </div>
  );
}

const t = claro;

const est = {
  telaComLateral: {
    minHeight: '100dvh', display: 'flex', alignItems: 'flex-start',
    background: t.fundo, color: t.texto,
  },
  conteudo: {
    flex: 1, minWidth: 0,
    padding: `${espaco.xl}px ${espaco.xl}px ${espaco.gigante}px`,
    display: 'flex', flexDirection: 'column', gap: espaco.xl,
  },

  /* ---- faixa de abertura ---- */
  capa: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: espaco.xl,
    padding: `${espaco.xxl}px ${espaco.xxxl}px`,
    background: t.papel, borderRadius: raio.lg, boxShadow: elevacao.baixa,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.borda,
    // A faixa vermelha a esquerda e' a assinatura da casa — a mesma marca
    // que o menu usa para dizer "e' aqui que voce esta".
    borderLeftWidth: 4, borderLeftColor: t.vermelho,
  },
  capaTexto: { display: 'flex', flexDirection: 'column', gap: espaco.xs, maxWidth: 620 },
  capaRotulo: { ...rotulo(t.vermelho) },
  capaTitulo: { ...tipo('titulo'), color: t.texto, margin: 0 },
  capaDica: { ...tipo('corpo'), color: t.textoMedio, margin: 0 },
  capaMarca: { flexShrink: 0, opacity: 0.9 },

  erro: {
    padding: espaco.md, background: t.criticoFundo,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.critico,
    borderRadius: raio.sm, ...tipo('corpo'),
  },

  /* ---- numeros ---- */
  numeros: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: espaco.md,
  },
  numero: {
    background: t.papel, borderRadius: raio.lg, boxShadow: elevacao.baixa,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.borda,
    padding: `${espaco.lg}px ${espaco.xl}px`,
    display: 'flex', flexDirection: 'column', gap: 2,
  },
  numeroRotulo: { ...rotulo(t.textoFraco) },
  numeroValor: { ...tipo('display'), ...numeros, lineHeight: 1.1, color: t.texto },
  numeroValorAtencao: { ...tipo('display'), ...numeros, lineHeight: 1.1, color: t.critico },
  numeroSub: { ...tipo('legenda'), color: t.textoMedio },

  /* ---- paineis ---- */
  painel: {
    background: t.papel, borderRadius: raio.lg, boxShadow: elevacao.baixa,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.borda,
    padding: espaco.xl, display: 'flex', flexDirection: 'column', gap: espaco.md,
  },
  painelTopo: {
    display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
    gap: espaco.md, flexWrap: 'wrap',
  },
  painelTitulo: { ...tipo('corpoF'), margin: 0 },
  painelDica: { ...tipo('corpo'), color: t.textoMedio, margin: 0, maxWidth: 760 },
  link: {
    background: 'transparent', border: 'none', padding: 0,
    color: t.textoMedio, ...tipo('legenda'), fontWeight: 600,
    cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline',
  },
  nota: { ...tipo('legenda'), color: t.textoFraco, margin: 0 },

  /* ---- fila de acoes ---- */
  acoes: { display: 'flex', flexDirection: 'column', gap: espaco.md },
  acao: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: espaco.lg, flexWrap: 'wrap',
    padding: `${espaco.md}px ${espaco.lg}px`, background: t.fundo, borderRadius: raio.md,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.borda,
    borderLeftWidth: 3,
  },
  acaoTexto: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1 },
  acaoEstado: { ...rotulo(t.texto), display: 'flex', alignItems: 'center', gap: espaco.sm },
  acaoPonto: { width: 7, height: 7, borderRadius: '50%', display: 'inline-block' },
  acaoNome: {
    ...tipo('corpoF'), color: t.texto,
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  acaoDetalhe: { ...tipo('legenda'), ...numeros, color: t.textoMedio },

  botaoPrimario: {
    minHeight: 40, padding: `0 ${espaco.lg}px`, flexShrink: 0,
    background: t.vermelho, border: 'none', borderRadius: raio.md, color: '#fff',
    ...tipo('corpoF'), cursor: 'pointer', fontFamily: 'inherit', boxShadow: elevacao.baixa,
  },
  botaoSecundario: {
    minHeight: 40, padding: `0 ${espaco.lg}px`, flexShrink: 0, background: 'transparent',
    borderWidth: 1, borderStyle: 'solid', borderColor: t.bordaForte, borderRadius: raio.md,
    color: t.texto, ...tipo('corpo'), cursor: 'pointer', fontFamily: 'inherit',
  },

  /* ---- os dois caminhos ---- */
  caminhos: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: espaco.lg,
  },
  caminho: {
    position: 'relative', textAlign: 'left',
    background: t.papel, borderRadius: raio.lg, boxShadow: elevacao.baixa,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.borda,
    padding: `${espaco.xl}px ${espaco.xxl}px ${espaco.xl}px ${espaco.xl}px`,
    display: 'flex', flexDirection: 'column', gap: espaco.xs,
    cursor: 'pointer', fontFamily: 'inherit',
    transition: `box-shadow ${transicao.normal}, border-color ${transicao.normal}`,
  },
  caminhoRotulo: rotulo(t.textoFraco),
  caminhoTitulo: { ...tipo('destaque'), color: t.texto },
  caminhoTexto: { ...tipo('corpo'), color: t.textoMedio },
  caminhoSeta: {
    position: 'absolute', top: espaco.xl, right: espaco.lg,
    ...tipo('destaque'), color: t.vermelho,
  },
};
