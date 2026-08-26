/**
 * Senha e sessao do analista.
 *
 * IMPORTANTE, e escrito aqui para nao se perder: isto e' IDENTIFICACAO, nao
 * controle de acesso. O token de servico (API_TOKEN) vive embutido no bundle
 * do navegador e continua abrindo a API inteira sozinho — e precisa
 * continuar, porque o tablet entra sem senha, de luva, diante da maquina.
 *
 * O que a sessao entrega e' saber QUEM fez: acaba com o mesmo analista
 * gravado em tres grafias, permite indicador por pessoa e da' rastro de quem
 * criou e alterou cada estudo. Quem depender disto para isolar empresas vai
 * se enganar; esse dia exige tirar o token do bundle, e ai' o tablet passa a
 * ter login tambem.
 *
 * Sem dependencia nova: scrypt e sha256 sao do proprio Node.
 */
import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

/** scrypt com os parametros padrao do Node (N=16384). 64 bytes de saida. */
function derivar(senha, sal) {
  return new Promise((resolve, reject) => {
    scrypt(senha, sal, 64, (erro, chave) => (erro ? reject(erro) : resolve(chave.toString('hex'))));
  });
}

/** Sal novo por usuario: duas pessoas com a mesma senha nao colidem no hash. */
export async function guardarSenha(senha) {
  const salt = randomBytes(16).toString('hex');
  return { hash: await derivar(senha, salt), salt };
}

/**
 * Confere a senha em tempo constante.
 *
 * Usuario sem senha cadastrada NAO entra — e' o caso do analista criado para
 * ser escolhido na lista de estudos, sem acesso proprio. Devolver false aqui
 * evita que "sem senha" vire "qualquer senha serve".
 */
export async function conferirSenha(senha, hash, salt) {
  if (!hash || !salt) return false;
  const tentativa = Buffer.from(await derivar(senha, salt), 'hex');
  const guardado = Buffer.from(hash, 'hex');
  if (tentativa.length !== guardado.length) return false;
  return timingSafeEqual(tentativa, guardado);
}

/**
 * Token de sessao.
 *
 * O banco guarda so' o HASH. Vazar a tabela nao entrega sessao valida a
 * ninguem — mesmo motivo pelo qual a senha tambem nao e' guardada.
 */
export const novoTokenSessao = () => randomBytes(32).toString('hex');
export const hashDoToken = (token) => createHash('sha256').update(token).digest('hex');

/**
 * Duracao da sessao: um turno longo.
 *
 * Curto demais e o analista perde o login no meio da analise; longo demais e
 * o PC da sala fica identificado como alguem que foi embora ontem.
 */
export const HORAS_DE_SESSAO = 14;
