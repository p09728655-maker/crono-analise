import { claro } from '../theme/tokensAnalise.js';
import { elevacao, espaco, raio, rotulo, tipo, transicao } from '../theme/escala.js';
import { LOGO_PATRIMAR } from '../theme/logo.js';

/**
 * Menu lateral — so' no PC (Analise).
 *
 * O topo estava virando uma fileira de botoes cada vez mais longa: Coleta,
 * Analise, Arquivados, Conferencias, Importar, Chave da IA, Novo estudo.
 * Barra horizontal nao cresce — a partir de um ponto ela empurra o titulo,
 * quebra em duas linhas e some com a hierarquia.
 *
 * Na lateral cada grupo tem nome (Estudos, Relatorios, Acoes), a busca fica
 * sempre visivel, e a lista de produtos vira navegacao de verdade em vez de
 * uma fila de pilulas. Sobra largura para o conteudo, que e' onde o analista
 * de fato trabalha.
 *
 * MESMO MENU EM TODA TELA DE PC. Ele nasceu so' na lista, e o estudo aberto
 * ficou com outro modelo — cabecalho no topo mais abas horizontais. Duas
 * navegacoes diferentes no mesmo app obrigam o analista a reaprender onde
 * clicar cada vez que abre um estudo, e as abas competiam com os botoes do
 * topo pela mesma tarefa. Agora a lateral e' a navegacao das duas telas: o
 * que muda e' o CONTEUDO dela, nao o lugar onde ela fica.
 *
 * Os blocos sao opcionais e aparecem conforme as props que chegam:
 *   lista   — busca, produtos, arquivados, ferramentas.
 *   estudo  — voltar, nome do estudo, secoes da analise, acoes do estudo.
 *
 * A coleta (celular) NAO tem lateral: la a tela e' pequena e a tarefa e'
 * uma so'.
 */
