/**
 * Endereco do projeto Supabase.
 *
 * Fica NO CODIGO de proposito: a URL do projeto e a chave publicavel sao
 * identificadores publicos por desenho (qualquer pagina que fala com o
 * Supabase os entrega ao navegador). O que protege os dados e' a RLS e a
 * senha de cada usuario — nunca estes dois valores. Deixa-los aqui elimina
 * duas variaveis de ambiente que so' existiriam para serem digitadas errado.
 *
 * As envs continuam mandando quando existem — e' o que permite apontar um
 * ambiente de teste para outro projeto sem tocar no codigo.
 */
export const URL_SUPABASE = process.env.SUPABASE_URL
  || 'https://meqjsdrgwnupvreghxgm.supabase.co';

export const CHAVE_PUBLICAVEL = process.env.SUPABASE_PUBLISHABLE_KEY
  || 'sb_publishable_PxLuVvLDpq1OQVqTBt3OAg_s1jz1jpF';
