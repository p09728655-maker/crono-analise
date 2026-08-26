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
 * A coleta (celular) NAO tem lateral: la a tela e' pequena e a tarefa e'
 * uma so'.
 */
export default function MenuLateral({
  versao, aoVerVersao, busca, aoBuscar, grupos = [], filtro, aoFiltrar,
  aoNovoEstudo, aoImportar, aoVerConferencias, aoVerArquivados, arquivados = 0,
  aoVerChaveIa, aoTrocarModo,
}) {
  const total = grupos.reduce((acc, g) => acc + g.estudos.length, 0);

  return (
    <nav style={est.lateral} aria-label="Navegação">
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

      <div style={est.bloco}>
        <label style={est.rotuloBusca} htmlFor="busca-estudos">Buscar</label>
        <input
          id="busca-estudos"
          type="search"
          value={busca}
          onChange={(ev) => aoBuscar(ev.target.value)}
          placeholder="Produto, peça, máquina..."
          style={est.busca}
          aria-label="Buscar estudo por produto, máquina ou analista"
        />
      </div>

      {grupos.length > 0 && (
        <div style={est.bloco} role="group" aria-label="Filtrar por produto">
          <div style={est.grupoRotulo}>Estudos de tempo</div>
          <div style={est.grupoDica}>Ciclo a ciclo, com tempo padrão — ex: embalagem</div>
          <button
            type="button"
            onClick={() => aoFiltrar(null)}
            aria-current={filtro === null ? 'true' : undefined}
            style={{ ...est.item, ...(filtro === null ? est.itemAtivo : {}) }}
          >
            <span style={est.itemTexto}>Todos</span>
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

      {/* Arquivados sao ESTUDOS: ficam com os estudos, nao com as
          conferencias — agrupar pelo tipo de medicao e' o que faz o menu
          responder "onde fica a embalagem" e "onde fica a furadeira". */}
      {arquivados > 0 && (
        <div style={est.bloco}>
          <button type="button" style={est.item} onClick={aoVerArquivados}>
            <span style={est.itemTexto}>Estudos arquivados</span>
            <span style={est.contagem}>{arquivados}</span>
          </button>
        </div>
      )}

      {aoVerConferencias && (
        <div style={est.bloco}>
          <div style={est.grupoRotulo}>Conferências rápidas</div>
          <div style={est.grupoDica}>Peças/hora por posto — ex: furadeiras</div>
          <button type="button" style={est.item} onClick={aoVerConferencias}>
            <span style={est.itemTexto}>Ritmo por máquina</span>
          </button>
        </div>
      )}

      <div style={est.bloco}>
        <div style={est.grupoRotulo}>Ações</div>
        <button type="button" style={est.botaoPrimario} onClick={aoNovoEstudo}>
          + Novo estudo
        </button>
        <button type="button" style={est.item} onClick={aoImportar}>
          <span style={est.itemTexto}>Importar PDF ou planilha</span>
        </button>
        <button type="button" style={est.item} onClick={aoVerChaveIa}>
          <span style={est.itemTexto}>Chave da IA</span>
        </button>
      </div>

      <div style={est.rodape}>
        {aoTrocarModo && (
          <button type="button" style={est.item} onClick={aoTrocarModo} title="Tela de coleta (celular)">
            <span style={est.itemTexto}>Ir para a Coleta</span>
            <span aria-hidden="true" style={est.seta}>→</span>
          </button>
        )}
      </div>
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

  bloco: { display: 'flex', flexDirection: 'column', gap: espaco.xs },
  grupoRotulo: { ...rotulo(t.textoFraco) },
  // A dica separa as duas naturezas de medicao: estudo mede ciclo, a
  // conferencia mede vazao. Sem isso o analista precisa abrir para saber.
  grupoDica: { ...tipo('micro'), color: t.textoFraco, marginBottom: espaco.xs, textTransform: 'none', letterSpacing: 0, fontWeight: 400 },
  rotuloBusca: { ...rotulo(t.textoFraco), marginBottom: espaco.xs },
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

  botaoPrimario: {
    width: '100%', minHeight: 40, padding: `0 ${espaco.md}px`,
    background: t.vermelho, border: 'none', borderRadius: raio.md, color: '#fff',
    ...tipo('corpoF'), cursor: 'pointer', fontFamily: 'inherit',
    boxShadow: elevacao.baixa, marginBottom: espaco.xs,
  },

  rodape: {
    marginTop: 'auto', paddingTop: espaco.md,
    borderTopWidth: 1, borderTopStyle: 'solid', borderTopColor: t.borda,
  },
};
