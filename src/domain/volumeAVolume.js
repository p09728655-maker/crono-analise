/**
 * O VOLUME A VOLUME EM PALAVRAS — o veredito e os numeros que a tela e a
 * folha A4 da Embalagem Takt Time escrevem.
 *
 * Mora no dominio, e nao no componente, por dois motivos: tela e papel leem
 * a MESMA frase (papel e tela dizendo coisas diferentes sobre os mesmos
 * numeros vira discussao na reuniao), e o teste precisa conferir a frase
 * que o gerente le — nao um numero intermediario que nenhuma tela mostra.
 * Foi assim que a regua errada do takt passou uma vez: o teste olhava o
 * numero certo e a tela escrevia outro.
 */
import { formatarSegundos } from './crono/formato.js';

/** Takt e intervalo em SEGUNDOS, sempre: "72.0 s", nunca "1min12s". */
const seg = (ms) => (Number.isFinite(ms) && ms > 0 ? `${formatarSegundos(ms)} s` : '—');

/** Tempo somado (lacunas): ate' um minuto em segundos, dai' em min e s. */
function tempoSomado(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return '—';
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}min${String(s % 60).padStart(2, '0')}s`;
}

/** Por que nao ha' linha de takt — em palavras, nunca so' um traco. */
export function semTakt(estado, nomeGrupo) {
  const g = nomeGrupo ? `do grupo ${nomeGrupo}` : 'do grupo';
  switch (estado) {
    case 'sem-grupo': return 'a máquina não está em nenhum grupo do cadastro, e sem grupo não há programa.';
    case 'sem-demanda': return `não há programa de produção ${g} cadastrado.`;
    case 'sem-semana': return `o programa ${g} não cobre a semana desta medição.`;
    case 'sem-horas': return `faltam as horas disponíveis ${g} na semana.`;
    case 'setup-excede': return `o setup cadastrado ${g} passa da jornada — confira o cadastro.`;
    case 'erro-programa': return 'não deu para carregar o programa agora.';
    default: return 'a medição não tem data para achar a semana.';
  }
}

/**
 * O VEREDITO. Contra o takt vai o PERIODO por volume, paradas dentro (ver
 * periodoPorPeca) — a regua do veredito da semana. As duas camadas de baixo
 * dizem de onde vem a diferenca, e a primeira que cai dentro do takt
 * aponta a acao: paradas marcadas, lacunas ou o passo da linha.
 *
 * Sem periodo (medicao sem o relogio entre toques) NAO ha' veredito: cair
 * para a linha rodando seria exatamente a regua otimista que esta tela
 * deixou de usar.
 */
export function frasesVolumeAVolume({
  leitura, takt = {}, unidade, nomeGrupo,
}) {
  const { singular, plural } = unidade;
  if (!leitura.suficiente) {
    return {
      tom: 'neutro',
      manchete: `Poucos ${plural} para ler o ritmo`,
      linhas: [`${leitura.motivo}. O gráfico mostra o que foi tocado.`],
    };
  }

  const linhas = [];
  let tom;
  let manchete;
  const periodo = leitura.periodoMs;
  const rodandoTxt = seg(leitura.mediaMs);
  const normalTxt = seg(leitura.normalMs);
  const temLacuna = leitura.lacunas.length > 0;
  const alvo = leitura.taktMs;

  if (!periodo) {
    manchete = `Com a linha rodando, saiu um ${singular} a cada ${rodandoTxt}.`;
    tom = temLacuna ? 'atencao' : 'neutro';
    linhas.push('Sem o relógio entre o primeiro e o último toque, não há veredito contra o takt: comparar a linha rodando com ele deixaria as paradas de fora.');
  } else if (alvo) {
    const abertura = `No período, saiu um ${singular} a cada ${seg(periodo)}, paradas dentro`;
    const pct = Math.abs(Math.round(((periodo / alvo) - 1) * 100));
    if (periodo <= alvo) {
      manchete = `${abertura} — dentro do takt de ${seg(alvo)}, com ${pct}% de folga.`;
      tom = temLacuna ? 'atencao' : 'atende';
    } else {
      manchete = `${abertura} — ${pct}% acima do takt de ${seg(alvo)}.`;
      tom = 'falha';
      if (leitura.mediaMs <= alvo) {
        linhas.push(`Com a linha rodando seriam ${rodandoTxt} por ${singular}, dentro do takt: o que tira a linha do takt são as paradas marcadas nesta medição.`);
      } else if (leitura.normalMs <= alvo) {
        linhas.push(`Com a linha rodando, ${rodandoTxt}; sem as lacunas, ${normalTxt}, dentro do takt: o que tira a linha do takt são as paradas que ninguém marcou.`);
      } else {
        linhas.push(`Mesmo sem parada nenhuma (${normalTxt} por ${singular}), a linha não acompanha a demanda: é o passo dela que está mais lento que o takt.`);
      }
    }
  } else {
    manchete = `No período, saiu um ${singular} a cada ${seg(periodo)}, paradas dentro; com a linha rodando, ${rodandoTxt}.`;
    tom = temLacuna ? 'atencao' : 'neutro';
    linhas.push(`Sem takt para comparar: ${semTakt(takt.estado, nomeGrupo)}`);
  }

  if (temLacuna) {
    const n = leitura.lacunas.length;
    const cerca = Math.round(leitura.pecasNoExcesso);
    linhas.push(
      `${n} ${n === 1 ? 'lacuna' : 'lacunas'} — intervalo maior que o dobro do normal (${normalTxt}) — `
      + `${n === 1 ? 'somou' : 'somaram'} ${tempoSomado(leitura.excessoMs)} além do normal`
      + `${cerca >= 1 ? `: cerca de ${cerca} ${cerca === 1 ? singular : plural} que ${cerca === 1 ? 'deixou' : 'deixaram'} de sair` : ''}. `
      + 'As paradas marcadas no cronômetro já estão fora desta conta: estas, ninguém marcou.',
    );
  } else {
    linhas.push('Nenhuma lacuna: nenhum intervalo passou do dobro do normal.');
  }
  return { tom, manchete, linhas };
}

/**
 * Os cinco numeros, na ordem em que se leem: o veredito (periodo x takt) e
 * as duas camadas do "se nao parasse". Mesma lista na tela e no papel.
 */
export function numerosDaLeitura(leitura, takt = {}, unidade) {
  if (!leitura.suficiente) {
    return [{ rotulo: 'Intervalos tocados', valor: String(leitura.n), sub: `a leitura começa com ${leitura.criterios.minIntervalos}` }];
  }
  return [
    {
      rotulo: `Por ${unidade.singular} no período`,
      valor: seg(leitura.periodoMs),
      sub: 'paradas dentro — contra o takt',
    },
    {
      rotulo: 'Takt da semana',
      valor: seg(leitura.taktMs),
      sub: leitura.taktMs ? `semana ${takt.semana} · por ${unidade.singular}` : 'sem programa para comparar',
    },
    { rotulo: 'Com a linha rodando', valor: seg(leitura.mediaMs), sub: 'sem as paradas marcadas' },
    { rotulo: 'Sem as lacunas', valor: seg(leitura.normalMs), sub: 'sem parada nenhuma' },
    {
      rotulo: 'Lacunas',
      valor: String(leitura.lacunas.length),
      sub: leitura.lacunas.length ? `${tempoSomado(leitura.excessoMs)} além do normal` : 'nenhuma',
    },
  ];
}

