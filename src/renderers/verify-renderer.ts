// ============================================================
// Pstep — Verify 消息渲染器
// ============================================================

import { html } from 'lit';
import type { AgentMessage } from '@earendil-works/pi-agent-core';
import { extractVerifyStatus } from '../types/index.js';

export function renderVerifyMessage(message: AgentMessage) {
  const content = typeof message.content === 'string' ? message.content : '';
  const { status, details } = extractVerifyStatus(content);

  const statusIcon = status === 'pass' ? '✅' : status === 'fail' ? '❌' : '⏳';
  const statusLabel = status === 'pass' ? '通过' : status === 'fail' ? '失败' : '待验证';

  return html`
    <div class="pstep-verify">
      <div class="pstep-verify-header">
        <span>${statusIcon}</span>
        <span>Verify</span>
        <span class="pstep-verify-status ${status}">${statusLabel}</span>
      </div>
      <div style="font-size:14px;line-height:1.6;">${details}</div>
    </div>
  `;
}