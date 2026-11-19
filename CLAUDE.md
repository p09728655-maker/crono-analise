# RitmoPatrimar · Estudo de Tempos (crono-analise) — instruções do projeto

App React 18 + Vite: o PC de análise e o tablet de coleta. API em `api/`
(funções da Vercel) e Postgres em `db/schema.sql`, migrado sozinho no build de
produção (`scripts/migrar.mjs`). **A memória do projeto é o `README.md`**: o
porquê de cada regra, os casos reais e as armadilhas. Antes de mexer numa
área, leia a seção dela.

## Teste de regressão: TODA mudança leva o seu (PPCP, 19/11/2026)
*"colocar no md toda vez criar teste de regressão"*
- **Defeito corrigido** → um teste que FALHA com o defeito de volta. Confira
  por mutação: desfaça a correção, rode, veja o teste falhar, refaça. Teste que
  passa com e sem a correção não prova nada.
- **Conta, regra ou função nova** → teste do comportamento, com um caso real
  (os números do dia em que o pedido apareceu, quando houver).
- **Tela ou fluxo novo ou mudado** → o e2e da tela clica, vê e grava como o
  usuário. O teste prova o EFEITO (o número, a linha que some, o aviso que
  aparece), não só que a função foi chamada.
- **Banco ou API** → teste de integração contra Postgres
  (`test/api.integracao.test.js`).
- O teste vai no MESMO commit da mudança. Sem teste não se entrega; quando não
  der para testar, o commit e a resposta dizem por quê e o que foi conferido à
  mão.
- Onde: unidade em `test/*.test.js` (Vitest, achadas sozinhas); ponta a ponta
  em `test/e2e/*.e2e.mjs`; dado real em `test/fixtures/` (só números, sem dado
  de cliente).

## Antes de todo commit
- `npx vitest run` · `npm run lint` · `node test/checar-estilos.mjs` ·
  `npm run build`.
- O e2e do que foi tocado, com `npm run dev -- --port 5199 --strictPort` de pé:
  `E2E_BASE=http://localhost:5199 node test/e2e/<arquivo>.e2e.mjs` — conte os
  `FALHA` (na nuvem, com `CHROMIUM_PATH=/opt/pw-browsers/chromium`).
- Mexeu em banco ou API: Postgres local com o `db/schema.sql` aplicado (duas
  vezes: ele é idempotente) e
  `TEST_DATABASE_URL=postgres://… npx vitest run test/api.integracao.test.js test/painel.integracao.test.js`
  (sem a variável, essas suítes pulam caladas).
- Versão: `package.json`, `package-lock.json` e `src/versao.js` juntos, com o
  changelog escrito para o usuário.
- O revisor do projeto é o agente `revisor` (`.claude/agents/revisor.md`): ele
  bloqueia mudança sem teste de regressão.
