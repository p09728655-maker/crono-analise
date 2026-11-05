/**
 * UMA SEMANA DIGITADA — para a semana reprogramada ou quando a planilha
 * nao esta' a' mao.
 *
 * Lida pelas MESMAS regras da colagem: "S38" ou "038-26", data
 * dd/mm/aaaa, pecas com ponto de milhar. Inicio e' obrigatorio aqui de
 * proposito — na colagem ele e' tolerado por causa de planilha antiga;
 * digitando uma semana, nao ha' desculpa para o casamento por numero, que
 * erra em toda semana com feriado.
 *
 * A previa mostra o que vai ser gravado, e o que ja' esta' gravado no
 * lugar: substituir sem ver o valor antigo e' como se apaga um numero
 * certo sem perceber.
 *
 * DIAS DE PRODUCAO (v2.101.0): a semana com feriado tem menos tempo que as
 * outras, e o takt dela tem de usar so' os dias trabalhados — vazio e' a
 * semana inteira. EDITAR: o "Editar" de uma linha do programa gravado
 * traz a semana para ca', com a semana travada (e' ela que se altera, nao
 * outra) — antes, alterar era apagar e digitar de novo.
 */
import { useEffect, useRef, useState } from 'react';
import {
  chaveSemana, comoDia, dataIso, emUtc, lerCodigoSemana, lerDataPtBr, numeroPtBr, periodosDoPrograma,
} from '../../../domain/demandaSemanal.js';
import { est } from './estilos.js';

const VAZIO = { semana: '', inicio: '', pecas: '', dias: '' };
/** "2026-11-03" -> "03/11/2026", como o campo de inicio se digita. */
const comoDigitado = (iso) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');

