/**
 * O TETO DE 12 FUNCOES SERVERLESS DO PLANO HOBBY.
 *
 * A Vercel transforma cada arquivo de `api/` numa funcao (pasta e arquivo
 * com underscore ficam de fora). No plano Hobby o teto e' 12 por deploy, e
 * este projeto vive exatamente nele.
 *
 * Passar do teto NAO quebra so' o endpoint novo: derruba o DEPLOY INTEIRO
 * — o app todo para de publicar e a producao fica parada na versao
 * anterior, sem nada na tela dizendo por que. Ja' aconteceu duas vezes:
 * quando a recuperacao de senha quis um arquivo proprio (resolvido dentro
 * de api/sessao.js) e quando a demanda semanal ganhou api/demanda.js —
 * esse derrubou o deploy do PR #73 e so' foi descoberto pelo painel da
 * Vercel, tres versoes depois (resolvido em api/_lib/demanda.js, exposto
 * por api/maquinas.js?demanda=1).
 *
 * O erro nao aparece em teste nenhum, nem no build local: `vite build` nao
 * olha a pasta api/. Este arquivo e' a unica rede que existe antes do
 * deploy — e e' por isso que ele conta arquivo, e nao rota.
 */
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const API = fileURLToPath(new URL('../api', import.meta.url));

/** Teto do plano Hobby. Migrar para o Pro e' o que libera separar. */
const TETO_HOBBY = 12;

/**
 * Os arquivos que a Vercel publica como funcao: .js dentro de api/, menos
 * o que estiver em caminho iniciado por underscore (`api/_lib/...`), que a
 * plataforma ignora de proposito — e' onde mora codigo compartilhado.
 */
function funcoes(dir = API, prefixo = '') {
  const achadas = [];
  for (const nome of readdirSync(dir)) {
    if (nome.startsWith('_')) continue;
    const caminho = join(dir, nome);
    const rota = prefixo ? `${prefixo}/${nome}` : nome;
    if (statSync(caminho).isDirectory()) achadas.push(...funcoes(caminho, rota));
    else if (nome.endsWith('.js')) achadas.push(rota);
  }
  return achadas.sort();
}

describe('funcoes serverless', () => {
  it(`cabem no teto de ${TETO_HOBBY} do plano Hobby`, () => {
    const lista = funcoes();
    expect(lista.length, `funções encontradas:\n  ${lista.join('\n  ')}`)
      .toBeLessThanOrEqual(TETO_HOBBY);
  });

  it('codigo compartilhado fica em _lib, que nao vira funcao', () => {
    // Se algum dia _lib passar a contar, o teste acima para de proteger.
    expect(funcoes().some((f) => f.startsWith('_'))).toBe(false);
  });
});
