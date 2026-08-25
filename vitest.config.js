import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    /**
     * Arquivos de teste rodam em SERIE, nao em paralelo.
     *
     * Os testes de integracao falam com um Postgres real e compartilham as
     * mesmas tabelas. Em paralelo eles se atropelam: o `DELETE FROM empresas`
     * de um arquivo apaga as empresas que o outro acabou de criar, e o
     * resultado sao falhas de chave estrangeira que nao tem nada a ver com o
     * codigo sob teste.
     *
     * O custo e' baixo — a suite inteira roda em cerca de um segundo — e o
     * ganho e' nao perder tempo investigando falha fantasma.
     */
    fileParallelism: false,
    include: ['test/**/*.test.js'],
  },
});
