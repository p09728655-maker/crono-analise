import { useEffect, useMemo, useState } from 'react';
import { DIAS_ATE_ENVELHECER, SEM_GRUPO_PAINEL, painelDeMaquinas } from '../../domain/painelFabrica.js';
import { filtrarPorPeriodo } from '../../domain/relatorioConferencias.js';
import { nomeChave } from '../../domain/cronoanalise.js';
import { listarCadastroMaquinas, listarConferenciasServidor } from '../../lib/api.js';
import { est } from './estilos.js';

/**
 * GESTAO A VISTA — monitor no chao de fabrica.
 *
 * Tela de PAREDE, nao de mesa: ninguem chega perto, ninguem clica. Ela se
 * carrega sozinha, se atualiza sozinha e nao tem nenhuma interacao — nem
 * menu, nem filtro, nem rolagem prevista. O que ela mostra tem de caber e
 * ser legivel a metros.
 *
 * O QUE ELA NAO PODE FAZER, e e' o motivo de ela existir num arquivo
 * proprio em vez de ser o relatorio esticado:
 *
 *  - NAO pode mostrar numero velho com cara de agora. O RitmoPatrimar mede
 *    por AMOSTRAGEM — o analista passa, mede vinte minutos e vai embora —
 *    e painel de parede sugere "agora" por natureza. Cada cartao carrega
 *    a idade da propria medicao, e o que passou de dois dias e' marcado.
 *  - NAO pode esconder maquina sem medicao. A que ninguem mediu ha' duas
 *    semanas e' a que mais precisa aparecer; ela vem PRIMEIRO no grupo.
 *  - NAO pode comparar maquinas de grupos diferentes. Uma CNC a 181 pc/h
 *    nao e' pior que uma furadeira a 750 — sao servicos diferentes.
 *
 * A JANELA e' de sete dias, fixa: gestao a vista fala do presente, e
 * esticar para trinta traria media de mes para uma tela que se le' como
 * "agora". Quem quer a serie inteira tem o relatorio.
 */
const JANELA_DIAS = 7;

/* De quanto em quanto tempo a tela se refaz. Dois minutos: a medicao nao
   chega mais rapido que isso (ela sobe quando o aparelho sincroniza), e
   recarregar mais vezes so' gastaria banco sem mudar numero nenhum. */
const INTERVALO_MS = 120000;

const comoHoras = (h) => (h >= 1 ? `${h.toFixed(1)} h` : `${Math.round(h * 60)} min`);

