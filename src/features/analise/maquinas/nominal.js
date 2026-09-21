/**
 * O que o formulario do cadastro manda de RITMO NOMINAL — validado ANTES
 * de sair do navegador.
 *
 * O caminho que este arquivo fecha: "15 ciclos" digitado no campo virava
 * Number("15 ciclos") = NaN, o JSON serializava NaN como null, e null no
 * servidor significa APAGAR — o nominal e a fonte sumiam com resposta 200
 * e o formulario fechando como sucesso. A validacao do servidor ("deve ser
 * numerico") nunca era alcancada, porque o numero ja' chegava como null.
 *
 * Vazio continua sendo "apagar" (e' como se diz "nao sei" depois de ter
 * dito 15); texto que nao e' numero e' ERRO, e fonte sem numero tambem —
 * a mesma regra do servidor, dita aqui antes de ele precisar dizer.
 * Virgula vale como decimal: e' como se escreve 12,5 na fabrica.
 */
export function lerNominalDoFormulario({ nominal = '', fonte = '' } = {}) {
  const textoNominal = String(nominal ?? '').trim();
  const textoFonte = String(fonte ?? '').trim();
  if (textoNominal === '') {
    if (textoFonte) throw new Error('Informe o ritmo nominal (ciclos/min) junto com a fonte — ou deixe os dois vazios');
    return { nominalCiclosMin: null, nominalFonte: null };
  }
  const n = Number(textoNominal.replace(',', '.'));
  if (!Number.isFinite(n)) {
    throw new Error(`"${textoNominal}" não é um número: o ritmo nominal é só o número, em ciclos por minuto (ex: 15 ou 12,5)`);
  }
  if (n <= 0 || n > 10000) throw new Error('O ritmo nominal deve estar entre 0,01 e 10000 ciclos por minuto');
  return { nominalCiclosMin: n, nominalFonte: textoFonte || null };
}
