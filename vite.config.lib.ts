import { defineConfig } from 'vite';

export default defineConfig({
  publicDir: false,
  build: {
    lib: {
      entry: 'index.ts',
      formats: ['es'],
      fileName: 'index',
    },
    outDir: 'dist/lib',
    emptyOutDir: true,
  },
});
