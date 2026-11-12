import { formatarDuracao, formatarSegundos } from '../../../domain/cronoanalise.js';
import { rotuloMotivo } from '../../../domain/crono/paradas.js';
import { MOTIVO_SEM_DEFINICAO } from '../../../domain/perdasEmbalagem.js';
import { LOGO_PATRIMAR } from '../../../theme/logo.js';
import { VERSAO } from '../../../versao.js';
import { imp } from '../conferencias/estilos.js';

const nVolumes = (n) => Math.round(n).toLocaleString('pt-BR');
const pct = (n) => `${Number(n).toFixed(1)}%`;
const horas = (h) => formatarDuracao(h * 3600000);

/**
 * FOLHA DAS PERDAS DA EMBALAGEM (v2.110.1) — A4 retrato, o mesmo modelo da
 * folha do Ritmo por maquina: cabecalho com a versao, identificacao, os
 * quadros e a legenda em palavras, e as assinaturas. Nao e' a tela no
 * papel: a tela mostra 15 produtos e um botao para o resto; a folha traz
 * TODOS, porque circula na reuniao e ninguem clica no papel.
 *
 * Recebe o relatorio ja' calculado pela tela (relatorioDePerdas) e as
 * semanas da hora extra: o que esta' na tela e' o que sai no papel.
 */
