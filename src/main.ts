// ============================================================================
// Pstep Web UI — 主入口
// ============================================================================

import { Agent, type AgentMessage } from "@earendil-works/pi-agent-core";
import { getModel, type TextContent } from "@earendil-works/pi-ai";
import {
  ApiKeyPromptDialog,
  AppStorage,
  ChatPanel,
  CustomProvidersStore,
  createJavaScriptReplTool,
  IndexedDBStorageBackend,
  ProviderKeysStore,
  SessionsStore,
  SettingsDialog,
  SettingsStore,
  setAppStorage,
  ProvidersModelsTab,
  ProxyTab,
  SessionListDialog,
  registerMessageRenderer,
} from "@earendil-works/pi-web-ui";
import "@earendil-works/pi-web-ui/app.css";
import { html, render } from "lit";
import { History, Plus, Settings, Lightbulb, ListChecks, CheckCircle2 } from "lucide";
import { icon } from "@mariozechner/mini-lit";
import { Button } from "@mariozechner/mini-lit/dist/Button.js";
import "./pstep.css";

// ============================================================
// 注册自定义消息渲染器
// ============================================================

// Plan 消息渲染器
registerMessageRenderer("plan", (message: any) => {
  const content = typeof message.content === "string" ? message.content : "";
  return html`
    <div class="pstep-block plan-block">
      <div class="pstep-header">
        <span class="pstep-icon">${icon(Lightbulb, "sm")}</span>
        <span class="pstep-label">计划</span>
      </div>
      <div class="pstep-content">${content}</div>
    </div>`;
});

// Solve 消息渲染器
registerMessageRenderer("solve", (message: any) => {
  const content = typeof message.content === "string" ? message.content : "";
  return html`
    <div class="pstep-block solve-block">
      <div class="pstep-header">
        <span class="pstep-icon">${icon(ListChecks, "sm")}</span>
        <span class="pstep-label">执行</span>
      </div>
      <div class="pstep-content">${content}</div>
    </div>`;
});

// Verify 消息渲染器
registerMessageRenderer("verify", (message: any) => {
  const content = typeof message.content === "string" ? message.content : "";
  const verified = content.includes("通过") || content.includes("正确") || content.includes("完成");
  return html`
    <div class="pstep-block ${verified ? "verify-pass" : "verify-fail"}">
      <div class="pstep-header">
        <span class="pstep-icon">${icon(CheckCircle2, "sm")}</span>
        <span class="pstep-label">验证</span>
      </div>
      <div class="pstep-content">${content}</div>
    </div>`;
});

// ============================================================
// Storage Setup
// ============================================================

const settings = new SettingsStore();
const providerKeys = new ProviderKeysStore();
const sessions = new SessionsStore();
const customProviders = new CustomProvidersStore();

const backend = new IndexedDBStorageBackend({
  dbName: "pstep-web-app",
  version: 2,
  stores: [
    settings.getConfig(),
    SessionsStore.getMetadataConfig(),
    providerKeys.getConfig(),
    customProviders.getConfig(),
    sessions.getConfig(),
  ],
});

settings.setBackend(backend);
providerKeys.setBackend(backend);
customProviders.setBackend(backend);
sessions.setBackend(backend);

const storage = new AppStorage(settings, providerKeys, sessions, customProviders, backend);
setAppStorage(storage);

// ============================================================
// 注册默认网关提供商
// ============================================================

const gatewayUrl = import.meta.env.VITE_GATEWAY_URL || "http://localhost:3001";
async function registerDefaultProvider() {
  await customProviders.set({
    id: "pstep-gateway",
    name: "Pstep Gateway",
    type: "openai-completions",
    baseUrl: gatewayUrl,
    models: [{ id: "mimo-v2.5", name: "MiMo v2.5" }],
    apiKey: "pstep-gateway-key",
  });
  // Refresh the in-memory cache so Agent can find it immediately
  await customProviders.getAll();
}

// ============================================================
// Agent & Session State
// ============================================================

let currentSessionId: string | undefined;
let currentTitle = "";
let isEditingTitle = false;
let agent: Agent;
let chatPanel: ChatPanel;
let agentUnsubscribe: (() => void) | undefined;

