/**
 * TEMPO DISPONIVEL — a jornada do grupo menos o que o setup come.
 *
 * E' sobre o que sobra que o ritmo exigido e' calculado, e por isso a
 * conta aparece por extenso: tres numeros lado a lado com a formula
 * embaixo de cada um. E' o que permite conferir de cabeca ("6 × 44 = 264,
 * tirei 50, sobram 214") em vez de confiar num numero que apareceu.
 */
import { useEffect, useState } from 'react';
import { est } from './estilos.js';

export default function TempoDisponivel({ tempo, grupo, maquinasDoGrupo, ocupado, aoSalvar }) {
  const {
    horas, setHoras, diasSemana, setDiasSemana, setupsDia, setSetupsDia, setupMin, setSetupMin,
    horasNum, setupHoras, conta, setupComeTudo, valores, houveMudanca,
  } = tempo;

  /**
   * O QUADRO MAIOR DA JANELA, e o que menos se mexe.
   *
   * Jornada e setup se cadastram uma vez por grupo e ficam meses iguais,
   * mas o quadro ocupava 463px dos 1625 da janela — 28% da rolagem para
   * quem veio colar a planilha da semana. Configurado e sem alteracao
   * pendente, ele recolhe para uma linha com a conta.
   *
   * Recolher nunca esconde trabalho: fica aberto enquanto NAO ha' jornada
   * cadastrada (ai' preencher e' o proprio assunto do quadro) e enquanto
   * houver mudanca por salvar. Trocar de grupo fecha de novo, porque a
   * pergunta volta a ser a do grupo novo.
   */
  const configurado = grupo?.horas_semana != null;
  const [abertoNaMao, setAbertoNaMao] = useState(false);
  useEffect(() => { setAbertoNaMao(false); }, [grupo?.id]);
  const aberto = abertoNaMao || !configurado || houveMudanca;

  if (!aberto) {
    return (
      <div style={est.bloco}>
        <div style={est.blocoTopo}>
          <div style={est.blocoTitulo}>Tempo disponível</div>
          <button type="button" style={est.botaoTexto} onClick={() => setAbertoNaMao(true)}>
            Editar
          </button>
        </div>
        {/* A CONTA EM UMA LINHA. Sem ela, recolher viraria esconder o
            numero de que o exigido de toda semana depende. */}
        <p style={est.blocoResumo}>
          {conta
            ? (
              <>
                <strong>{conta.texto.produtivas} horas-máquina produtivas</strong> na semana —{' '}
                {maquinasDoGrupo} máq. × {horasNum.toLocaleString('pt-BR')} h
                {setupHoras != null && setupHoras > 0 && <> − {conta.texto.setup} h de setup</>}.
              </>
            )
            : <>Jornada cadastrada, mas sem máquina ativa no grupo para multiplicar.</>}
        </p>
        {/* A RESSALVA DO SETUP NAO RECOLHE JUNTO: sem ele o veredito sai
            otimista pelo tempo de troca da semana inteira, e essa e' a
            informacao que menos pode ficar atras de um clique. */}
        {setupHoras == null && (
          <p style={est.blocoAviso}>
            Setup não informado — as horas acima são jornada cheia, e o veredito sai
            otimista pelo tempo de troca da semana.
          </p>
        )}
        {setupComeTudo && (
          <p style={est.blocoAviso}>
            O setup cadastrado come a jornada inteira — confira os números.
          </p>
        )}
      </div>
    );
  }

  return (
    <div style={est.bloco}>
      <div style={est.blocoTopo}>
        <div style={est.blocoTitulo}>Tempo disponível</div>
        {/* So' recolhe o que ja' esta' salvo: com mudanca pendente o botao
            sairia do caminho levando junto o que foi digitado. */}
        {configurado && !houveMudanca && (
          <button type="button" style={est.botaoTexto} onClick={() => setAbertoNaMao(false)}>
            Recolher
          </button>
        )}
      </div>
      <p style={est.blocoTexto}>
        O ritmo exigido é a demanda dividida pelo tempo que o grupo tem para produzir:
        a <strong>jornada</strong> de cada máquina menos o <strong>setup</strong> — a troca
        de peça (gabarito, batente, brocas), que acontece entre uma medição e outra e que
        o cronômetro não pega. Tudo por máquina; a tela multiplica pelas{' '}
        {maquinasDoGrupo} ativa(s) do grupo.
      </p>

      <div style={est.gradeTempo}>
        <fieldset style={est.grupoCampos}>
          <legend style={est.legendaCampos}>Jornada</legend>
          <div style={est.linhaCampos}>
            <label style={est.campoCurto}>
              <span style={est.rotuloCampo}>Horas por semana</span>
              <input
                type="number" min="0.5" max="168" step="0.1" style={est.input}
                value={horas} disabled={ocupado}
                onChange={(ev) => setHoras(ev.target.value)}
                placeholder="ex.: 44"
              />
            </label>
            <label style={est.campoCurto}>
              <span style={est.rotuloCampo}>Dias de produção</span>
              <input
                type="number" min="1" max="7" step="1" style={est.input}
                value={diasSemana} disabled={ocupado}
                onChange={(ev) => setDiasSemana(ev.target.value)}
                placeholder="ex.: 5"
              />
            </label>
          </div>
        </fieldset>
        <fieldset style={est.grupoCampos}>
          <legend style={est.legendaCampos}>Setup</legend>
          <div style={est.linhaCampos}>
            <label style={est.campoCurto}>
              <span style={est.rotuloCampo}>Setups por dia</span>
              <input
                type="number" min="0" max="100" step="1" style={est.input}
                value={setupsDia} disabled={ocupado}
                onChange={(ev) => setSetupsDia(ev.target.value)}
                placeholder="ex.: 5"
              />
            </label>
            <label style={est.campoCurto}>
              <span style={est.rotuloCampo}>Minutos por setup</span>
              <input
                type="number" min="0" max="600" step="1" style={est.input}
                value={setupMin} disabled={ocupado}
                onChange={(ev) => setSetupMin(ev.target.value)}
                placeholder="ex.: 20"
              />
            </label>
          </div>
        </fieldset>
      </div>

      {/* A CONTA, VISIVEL. Muda a cada tecla, antes de salvar, para a pessoa
          ver o efeito do que esta' digitando. */}
      {maquinasDoGrupo > 0 && horasNum > 0 && (
        <div style={est.contaTempo}>
          <div style={est.contaCaixa}>
            <span style={est.contaRotulo}>Jornada</span>
            <span style={est.contaValor}>
              {conta.texto.jornada}<span style={est.contaUnidade}>h</span>
            </span>
            <span style={est.contaFormula}>
              {maquinasDoGrupo} máq. × {horasNum.toLocaleString('pt-BR')} h
            </span>
          </div>
          <div style={est.contaCaixa}>
            <span style={est.contaRotulo}>Setup</span>
            <span style={setupHoras == null ? est.contaValorVazio : est.contaValor}>
              {setupHoras == null ? '?' : `− ${conta.texto.setup}`}
              {setupHoras != null && <span style={est.contaUnidade}>h</span>}
            </span>
            <span style={est.contaFormula}>
              {setupHoras == null
                ? 'setups/dia × dias × minutos'
                : (setupHoras === 0
                  ? 'sem troca de peça cadastrada'
                  : `${valores.setupsDia}/dia × ${valores.diasSemana} dias × ${valores.setupMin} min = ${conta.texto.porMaquina} h/máq.`)}
            </span>
          </div>
          <div style={setupComeTudo ? est.contaCaixaAlerta : est.contaCaixaResultado}>
            <span style={est.contaRotulo}>Produtivas</span>
            <span style={est.contaValor}>
              {conta.texto.produtivas}<span style={est.contaUnidade}>h</span>
            </span>
            <span style={est.contaFormula}>
              {setupComeTudo
                ? 'o setup come a jornada inteira — confira os números'
                : 'horas-máquina na semana — é sobre elas que o exigido é calculado'}
            </span>
          </div>
        </div>
      )}

      <div style={est.acoes}>
        <button
          type="button" style={houveMudanca ? est.botaoPrimario : est.botaoSecundario}
          onClick={aoSalvar} disabled={ocupado || !houveMudanca}
        >
          {ocupado ? 'Salvando...' : 'Salvar tempo disponível'}
        </button>
        {houveMudanca && !ocupado && (
          <span style={est.dica}>a conta acima já usa o que você digitou; o relatório só muda depois de salvar</span>
        )}
      </div>

      <p style={est.blocoTexto}>
        {horasNum > 0 && maquinasDoGrupo > 0
          ? (setupHoras == null
            ? (
              <>
                <strong>Setup não informado.</strong> Sem ele o relatório usa a jornada cheia e
                o veredito sai otimista exatamente pelo tempo de troca da semana — nas
                furadeiras, cinco trocas de 20 min por dia são mais de 8 h por máquina.
              </>
            )
            : (
              <>
                Setup entra <strong>uma vez só</strong>: aqui, planejado. Se alguma medição
                também marcar parada de troca/setup, o relatório tira esse tempo do ritmo de
                relógio para não contar duas vezes.
              </>
            ))
          : 'Sem as horas não há takt: o ritmo exigido é a demanda dividida pelo tempo disponível. Não assumo 44 h por conta própria — jornada é decisão de turno.'}
      </p>
      {grupo?.horas_semana == null && (
        <p style={est.blocoAviso}>
          Só administrador altera o cadastro de máquinas. Se o botão recusar, peça a
          quem administra — ou troque o seu papel no cadastro de analistas.
        </p>
      )}
    </div>
  );
}
