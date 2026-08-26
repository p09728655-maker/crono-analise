import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { version } from './package.json';

/**
 * Publica a versao num arquivo estatico proprio.
 *
 * O app aberto no tablet nao sabe que saiu deploy: ele continua rodando o
 * bundle que baixou. Este arquivo — minusculo e sem cache — e' o que
 * permite perguntar ao servidor "qual versao esta no ar?" e avisar quem
 * ficou para tras. Nao pode ser um asset com hash no nome, porque o
 * proprio hash muda a cada build e o app velho nao saberia o novo nome.
 */
function publicarVersao() {
  return {
    name: 'publicar-versao',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'versao.json',
        source: JSON.stringify({ versao: version }),
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), publicarVersao()],
  build: {
    outDir: 'dist',
    // O tablet de chao de fabrica costuma ser modesto: separar o vendor
    // permite que o navegador reaproveite o cache entre deploys.
    rollupOptions: {
      output: {
        manualChunks: { react: ['react', 'react-dom'] },
      },
    },
  },
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:3000' },
  },
});
