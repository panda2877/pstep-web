// ============================================================
// Pstep — Solve 消息渲染器
// ============================================================

import { html } from 'lit';
import type { AgentMessage } from '@earendil-works/pi-agent-core';
import { extractSolveContent } from '../types/index.js';

export function renderSolveMessage(message: AgentMessage) {
  const content = typeof message.content === 'string' ? message.content : '';
  const { reasoning, answer } = extractSolveContent(content);

  return html`
    <div class="pstep-solve">
      <div class="pstep-solve-header">
        <span>🔧</span>
        <span>Solve</span>
      </div>
      ${reasoning ? html`
        <details style="margin-bottom:8px;">
          <summary style="font-size:12px;color:#666;cursor:pointer;">思考过程</summary>
          <div style="font-size:13px;color:#888;margin-top:4px;padding:8px;background:rgba(0,0,0,0.03);border-radius:4px;line-height:1.5;">
            ${reasoning}
          </div>
        </details>
      ` : ''}
      <div class="pstep-solve-content">${answer}</div>
    </div>
  `;
}