const PSTEP_SYSTEM_PROMPT = `你是 Pstep (Panda Step) 多步推理助手。你的核心工作方式是：

## 核心原则
将复杂任务拆解为 Plan → Solve → Verify 循环。

## 工作流程

### 1. 规划 (Plan)
当收到复杂任务时，先制定计划：
- 列出需要完成的步骤
- 每个步骤要明确、可执行
- 步骤之间要有逻辑顺序

使用 **📋 计划** 标记开头。

### 2. 执行 (Solve)
按计划逐步执行：
- 一次只做一个步骤
- 完成一个再继续下一个
- 使用工具辅助执行

使用 **🔧 执行** 标记开头。

### 3. 验证 (Verify)
每完成一个步骤后验证结果：
- 检查输出是否符合预期
- 如果发现问题，回到 Solve 修正
- 如果通过，进入下一步

使用 **✅ 验证** 标记开头。

### 4. 循环
重复 Solve → Verify 直到所有步骤完成。
全部完成后给出最终总结。`;

const generateTitle = (messages: AgentMessage[]): string => {
  const firstUserMsg = messages.find((m) => m.role === "user");
  if (!firstUserMsg) return "";
  let text = "";
  const content = firstUserMsg.content;
  if (typeof content === "string") {
    text = content;
  } else {
    const textBlocks = content.filter((c): c is TextContent => c.type === "text");
    text = textBlocks.map((c) => c.text || "").join(" ");
  }
  text = text.trim();
  if (!text) return "";
  const sentenceEnd = text.search(/[.!?？。！]/);
  if (sentenceEnd > 0 && sentenceEnd <= 50) return text.substring(0, sentenceEnd + 1);
  return text.length <= 50 ? text : `${text.substring(0, 47)}...`;
};

const shouldSaveSession = (messages: AgentMessage[]): boolean => {
  return messages.some((m) => m.role === "user") && messages.some((m) => m.role === "assistant");
};

const saveSession = async () => {
  if (!storage.sessions || !currentSessionId || !agent || !currentTitle) return;
  const state = agent.state;
  if (!shouldSaveSession(state.messages)) return;
  try {
    const sessionData = {
      id: currentSessionId,
      title: currentTitle,
      model: state.model!,
      thinkingLevel: state.thinkingLevel,
      messages: state.messages,
      createdAt: new Date().toISOString(),
      lastModified: new Date().toISOString(),
    };
    const metadata = {
      id: currentSessionId,
      title: currentTitle,
      createdAt: sessionData.createdAt,
      lastModified: sessionData.lastModified,
      messageCount: state.messages.length,
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
      modelId: state.model?.id || null,
      thinkingLevel: state.thinkingLevel,
      preview: generateTitle(state.messages),
    };
    await storage.sessions.save(sessionData, metadata);
  } catch (err) {
    console.error("Failed to save session:", err);
  }
};

const updateUrl = (sessionId: string) => {
  const url = new URL(window.location.href);
  url.searchParams.set("session", sessionId);
  window.history.replaceState({}, "", url);
};

const createAgent = async (initialState?: any) => {
  if (agentUnsubscribe) agentUnsubscribe();
  agent = new Agent({
    initialState: initialState || {
      systemPrompt: PSTEP_SYSTEM_PROMPT,
      model: getModel("pstep-gateway", "mimo-v2.5"),
      thinkingLevel: "off",
      messages: [],
      tools: [],
    },
  });
  agentUnsubscribe = agent.subscribe((event: any) => {
    if (event.type === "state-update") {
      const messages = event.state.messages;
      if (!currentTitle && shouldSaveSession(messages)) currentTitle = generateTitle(messages);
      if (!currentSessionId && shouldSaveSession(messages)) {
        currentSessionId = crypto.randomUUID();
        updateUrl(currentSessionId);
      }
      if (currentSessionId) saveSession();
      renderApp();
    }
  });
  await chatPanel.setAgent(agent, {
    onApiKeyRequired: async (provider: string) => ApiKeyPromptDialog.prompt(provider),
    toolsFactory: (_agent: any, _agentInterface: any, _artifactsPanel: any, runtimeProvidersFactory: any) => {
      const replTool = createJavaScriptReplTool();
      replTool.runtimeProvidersFactory = runtimeProvidersFactory;
      return [replTool];
    },
  });
};

