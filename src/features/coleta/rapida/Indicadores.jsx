import { formatarDuracao, formatarSegundos, potencialSemParada } from '../../../domain/cronoanalise.js';
import { est } from './estilos.js';

/** Um numero com rotulo, na linha de parciais. */
export function Parcial({ rotulo, valor, sufixo }) {
  return (
    <div style={est.parcial}>
      <span style={est.parcialRotulo}>{rotulo}</span>
      <span style={est.parcialValor}>
        {valor}
        {sufixo && <span style={est.parcialSufixo}>{sufixo}</span>}
      </span>
    </div>
  );
}


/**
 * A MANCHETE do resultado — igual nos dois caminhos (horarios e ao vivo).
 *
 * O numero grande e' o que SAIU do posto no periodo — e' a producao que o
 * analista confere no contador e defende na reuniao. O ritmo com a maquina
 * rodando (o de capacidade) desce para a linha das paradas (ComParadas):
 * contexto, nao manchete. Sem parada marcada, os dois sao o mesmo.
 *
 * "Peças/min" sem dizer de qual tempo virou divergencia entre o celular e o
 * PC: aqui ele sai do PERIODO INTEIRO (acompanha a manchete), la' sai do
 * tempo com a maquina rodando. Dois numeros certos, um rotulo so' — o
 * rotulo e' que estava faltando.
 */
export function RitmoDoPeriodo({ calculado, periodo, children }) {
  if (!calculado) return null;
  return (
    <>
      <div style={est.destaqueRitmo} aria-label="Ritmo do período">
        <span style={est.valorRitmo}>{Math.round(calculado.pecasPorHoraBruto)}</span>
        <span style={est.sufixoRitmo}>
          {calculado.paradaMs > 0 ? 'peças/hora produzidas no período' : 'peças/hora'}
        </span>
      </div>
      {/* O que vem ENTRE a manchete e os parciais — no resultado ao vivo
          e' o seletor de ciclos, que precisa ficar perto do numero que
          ele explica. */}
      {children}
      <div style={est.linhaParcial}>
        {periodo != null && <Parcial rotulo="Período" valor={formatarDuracao(periodo)} />}
        <Parcial
          rotulo={calculado.paradaMs > 0 ? 'Pç/min período' : 'Peças/min'}
          valor={(calculado.pecasPorHoraBruto / 60).toFixed(1)}
        />
        <Parcial
          rotulo="Ciclo médio"
          valor={calculado.cicloMedioMs ? formatarSegundos(calculado.cicloMedioMs) : '—'}
          sufixo="s/pç"
        />
        {/* So' quando a peca fura em mais de um ciclo: com 1, o ciclo do
            motor E' o ciclo medio — repetir seria ruido. */}
        {calculado.ciclosPorPeca > 1 && (
          <Parcial
            rotulo="Ciclo motor"
            valor={calculado.cicloMotorMs ? formatarSegundos(calculado.cicloMotorMs) : '—'}
            sufixo="s/acion."
          />
        )}
      </div>
    </>
  );
}

/**
 * O COMPARATIVO no celular: o que saiu x o que teria saido no mesmo tempo.
 *
 * E' o numero que o analista leva para a reuniao — e ele nasce aqui, no
 * corredor, com a parada ainda fresca na memoria. Sem isto ele so' via
 * "13 min parados" e tinha de fazer a conta depois, no PC.
 */
export function SemAParada({ calculado }) {
  const c = potencialSemParada({
    pecas: calculado?.pecas,
    duracaoMs: calculado?.duracaoMs,
    produtivoMs: calculado?.produtivoMs,
  });
  if (!c) return null;
  return (
    <section style={est.comparativo} aria-label="Sem a parada, no mesmo tempo">
      <div style={est.comparativoRotulo}>Sem a parada, no mesmo tempo</div>
      <div style={est.comparativoLinha}>
        <span style={est.comparativoDe}>{c.pecas}</span>
        <span style={est.comparativoSeta}>→</span>
        <span style={est.comparativoPara}>{c.potencial}</span>
        {/* A perda em PECA, nao em minuto: e' o que muda a conversa. Na
            MESMA linha do numero grande — cada linha a mais empurra o
            SALVAR para baixo da dobra, e rolar de luva custa caro. */}
        <span style={est.comparativoUnidade}>peças (+{c.perdidas})</span>
      </div>
      <div style={est.comparativoSub}>
        {Math.round(c.ritmoPotencial)} pç/h · {(c.ritmoPotencial / 60).toFixed(1)} pç/min
        {' · '}{Math.round(c.ganhoPct)}% a mais
      </div>
      <div style={est.comparativoPerda}>
        é o ritmo que esta máquina fez rodando, no mesmo período — não é meta
      </div>
    </section>
  );
}

