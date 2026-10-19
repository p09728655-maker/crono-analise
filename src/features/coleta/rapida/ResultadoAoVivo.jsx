import { formatarCronometro, formatarDuracao } from '../../../domain/cronoanalise.js';
import Paradas from './Paradas.jsx';
import Observacao from './Observacao.jsx';
import { CampoMaquina, CiclosFuracao, FuracaoPassante } from './CamposDaPeca.jsx';
import { AvisoSalvar, BotaoSalvar, ComParadas, RitmoDoPeriodo, SemAParada } from './Indicadores.jsx';
import { est } from './estilos.js';

/**
 * O RESULTADO DO CRONOMETRO: o periodo fechou, e o que se ajusta agora e'
 * o que o cronometro nao sabia — maquina, peca, ciclos, a contagem lida no
 * contador da maquina e a parada esquecida no calor da coleta. Tudo
 * editavel antes de salvar, sem refazer a conferencia.
 */
export default function ResultadoAoVivo({
  crono, resultado, excede, totalParadaMs, motivos, paradas,
  maquina, aoTrocarMaquina, peca, aoTrocarPeca, ciclosPorPeca, aoTrocarCiclos,
  furacaoPassante, aoTrocarPassante,
  observacao, aoTrocarObservacao, jaSalva,
  aoNovaConferencia, unidade, marcasDescartadas, salvo, aoSalvar, aoSair,
  // Embalagem Takt Time: sem campos de furacao, e com o RESUMO proprio no
  // lugar da manchete de pecas/hora (intervalo, takt e lacunas em segundos).
  semFuracao = false, resumo = null,
  // Na embalagem o que se mede e' o PRODUTO embalado, nao a peca.
  rotuloPeca = 'PEÇA', exemploPeca = 'Ex: Lateral Mesa', ariaPeca = 'Nome da peça',
  // Para onde a medicao vai no PC — a tela nao pode mandar procurar no
  // relatorio errado. Nulo mantem os textos do Ritmo da maquina.
  destinoObservacao, avisoSalvar = null,
}) {
  const { duracaoFinal, pecasFinais, setPecasFinais } = crono;

  const editorParadas = (
    <Paradas
      motivos={motivos}
      paradas={paradas.paradas}
      resumo={paradas.total}
      duracaoMs={duracaoFinal}
      aoAdicionar={paradas.adicionar}
      aoAlterar={paradas.alterar}
      aoRemover={paradas.remover}
    />
  );

  if (!resultado) {
    // Paradas maiores que o periodo cronometrado: nao ha ritmo a calcular.
    // A tela diz isso e deixa a lista de paradas na mao para corrigir.
    if (!excede) return null;
    return (
      <section style={est.avisoParada} role="alert">
        As paradas somam {formatarDuracao(totalParadaMs)} e o período
        cronometrado tem {formatarDuracao(duracaoFinal)} — não sobra tempo de
        máquina rodando. Ajuste os minutos de parada abaixo.
        {editorParadas}
      </section>
    );
  }

  return (
    <>
      <section style={est.painelResultado} aria-label="Resultado da conferência">
        <div style={est.linhaResultado}>
          <label style={est.campoHora}>
            <span style={est.rotuloCampo}>MÁQUINA</span>
            <CampoMaquina valor={maquina} aoTrocar={aoTrocarMaquina} />
          </label>
          <label style={est.campoHora}>
            <span style={est.rotuloCampo}>{rotuloPeca}</span>
            <input
              type="text"
              placeholder={exemploPeca}
              value={peca}
              onChange={(ev) => aoTrocarPeca(ev.target.value)}
              style={est.inputTexto}
              aria-label={ariaPeca}
            />
          </label>
        </div>

        <div style={est.linhaResultado}>
          <div style={est.blocoResultado}>
            <span style={est.rotuloTempo}>TEMPO CRONOMETRADO</span>
            <span style={est.valorTempo}>{formatarCronometro(duracaoFinal)}</span>
          </div>
          <label style={est.blocoResultado}>
            <span style={est.rotuloTempo}>{unidade.plural.toUpperCase()} NO PERÍODO</span>
            {/* Editavel de proposito: quem leu o contador da maquina
                corrige aqui e o resultado recalcula na hora. */}
            <input
              type="number"
              min="0"
              inputMode="numeric"
              value={pecasFinais}
              onChange={(ev) => setPecasFinais(ev.target.value)}
              style={est.inputPecas}
              aria-label={`${unidade.plural.charAt(0).toUpperCase()}${unidade.plural.slice(1)} no período`}
            />
          </label>
        </div>

        {/* A contagem corrigida a mao nao tem toque para cada unidade: o
            intervalo um a um sairia falso, e por isso ele nao vai. Dito
            aqui, ao lado do numero que causou isso, e nao descoberto no PC. */}
        {marcasDescartadas && (
          <section style={est.aviso} role="status">
            A contagem foi corrigida à mão: o ritmo vai normalmente, mas o intervalo
            {unidade.singular === 'volume' ? ' volume a volume' : ' peça a peça'} não
            vai junto — os toques não batem com o número digitado.
          </section>
        )}

        {/* Mesma hierarquia do caminho dos horarios: a manchete e' o que
            saiu do posto; o ritmo de maquina rodando fica na linha das
            paradas. O periodo nao repete aqui — esta' no TEMPO CRONOMETRADO. */}
        {resumo || (
          <>
            <RitmoDoPeriodo calculado={resultado}>
              {!semFuracao && (
                <>
                  <CiclosFuracao valor={ciclosPorPeca} aoTrocar={aoTrocarCiclos} compacto />
                  <FuracaoPassante valor={furacaoPassante} aoTrocar={aoTrocarPassante} compacto />
                </>
              )}
            </RitmoDoPeriodo>
            <ComParadas calculado={resultado} />
            <SemAParada calculado={resultado} />
          </>
        )}

        {/* Editavel tambem aqui: parada esquecida no calor da coleta se
            corrige antes de salvar, sem refazer a conferencia. */}
        {editorParadas}

        <Observacao valor={observacao} aoTrocar={aoTrocarObservacao} jaSalva={jaSalva} destino={destinoObservacao} />

        {resultado.pecas > 0 && <BotaoSalvar salvo={salvo} aoSalvar={aoSalvar} />}
      </section>

      <AvisoSalvar texto={avisoSalvar} />

      <nav style={est.barraInferior} aria-label="Ações do resultado">
        <button type="button" style={est.botaoBarra} onClick={aoSair}>
          <span style={est.iconeBarra}>←</span>
          Sair
        </button>
        <button
          type="button"
          style={{ ...est.botaoBarra, ...est.botaoNova }}
          onClick={aoNovaConferencia}
        >
          <span style={est.iconeBarra}>▶</span>
          Nova conferência
        </button>
      </nav>
    </>
  );
}
