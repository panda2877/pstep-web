import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 5173,
    // 开发环境代理
    proxy: {
      // /gateway/* → Gateway (模型路由)
      '/gateway': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/gateway/, ''),
      },
      // /api/* → Engine (Agent 逻辑引擎，SSE 流)
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
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
