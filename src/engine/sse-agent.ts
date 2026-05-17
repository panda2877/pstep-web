/**
 * SSEAgent — 通过 SSE 流消费 Engine 的 Pstep 响应
 * 模拟 pi-agent-core 的 Agent 接口，使 ChatPanel 无需改造即可使用
 */

import type { Agent, AgentOptions, AgentEvent, AgentMessage } from "@earendil-works/pi-agent-core";

export interface SSEAgentOptions {
  engineUrl?: string;
  model?: string;
  systemPrompt?: string;
  onSessionCreated?: (sessionId: string, title?: string) => void;
}

export interface SSEMessage extends AgentMessage {
  type?: "plan" | "solve" | "verify" | "streaming" | "done" | "error" | "tool_call" | "tool_result";
  stepId?: string;
  stepNumber?: number;
  status?: "pass" | "fail" | "needs_revision";
  feedback?: string;
  suggestions?: string[];
  isToolCall?: boolean;
  toolName?: string;
  toolCallId?: string;
}

export class SSEAgent {
  private options: SSEAgentOptions;
  state: {
    messages: SSEMessage[];
    model?: any;
    thinkingLevel: string;
  };
  private subscribers: Array<(event: AgentEvent) => void> = [];
  private sessionId: string | null = null;
  private isProcessing = false;
  private abortController: AbortController | null = null;

  constructor(options: SSEAgentOptions) {
    this.options = {
      engineUrl: options.engineUrl || "/api",
      model: options.model,
      systemPrompt: options.systemPrompt,
      onSessionCreated: options.onSessionCreated,
    };
    this.state = {
      messages: [],
      thinkingLevel: "off",
    };
    if (options.model) {
      this.state.model = options.model;
    }
  }

  /** 订阅状态更新 */
  subscribe(callback: (event: AgentEvent) => void): () => void {
    this.subscribers.push(callback);
    return () => {
      const idx = this.subscribers.indexOf(callback);
      if (idx > -1) this.subscribers.splice(idx, 1);
    };
  }

  /** 通知订阅者 */
  private notify(event: AgentEvent) {
    for (const cb of this.subscribers) {
      try {
        cb(event);
      } catch (e) {
        console.error("[SSEAgent] Subscriber error:", e);
      }
    }
  }

  /** 添加消息并通知 */
  private addMessage(msg: SSEMessage) {
    this.state.messages.push(msg);
    this.notify({ type: "state-update", state: this.state });
  }

  /** 获取当前会话 ID */
  getSessionId(): string | null {
    return this.sessionId;
  }

  /** 设置会话 ID（从 Engine 返回中获取） */
  setSessionId(sessionId: string) {
    this.sessionId = sessionId;
  }

  /** 中断当前请求 */
  abort() {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.isProcessing = false;
  }

  /**
   * 发送消息到 Engine，通过 SSE 流接收响应
   */
  async prompt(userMessage: string): Promise<void> {
    if (this.isProcessing) {
      console.warn("[SSEAgent] Already processing, ignoring duplicate request");
      return;
    }
    this.isProcessing = true;
    this.abortController = new AbortController();

    // 添加用户消息到本地状态
    const userMsg: SSEMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: userMessage,
      createdAt: Date.now(),
    };
    this.addMessage(userMsg);

    const engineUrl = this.options.engineUrl || "/api";
    const url = `${engineUrl}/chat`;

