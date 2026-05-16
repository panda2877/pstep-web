import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 5173,
    // 开发环境代理 /gateway/* → http://localhost:3001/*
    proxy: {
      '/gateway': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/gateway/, ''),
      },
    },
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
