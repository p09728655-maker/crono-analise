import { useCallback, useEffect, useMemo, useState } from 'react';
import { conferenciaRapida, duracaoEntreHoras, nomeChave } from '../../domain/cronoanalise.js';
import { useMotivosParada } from '../../lib/motivosParada.js';
import { useWakeLock, vibrar } from '../../lib/hooks.js';
import { carregarMaquinas, useMaquinas } from '../../lib/maquinas.js';
import { useParadasDoPeriodo } from './rapida/useParadasDoPeriodo.js';
import { useCronometroAoVivo } from './rapida/useCronometroAoVivo.js';
import { useHistoricoLocal } from './rapida/useHistoricoLocal.js';
import { useRascunho } from './rapida/useRascunho.js';
import { est } from './rapida/estilos.js';
import FormularioHorarios from './rapida/FormularioHorarios.jsx';
import ResultadoHorarios from './rapida/ResultadoHorarios.jsx';
import CronometroAoVivo from './rapida/CronometroAoVivo.jsx';
import ResultadoAoVivo from './rapida/ResultadoAoVivo.jsx';
import Historico from './rapida/Historico.jsx';

/**
 * CONFERENCIA RAPIDA — hora inicial, hora final, pecas. Sem cadastro.
 *
 * Cenario: o analista PASSA pelo posto as 7:00, marca a hora, segue o
 * caminho dele, volta as 7:10, marca de novo, le o contador da maquina
 * (150 pecas) e a conta sai — 900 pc/h, ciclo medio 4s. Ninguem fica
 * parado segurando cronometro, entao o caminho principal e' o formulario
 * de horarios, com botao "Agora" para carimbar a hora na passada e campos
 * livres para digitar de cabeca depois do fato.
 *
 * O cronometro ao vivo continua na mesma tela, como alternativa, para
 * quem quer ficar diante da maquina contando peca a peca.
 *
 * Decisoes que vem desse cenario:
 *  - Salvar (opcional, com o nome da peca) guarda a conferencia NESTE
 *    aparelho e a manda ao relatorio do PC pela fila offline. Registro
 *    oficial, com tempo padrao, e' papel do estudo. A tela diz isso com
 *    todas as letras.
 *  - O resultado recalcula a cada tecla: preencheu os tres campos, a
 *    conta esta' na tela. Sem botao "calcular" — ele so' atrasaria.
 *  - A quantidade de pecas e' EDITAVEL tambem no resultado do cronometro,
 *    para quem cronometrou ao vivo mas contou pelo contador da maquina.
 *  - PARADAS entram no periodo: setup, falta de peca, manutencao. Sem elas,
 *    a mesma furadeira aparece lenta no dia de troca de lote e rapida no
 *    dia de lote longo — e o ritmo nunca fecha com o que o posto entrega.
 *    O ritmo sai do tempo em que a maquina RODOU; o do periodo inteiro
 *    continua na tela, porque e' ele que explica o que saiu no turno.
 *  - Mesma ergonomia da coleta: alvo gigante, vibracao, tema escuro,
 *    tela acesa enquanto cronometra.
 *
 * Este arquivo e' o ARRANJO. Cada responsabilidade mora num hook em
 * rapida/: as paradas do periodo, o cronometro ao vivo, o historico
 * salvo no aparelho (e o caminho dele ate' o PC) e o rascunho que
 * sobrevive ao aparelho apagar. As secoes da tela sao componentes sem
 * estado proprio. Aqui ficam os campos do periodo, as contas que juntam
 * tudo e o que acontece entre um periodo e o proximo.
 */