    // 准备请求体
    const body = {
      projectId: "default",
      sessionId: this.sessionId || undefined,
      message: userMessage,
      stream: true,
    };

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: this.abortController.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Engine HTTP ${response.status}: ${errorText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("No response body");
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // 解析 SSE 格式：event: message\ndata: {...}\n\n
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";

        for (const part of parts) {
          const lines = part.trim().split("\n");
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const jsonStr = line.slice(6);
              try {
                const msg: SSEMessage = JSON.parse(jsonStr);
                this.handleEngineMessage(msg);
              } catch (e) {
                console.error("[SSEAgent] Failed to parse SSE data:", jsonStr.slice(0, 100));
              }
            }
          }
        }
      }

      // 处理剩余缓冲区
      if (buffer.trim()) {
        const lines = buffer.trim().split("\n");
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const jsonStr = line.slice(6);
            try {
              const msg: SSEMessage = JSON.parse(jsonStr);
              this.handleEngineMessage(msg);
            } catch (e) {
              console.error("[SSEAgent] Failed to parse SSE data:", jsonStr.slice(0, 100));
            }
          }
        }
      }
    } catch (err: any) {
      if (err.name === "AbortError") {
        console.log("[SSEAgent] Request aborted");
      } else {
        console.error("[SSEAgent] SSE stream error:", err);
        this.addMessage({
          id: crypto.randomUUID(),
          role: "assistant",
          type: "error",
          content: `连接引擎失败: ${err.message}`,
          createdAt: Date.now(),
        });
      }
    } finally {
      this.isProcessing = false;
      this.abortController = null;
      this.notify({ type: "state-update", state: this.state });
    }
  }

  /** 处理来自 Engine 的消息 */
  private handleEngineMessage(msg: SSEMessage) {
    switch (msg.type) {
      case "plan":
        this.addMessage({
          ...msg,
          id: msg.id || crypto.randomUUID(),
          role: "assistant",
          createdAt: msg.createdAt || Date.now(),
        });
        break;

      case "solve":
      case "verify":
      case "tool_call":
      case "tool_result":
        this.addMessage({
          ...msg,
          id: msg.id || crypto.randomUUID(),
          role: msg.role || "assistant",
          createdAt: msg.createdAt || Date.now(),
        });
        break;

      case "streaming":
        // 流式消息：累积到上一条 assistant 消息，或创建新消息
        const lastAssistantIdx = this.state.messages
          .map((m, i) => ({ m, i }))
          .filter(({ m }) => m.role === "assistant")
          .pop();

        if (lastAssistantIdx && !lastAssistantIdx.m.type) {
          // 追加到现有消息
          const existing = this.state.messages[lastAssistantIdx.i];
          existing.content += msg.content;
          this.notify({ type: "state-update", state: this.state });
        } else {
          // 创建新的流式消息
          this.addMessage({
            id: msg.id || crypto.randomUUID(),
            role: "assistant",
            type: "streaming",
            content: msg.content,
            createdAt: msg.createdAt || Date.now(),
            isToolCall: msg.isToolCall,
            toolName: msg.toolName,
            toolCallId: msg.toolCallId,
          });
        }
        break;

      case "done":
        // 会话完成，可能更新会话 ID
        if (msg.sessionId && !this.sessionId) {
          this.sessionId = msg.sessionId;
          this.options.onSessionCreated?.(msg.sessionId);
        }
        // 添加完成标记
        this.addMessage({
          id: crypto.randomUUID(),
          role: "assistant",
          type: "done",
          content: msg.summary || "任务完成",
          createdAt: Date.now(),
        });
        break;

      case "error":
        this.addMessage({
          id: crypto.randomUUID(),
          role: "assistant",
          type: "error",
          content: (msg as any).message || "引擎错误",
          createdAt: Date.now(),
        });
        break;

      default:
        // 未知类型，当作普通 assistant 消息处理
        if (msg.role && msg.content !== undefined) {
          this.addMessage({
            ...msg,
            id: msg.id || crypto.randomUUID(),
            role: msg.role,
            createdAt: msg.createdAt || Date.now(),
          });
        }
    }
  }

  /** 清空会话 */
  clear() {
    this.state.messages = [];
    this.sessionId = null;
    this.notify({ type: "state-update", state: this.state });
  }
}

export function createSSEAgent(options: SSEAgentOptions): SSEAgent {
  return new SSEAgent(options);
}
