import { proximasAcoes } from '../../../domain/proximasAcoes.js';
import { plural } from './formato.js';

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
export default function ProximasAcoes({ estudos, est, t, aoMedir, aoAnalisar }) {
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