export default function ConferenciaRapida({ aoSair }) {
  // A lista vem do cadastro da fabrica (Ferramentas > Motivos de parada) e
  // cai nos motivos de fabrica quando ainda nao ha cadastro nem cache.
  const motivos = useMotivosParada();

  // Formulario de horarios (caminho principal).
  const [horaInicial, setHoraInicial] = useState('');
  const [horaFinal, setHoraFinal] = useState('');
  const [pecasPeriodo, setPecasPeriodo] = useState('');

  // Maquina e peca.
  const [maquina, setMaquina] = useState('');
  const [peca, setPeca] = useState('');
  // Ciclos de FURACAO da peca: 1 acionamento do motor (lateral simples),
  // 2 (sobe e desce) ou 3. E' dado da PECA, por isso mora ao lado dela.
  const [ciclosPorPeca, setCiclosPorPeca] = useState(1);

  /**
   * O SELO do cabecalho nomeia o POSTO — o grupo da maquina escolhida no
   * cadastro (FURADEIRA, FRESADORA, EMBALAGEM). Antes ele dizia sempre
   * "FURADEIRA", o que passou a ser mentira no dia em que o cadastro
   * ganhou outros grupos. Sem maquina escolhida, ou sem grupo, o selo nao
   * aparece: melhor nada do que um posto errado.
   */
  const cadastroDeMaquinas = useMaquinas();
  const seloDoPosto = useMemo(() => {
    const alvo = nomeChave(maquina);
    if (!alvo) return null;
    const m = cadastroDeMaquinas.find((x) => nomeChave(x.nome) === alvo);
    return m?.grupo_nome ? String(m.grupo_nome).toUpperCase() : null;
  }, [cadastroDeMaquinas, maquina]);

  // Cadastro de maquinas: atualiza o cache do aparelho quando ha rede.
  // Sem rede, a lista ja vista continua valendo (ver lib/maquinas.js).
  useEffect(() => { carregarMaquinas(); }, []);

  const paradas = useParadasDoPeriodo(motivos);
  const crono = useCronometroAoVivo({ paradas });
  const rascunho = useRascunho({
    campos: { maquina, peca, ciclosPorPeca, horaInicial, horaFinal, pecasPeriodo, paradas: paradas.paradas },
    aoRestaurar: (r) => {
      setMaquina((v) => v || r.maquina || '');
      setPeca((v) => v || r.peca || '');
      setCiclosPorPeca((v) => (v > 1 ? v : Number(r.ciclosPorPeca) || 1));
      setHoraInicial((v) => v || r.horaInicial || '');
      setHoraFinal((v) => v || r.horaFinal || '');
      setPecasPeriodo((v) => v || r.pecasPeriodo || '');
      paradas.restaurar(r.paradas);
    },
  });
  const historico = useHistoricoLocal({ aoGuardar: rascunho.limpar });

  // Mudou qualquer dado, a conferencia na tela ja' e' outra: libera salvar
  // de novo em vez de fingir que a alteracao tambem esta' guardada.
  useEffect(() => {
    historico.invalidar();
  }, [maquina, peca, ciclosPorPeca, horaInicial, horaFinal, pecasPeriodo, crono.pecasFinais, paradas.paradas, crono.fase]);

  // Tela acesa tambem durante o setup cronometrado: o analista esta' de
  // maos ocupadas na troca, e o aparelho apagando pausaria a medicao.
  const medindo = crono.rodando || Boolean(paradas.setupCrono);
  useWakeLock(medindo);

  // Recarregar no meio da conferencia (ou de um setup cronometrado)
  // perderia o tempo medido.
  useEffect(() => {
    if (!medindo) return undefined;
    const aoFechar = (ev) => { ev.preventDefault(); ev.returnValue = ''; };
    window.addEventListener('beforeunload', aoFechar);
    return () => window.removeEventListener('beforeunload', aoFechar);
  }, [medindo]);

  /* ------------------------------------------------------ as contas */
  const parcial = useMemo(
    () => conferenciaRapida({ duracaoMs: crono.decorrido, pecas: crono.pecas, paradas: paradas.emMs, ciclosPorPeca }),
    [crono.decorrido, crono.pecas, paradas.emMs, ciclosPorPeca],
  );
  const resultado = useMemo(
    () => conferenciaRapida({ duracaoMs: crono.duracaoFinal, pecas: crono.pecasFinais, paradas: paradas.emMs, ciclosPorPeca }),
    [crono.duracaoFinal, crono.pecasFinais, paradas.emMs, ciclosPorPeca],
  );
  // A conta dos horarios sai a cada tecla: preencheu, apareceu.
  const duracaoHoras = useMemo(
    () => duracaoEntreHoras(horaInicial, horaFinal),
    [horaInicial, horaFinal],
  );
  const resultadoHoras = useMemo(
    () => (duracaoHoras > 0
      ? conferenciaRapida({ duracaoMs: duracaoHoras, pecas: pecasPeriodo, paradas: paradas.emMs, ciclosPorPeca })
      : null),
    [duracaoHoras, pecasPeriodo, paradas.emMs, ciclosPorPeca],
  );
  // Paradas maiores que o periodo: sobra zero de maquina rodando e nao ha
  // ritmo a calcular. A tela diz isso em vez de sumir com o resultado.
  const paradasExcedem = duracaoHoras > 0 && paradas.total.totalMs >= duracaoHoras;
  const paradasExcedemVivo = crono.duracaoFinal > 0 && paradas.total.totalMs >= crono.duracaoFinal;

  /* --------------------------------------- de um periodo ao proximo */
  const salvar = (calculado, horarios) => historico.salvar({
    calculado, maquina, peca, paradas: paradas.emMs,
    horaInicial: horarios ? horaInicial : null,
    horaFinal: horarios ? horaFinal : null,
  });

  /**
   * Proxima peca na MESMA maquina: emenda o periodo (a nova hora inicial
   * e' a hora final da anterior — o analista continua parado no posto) e
   * limpa peca e quantidade. A maquina fica: trocar de peca nao e' trocar
   * de posto.
   */
  const outraPeca = useCallback(() => {
    setPeca('');
    setPecasPeriodo('');
    // Peca nova pode furar em outro numero de ciclos: volta ao padrao.
    setCiclosPorPeca(1);
    setHoraInicial(horaFinal || '');
    setHoraFinal('');
    paradas.limpar();
    vibrar(30);
  }, [horaFinal, paradas.limpar]);

  /**
   * Mais um periodo da MESMA peca.
   *
   * E' o caminho da REFERENCIA: o criterio da maquina fecha com 3
   * conferencias e 30 min rodando, e o jeito de medir isso e' repetir a
   * mesma peca em periodos separados. "Comecar outra peca" obrigava a
   * redigitar nome e ciclos tres vezes — aqui peca e ciclos ficam, so' o
   * horario emenda (a parada e' do periodo que acabou e sai igual).
   */
  const maisUmPeriodo = useCallback(() => {
    setPecasPeriodo('');
    setHoraInicial(horaFinal || '');
    setHoraFinal('');
    paradas.limpar();
    vibrar(30);
  }, [horaFinal, paradas.limpar]);

  return (
    <div style={{ ...est.tela, ...(crono.rodando ? {} : est.telaRolavel) }}>
      <header style={est.cabecalho}>
        <button type="button" onClick={aoSair} style={est.botaoVoltar} aria-label="Voltar para a lista">
          ←
        </button>
        <div style={{ minWidth: 0, flex: 1 }}>
          {/* "Ritmo da FURADEIRA" era um nome errado desde que o cadastro
              passou a ter fresadora, embalagem e o que mais vier: a tela
              mede o ritmo de QUALQUER posto — o que ela nao faz e'
              cronometrar ciclo a ciclo. O selo a direita nomeia o GRUPO da
              maquina escolhida, que e' o posto de verdade. */}
          <div style={est.titulo}>Ritmo da máquina</div>
          <div style={est.subtitulo}>Peças/hora do posto · sem cronometrar ciclo</div>
        </div>
        {seloDoPosto && <span style={est.selo}>{seloDoPosto}</span>}
      </header>

      {crono.fase === 'pronto' && (
        <>
          <FormularioHorarios
            maquina={maquina} aoTrocarMaquina={setMaquina}
            peca={peca} aoTrocarPeca={setPeca}
            ciclosPorPeca={ciclosPorPeca} aoTrocarCiclos={setCiclosPorPeca}
            horaInicial={horaInicial} aoTrocarHoraInicial={setHoraInicial}
            horaFinal={horaFinal} aoTrocarHoraFinal={setHoraFinal}
            pecasPeriodo={pecasPeriodo} aoTrocarPecas={setPecasPeriodo}
            duracaoMs={duracaoHoras}
            motivos={motivos}
            paradas={paradas}
          />

          <ResultadoHorarios
            resultado={resultadoHoras}
            duracaoMs={duracaoHoras}
            totalParadaMs={paradas.total.totalMs}
            excede={paradasExcedem}
            salvo={historico.salvo}
            aoSalvar={() => salvar(resultadoHoras, true)}
            aoMaisUmPeriodo={maisUmPeriodo}
            aoOutraPeca={outraPeca}
          />

          <div style={est.divisorOu}>
            <span style={est.traco} />
            <span style={est.textoOu}>ou fique no posto e conte peça a peça</span>
            <span style={est.traco} />
          </div>

          {/* onClick, nao onPointerDown: comecar troca a tela inteira, e o
              toque que ainda nao terminou cairia no botao que aparecer
              embaixo do dedo — "Parou" ou, pior, "Encerrar". Aqui uns
              milissegundos a mais nao custam nada: o periodo tem minutos. */}
          <button type="button" onClick={crono.comecar} style={{ ...est.botaoGrande, ...est.botaoIniciar, ...est.botaoVivo }}>
            <span style={est.rotuloBotao}>▶ CRONOMETRAR AO VIVO</span>
          </button>

          <Historico historico={historico.historico} naFila={historico.naFila} aoRemover={historico.remover} />

          <div style={est.rodape} />
        </>
      )}

      {crono.rodando && (
        <CronometroAoVivo
          crono={crono}
          parcial={parcial}
          totalParadaMs={paradas.total.totalMs}
          motivos={motivos}
        />
      )}

      {crono.fase === 'resultado' && (
        <ResultadoAoVivo
          crono={crono}
          resultado={resultado}
          excede={paradasExcedemVivo}
          totalParadaMs={paradas.total.totalMs}
          motivos={motivos}
          paradas={paradas}
          maquina={maquina} aoTrocarMaquina={setMaquina}
          peca={peca} aoTrocarPeca={setPeca}
          ciclosPorPeca={ciclosPorPeca} aoTrocarCiclos={setCiclosPorPeca}
          salvo={historico.salvo}
          aoSalvar={() => salvar(resultado, false)}
          aoSair={aoSair}
        />
      )}
    </div>
  );
}
