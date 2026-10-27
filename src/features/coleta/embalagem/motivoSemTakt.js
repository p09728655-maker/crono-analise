/**
 * Por que nao ha' takt no tablet da embalagem, em palavras de chao de
 * fabrica. O takt em si vem de lib/taktDaSemana.js.
 *
 * null = nao avisar. Programa nao colado e' assunto do PCP, nao de quem
 * esta' no tablet: la' ninguem tem o que fazer com o aviso, e a tela do PC
 * (Embalagem Takt Time) continua dizendo que falta o programa.
 */
export function motivoSemTakt(estado, { semRede = false } = {}) {
  // Sem rede, o que o aparelho guardou pode ser so' de outra semana (na
  // virada, por exemplo): dizer que o programa "nao cobre" culparia o PCP.
  if (semRede && estado === 'sem-semana') return 'Sem rede: o programa desta semana ainda não chegou a este aparelho.';
  switch (estado) {
    case 'carregando': return 'Buscando o programa da semana…';
    case 'sem-rede': return 'Sem rede: o programa da semana ainda não chegou a este aparelho.';
    case 'sem-grupo': return 'A máquina não está no grupo EMBALAGEM do cadastro.';
    case 'sem-demanda': return null;
    case 'sem-semana': return 'O programa da embalagem não cobre esta semana.';
    case 'sem-horas': return 'Faltam as horas da semana do grupo EMBALAGEM no cadastro.';
    case 'sem-dias': return 'Faltam os dias de produção da semana do grupo EMBALAGEM no cadastro.';
    case 'setup-excede': return 'O setup cadastrado da embalagem passa da jornada.';
    default: return 'Sem takt para esta semana.';
  }
}