export default function ImpressaoPerdas({
  dias, r, colunas = [], avisos = [], periodo, grupos = [], porMaquina = false, umRitmo = true, truncado = false,
}) {
  const total = r.total;
  const hoje = new Date().toLocaleDateString('pt-BR');
  return (
    <div className="somente-impressao" style={imp.folha}>
      <header style={imp.cabecalho}>
        <div>
          <img src={LOGO_PATRIMAR} alt="Patrimar Móveis" style={imp.logo} />
          <h1 style={imp.titulo}>Perdas da Embalagem</h1>
        </div>
        <div style={imp.emissao}>RitmoPatrimar v{VERSAO} · emitido em {hoje}</div>
      </header>

      <section style={imp.identificacao}>
        {[
          ['Grupo', grupos.length ? grupos.join(' · ') : '—'],
          ['Período', `últimos ${dias} dias${periodo ? ` · ${periodo}` : ''}`],
          ['Medições', `${total.medicoes}${r.sobrepostas ? ` (+${r.sobrepostas} do mesmo trecho, ${r.sobrepostas === 1 ? 'contada' : 'contadas'} uma vez)` : ''}`],
          ['Setup planejado fora da conta', total.setupMs > 0 ? formatarDuracao(total.setupMs) : '—'],
          ['Volumes', nVolumes(total.volumes)],
          ['Linha medida', horas(total.horasMedidas)],
          ['Sem produzir', `${pct(total.perdaPct)} · ${formatarDuracao(total.semProduzirMs)}`],
          ['Paradas marcadas', formatarDuracao(total.paradasMs)],
          ['Paradas não marcadas', `${formatarDuracao(total.lacunasMs)} · ${total.nLacunas} ${total.nLacunas === 1 ? 'lacuna' : 'lacunas'}`],
          ['Por volume no período', `${formatarSegundos(total.periodoMs)} s`],
          ['Por volume rodando', `${formatarSegundos(total.normalMs)} s`],
          ['Volumes que deixaram de sair', nVolumes(total.volumesPerdidos)],
        ].map(([k, v]) => (
          <div key={k} style={imp.campo}>
            <span style={imp.campoRotulo}>{k}</span>
            <span style={imp.campoValor}>{v}</span>
          </div>
        ))}
      </section>
      {/* A ressalva da tela vai para o papel: a folha circula sem a tela. */}
      {truncado && (
        <p style={{ ...imp.comparativoCaixaDestaque, fontSize: 9.5, fontWeight: 700, margin: '0 0 10px' }}>
          Atenção: o período tem mais medições do que o relatório lê de uma vez (1.000). Os números são das mais
          recentes, não do período inteiro.
        </p>
      )}

      {(colunas.length > 0 || avisos.length > 0) && (
        <section style={imp.comparativo}>
          <h2 style={imp.tituloSecao}>Por que ainda precisa de hora extra</h2>
          {colunas.length > 0 && (
            <table style={imp.tabela}>
              <thead>
                <tr>
                  <th style={imp.th} />
                  {colunas.map((s) => <th key={s.chave} style={imp.thNum}>{s.rotulo}</th>)}
                </tr>
              </thead>
              <tbody>
                {[
                  ['Programa', (c) => `${nVolumes(c.demanda)} volumes`],
                  [`${porMaquina ? 'Horas de cada máquina' : 'Horas da linha'} (jornada − setup planejado)`, (c) => horas(c.horasDisponiveis)],
                  [`Precisa no ritmo medido${umRitmo ? ` (${formatarSegundos(colunas[0].periodoMs)} s)` : ''}`, (c) => horas(c.precisaPeriodo)],
                  ['Hora extra estimada', (c) => (c.horaExtra > 0 ? horas(c.horaExtra) : 'nenhuma'), true],
                  [`Precisa no ritmo normal${umRitmo ? ` (${formatarSegundos(colunas[0].normalMs)} s)` : ''}`, (c) => horas(c.precisaNormal)],
                  ['Hora extra sem as perdas', (c) => (c.horaExtraSemPerdas > 0 ? horas(c.horaExtraSemPerdas) : 'nenhuma')],
                  ['O que as perdas custam', (c) => horas(c.custoDasPerdas), true],
                ].map(([rotulo, valor, forte]) => (
                  <tr key={rotulo}>
                    <td style={{ ...imp.td, ...(forte ? { fontWeight: 700 } : {}) }}>{rotulo}</td>
                    {colunas.map((s) => (
                      <td key={s.chave} style={{ ...imp.tdNum, ...(forte ? { fontWeight: 700 } : {}) }}>{valor(s.conta)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {avisos.map((a) => <p key={a} style={imp.comparativoNota}>{a}</p>)}
          <p style={imp.comparativoNota}>
            Estimativa: o ritmo é o das medições do período, com o mix de produtos delas — não o mix da semana.
          </p>
        </section>
      )}

      {r.porMotivo.length > 0 && (
        <section style={imp.comparativo}>
          <h2 style={imp.tituloSecao}>Por que a linha parou — paradas marcadas</h2>
          <table style={imp.tabela}>
            <thead>
              <tr>
                <th style={imp.th}>Motivo</th>
                <th style={imp.thNum}>Tempo</th>
                <th style={imp.thNum}>% das paradas</th>
                <th style={imp.thNum}>Vezes</th>
              </tr>
            </thead>
            <tbody>
              {r.porMotivo.map((m) => (
                <tr key={m.motivo}>
                  <td style={{ ...imp.td, ...(m.motivo === MOTIVO_SEM_DEFINICAO ? { fontWeight: 700 } : {}) }}>
                    {rotuloMotivo(m.motivo)}
                  </td>
                  <td style={imp.tdNum}>{formatarDuracao(m.ms)}</td>
                  <td style={imp.tdNum}>{pct(m.pct)}</td>
                  <td style={imp.tdNum}>{m.vezes}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={imp.comparativoNota}>
            {formatarDuracao(r.totalMotivosMs)} de paradas com motivo. As lacunas ({formatarDuracao(total.lacunasMs)}) são as
            paradas que o cronômetro não tirou: a anotada depois aparece aqui com o motivo, mas o tempo dela está nas lacunas.
            {r.setupForaMs > 0 && ` O setup planejado marcado entre os volumes (${formatarDuracao(r.setupForaMs)}) fica fora, como na conta.`}
            {r.semDefinicaoPct >= 20 && ` ${pct(r.semDefinicaoPct)} do tempo parado está em “${rotuloMotivo(MOTIVO_SEM_DEFINICAO)}”: sem o motivo, não dá para atacar a causa.`}
          </p>
        </section>
      )}

      <h2 style={imp.tituloSecao}>Onde a linha mais perde tempo — por produto</h2>
      {/* TODOS os produtos: a tabela pode passar de uma pagina, e a regra
          geral (nao quebrar tabela) a jogaria inteira para a seguinte,
          deixando meia pagina em branco. O cabecalho se repete (thead). */}
      <table style={{ ...imp.tabela, breakInside: 'auto', pageBreakInside: 'auto' }}>
        <thead>
          <tr>
            <th style={imp.th}>Produto</th>
            <th style={imp.thNum}>Med.</th>
            <th style={imp.thNum}>Vol.</th>
            <th style={imp.thNum}>Período</th>
            <th style={imp.thNum}>Rodando</th>
            <th style={imp.thNum}>Paradas</th>
            <th style={imp.thNum}>Lacunas</th>
            <th style={imp.thNum}>Sem produzir</th>
            <th style={imp.thNum}>Vol. perd.</th>
          </tr>
        </thead>
        <tbody>
          {r.porProduto.map((p) => (
            <tr key={p.produto}>
              <td style={imp.td}>{p.produto}</td>
              <td style={imp.tdNum}>{p.medicoes}</td>
              <td style={imp.tdNum}>{nVolumes(p.volumes)}</td>
              <td style={imp.tdNum}>{formatarSegundos(p.periodoMs)} s</td>
              <td style={imp.tdNum}>{formatarSegundos(p.normalMs)} s</td>
              <td style={imp.tdNum}>{formatarDuracao(p.paradasMs)}</td>
              <td style={imp.tdNum}>{formatarDuracao(p.lacunasMs)}</td>
              <td style={{ ...imp.tdNum, fontWeight: 700 }}>{formatarDuracao(p.semProduzirMs)} · {pct(p.perdaPct)}</td>
              <td style={imp.tdNum}>{nVolumes(p.volumesPerdidos)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {total.curtas > 0 && (
        <p style={imp.comparativoNota}>
          {total.curtas === 1
            ? '1 medição com menos de 10 intervalos não separa lacuna: nela só as paradas marcadas contam.'
            : `${total.curtas} medições com menos de 10 intervalos não separam lacuna: nelas só as paradas marcadas contam.`}
        </p>
      )}

      {/* Legenda em PALAVRAS: a folha circula na reuniao e nao pode
          depender de quem a emitiu para ser entendida. */}
      <section style={imp.legenda}>
        <strong>Como ler este relatório</strong>
        <div style={imp.gradeLegenda}>
          {[
            ['Medição', 'um trecho da linha medido no tablet ou no Cronometrar por vídeo, volume a volume.'],
            ['Sem produzir', 'paradas marcadas + lacunas, sobre o tempo do 1º ao último volume de cada medição. O setup planejado no cadastro do grupo fica fora, como nas horas da linha.'],
            ['Paradas marcadas', 'tempo parado marcado no cronômetro (tablet ou vídeo), com motivo.'],
            ['Lacunas', 'intervalos entre volumes acima do dobro do normal: paradas que o cronômetro não tirou — inclusive a anotada só depois, no resultado (o motivo dela está no quadro dos motivos). Conta só o excesso. O setup anotado depois não sai da conta: só o marcado no cronômetro entre os volumes.'],
            ['Período', 'tempo por volume com tudo dentro — o que a linha entregou.'],
            ['Rodando', 'tempo por volume da linha rodando, sem paradas e sem lacunas — o ritmo que ela provou.'],
            ['Vol. perdidos', 'volumes que teriam saído no tempo parado, no ritmo rodando do próprio produto.'],
            ['Hora extra', 'o programa da semana no ritmo medido contra as horas da linha (as do takt). No ritmo rodando, a mesma conta mostra o que as perdas custam.'],
            ['Amostra', 'as medições são escolhidas por quem mede; a curta costuma pegar o trecho bom. A perda real do dia tende a ser maior.'],
            ['Produto', 'nomes iguais com e sem o código juntam; nome digitado diferente fica separado.'],
          ].map(([sigla, texto]) => (
            <div key={sigla} style={imp.itemLegenda}>
              <strong style={{ whiteSpace: 'nowrap' }}>{sigla}:</strong>
              <span>{texto}</span>
            </div>
          ))}
        </div>
      </section>

      <section style={imp.assinaturas}>
        {['Analista responsável', 'Coordenador PPCP'].map((papel) => (
          <div key={papel} style={imp.assinatura}>
            <div style={imp.linhaAssinatura} />
            <span style={imp.papelAssinatura}>{papel}</span>
          </div>
        ))}
      </section>
    </div>
  );
}
