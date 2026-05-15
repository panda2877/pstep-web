# 🧠 Plan & Solve Platform

> 基于 [pi Agent Framework](https://github.com/earendil-works/pi) 构建的 Plan & Solve 多步推理平台
>
> 核心思想：将复杂任务拆解为 **Plan → Solve → Verify** 循环，让 AI 自主规划、执行、验证

---

## 📦 仓库一览

本平台由 **4 个 GitHub 仓库** 组成：

| # | 仓库 | 说明 | 技术栈 |
|---|------|------|--------|
| 0 | [`pi`](https://github.com/panda2877/pi) | Fork 自 earendil-works/pi 的 monorepo，**只读**，仅用于升级同步 | TypeScript |
| 1 | [`plan-solve-core`](https://github.com/panda2877/plan-solve-core) | 自定义 Agent 逻辑：Plan/Solve/Verify 消息类型、工具、钩子 | TypeScript, pi-agent-core |
| 2 | [`plan-solve-gateway`](https://github.com/panda2877/plan-solve-gateway) | 模型网关：API Key 管理、路由分发、流式转发 | Node.js |
| 3 | [`plan-solve-app`](https://github.com/panda2877/plan-solve-app) | **主仓库**：应用入口、自定义 UI、部署配置、CI/CD 编排 | TypeScript, pi-web-ui |

> 你正在看的就是 **主仓库（plan-solve-app）** 👈

---

## 🏗️ 系统架构

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│                          plan-solve-app (主仓库)                         │
│                                                                         │
│   ┌─────────────────────────────────────────────────────────────┐       │
│   │                  自定义 UI 层 (Lit + pi-web-ui)              │       │
│   │                                                              │       │
│   │   PlanPanel       SolveView       VerifyTimeline             │       │
│   │   PlanRenderer    SolveRenderer   VerifyRenderer             │       │
│   │                                                              │       │
│   │   ┌──────────────────────────────────────────────────┐       │       │
│   │   │  pi-web-ui 组件 (npm 依赖)                        │       │       │
│   │   │  AgentInterface · ChatPanel · 弹窗 · 存储         │       │       │
│   │   └──────────────────────────────────────────────────┘       │       │
│   └──────────────────────────┬──────────────────────────────────┘       │
│                              │                                         │
│   ┌──────────────────────────▼──────────────────────────────────┐       │
│   │              plan-solve-core (npm 依赖)                       │       │
│   │                                                              │       │
│   │   PlanMessage · SolveMessage · VerifyMessage                 │       │
│   │   PlanTool · SolveTool · VerifyTool                          │       │
│   │   beforeToolCall · afterToolCall · convertToLlm              │       │
│   │                                                              │       │
│   │   ┌──────────────────────────────────────────────────┐       │       │
│   │   │  pi-agent-core + pi-ai (npm 依赖)                  │       │       │
│   │   │  Agent 类 · AgentLoop · streamSimple               │       │       │
│   │   └──────────────────────────────────────────────────┘       │       │
│   └──────────────────────────────────────────────────────────────┘       │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘

                                    │ HTTP (OpenAI 兼容)
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      plan-solve-gateway (独立服务)                       │
│                                                                         │
│   POST /v1/chat/completions                                             │
│       → 解析 model → 路由 → API Key 注入 → 转发上游                      │
│       → 流式 SSE 返回                                                    │
│                                                                         │
│   零依赖 pi，可被任何客户端使用                                           │
└─────────────────────────────────────────────────────────────────────────┘

                    │                    │                    │
                    ▼                    ▼                    ▼
             ┌──────────┐        ┌──────────┐        ┌──────────┐
             │ Anthropic │        │  OpenAI  │        │  其他    │
             └──────────┘        └──────────┘        └──────────┘
```

### 数据流

```
用户在 ChatPanel 输入问题
       │
       ▼
plan-solve-app 发送消息到 Agent.prompt()
       │
       ▼
Agent → convertToLlm() → 将 Plan/Solve/Verify 消息转为 LLM 可理解格式
       │
       ▼
streamFn → plan-solve-gateway (HTTP /v1/chat/completions)
       │
       ▼
网关路由到上游 (Anthropic/OpenAI)
       │
       ▼
SSE 流式返回 → Agent 解析事件 → 工具调用 → Plan/Solve/Verify 循环
       │
       ▼
自定义渲染器将结果渲染到 UI
```

---

## 🔄 Git 更新流程

### 日常开发

```bash
# 开发前先拉取最新代码（所有仓库）
cd ~/plan-solve-app     && git pull
cd ~/plan-solve-core    && git pull
cd ~/plan-solve-gateway && git pull
cd ~/pi                 && git pull

# 开发 plan-solve-core（改完发版后，app 侧更新依赖）
cd ~/plan-solve-app
npm update plan-solve-core

# 本地调试时用 npm link 串联仓库
cd ~/plan-solve-core    && npm link
cd ~/plan-solve-app     && npm link plan-solve-core
```

### 更新 pi 上游版本

当 [earendil-works/pi](https://github.com/earendil-works/pi) 发布新版本时：

```bash
# 1. 进入 pi fork 仓库
cd ~/pi

# 2. 添加上游 remote（仅首次）
git remote add upstream https://github.com/earendil-works/pi.git

# 3. 拉取上游最新代码
git fetch upstream

# 4. 合并到你的主分支
git checkout main
git merge upstream/main

# 5. 解决可能的冲突（通常没有，因为你的改动很少）
# 如果有冲突，手动解决后：
git add .
git commit -m "chore: merge upstream pi v0.75.0"

# 6. 推送到你的 GitHub
git push origin main
```

> pi 的 fork 基本上是**只读的**，你不需要修改 pi 的源码。你的所有业务逻辑都在 `plan-solve-core` 和 `plan-solve-app` 里。

### 更新依赖版本

```bash
# pi 合并后，更新 plan-solve-core 的依赖
cd ~/plan-solve-core
npm update @org/pi-agent-core @org/pi-ai

# 测试兼容性
npm test

# 更新 plan-solve-app 的依赖
cd ~/plan-solve-app
npm update plan-solve-core @org/pi-web-ui
```

---

## 🚀 Git 发布流程

### 方式一：GitHub 一键发布（推荐）

在 `plan-solve-app` 仓库的 GitHub 页面：

1. 点击 **Actions** → **🚀 一键发布**
2. 点击 **Run workflow**
3. 输入版本号（如 `1.0.0`）
4. 点击 **Run**

系统自动完成：
```
① 给 pi fork 打 tag v1.0.0
② 给 plan-solve-core 打 tag v1.0.0 → CI 发布 npm 包
③ 给 plan-solve-gateway 打 tag v1.0.0 → CI 构建 Docker 镜像
④ 给 plan-solve-app 打 tag v1.0.0 → CI 构建 Docker 镜像
⑤ SSH 到服务器 → docker compose pull && up -d ✅
```

### 方式二：手动发布

```bash
# 1. 发布 pi fork（如果 pi 有改动）
cd ~/pi
git tag v1.0.0 && git push origin v1.0.0

# 2. 发布 plan-solve-core
cd ~/plan-solve-core
npm version 1.0.0          # 自动更新 package.json + 打 tag
git push && git push --tags

# 3. 发布 plan-solve-gateway
cd ~/plan-solve-gateway
npm version 1.0.0
git push && git push --tags

# 4. 发布 plan-solve-app
cd ~/plan-solve-app
npm version 1.0.0
git push && git push --tags
```

### 版本号规范

遵循 [SemVer](https://semver.org/)：

```
主版本.次版本.修订号

1.0.0  ← 首次稳定发布
1.1.0  ← 新增功能（向后兼容）
1.1.1  ← Bug 修复
2.0.0  ← 不兼容的 API 变更
```

所有 4 个仓库保持**同一版本号**，确保部署时组件兼容。

---

## 🐳 Git 部署流程

### 服务器架构

```
服务器 (43.173.101.44)
│
├── /root/docker-compose.yml    ← 编排所有服务
│
├── gateway 容器 (ghcr.io/org/plan-solve-gateway:latest)
│   └── 端口 3001
│
└── app 容器 (ghcr.io/org/plan-solve-app:latest)
    └── 端口 5173
```

### 服务器 docker-compose.yml

```yaml
version: '3.8'

services:
  gateway:
    image: ghcr.io/org/plan-solve-gateway:latest
    ports: ['3001:3001']
    restart: unless-stopped
    environment:
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - OPENAI_API_KEY=${OPENAI_API_KEY}

  app:
    image: ghcr.io/org/plan-solve-app:latest
    ports: ['5173:5173']
    environment:
      - GATEWAY_URL=http://gateway:3001
    depends_on: [gateway]
    restart: unless-stopped
```

### 首次部署

```bash
# 1. SSH 到服务器
ssh root@43.173.101.44

# 2. 安装 Docker（如果没有）
curl -fsSL https://get.docker.com | sh

# 3. 创建环境变量文件
cat > /root/.env << 'EOF'
ANTHROPIC_API_KEY=sk-ant-xxx
OPENAI_API_KEY=sk-xxx
EOF

# 4. 创建 docker-compose.yml（内容如上）
# 5. 启动
docker compose up -d
```

### 日常部署（一键）

```bash
# 方式一：GitHub Actions 自动部署（推荐）
# 发布后自动执行，无需手动操作

# 方式二：手动部署
ssh root@43.173.101.44 'cd /root && docker compose pull && docker compose up -d'
```

### 回滚

```bash
# 回滚到上一个版本
ssh root@43.173.101.44 '
  cd /root
  docker compose down
  # 修改 docker-compose.yml 中的 tag 为上一个版本号
  sed -i "s/:latest/:v1.0.0/g" docker-compose.yml
  docker compose pull
  docker compose up -d
'
```

---

## 🧩 各仓库职责与边界

| 仓库 | 能做什么 | 不能做什么 |
|------|----------|------------|
| **pi** (fork) | 合并上游更新，修复 bug | ❌ 不能添加业务逻辑 |
| **plan-solve-core** | 定义 Plan/Solve/Verify 消息、工具、钩子 | ❌ 不能依赖 UI 组件 |
| **plan-solve-gateway** | 路由请求、管理 API Key、用量统计 | ❌ 不能依赖 pi |
| **plan-solve-app** | 自定义 UI、渲染器、部署配置 | ❌ 不能包含 Agent 核心逻辑 |

---

## 📁 推荐目录结构

### plan-solve-core

```
plan-solve-core/
├── src/
│   ├── messages/
│   │   ├── plan.ts           ← PlanMessage (declaration merging)
│   │   ├── solve.ts          ← SolveMessage
│   │   └── verify.ts         ← VerifyMessage
│   ├── tools/
│   │   ├── plan-executor.ts  ← Plan 执行工具
│   │   ├── solve-executor.ts ← Solve 执行工具
│   │   └── verify-executor.ts← Verify 执行工具
│   ├── hooks/
│   │   ├── convert-to-llm.ts ← 自定义消息→LLM 消息转换
│   │   ├── before-tool-call.ts
│   │   └── after-tool-call.ts
│   ├── loop/
│   │   └── plan-solve-loop.ts← Plan/Solve/Verify 循环控制
│   ├── types.ts              ← 类型声明 + declaration merging
│   └── index.ts              ← 统一导出
├── package.json              ← deps: @org/pi-agent-core, @org/pi-ai
├── tsconfig.json
└── README.md
```

### plan-solve-gateway

```
plan-solve-gateway/
├── src/
│   ├── server.ts             ← HTTP 服务入口
│   ├── router.ts             ← 路由: model → upstream
│   ├── providers/
│   │   ├── anthropic.ts      ← Anthropic 适配器
│   │   └── openai.ts         ← OpenAI 适配器
│   ├── auth.ts               ← API Key 管理
│   └── types.ts
├── package.json
├── Dockerfile
└── README.md
```

### plan-solve-app

```
plan-solve-app/
├── src/
│   ├── main.ts               ← 应用入口
│   ├── components/
│   │   ├── PlanPanel.ts      ← Plan 展示面板
│   │   ├── SolveView.ts      ← Solve 执行视图
│   │   └── VerifyTimeline.ts ← Verify 时间线
│   ├── renderers/
│   │   ├── plan-renderer.ts
│   │   ├── solve-renderer.ts
│   │   └── verify-renderer.ts
│   ├── stores/
│   │   └── plan-store.ts     ← Plan 持久化存储
│   ├── styles/
│   │   └── app.css
│   └── vite-env.d.ts
├── index.html
├── package.json              ← deps: plan-solve-core, @org/pi-web-ui
├── vite.config.ts
├── tsconfig.json
├── Dockerfile
├── docker-compose.yml        ← 部署编排
└── .github/workflows/
    └── release.yml           ← 一键发布工作流
```

---

## ✅ 快速开始（首次搭建）

```bash
# 1. Fork pi
#    在 GitHub 上 fork earendil-works/pi → panda2877/pi

# 2. 克隆所有仓库
git clone https://github.com/panda2877/pi.git
git clone https://github.com/panda2877/plan-solve-core.git
git clone https://github.com/panda2877/plan-solve-gateway.git
git clone https://github.com/panda2877/plan-solve-app.git

# 3. 安装依赖
cd plan-solve-core && npm install
cd ../plan-solve-app && npm install
cd ../plan-solve-gateway && npm install

# 4. 本地开发串联
cd plan-solve-core && npm link
cd ../plan-solve-app && npm link plan-solve-core

# 5. 启动开发服务器
cd ../plan-solve-app && npm run dev
```

---

## 📝 许可证

- pi 框架: [MIT License](https://github.com/earendil-works/pi/blob/main/LICENSE)
- plan-solve-core / plan-solve-gateway / plan-solve-app: [MIT License](LICENSE)