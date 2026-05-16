import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
  build: {
    target: 'es2020',
    outDir: 'dist',
    rollupOptions: {
      external: ['@mistralai/mistralai'],
      output: {
        manualChunks: {
          'lit-core': ['lit'],
          'pi-agent': ['@earendil-works/pi-agent-core', '@earendil-works/pi-ai'],
          'pi-web-ui': ['@earendil-works/pi-web-ui'],
        },
      },
    },
  },
  optimizeDeps: {
    exclude: ['@mistralai/mistralai'],
  },
});
