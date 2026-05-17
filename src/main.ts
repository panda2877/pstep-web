// ============================================================================
// Pstep Web UI — 主入口（SSE 流模式）
// 通过 SSEAgent 消费 Engine 的 Plan/Solve/Verify 循环输出
// ============================================================================

import { type AgentMessage } from "@earendil-works/pi-agent-core";
import { type TextContent } from "@earendil-works/pi-ai";
import {
  ApiKeyPromptDialog,
  AppStorage,
  ChatPanel,
  CustomProvidersStore,
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
import { SSEAgent, type SSEMessage } from "./engine/sse-agent.js";
import "./pstep.css";

// ============================================================
// 注册自定义消息渲染器
// ============================================================

// Plan 消息渲染器
registerMessageRenderer("plan", (message: any) => {
  const content = typeof message.content === "string" ? message.content : "";
  const steps = message.steps ?? [];
  return html`
    <div class="pstep-block plan-block">
      <div class="pstep-header">
        <span class="pstep-icon">${icon(Lightbulb, "sm")}</span>
        <span class="pstep-label">计划 (${steps.length} 步)</span>
      </div>
      <div class="pstep-content">${content}</div>
      ${steps.length > 0 ? html`
        <div class="pstep-steps">
          ${steps.map((s: any, i: number) => html`
            <div class="pstep-step ${s.status === "completed" ? "completed" : s.status === "in_progress" ? "active" : ""}">
              <span class="step-num">${i + 1}</span>
              <span class="step-title">${s.title}</span>
              ${s.description ? html`<span class="step-desc">${s.description}</span>` : ""}
            </div>
          `)}
        </div>` : ""}
    </div>`;
});

// Solve 消息渲染器
registerMessageRenderer("solve", (message: any) => {
  const content = typeof message.content === "string" ? message.content : "";
  return html`
    <div class="pstep-block solve-block">
      <div class="pstep-header">
        <span class="pstep-icon">${icon(ListChecks, "sm")}</span>
        <span class="pstep-label">执行 ${message.stepNumber ? `(第 ${message.stepNumber} 步)` : ""}</span>
      </div>
      <div class="pstep-content">${content}</div>
    </div>`;
});

// Verify 消息渲染器
registerMessageRenderer("verify", (message: any) => {
  const content = typeof message.content === "string" ? message.content : "";
  const status = message.status ?? (content.includes("通过") || content.includes("正确") || content.includes("完成") ? "pass" : "fail");
  const isPass = status === "pass";
  return html`
    <div class="pstep-block ${isPass ? "verify-pass" : "verify-fail"}">
      <div class="pstep-header">
        <span class="pstep-icon">${icon(CheckCircle2, "sm")}</span>
        <span class="pstep-label">验证 ${isPass ? "✅" : "❌"}</span>
      </div>
      <div class="pstep-content">${content}</div>
      ${message.suggestions?.length > 0 ? html`
        <div class="pstep-suggestions">
          <div class="suggestion-label">建议：</div>
          ${message.suggestions.map((s: string) => html`<div class="suggestion-item">- ${s}</div>`)}
        </div>` : ""}
    </div>`;
});

// 流式消息渲染器
registerMessageRenderer("streaming", (message: any) => {
  const content = typeof message.content === "string" ? message.content : "";
  const isTool = message.isToolCall;
  if (isTool) {
    return html`
      <div class="pstep-block tool-block">
        <div class="pstep-header">
          <span class="pstep-icon">🔧</span>
          <span class="pstep-label">工具: ${message.toolName ?? "未知"}</span>
        </div>
        <div class="pstep-content">${content}</div>
      </div>`;
  }
  return html`
    <div class="pstep-block streaming-block">
      <div class="pstep-content streaming-content">${content}</div>
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
// 注册默认网关提供商（仅用于模型选择，消息走 Engine SSE）
// ============================================================

const gatewayUrl = import.meta.env.VITE_GATEWAY_URL || "/gateway";
let gatewayModels: any[] = [];

async function registerDefaultProvider() {
  const res = await fetch(`${gatewayUrl}/api/models`, {
    headers: { Authorization: Bearer pstep-gateway-key },
  });
  const meta = await res.json();
  gatewayModels = meta.models || [];

  await customProviders.set({
    id: "pstep-gateway",
    name: "Pstep Gateway",
    type: "openai-completions",
    baseUrl: gatewayUrl,
    models: gatewayModels.map((m: any) => ({ id: m.id, name: m.name })),
    apiKey: meta.apiKey,
  });
  await customProviders.getAll();
  await providerKeys.set("pstep-gateway", meta.apiKey);
  return meta;
}

// ============================================================
// SSEAgent + Session State
// ============================================================

let currentSessionId: string | undefined;
let currentTitle = "";
let isEditingTitle = false;
let sseAgent: SSEAgent;
let chatPanel: ChatPanel;
let agentUnsubscribe: (() => void) | undefined;

const generateTitle = (messages: SSEMessage[]): string => {
  const firstUserMsg = messages.find((m) => m.role === "user");
  if (!firstUserMsg) return "";
  let text = "";
  const content = (firstUserMsg as any).content;
  if (typeof content === "string") {
    text = content;
  } else if (Array.isArray(content)) {
    const textBlocks = content.filter((c: any): c is TextContent => c.type === "text");
    text = textBlocks.map((c) => c.text || "").join(" ");
  }
  text = text.trim();
  if (!text) return "";
  const sentenceEnd = text.search(/[.!?？。！]/);
  if (sentenceEnd > 0 && sentenceEnd <= 50) return text.substring(0, sentenceEnd + 1);
  return text.length <= 50 ? text : `${text.substring(0, 47)}...`;
};

const shouldSaveSession = (messages: SSEMessage[]): boolean => {
  return messages.some((m) => m.role === "user") && messages.some((m) => m.role === "assistant");
};

const saveSession = async () => {
  if (!storage.sessions || !currentSessionId || !sseAgent || !currentTitle) return;
  const messages = sseAgent.state.messages;
  if (!shouldSaveSession(messages)) return;
  try {
    const sessionData = {
      id: currentSessionId,
      title: currentTitle,
      model: sseAgent.state.model ?? { id: "engine" },
      thinkingLevel: sseAgent.state.thinkingLevel || "off",
      messages,
      createdAt: new Date().toISOString(),
      lastModified: new Date().toISOString(),
    };
    const metadata = {
      id: currentSessionId,
      title: currentTitle,
      createdAt: sessionData.createdAt,
      lastModified: sessionData.lastModified,
      messageCount: messages.length,
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
      modelId: null,
      thinkingLevel: "off",
      preview: generateTitle(messages),
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

const createSSEAgent = async (initialState?: { messages?: SSEMessage[] }) => {
  if (agentUnsubscribe) agentUnsubscribe();
  if (sseAgent) sseAgent.clear();

  const defaultModel = gatewayModels[0] || { id: "sensenova" };

  sseAgent = new SSEAgent({
    engineUrl: "/api",
    model: defaultModel,
    systemPrompt: "你是一位 Pstep 多步推理助手，采用 Plan/Solve/Verify 范式工作。",
    onSessionCreated: (newSessionId) => {
      if (!currentSessionId) {
        currentSessionId = newSessionId;
        updateUrl(newSessionId);
      }
    },
  });

  // 恢复 initialState 中的消息
  if (initialState?.messages?.length) {
    sseAgent.state.messages = [...initialState.messages];
  }

  agentUnsubscribe = sseAgent.subscribe((event: any) => {
    if (event.type === "state-update") {
      const messages = sseAgent.state.messages;
      if (!currentTitle && shouldSaveSession(messages)) currentTitle = generateTitle(messages);
      if (currentSessionId) saveSession();
      renderApp();
    }
  });

  await chatPanel.setAgent(sseAgent as any, {
    onApiKeyRequired: async (provider: string) => ApiKeyPromptDialog.prompt(provider),
    toolsFactory: () => {
      // 工具由 Engine 服务端管理，本地不创建工具
      return [];
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
  await createSSEAgent({
    messages: (sessionData.messages || []) as SSEMessage[],
  });
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
                    const inp = app?.querySelector(input[type=text]) as HTMLInputElement;
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
      <div style="flex:1;min-height:0;overflow:hidden;">${chatPanel}</div>
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
  await registerDefaultProvider();
  const urlParams = new URLSearchParams(window.location.search);
  const sessionIdFromUrl = urlParams.get("session");
  if (sessionIdFromUrl) {
    const loaded = await loadSession(sessionIdFromUrl);
    if (!loaded) { newSession(); return; }
  } else {
    await createSSEAgent();
  }
  renderApp();
}

initApp();