const loadSession = async (sessionId: string): Promise<boolean> => {
  if (!storage.sessions) return false;
  const sessionData = await storage.sessions.get(sessionId);
  if (!sessionData) { console.error("Session not found:", sessionId); return false; }
  currentSessionId = sessionId;
  const metadata = await storage.sessions.getMetadata(sessionId);
  currentTitle = metadata?.title || "";
  await createAgent({ model: sessionData.model, thinkingLevel: sessionData.thinkingLevel, messages: sessionData.messages, tools: [] });
  updateUrl(sessionId);
  renderApp();
  return true;
};

const newSession = () => {
  const url = new URL(window.location.href);
  url.search = "";
  window.location.href = url.toString();
};

// ============================================================
// Render
// ============================================================

const renderApp = () => {
  const app = document.getElementById("app");
  if (!app) return;
  const appHtml = html`
    <div style="width:100%;height:100vh;display:flex;flex-direction:column;overflow:hidden;">
      <!-- Header -->
      <div style="display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--border);flex-shrink:0;">
        <div style="display:flex;align-items:center;gap:8px;padding:8px 16px;">
          ${Button({ variant: "ghost", size: "sm", children: icon(History, "sm"),
            onClick: () => SessionListDialog.open(
              async (sid: string) => { await loadSession(sid); },
              (did: string) => { if (did === currentSessionId) newSession(); }
            ),
            title: "Sessions",
          })}
          ${Button({ variant: "ghost", size: "sm", children: icon(Plus, "sm"),
            onClick: newSession, title: "New Session",
          })}
          ${currentTitle
            ? isEditingTitle
              ? html`<input type="text" .value=${currentTitle} style="font-size:14px;border:1px solid var(--border);border-radius:4px;padding:4px 8px;width:256px;"
                  @change=${(e: Event) => {
                    const v = (e.target as HTMLInputElement).value.trim();
                    if (v && v !== currentTitle && storage.sessions && currentSessionId) {
                      storage.sessions.updateTitle(currentSessionId, v);
                      currentTitle = v;
                    }
                    isEditingTitle = false; renderApp();
                  }}
                  @keydown=${(e: KeyboardEvent) => {
                    if (e.key === "Enter" || e.key === "Escape") { isEditingTitle = false; renderApp(); }
                  }} />`
              : html`<button style="padding:4px 8px;font-size:14px;cursor:pointer;background:none;border:none;color:var(--foreground);"
                  @click=${() => { isEditingTitle = true; renderApp(); requestAnimationFrame(() => {
                    const inp = app?.querySelector('input[type="text"]') as HTMLInputElement;
                    if (inp) { inp.focus(); inp.select(); }
                  });}}>${currentTitle}</button>`
            : html`<span style="font-size:16px;font-weight:600;display:flex;align-items:center;gap:6px;">
                <span class="pstep-logo">🐼</span> Pstep
              </span>`}
        </div>
        <div style="display:flex;align-items:center;gap:4px;padding:0 8px;">
          <theme-toggle></theme-toggle>
          ${Button({ variant: "ghost", size: "sm", children: icon(Settings, "sm"),
            onClick: () => SettingsDialog.open([new ProvidersModelsTab(), new ProxyTab()]),
            title: "Settings",
          })}
        </div>
      </div>
      <!-- Chat Panel -->
      ${chatPanel}
    </div>`;
  render(appHtml, app);
};

// ============================================================
// Init
// ============================================================

async function initApp() {
  const app = document.getElementById("app");
  if (!app) throw new Error("App container not found");
  render(html`<div style="width:100%;height:100vh;display:flex;align-items:center;justify-content:center;"><div>Loading...</div></div>`, app);
  chatPanel = new ChatPanel();
  // 先注册默认网关提供商，确保 agent 创建前 provider 已就绪
  await registerDefaultProvider();
  const urlParams = new URLSearchParams(window.location.search);
  const sessionIdFromUrl = urlParams.get("session");
  if (sessionIdFromUrl) {
    const loaded = await loadSession(sessionIdFromUrl);
    if (!loaded) { newSession(); return; }
  } else {
    await createAgent();
  }
  renderApp();
}

initApp();