export default function SemanaManual({
  semanas, ocupado, aoIncluir,
  // A unidade do grupo (unidadeDoPosto): na embalagem o campo e' de VOLUMES
  // (v2.100.2) — "Peças" no grupo EMBALAGEM convidava a digitar produtos.
  unidade = { singular: 'peça', plural: 'peças', abrev: 'pç' },
  // Os dias de producao da JORNADA do grupo (Tempo disponivel): o padrao do
  // campo e a base do "4 de 5".
  diasDaJornada = null,
  // { semana, versao }: a semana que o "Editar" do programa gravado mandou.
  edicao = null, aoSairDaEdicao = () => {},
}) {
  const Unidade = `${unidade.plural.charAt(0).toUpperCase()}${unidade.plural.slice(1)}`;
  const ehVolume = unidade.singular === 'volume';
  const [manual, setManual] = useState(VAZIO);
  const jornada = Number(diasDaJornada) > 0 ? Math.floor(Number(diasDaJornada)) : null;
  const refBloco = useRef(null);

  const inicio = lerDataPtBr(manual.inicio);
  const semana = lerCodigoSemana(manual.semana, {
    ano: inicio?.getUTCFullYear() ?? new Date().getFullYear(),
  });
  const pecas = numeroPtBr(manual.pecas);
  // Vazio = a semana inteira. Inteiro de 1 a 7: dia alem da jornada nao
  // conta no takt (hora extra nao e' tempo disponivel), e a previa diz isso.
  const diasDigitados = manual.dias.trim();
  const dias = diasDigitados === '' ? null : Number(diasDigitados);
  const diasOk = dias === null || (Number.isInteger(dias) && dias >= 1 && dias <= 7);

  const preenchido = [manual.semana, manual.inicio, manual.pecas, manual.dias].some((v) => v.trim() !== '');
  const problemas = [
    manual.semana.trim() !== '' && !semana && 'Semana no formato S38 ou 038-26.',
    manual.inicio.trim() !== '' && !inicio && 'Início no formato dd/mm/aaaa.',
    manual.pecas.trim() !== '' && !(pecas > 0)
      && `Informe ${unidade.singular === 'peça' ? 'as' : 'os'} ${unidade.plural} como um número maior que zero.`,
    !diasOk && 'Dias de produção: um número inteiro de 1 a 7, ou vazio para a semana inteira.',
  ].filter(Boolean);
  const pronto = Boolean(semana && inicio && pecas > 0 && diasOk);
  const jaGravada = pronto
    ? (semanas || []).find((s) => s.chave === chaveSemana(semana)) || null
    : null;
  /* O periodo que a semana vai cobrir, ja' contando a seguinte gravada:
     termina na vespera dela (periodosDoPrograma), como a tabela mostra. */
  const periodo = pronto
    ? periodosDoPrograma([
      ...(semanas || []).filter((s) => s.chave !== chaveSemana(semana)),
      { ano: semana.ano, numero: semana.numero, pecas, inicio: dataIso(inicio), novo: true },
    ]).find((x) => x.semana.novo) || null
    : null;

  /* O "Editar" de uma linha: a semana vem para o formulario, aberto e a'
     vista. A versao muda a cada clique — editar a mesma semana duas vezes
     seguidas tambem recarrega o que estava gravado. */
  useEffect(() => {
    const s = edicao?.semana;
    if (!s) return;
    setManual({
      semana: s.chave,
      inicio: comoDigitado(s.inicio),
      pecas: Number(s.pecas).toLocaleString('pt-BR'),
      dias: s.diasProducao != null ? String(s.diasProducao) : '',
    });
    setAberto(true);
    refBloco.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }, [edicao?.versao]);
  const editando = Boolean(edicao?.semana);

  function sairDaEdicao() {
    setManual(VAZIO);
    aoSairDaEdicao();
  }

  // Limpa so' depois de gravar: falha de rede com os campos ja' vazios
  // devolveria o trabalho de digitar de novo. Os dias vao SEMPRE (numero
  // ou null): e' assim que o servidor sabe que vazio quer dizer "a semana
  // inteira" e limpa o que estava — a colagem, que nao os tem, nao mexe.
  async function incluir() {
    const ok = await aoIncluir([{
      ano: semana.ano, numero: semana.numero, pecas, inicio: dataIso(inicio), diasProducao: dias,
    }]);
    if (ok) {
      setManual(VAZIO);
      if (editando) aoSairDaEdicao();
    }
  }

  /**
   * CAMINHO DE EXCECAO, recolhido por padrao.
   *
   * A demanda entra por COLAGEM — e' o que o proprio quadro de baixo diz e
   * o que o dominio documenta. Digitar uma semana serve para a
   * reprogramada ou para quando a planilha nao esta' a' mao, e assim
   * mesmo ocupava 190px acima da caixa de colagem, empurrando o caminho
   * principal para fora da tela.
   *
   * O rascunho SOBREVIVE ao recolher: o estado mora aqui e o componente
   * nao desmonta — so' o formulario deixa de ser desenhado.
   */
  const [aberto, setAberto] = useState(false);

  if (!aberto) {
    return (
      <div style={est.bloco} ref={refBloco}>
        <div style={est.blocoTopo}>
          <div style={est.blocoTitulo}>Incluir uma semana</div>
          <button type="button" style={est.botaoTexto} onClick={() => setAberto(true)}>
            {preenchido ? 'Voltar ao que eu digitava' : 'Digitar uma semana à mão'}
          </button>
        </div>
        <p style={est.blocoResumo}>
          Para uma semana reprogramada ou quando a planilha não está à mão.
        </p>
      </div>
    );
  }

  return (
    <div style={est.bloco} ref={refBloco}>
      <div style={est.blocoTopo}>
        <div style={est.blocoTitulo}>{editando ? `Alterar a semana ${edicao.semana.chave}` : 'Incluir uma semana'}</div>
        {editando ? (
          <button type="button" style={est.botaoTexto} onClick={sairDaEdicao} disabled={ocupado}>
            Cancelar alteração
          </button>
        ) : (
          <button type="button" style={est.botaoTexto} onClick={() => setAberto(false)}>
            Recolher
          </button>
        )}
      </div>
      <p style={est.blocoTexto}>
        Para uma semana reprogramada ou quando a planilha não está à mão. Semana como
        o PCP escreve (<strong>S38</strong>), início é o primeiro dia de produção dela
        {ehVolume
          ? <> (na embalagem, o primeiro dia de embalar), e <strong>volumes</strong> são as caixas da semana — um rack de 2 volumes conta 2, não 1.</>
          : <> (a data de CORTE MDF da aba), peças é o TOTAL SEMANA.</>}
        {' '}<strong>Dias de produção</strong>: só para semana com feriado ou parada
        programada (ex.: 4) — o takt usa as horas desses dias. Vazio é a semana inteira.
        {' '}Semana que já existe é substituída.
      </p>
      <div style={est.linhaCampos}>
        <label style={est.campoEstreito}>
          <span style={est.rotuloCampo}>Semana</span>
          {/* Editando, a semana trava: e' ELA que se altera. Trocar o codigo
              aqui gravaria outra semana e deixaria a antiga como estava. */}
          <input
            type="text" style={est.input} value={manual.semana} disabled={ocupado || editando}
            onChange={(ev) => setManual((m) => ({ ...m, semana: ev.target.value }))}
            placeholder="S38" aria-label="Semana"
          />
        </label>
        <label style={est.campoEstreito}>
          <span style={est.rotuloCampo}>Início</span>
          <input
            type="text" style={est.input} value={manual.inicio} disabled={ocupado}
            onChange={(ev) => setManual((m) => ({ ...m, inicio: ev.target.value }))}
            placeholder="08/09/2026" aria-label="Início" inputMode="numeric"
          />
        </label>
        <label style={est.campoEstreito}>
          <span style={est.rotuloCampo}>{Unidade}</span>
          <input
            type="text" style={est.input} value={manual.pecas} disabled={ocupado}
            onChange={(ev) => setManual((m) => ({ ...m, pecas: ev.target.value }))}
            placeholder={ehVolume ? '8.500' : '121.900'} aria-label={Unidade} inputMode="numeric"
          />
        </label>
        <label style={est.campoEstreito}>
          <span style={est.rotuloCampo}>Dias de produção</span>
          <input
            type="text" style={est.input} value={manual.dias} disabled={ocupado}
            onChange={(ev) => setManual((m) => ({ ...m, dias: ev.target.value }))}
            placeholder={jornada ? `${jornada} (inteira)` : 'inteira'} aria-label="Dias de produção" inputMode="numeric"
          />
        </label>
        <button
          type="button" style={pronto ? est.botaoPrimario : est.botaoSecundario}
          onClick={incluir} disabled={ocupado || !pronto}
        >
          {ocupado ? 'Gravando...' : (editando ? 'Salvar alteração' : (jaGravada ? 'Substituir semana' : 'Incluir semana'))}
        </button>
      </div>
      {preenchido && (
        <div style={est.previa}>
          {pronto ? (
            <div style={est.previaTitulo}>
              {chaveSemana(semana)} · {comoDia(inicio)} a{' '}
              {comoDia(periodo?.fim ?? new Date(inicio.getTime() + (6 * 86400000)), { ano: true })} ·{' '}
              <strong>{pecas.toLocaleString('pt-BR')}</strong> {unidade.plural} ·{' '}
              {textoDosDias(dias, jornada)}
              {jaGravada && (
                <span style={est.previaItem}>
                  {' '}— hoje está com {jaGravada.pecas.toLocaleString('pt-BR')}
                  {jaGravada.inicio ? ` (início ${comoDia(emUtc(jaGravada.inicio))}` : ' (sem data'}
                  {jaGravada.diasProducao != null ? `, ${jaGravada.diasProducao} dias)` : ', semana inteira)'}
                </span>
              )}
            </div>
          ) : (
            <div style={est.previaTitulo}>
              {problemas.length ? problemas.join(' ') : `Preencha semana, início e ${unidade.plural}.`}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** O que os dias digitados fazem com o takt, em palavras. */
function textoDosDias(dias, jornada) {
  if (dias == null) return jornada ? `semana inteira (${jornada} dias)` : 'semana inteira';
  if (!jornada) return `${dias} dias de produção — informe os dias da jornada em Tempo disponível`;
  if (dias >= jornada) {
    return dias > jornada
      ? `${dias} dias — além dos ${jornada} da jornada: hora extra não entra no takt, vale a semana inteira`
      : `${dias} de ${jornada} dias: a semana inteira`;
  }
  return `${dias} de ${jornada} dias de produção: o takt usa ${Math.round((dias / jornada) * 100)}% das horas`;
}
