import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  conferenciaRapida, formatarDuracao, formatarSegundos, leituraPecaAPeca, periodoPorPeca, unidadeDoPosto,
} from '../../domain/cronoanalise.js';
import { useMotivosDoGrupo } from '../../lib/motivosParada.js';
import { useWakeLock, vibrar } from '../../lib/hooks.js';
import { carregarMaquinas, produtosDoGrupo, useCadastroMaquinas } from '../../lib/maquinas.js';
import { useParadasDoPeriodo } from './rapida/useParadasDoPeriodo.js';
import { useCronometroAoVivo } from './rapida/useCronometroAoVivo.js';
import { useHistoricoLocal } from './rapida/useHistoricoLocal.js';
import { Parcial } from './rapida/Indicadores.jsx';
import { est } from './rapida/estilos.js';
import CronometroAoVivo from './rapida/CronometroAoVivo.jsx';
import ResultadoAoVivo from './rapida/ResultadoAoVivo.jsx';
import { CampoProduto } from './rapida/CamposDaPeca.jsx';
import Historico from './rapida/Historico.jsx';
import { useTaktDaSemana } from '../../lib/taktDaSemana.js';
import { motivoSemTakt } from './embalagem/motivoSemTakt.js';

const VOLUME = unidadeDoPosto('EMBALAGEM');
const ehEmbalagem = (grupo) => unidadeDoPosto(grupo?.nome).singular === 'volume';
const nada = () => {};

/**
 * EMBALAGEM TAKT TIME — o volume embalado contra o takt, em segundos.
 *
 * Funcao PROPRIA, separada do Ritmo da maquina, a pedido do PPCP: na
 * embalagem a pergunta nao e' "quantas pecas por hora", e' "cada volume
 * esta' saindo dentro do takt?". Por isso esta tela nao tem formulario de
 * horarios nem campo de furacao: so' a maquina da embalagem, o produto e
 * um botao — e, enquanto o cronometro roda, o intervalo do ULTIMO volume
 * ao lado do takt da semana.
 *
 * Por baixo, e' a mesma medicao do Ritmo da maquina: o mesmo cronometro,
 * as mesmas paradas, a mesma fila offline e a mesma tabela no banco. Uma
 * medicao feita aqui aparece no relatorio de ritmo como qualquer outra — a
 * separacao e' de TRABALHO, nao de dado.
 *
 * O TAKT vem do programa da semana do grupo EMBALAGEM, que o PCP cola em
 * VOLUMES (ver useTaktDaSemana). Nao e' digitado aqui: takt digitado no
 * chao de fabrica vira o takt que cada um acha.
 */