export default function MenuLateral({
  versao, aoVerVersao,
  // --- contexto de um objeto aberto (estudo, relatorio) ---
  aoVoltar, voltarRotulo = 'Estudos', contexto,
  acaoPrimaria, secoes, secaoAtiva, aoTrocarSecao, secoesRotulo = 'Análise',
  acoes = [], acoesRotulo = 'Este estudo',
  // --- lista de estudos ---
  busca, aoBuscar, grupos = [], filtro, aoFiltrar,
  aoNovoEstudo, aoImportar, aoVerConferencias, aoVerArquivados, arquivados = 0,
  aoVerChaveIa, aoVerMotivos, aoVerMaquinas, aoVerAnalistas, usuario, aoTrocarModo,
}) {
  const total = grupos.reduce((acc, g) => acc + g.estudos.length, 0);
  const temFerramentas = aoBuscar || aoImportar || aoVerChaveIa || aoVerMotivos || aoVerMaquinas || aoVerAnalistas;

  return (
    <nav style={est.lateral} aria-label="Navegação">
      {/* 1. Onde estou */}
      <div style={est.marca}>
        <img src={LOGO_PATRIMAR} alt="Patrimar Móveis" style={est.logo} />
        <div style={est.titulo}>RitmoPatrimar</div>
        <div style={est.subtitulo}>
          Estudo de Tempos
          {versao && (
            <button type="button" onClick={aoVerVersao} style={est.versao} title="Ver histórico de versões">
              v{versao}
            </button>
          )}
        </div>
      </div>

      {/* 2. A saida para tras vem antes do conteudo: e' o unico jeito de
             deixar o estudo, e no topo ela fica onde o olho ja' esta'. */}
      {aoVoltar && (
        <button
          type="button"
          style={est.voltar}
          onClick={aoVoltar}
          aria-label="Voltar para a lista de estudos"
        >
          <span aria-hidden="true" style={est.seta}>←</span>
          <span style={est.itemTexto}>{voltarRotulo}</span>
        </button>
      )}

      {/* 3. O que esta' aberto. O nome inteiro no title: 248px cortam
             "SIRIUS 1.6 PRAT 768X358X15 MDP 4" bem no meio. */}
      {contexto && (
        <div style={est.contexto}>
          <div style={est.contextoRotulo}>{contexto.rotulo || 'Estudo'}</div>
          <div style={est.contextoTitulo} title={contexto.titulo}>{contexto.titulo}</div>
          {contexto.subtitulo && (
            <div style={est.contextoTexto} title={contexto.subtitulo}>{contexto.subtitulo}</div>
          )}
        </div>
      )}

      {/* 4. O que devo fazer — a acao principal vem antes de tudo, e e' a
             unica coisa vermelha do menu. */}
      {(acaoPrimaria || aoNovoEstudo) && (
        <div style={est.bloco}>
          <button
            type="button"
            style={est.botaoPrimario}
            onClick={acaoPrimaria ? acaoPrimaria.aoClicar : aoNovoEstudo}
          >
            {acaoPrimaria ? acaoPrimaria.rotulo : '+ Novo estudo'}
          </button>
        </div>
      )}

      {/* 5. Secoes do estudo aberto — o que antes eram abas horizontais.
             Um item com `cabecalho: true` nao e' clicavel: e' o nome de um
             GRUPO, e os itens abaixo dele pertencem a ele. E' assim que o
             relatorio lista as maquinas debaixo do grupo do cadastro
             (0002 · FURADEIRA), a mesma leitura que o celular ja' oferece
             no <optgroup> da escolha da maquina. */}
      {secoes?.length > 0 && (
        <div style={est.bloco} role="group" aria-label={secoesRotulo}>
          <div style={est.grupoRotulo}>{secoesRotulo}</div>
          {secoes.map((s) => (s.cabecalho ? (
            <div key={s.id} style={est.subgrupoRotulo}>{s.rotulo}</div>
          ) : (
            <button
              key={s.id}
              type="button"
              onClick={() => aoTrocarSecao(s.id)}
              aria-current={s.id === secaoAtiva ? 'page' : undefined}
              style={{
                ...est.item,
                ...(s.recuado ? est.itemRecuado : {}),
                ...(s.id === secaoAtiva ? est.itemAtivo : {}),
              }}
            >
              <span style={est.itemTexto}>{s.rotulo}</span>
              {s.contador != null && <span style={est.contagem}>{s.contador}</span>}
            </button>
          )))}
        </div>
      )}

      {/* 6. Acoes do objeto aberto: existem, mas nao disputam com a analise. */}
      {acoes.length > 0 && (
        <div style={est.bloco}>
          <div style={est.grupoRotulo}>{acoesRotulo}</div>
          {acoes.map((a) => (
            <button key={a.rotulo} type="button" style={est.item} onClick={a.aoClicar}>
              <span style={est.itemTexto}>{a.rotulo}</span>
            </button>
          ))}
        </div>
      )}

      {/* 7. Quais estudos ja existem */}
      {aoNovoEstudo && (
        <div style={est.bloco}>
          {/* Os dois blocos sao nomeados pelo POSTO, nao pelo metodo: no chao
              de fabrica a pergunta e' "vim medir a embalagem" ou "vim medir a
              maquina", nunca "vim fazer uma conferencia rapida". O metodo
              vem embaixo, como explicacao. */}
          <div style={est.grupoRotulo}>Embalagem e demais postos</div>
          <div style={est.grupoDica}>Estudos de tempo — ciclo a ciclo, com tempo padrão</div>
          {/* O grupo de filtro cobre SO' os produtos: arquivados nao filtra
              nada, abre outra tela.

              Com UM produto so' o filtro nao filtra nada: "Todos 1" e o
              proprio produto embaixo, com a mesma contagem. Pior quando o
              produto se chama "TODOS" — e chama, porque quem cadastra usa
              a palavra para dizer "vale para todos os modelos": viravam
              duas linhas quase identicas, uma filtro e outra dado. */}
          {grupos.length > 1 && (
            <div style={est.bloco} role="group" aria-label="Filtrar por produto">
              <button
                type="button"
                onClick={() => aoFiltrar(null)}
                aria-current={filtro === null ? 'true' : undefined}
                style={{ ...est.item, ...(filtro === null ? est.itemAtivo : {}) }}
              >
                {/* "Todos os produtos", nao "Todos": o rotulo precisa se
                    distinguir de um produto que por acaso tenha esse nome. */}
                <span style={est.itemTexto}>Todos os produtos</span>
                <span style={est.contagem}>{total}</span>
              </button>
              {grupos.map((g) => (
                <button
                  key={g.chave}
                  type="button"
                  onClick={() => aoFiltrar(g.chave === filtro ? null : g.chave)}
                  aria-current={g.chave === filtro ? 'true' : undefined}
                  style={{ ...est.item, ...(g.chave === filtro ? est.itemAtivo : {}) }}
                  title={g.rotulo}
                >
                  <span style={est.itemTexto}>{g.rotulo}</span>
                  <span style={est.contagem}>{g.estudos.length}</span>
                </button>
              ))}
            </div>
          )}
          {arquivados > 0 && (
            <button type="button" style={est.item} onClick={aoVerArquivados}>
              <span style={est.itemTexto}>Estudos arquivados</span>
              <span style={est.contagem}>{arquivados}</span>
            </button>
          )}
        </div>
      )}

      {/* 8. A outra natureza de medicao, com peso menor */}
      {aoVerConferencias && (
        <div style={est.bloco}>
          <div style={est.grupoRotulo}>Ritmo por máquina</div>
          <div style={est.grupoDica}>Peças/hora do posto — sem cronometrar ciclo</div>
          <button type="button" style={est.item} onClick={aoVerConferencias}>
            <span style={est.itemTexto}>Abrir o relatório</span>
          </button>
        </div>
      )}

      {/* 9. Ferramentas: existem, mas nao disputam a atencao. A busca vive
             aqui — util quando ha muitos estudos, nunca a primeira coisa
             que a tela oferece. */}
      {temFerramentas && (
        <div style={est.blocoFerramentas}>
          <div style={est.grupoRotulo}>Ferramentas</div>
          {aoBuscar && (
            <input
              id="busca-estudos"
              type="search"
              value={busca}
              onChange={(ev) => aoBuscar(ev.target.value)}
              placeholder="Buscar produto, peça, máquina..."
              style={est.busca}
              aria-label="Buscar estudo por produto, máquina ou analista"
            />
          )}
          {aoImportar && (
            <button type="button" style={est.item} onClick={aoImportar}>
              <span style={est.itemTexto}>Importar PDF ou planilha</span>
            </button>
          )}
          {aoVerAnalistas && (
            <button type="button" style={est.item} onClick={aoVerAnalistas}>
              <span style={est.itemTexto}>Analistas</span>
            </button>
          )}
          {aoVerMotivos && (
            <button type="button" style={est.item} onClick={aoVerMotivos}>
              <span style={est.itemTexto}>Motivos de parada</span>
            </button>
          )}
          {aoVerMaquinas && (
            <button type="button" style={est.item} onClick={aoVerMaquinas}>
              <span style={est.itemTexto}>Máquinas</span>
            </button>
          )}
          {aoVerChaveIa && (
            <button type="button" style={est.item} onClick={aoVerChaveIa}>
              <span style={est.itemTexto}>Chave da IA</span>
            </button>
          )}
        </div>
      )}

      {/* A coleta e' a primeira ETAPA de um estudo, nao uma quarta acao:
          fica no rodape, discreta, para quem ja sabe o que quer. */}
      {(aoVerAnalistas || aoTrocarModo) && (
        <div style={est.rodape}>
          {aoVerAnalistas && (
            <button
              type="button" style={est.itemDiscreto} onClick={aoVerAnalistas}
              title={usuario ? 'Trocar quem está usando este computador' : 'Dizer quem está usando este computador'}
            >
              <span style={est.itemTexto}>
                {usuario ? usuario.nome : 'Ninguém identificado'}
              </span>
              <span aria-hidden="true" style={est.seta}>{usuario ? '⇄' : '→'}</span>
            </button>
          )}
          {aoTrocarModo && (
            <button type="button" style={est.itemDiscreto} onClick={aoTrocarModo} title="Tela de coleta (celular)">
              <span style={est.itemTexto}>Ir para a Coleta</span>
              <span aria-hidden="true" style={est.seta}>→</span>
            </button>
          )}
        </div>
      )}
    </nav>
  );
}