/** "há 3 h" / "há 2 dias" — a idade, como se fala. */
function comoIdade(ms) {
  if (ms == null) return null;
  const min = Math.round(ms / 60000);
  if (min < 60) return min <= 1 ? 'agora há pouco' : `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? 'há 1 dia' : `há ${d} dias`;
}

export default function PainelFabrica() {
  const [linhas, setLinhas] = useState(null);
  const [cadastro, setCadastro] = useState(null);
  const [erro, setErro] = useState(null);
  const [atualizadoEm, setAtualizadoEm] = useState(null);

  useEffect(() => {
    let vivo = true;
    async function carregar() {
      try {
        const [conf, cad] = await Promise.all([
          listarConferenciasServidor({ arquivadas: false }),
          // Falha do cadastro nao derruba o painel: sem ele o painel perde
          // o grupo e a maquina esquecida, mas segue mostrando quem mediu.
          listarCadastroMaquinas().catch(() => null),
        ]);
        if (!vivo) return;
        setLinhas(conf.conferencias || []);
        setCadastro(cad);
        setErro(null);
        setAtualizadoEm(new Date());
      } catch (e) {
        if (vivo) setErro(e.message);
      }
    }
    carregar();
    const id = setInterval(carregar, INTERVALO_MS);
    return () => { vivo = false; clearInterval(id); };
  }, []);

  /* O GRUPO de cada maquina vem do cadastro, ligado pelo nome com a mesma
     chave normalizada do resto do app: a medicao grava texto livre. */
  const grupoDe = useMemo(() => {
    const mapa = new Map();
    for (const m of cadastro?.maquinas || []) {
      if (m.grupo_codigo || m.grupo_nome) {
        mapa.set(nomeChave(m.nome), `${m.grupo_codigo || ''} · ${m.grupo_nome || ''}`.trim());
      }
    }
    return (nome) => mapa.get(nomeChave(nome)) || null;
  }, [cadastro]);

  const painel = useMemo(() => painelDeMaquinas(
    filtrarPorPeriodo(linhas || [], JANELA_DIAS),
    { maquinas: cadastro?.maquinas || [], grupoDe },
  ), [linhas, cadastro, grupoDe]);

  return (
    <div style={est.tela}>
      <header style={est.topo}>
        <div>
          <h1 style={est.titulo}>Ritmo por máquina</h1>
          {/* O PERIODO no topo, sempre. Painel de parede se le' como
              "agora"; sem esta linha, sete dias viram hoje na cabeca de
              quem passa. */}
          <p style={est.subtitulo}>
            Últimos {JANELA_DIAS} dias
            {painel.semNumero > 0 && ` · ${painel.semNumero} máquina(s) sem número atual`}
          </p>
        </div>
        <span style={est.relogio}>
          {erro
            ? 'sem conexão com o servidor'
            : (atualizadoEm
              ? `atualizado ${atualizadoEm.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
              : 'carregando...')}
        </span>
      </header>

      {linhas == null && !erro && <p style={est.vazio}>Carregando medições...</p>}

      {painel.grupos.length === 0 && linhas != null && (
        <p style={est.vazio}>
          Nenhuma máquina medida nos últimos {JANELA_DIAS} dias.
        </p>
      )}

      {painel.grupos.map((g) => (
        <section key={g.grupo} style={est.grupo}>
          <div style={est.grupoTopo}>
            <h2 style={est.grupoNome}>
              {g.grupo === SEM_GRUPO_PAINEL ? 'Sem grupo no cadastro' : g.grupo}
            </h2>
            {/* Quantas do grupo o painel NAO consegue afirmar agora. Vem
                antes de qualquer numero: media de grupo com metade dos
                postos sem medicao nao e' media do grupo. */}
            {g.semNumero > 0 && (
              <span style={est.grupoPendencia}>
                {g.semNumero} de {g.maquinas.length} sem número atual
              </span>
            )}
          </div>
          <div style={est.grade}>
            {g.maquinas.map((m) => (
              <Cartao key={m.maquina} m={m} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function Cartao({ m }) {
  if (!m.medida) {
    return (
      <div style={est.cartaoSemNumero}>
        <div style={est.maquina}>{m.maquina}</div>
        <div style={est.ritmoVazio}>—</div>
        <div style={est.pendencia}>Sem medição nos últimos {JANELA_DIAS} dias</div>
        <div style={est.linha}>está no cadastro e ninguém mediu</div>
      </div>
    );
  }

  return (
    <div style={m.velha ? est.cartaoVelho : est.cartao}>
      <div style={est.maquina}>{m.maquina}</div>
      <div style={est.ritmo}>
        {Math.round(m.ritmoRelogio)}
        <span style={est.ritmoUnidade}>pç/h</span>
      </div>
      {/* O RELOGIO e' a manchete; o rodando entra como potencial, e a
          distancia entre os dois e' o que ha' a ganhar tratando parada. */}
      <div style={est.linha}>
        {m.paradaMs > 0
          ? `${Math.round(m.ritmoRodando)} pç/h rodando · ${Math.round(m.disponibilidadePct)}% do tempo`
          : 'sem parada marcada no período'}
      </div>
      <div style={est.linha}>
        {m.pecas.toLocaleString('pt-BR')} peças em {comoHoras(m.horasObservadas)}
        {m.n > 1 ? ` · ${m.n} medições` : ''}
      </div>
      {m.maiorParada && (
        <div style={est.linha}>maior parada: {m.maiorParada.rotulo}</div>
      )}
      {/* A IDADE, sempre — e destacada quando o numero deixou de falar do
          presente. Dois dias e' o limite: uma medicao de ontem ainda
          descreve o posto de hoje; uma da semana passada atravessou troca
          de peca e de operador. */}
      <div style={m.velha ? est.idadeVelha : est.idade}>
        {m.velha
          ? `medida ${comoIdade(m.idadeMs)} — número de ${DIAS_ATE_ENVELHECER}+ dias atrás`
          : `medida ${comoIdade(m.idadeMs)}`}
      </div>
      {!m.confiavel && <div style={est.linha}>ainda em medição</div>}
    </div>
  );
}
