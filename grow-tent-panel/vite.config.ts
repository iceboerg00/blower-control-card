import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    target: 'esnext',
    outDir: 'dist',
    cssCodeSplit: false,
    rollupOptions: {
      input: 'src/main.tsx',
      output: {
        inlineDynamicImports: true,
        entryFileNames: 'grow-tent-panel.js',
        // No chunks — everything in one file
        manualChunks: undefined,
      },
    },
  },
  test: {
    environment: 'node',
  },
});