/**
 * A linha que so' existe quando ha' parada marcada.
 *
 * Mostra o outro numero — o ritmo com a maquina RODANDO — porque os dois
 * respondem perguntas diferentes: a manchete diz o que de fato saiu do
 * posto naquelas horas; este aqui dimensiona capacidade. Decisao de
 * ago/2026: a producao real lidera e o de capacidade e' contexto — antes
 * era o contrario, e o analista lia 505 onde o posto entregou 441.
 */
export function ComParadas({ calculado }) {
  if (!calculado || !calculado.paradaMs) return null;
  return (
    <div style={est.linhaParcial}>
      <Parcial rotulo="Parado" valor={formatarDuracao(calculado.paradaMs)} />
      <Parcial rotulo="Tempo rodando" valor={formatarDuracao(calculado.produtivoMs)} />
      {/* "Máq. rodando" batia de frente com o "Máquina rodando %" do
          relatorio, que e' disponibilidade: mesmo nome, 800 num lado e 87 no
          outro. O nome diz a unidade. */}
      <Parcial rotulo="Pç/h rodando" valor={String(Math.round(calculado.pecasPorHora))} sufixo="pç/h" />
      {/* O MESMO numero que o relatorio do PC mostra na coluna Peças/min:
          ritmo com a maquina rodando. Sem ele, o analista comparava o
          peças/min do periodo (aqui em cima) com o de maquina rodando (la')
          e concluia, com razao, que os tempos nao batiam. */}
      <Parcial
        rotulo="Pç/min rodando"
        valor={(calculado.pecasPorHora / 60).toFixed(1)}
        sufixo="pç/min"
      />
    </div>
  );
}

/**
 * Botao de salvar com o proprio recibo: depois de guardar ele vira
 * "✓ SALVA" e trava, para o dedo apressado nao duplicar o registro.
 * Qualquer edicao nos dados libera de novo (ver o efeito sobre `salvo`).
 *
 * O recibo dizia "SALVA NESTE APARELHO" — e passava a mensagem ERRADA:
 * o analista lia que a medicao ficou presa no celular e que "tinha que
 * mandar para o estudo". Salvar sempre ENVIOU para o relatorio do PC
 * (fila offline, sobe quando ha' rede); agora o recibo diz isso. O
 * estado por medicao ("no PC" / "aguardando envio") segue na lista.
 */
export function BotaoSalvar({ salvo, aoSalvar }) {
  return (
    <>
      <button
        type="button"
        style={{ ...est.botaoSalvar, ...(salvo === 'ok' ? est.botaoSalvarFeito : {}) }}
        onClick={aoSalvar}
        disabled={salvo === 'ok'}
      >
        {salvo === 'ok' ? '✓ SALVA — VAI PARA O RELATÓRIO DO PC' : 'SALVAR CONFERÊNCIA'}
      </button>
      {salvo === 'erro' && (
        <div style={est.erroSalvar}>
          Não foi possível salvar neste aparelho — verifique o espaço do navegador.
        </div>
      )}
    </>
  );
}


/**
 * Esta frase dizia "guarda so' neste aparelho" — e era mentira desde que a
 * sincronizacao passou a existir. Salvar SOBE para o relatorio do PC, e o
 * que ficou no aparelho sem subir sobe na proxima vez que esta tela abrir.
 * Quem mede no posto precisa saber disso antes de tocar em Salvar, nao
 * depois de ver a medicao de teste aparecer no relatorio da furadeira.
 */
export function AvisoSalvar() {
  return (
    <section style={est.aviso}>
      Salvar envia esta conferência para o relatório Ritmo por máquina, no PC,
      e guarda uma cópia neste aparelho. Para registrar ciclos e calcular
      o tempo padrão, crie um estudo.
    </section>
  );
}
