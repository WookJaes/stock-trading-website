import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('.', import.meta.url)) },
  },
  build: {
    ssr: 'worker/strategy-worker.ts',
    outDir: 'dist/worker',
    emptyOutDir: true,
    rolldownOptions: {
      output: { entryFileNames: 'strategy-worker.js' },
    },
  },
});
