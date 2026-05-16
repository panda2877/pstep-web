# pstep-web

> 自定义 UI 层 — PlanPanel · SolveView · VerifyTimeline
>
> 基于 Lit + pi-web-ui 构建的 Pstep 多步推理前端

属于 [**Pstep Platform**](https://github.com/panda2877/pstep-engine) 的前端 UI 组件。

---

## 职责

- **PlanPanel** — Plan 展示面板，展示 AI 的推理规划
- **SolveView** — Solve 执行视图，展示逐步执行过程
- **VerifyTimeline** — Verify 时间线，展示验证结果
- 依赖 [pstep-engine](https://github.com/panda2877/pstep-engine) 提供 Agent 核心逻辑

## 技术栈

- **Lit** — Web Components 框架
- **pi-web-ui** — pi 框架的 UI 组件库（npm 依赖）
- **pstep-engine** — Agent 逻辑引擎（npm 依赖）

---

## 开发

```bash
npm install
npm run dev
```

需要本地先构建 `pstep-gateway`（端口 3001）作为 API 后端。

### npm link 串联开发

```bash
cd pstep-engine && npm link
cd pstep-web    && npm link pstep-engine
```

---

## 部署

生产环境为静态文件服务器：

```bash
npm run build
npx serve dist -p 5173 --cors
```

或使用 Docker：

```bash
docker build -t pstep-web .
docker run -p 5173:5173 pstep-web
```

---

## 与 pstep-engine 的关系

```
用户浏览器
    │
    ▼
pstep-web (UI 层)
    │
    │ 调用 Agent.prompt()
    ▼
pstep-engine (逻辑引擎, npm 依赖)
    │
    │ HTTP /v1/chat/completions
    ▼
pstep-gateway (模型网关)
```