export default function EmbalagemTaktTime({ aoSair }) {
  const cadastro = useCadastroMaquinas();
  /* 'buscando' | 'ok' | 'falhou'. Sem isto, o instante antes do cadastro
     chegar — ou o tablet sem rede e sem cadastro guardado — dizia "peca ao
     administrador para cadastrar": culpava o cadastro quando faltava rede. */
  const [busca, setBusca] = useState('buscando');
  useEffect(() => {
    let vivo = true;
    carregarMaquinas().then((r) => { if (vivo) setBusca(r ? 'ok' : 'falhou'); });
    return () => { vivo = false; };
  }, []);

  /* A maquina da embalagem: so' as do grupo EMBALAGEM, ativas. Com uma so'
     (o caso de hoje), ela ja' vem escolhida — nada a tocar antes de medir. */
  const gruposEmbalagem = useMemo(
    () => (cadastro.grupos || []).filter(ehEmbalagem),
    [cadastro],
  );
  const maquinas = useMemo(() => {
    const ids = new Set(gruposEmbalagem.map((g) => g.id));
    return (cadastro.maquinas || []).filter((m) => m && m.ativa !== false && ids.has(m.grupo_id));
  }, [cadastro, gruposEmbalagem]);
  const [maquinaId, setMaquinaId] = useState(null);
  const maquina = maquinas.find((m) => m.id === maquinaId) || maquinas[0] || null;
  const grupo = gruposEmbalagem.find((g) => g.id === maquina?.grupo_id) || null;
  const maquinasDoGrupo = maquinas.filter((m) => m.grupo_id === grupo?.id).length;
  // Os motivos e os produtos DA EMBALAGEM (cadastro do PC, por grupo): a
  // embalagem nao ve' "troca de broca", e o produto e' escolhido da lista.
  const motivos = useMotivosDoGrupo(grupo?.id);
  const produtos = useMemo(() => produtosDoGrupo(cadastro, grupo?.id), [cadastro, grupo?.id]);

  const [produto, setProduto] = useState('');
  const [observacao, setObservacao] = useState('');

  const takt = useTaktDaSemana({ grupo, maquinasDoGrupo });
  const paradas = useParadasDoPeriodo(motivos);
  // Com largada: o INICIAR so' arma, e o relogio abre no primeiro toque.
  const crono = useCronometroAoVivo({ paradas, comLargada: true });
  const historico = useHistoricoLocal();

  useEffect(() => {
    historico.invalidar();
  }, [maquina?.id, produto, crono.pecasFinais, paradas.paradas, crono.fase]);

  useWakeLock(crono.rodando);
  useEffect(() => {
    if (!crono.rodando) return undefined;
    const aoFechar = (ev) => { ev.preventDefault(); ev.returnValue = ''; };
    window.addEventListener('beforeunload', aoFechar);
    return () => window.removeEventListener('beforeunload', aoFechar);
  }, [crono.rodando]);

  const resultado = useMemo(
    () => conferenciaRapida({ duracaoMs: crono.duracaoFinal, pecas: crono.pecasFinais, paradas: paradas.emMs }),
    [crono.duracaoFinal, crono.pecasFinais, paradas.emMs],
  );
  const excede = crono.duracaoFinal > 0 && paradas.total.totalMs >= crono.duracaoFinal;

  // As marcas so' valem com a contagem que elas explicam (ver ConferenciaRapida).
  const marcasConferem = crono.marcasFinais.length > 0
    && Number(crono.pecasFinais) === crono.marcasFinais.length;
  /* A regua do takt: o tempo por volume no relogio, paradas dentro, entre o
     primeiro e o ultimo toque (ver periodoPorPeca). Ao vivo, o relogio so'
     anda a cada toque — uma parada em curso nao faz o aviso piscar; ela
     entra no proximo volume. Sem toques que expliquem a contagem (contagem
     corrigida a mao), nao ha' tempo por volume: a tela mostra vazio. */
  const descontarSetup = Boolean(takt.setupPlanejado);
  const porVolumeAoVivo = periodoPorPeca({
    relogioEntreMarcasMs: crono.relogioEntreMarcasMs, volumes: crono.pecas,
    setupNoTrechoMs: crono.setupEntreMarcasMs, setupPlanejado: descontarSetup,
  });
  const porVolumeFinal = marcasConferem ? periodoPorPeca({
    relogioEntreMarcasMs: crono.relogioEntreMarcasMs, volumes: crono.marcasFinais.length,
    setupNoTrechoMs: crono.setupEntreMarcasMs, setupPlanejado: descontarSetup,
  }) : null;
  const leitura = useMemo(
    () => (marcasConferem
      ? leituraPecaAPeca({ marcasMs: crono.marcasFinais, taktMs: takt.taktMs, periodoPorPecaMs: porVolumeFinal })
      : null),
    [marcasConferem, crono.marcasFinais, takt.taktMs, porVolumeFinal],
  );

  const salvar = () => historico.salvar({
    calculado: resultado, maquina: maquina?.nome || '', peca: produto, paradas: paradas.emMs, observacao,
    horaInicial: null, horaFinal: null,
    marcasMs: marcasConferem ? crono.marcasFinais : null,
    marcasRelogioMs: marcasConferem ? crono.relogioEntreMarcasMs : null,
    marcasSetupMs: marcasConferem ? crono.setupEntreMarcasMs : null,
  });

  const comecar = useCallback(() => {
    if (historico.salvo === 'ok') setObservacao('');
    crono.comecar();
  }, [crono.comecar, historico.salvo]);

  const novaMedicao = useCallback(() => {
    setObservacao('');
    crono.novaConferencia();
    vibrar(30);
  }, [crono.novaConferencia]);

  const nomesEmbalagem = new Set(maquinas.map((m) => m.nome.trim().toLowerCase()));
  const historicoDaEmbalagem = historico.historico
    .filter((c) => nomesEmbalagem.has(String(c.maquina || '').trim().toLowerCase()));

  return (
    <div style={{ ...est.tela, ...(crono.rodando ? {} : est.telaRolavel) }}>
      <header style={est.cabecalho}>
        <button type="button" onClick={aoSair} style={est.botaoVoltar} aria-label="Voltar para a lista">
          ←
        </button>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={est.titulo}>Embalagem Takt Time</div>
          <div style={est.subtitulo}>Volume a volume, em segundos</div>
        </div>
        <span style={est.selo}>EMBALAGEM</span>
      </header>

      {crono.fase === 'pronto' && (
        <>
          <section style={est.formHoras} aria-label="O que vai ser medido">
            <label style={est.campoHora}>
              <span style={est.rotuloCampo}>MÁQUINA</span>
              {maquinas.length > 1 ? (
                <select
                  value={maquina?.id || ''}
                  onChange={(ev) => { setMaquinaId(ev.target.value); vibrar(30); }}
                  style={est.selectMaquina}
                  aria-label="Máquina da embalagem"
                >
                  {maquinas.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
                </select>
              ) : (
                <span style={est.itemPeca}>{maquina?.nome || '—'}</span>
              )}
            </label>
            <label style={est.campoHora}>
              <span style={est.rotuloCampo}>PRODUTO</span>
              <CampoProduto
                valor={produto} aoTrocar={setProduto} produtos={produtos}
                aria="Produto embalado" placeholder="Ex: Rack Sirius 1.6"
              />
            </label>

            <CartaoTakt takt={takt} />
          </section>

          {maquina ? (
            /* onClick, nao onPointerDown: comecar troca a tela inteira, e o
               toque que ainda nao terminou cairia no botao de baixo. */
            <button type="button" onClick={comecar} style={{ ...est.botaoGrande, ...est.botaoIniciar, ...est.botaoVivo }}>
              <span style={est.rotuloBotao}>▶ INICIAR MEDIÇÃO</span>
            </button>
          ) : (
            <section style={est.aviso} role="status">
              {semMaquina(busca, cadastro)}
            </section>
          )}

          <Historico
            historico={historicoDaEmbalagem}
            naFila={historico.naFila}
            aoRemover={historico.remover}
            abrev={VOLUME.abrev}
            jaEsta="na Embalagem Takt Time, no PC"
            vaiPara="para a Embalagem Takt Time, no PC"
          />
          <div style={est.rodape} />
        </>
      )}

      {crono.rodando && (
        <CronometroAoVivo
          crono={crono}
          parcial={null}
          totalParadaMs={paradas.total.totalMs}
          motivos={motivos}
          unidade={VOLUME}
          modoTakt
          taktMs={takt.taktMs}
          porVolumeMs={porVolumeAoVivo}
        />
      )}

      {crono.fase === 'resultado' && (
        <ResultadoAoVivo
          crono={crono}
          resultado={resultado}
          excede={excede}
          totalParadaMs={paradas.total.totalMs}
          motivos={motivos}
          paradas={paradas}
          maquina={maquina?.nome || ''} aoTrocarMaquina={nada} maquinaFixa={maquina?.nome || '—'}
          peca={produto} aoTrocarPeca={setProduto} produtos={produtos}
          ciclosPorPeca={1} aoTrocarCiclos={nada}
          furacaoPassante={false} aoTrocarPassante={nada}
          observacao={observacao} aoTrocarObservacao={setObservacao} jaSalva={historico.salvo === 'ok'}
          aoNovaConferencia={novaMedicao}
          unidade={VOLUME}
          marcasDescartadas={crono.marcasFinais.length > 0 && !marcasConferem}
          semFuracao
          rotuloPeca="PRODUTO"
          exemploPeca="Ex: Rack Sirius 1.6"
          ariaPeca="Produto embalado"
          destinoObservacao="na Embalagem Takt Time, no PC"
          avisoSalvar={'Salvar envia esta medição para a Embalagem Takt Time, no PC, com o '
            + 'intervalo de cada volume, e guarda uma cópia neste aparelho.'}
          resumo={resultado && (
            <ResumoTakt resultado={resultado} leitura={leitura} takt={takt} porVolumeMs={porVolumeFinal} />
          )}
          salvo={historico.salvo}
          aoSalvar={salvar}
          aoSair={aoSair}
        />
      )}
    </div>
  );
}

/** O takt da semana antes de comecar — ou, sem ele, o porque. */
function CartaoTakt({ takt }) {
  const motivo = motivoSemTakt(takt.estado);
  if (!(takt.taktMs > 0) && !motivo) return null;
  return (
    <div style={est.destaqueRitmo} aria-label="Takt da semana">
      {takt.taktMs > 0 ? (
        <>
          <span style={est.valorRitmo}>{formatarSegundos(takt.taktMs)}</span>
          <span style={est.sufixoRitmo}>
            s por volume — takt da semana {takt.semana}
            {takt.semRede ? ' (programa guardado neste aparelho)' : ''}
          </span>
        </>
      ) : (
        <span style={est.sufixoRitmo}>Takt: {motivo}</span>
      )}
    </div>
  );
}

/**
 * O RESUMO do periodo que fechou: o que saiu (volumes/hora, paradas dentro)
 * e como saiu (tempo por volume no relogio contra o takt, e as lacunas). A leitura
 * completa, com grafico e a lista das lacunas, fica no PC.
 */
function ResumoTakt({
  resultado, leitura, takt, porVolumeMs,
}) {
  const suficiente = leitura?.suficiente;
  // O tempo por volume vale com poucos volumes (e' relogio, nao leitura);
  // so' some sem toques que expliquem a contagem.
  const acima = takt.taktMs > 0 && porVolumeMs > takt.taktMs;
  return (
    <>
      <div style={est.destaqueRitmo} aria-label="Volumes por hora no período">
        <span style={est.valorRitmo}>{Math.round(resultado.pecasPorHoraBruto)}</span>
        <span style={est.sufixoRitmo}>
          {resultado.paradaMs > 0 ? 'volumes/hora produzidos no período' : 'volumes/hora'}
        </span>
      </div>
      <div style={est.linhaParcial}>
        {/* O tempo POR VOLUME do periodo, paradas dentro, e' o que se
            compara com o takt — a regua do programa da semana. */}
        <Parcial
          rotulo={acima ? 'Por vol ▲ takt' : 'Por volume'}
          valor={porVolumeMs ? formatarSegundos(porVolumeMs) : '—'}
          sufixo="s"
          tom={acima ? 'atencao' : null}
        />
        <Parcial rotulo="Takt" valor={takt.taktMs > 0 ? formatarSegundos(takt.taktMs) : '—'} sufixo="s" />
        <Parcial rotulo="Lacunas" valor={suficiente ? String(leitura.lacunas.length) : '—'} />
        <Parcial rotulo="Parado" valor={resultado.paradaMs > 0 ? formatarDuracao(resultado.paradaMs) : '—'} />
      </div>
      {leitura && !suficiente && (
        <section style={est.aviso} role="status">
          Poucos volumes para ler o intervalo: {leitura.motivo}. O tempo por volume vale;
          as lacunas, ainda não.
        </section>
      )}
      {!(takt.taktMs > 0) && motivoSemTakt(takt.estado) && (
        <section style={est.aviso} role="status">Sem takt para comparar: {motivoSemTakt(takt.estado)}</section>
      )}
    </>
  );
}

/** Por que nao ha' maquina para medir — rede, cadastro ou grupo. */
function semMaquina(busca, cadastro) {
  const temCadastro = (cadastro.maquinas || []).length > 0;
  if (!temCadastro && busca === 'buscando') return 'Buscando o cadastro de máquinas…';
  if (!temCadastro && busca === 'falhou') {
    return 'Sem rede e sem o cadastro de máquinas neste aparelho. Conecte à rede uma vez para '
      + 'baixar o cadastro — depois ele fica guardado e a medição funciona sem rede.';
  }
  return 'Nenhuma máquina no grupo EMBALAGEM. Peça ao administrador para cadastrar no PC, em '
    + 'Ferramentas → Máquinas — sem ela não há takt nem tela da embalagem no PC.';
}