const t = claro;

const est = {
  lateral: {
    position: 'sticky', top: 0, alignSelf: 'flex-start',
    width: 248, flexShrink: 0, height: '100dvh', overflowY: 'auto',
    background: t.papel, borderRight: `1px solid ${t.borda}`,
    padding: `${espaco.xl}px ${espaco.lg}px`,
    display: 'flex', flexDirection: 'column', gap: espaco.xl,
  },

  // Nome do grupo dentro de um bloco: menor que o rotulo do bloco, para a
  // hierarquia ficar em tres niveis sem virar tres tamanhos de titulo.
  // Sem tamanho proprio: o `fontSize: 10` que estava aqui era um degrau
  // criado so' para este rotulo, e levava a tela do relatorio a dez tamanhos
  // distintos (teto da escala e' cinco). A hierarquia sai do espacamento e
  // da cor, nao de um tamanho novo.
  subgrupoRotulo: {
    ...rotulo(t.textoFraco),
    padding: `${espaco.md}px ${espaco.sm}px ${espaco.xs}px`,
  },
  // Shorthand inteiro, nao paddingLeft: misturar com o `padding` do
  // item base deixa o estilo imprevisivel no rerender (ver checar-estilos).
  itemRecuado: { padding: `0 ${espaco.md}px 0 ${espaco.lg}px` },

  marca: { display: 'flex', flexDirection: 'column', gap: 2 },
  // alignSelf flex-start e' o que impede a distorcao: num flex em COLUNA o
  // padrao e' stretch, que estica a imagem na largura do bloco e anula o
  // width:auto — a marca sai achatada.
  logo: {
    height: 30, width: 'auto', maxWidth: '100%', alignSelf: 'flex-start',
    display: 'block', marginBottom: espaco.sm,
  },
  titulo: { ...tipo('destaque'), color: t.texto },
  subtitulo: { ...tipo('legenda'), color: t.textoFraco, display: 'flex', alignItems: 'center', gap: espaco.sm },
  versao: {
    padding: '1px 6px', background: 'transparent',
    borderWidth: 1, borderStyle: 'solid', borderColor: t.borda, borderRadius: raio.pill,
    color: t.textoFraco, ...tipo('micro'), fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
  },

  voltar: {
    width: '100%', minHeight: 36, padding: `0 ${espaco.md}px`,
    display: 'flex', alignItems: 'center', gap: espaco.sm,
    background: 'transparent',
    borderWidth: 1, borderStyle: 'solid', borderColor: t.borda, borderRadius: raio.md,
    color: t.textoMedio, ...tipo('corpo'), fontWeight: 600, textAlign: 'left',
    cursor: 'pointer', fontFamily: 'inherit',
    transition: `background ${transicao.rapida}`,
  },

  contexto: {
    display: 'flex', flexDirection: 'column', gap: 2,
    paddingLeft: espaco.md,
    // Barra vermelha a esquerda: marca o que esta' aberto sem gastar uma
    // linha divisoria a mais numa lateral estreita.
    borderLeftWidth: 3, borderLeftStyle: 'solid', borderLeftColor: t.vermelho,
  },
  contextoRotulo: rotulo(t.textoFraco),
  // O nome do estudo tem o mesmo peso que "RitmoPatrimar" tem na lista: e'
  // a identidade da tela. Duas linhas no maximo — nome de peca importada do
  // roteiro tem 40 caracteres e encheria a lateral inteira.
  contextoTitulo: {
    ...tipo('destaque'), color: t.texto, overflowWrap: 'anywhere',
    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
  },
  contextoTexto: {
    ...tipo('micro'), color: t.textoFraco, fontWeight: 400,
    textTransform: 'none', letterSpacing: 0, overflowWrap: 'anywhere',
    display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
  },

  bloco: { display: 'flex', flexDirection: 'column', gap: espaco.xs },
  // Ferramentas ficam com o rotulo mais afastado: separacao por respiro,
  // sem mais uma linha divisoria na tela.
  blocoFerramentas: { display: 'flex', flexDirection: 'column', gap: espaco.xs, marginTop: espaco.md },
  grupoRotulo: { ...rotulo(t.textoFraco) },
  // A dica separa as duas naturezas de medicao: estudo mede ciclo, a
  // conferencia mede vazao. Sem isso o analista precisa abrir para saber.
  grupoDica: { ...tipo('micro'), color: t.textoFraco, marginBottom: espaco.xs, textTransform: 'none', letterSpacing: 0, fontWeight: 400 },
  busca: {
    width: '100%', minHeight: 38, padding: `0 ${espaco.md}px`,
    background: t.fundo, borderWidth: 1, borderStyle: 'solid', borderColor: t.borda,
    borderRadius: raio.md, color: t.texto, ...tipo('corpo'),
    fontFamily: 'inherit', outline: 'none',
  },

  item: {
    width: '100%', minHeight: 36, padding: `0 ${espaco.md}px`,
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: espaco.sm,
    background: 'transparent', border: 'none', borderRadius: raio.md,
    color: t.textoMedio, ...tipo('corpo'), textAlign: 'left',
    cursor: 'pointer', fontFamily: 'inherit',
    transition: `background ${transicao.rapida}, color ${transicao.rapida}`,
  },
  // Barra vermelha a esquerda: a marcacao nao depende so' da cor do texto.
  itemAtivo: {
    background: '#F8F9FB', color: t.texto, fontWeight: 700,
    boxShadow: `inset 3px 0 0 ${t.vermelho}`,
  },
  itemTexto: { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  contagem: {
    flexShrink: 0, minWidth: 20, padding: '0 6px', textAlign: 'center',
    borderRadius: raio.pill, background: t.fundo, color: t.textoFraco, ...tipo('micro'),
  },
  seta: { flexShrink: 0, color: t.textoFraco },

  // Unico elemento vermelho do menu e o mais alto: e' a acao principal.
  botaoPrimario: {
    width: '100%', minHeight: 46, padding: `0 ${espaco.md}px`,
    background: t.vermelho, border: 'none', borderRadius: raio.md, color: '#fff',
    ...tipo('destaque'), cursor: 'pointer', fontFamily: 'inherit',
    boxShadow: elevacao.baixa,
  },
  itemDiscreto: {
    width: '100%', minHeight: 34, padding: `0 ${espaco.md}px`,
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: espaco.sm,
    background: 'transparent', border: 'none', borderRadius: raio.md,
    color: t.textoFraco, ...tipo('legenda'), textAlign: 'left',
    cursor: 'pointer', fontFamily: 'inherit',
  },

  rodape: {
    marginTop: 'auto', paddingTop: espaco.md,
    borderTopWidth: 1, borderTopStyle: 'solid', borderTopColor: t.borda,
  },
};
