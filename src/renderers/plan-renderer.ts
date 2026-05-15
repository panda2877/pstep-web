// ============================================================
// Pstep — Plan 消息渲染器
// ============================================================

import { html } from 'lit';
import type { AgentMessage } from '@earendil-works/pi-agent-core';
import { extractPlanSteps } from '../types/index.js';

export function renderPlanMessage(message: AgentMessage) {
  const content = typeof message.content === 'string' ? message.content : '';
  const steps = extractPlanSteps(content);

  return html`
    <div class="pstep-plan">
      <div class="pstep-plan-header">
        <span>📋</span>
        <span>Plan</span>
      </div>
      <div style="font-size:13px;color:#666;margin-bottom:8px;">
        ${steps.length > 0
          ? html`<span>${steps.length} 个步骤</span>`
          : html`<span>规划中...</span>`}
      </div>
      <ol class="pstep-plan-steps">
        ${steps.map((step) => html`
          <li class="pstep-plan-step">
            <span class="pstep-plan-step-num">${step.number}</span>
            <span>${step.description}</span>
          </li>
        `)}
      </ol>
    </div>
  `;
}