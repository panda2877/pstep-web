// ============================================================================
// Pstep Web — 生产环境服务器（静态文件 + Gateway 代理）
// ============================================================================
// 功能：
// 1. 提供前端静态文件
// 2. 代理 /gateway/* → http://localhost:3001/*（Gateway）
// 3. 所有请求携带 Authorization: Bearer pstep-gateway-key
// ============================================================================

import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import path from 'path';

const app = express();
const PORT = 5173;
const GATEWAY_URL = 'http://127.0.0.1:3001';
const ENGINE_URL = 'http://127.0.0.1:4000';

// ============================================================
// 代理中间件 — /gateway/* → Gateway
// ============================================================

const gatewayProxy = createProxyMiddleware({
  target: GATEWAY_URL,
  changeOrigin: true,
  pathRewrite: {
    '^/gateway': '',
  },
  onProxyReq: (proxyReq, req, res) => {
    // 所有代理请求自动携带 API Key
    proxyReq.setHeader('Authorization', 'Bearer pstep-gateway-key');
  },
  onError: (err, req, res) => {
    console.error('[proxy] Gateway 连接失败:', err.message);
    res.status(502).json({ error: 'Gateway 连接失败', message: err.message });
  },
});

app.use('/gateway', gatewayProxy);
// Engine proxy
const engineProxy = createProxyMiddleware({
  target: ENGINE_URL,
  pathRewrite: { "^/api": "" },
  changeOrigin: true,
  onError: (err, req, res) => {
    console.error("[proxy] Engine 连接失败:", err.message);
    res.status(502).json({ error: "Engine 连接失败", message: err.message });
  },
});

app.use("/api", engineProxy);

// ============================================================
// 静态文件服务
// ============================================================

const distPath = path.resolve('/opt/pstep/web/dist');
app.use(express.static(distPath, {
  index: 'index.html',
  maxAge: 0,
}));

// SPA 回退：所有未匹配路由返回 index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

// ============================================================
// 启动
// ============================================================

app.listen(PORT, '0.0.0.0', () => {
  console.log('╔══════════════════════════════════════╗');
  console.log('║      Pstep Web + Gateway Proxy       ║');
  console.log('╚══════════════════════════════════════╝');
  console.log(`✅ 前端服务: http://0.0.0.0:${PORT}`);
  console.log(`✅ 代理层: /gateway/* → http://127.0.0.1:3001`);
  console.log(`✅ 代理层: /api/* → http://127.0.0.1:4000 (Engine)`);
  console.log(`🔒 API Key 校验: 已启用`);
});