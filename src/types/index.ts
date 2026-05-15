// ============================================================
// Pstep — 声明合并 & 自定义类型
// 通过 declaration merging 扩展 pi 的消息类型
// ============================================================

import type { AgentMessage } from '@earendil-works/pi-agent-core';

// ============================================================
// 自定义消息类型
// ============================================================

export interface PlanStep {
  number: number;
  description: string;
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
}

export interface PlanMessage {
  type: 'plan';
  steps: PlanStep[];
  goal: string;
}

export interface SolveMessage {
  type: 'solve';
  stepNumber: number;
  content: string;
  reasoning: string;
}

export interface VerifyMessage {
  type: 'verify';
  stepNumber: number;
  status: 'pass' | 'fail' | 'pending';
  details: string;
}

// ============================================================
// 工具函数：检测消息中的 Pstep 内容
// ============================================================

/** 检测消息是否为 Plan 类型 */
export function isPlanMessage(msg: AgentMessage): boolean {
  if (typeof msg.content !== 'string') return false;
  try {
    const parsed = JSON.parse(msg.content);
    return parsed.type === 'plan' && Array.isArray(parsed.steps);
  } catch {
    return msg.content.startsWith('## Plan') || msg.content.startsWith('📋 Plan');
  }
}

/** 检测消息是否为 Solve 类型 */
export function isSolveMessage(msg: AgentMessage): boolean {
  if (typeof msg.content !== 'string') return false;
  try {
    const parsed = JSON.parse(msg.content);
    return parsed.type === 'solve';
  } catch {
    return msg.content.startsWith('## Solve') || msg.content.startsWith('🔧 Solve');
  }
}

/** 检测消息是否为 Verify 类型 */
export function isVerifyMessage(msg: AgentMessage): boolean {
  if (typeof msg.content !== 'string') return false;
  try {
    const parsed = JSON.parse(msg.content);
    return parsed.type === 'verify';
  } catch {
    return msg.content.startsWith('## Verify') || msg.content.startsWith('✅ Verify');
  }
}

// ============================================================
// 提取结构化数据
// ============================================================

/** 从 Plan 文本中提取步骤 */
export function extractPlanSteps(content: string): PlanStep[] {
  try {
    const parsed = JSON.parse(content);
    if (parsed.type === 'plan' && Array.isArray(parsed.steps)) {
      return parsed.steps;
    }
  } catch {
    // 尝试从 Markdown 解析
    const steps: PlanStep[] = [];
    const stepRegex = /(?:^|\n)\s*(?:\d+[.)]\s*|\*\s*)(.+)/gm;
    let match;
    let num = 1;
    while ((match = stepRegex.exec(content)) !== null) {
      steps.push({
        number: num++,
        description: match[1].trim(),
        status: 'pending',
      });
    }
    return steps;
  }
  return [];
}

/** 从 Solve 文本中提取内容 */
export function extractSolveContent(content: string): { reasoning: string; answer: string } {
  try {
    const parsed = JSON.parse(content);
    if (parsed.type === 'solve') {
      return {
        reasoning: parsed.reasoning || '',
        answer: parsed.content || parsed.answer || content,
      };
    }
  } catch {
    // 从 Markdown 中提取 reasoning 和 answer 部分
    const parts = content.split(/(?=Answer:|结论:|结果:)/i);
    if (parts.length > 1) {
      return {
        reasoning: parts[0].replace(/^##?\s*(Solve|Reasoning)/im, '').trim(),
        answer: parts.slice(1).join('').replace(/^##?\s*(Answer|结论|结果)/im, '').trim(),
      };
    }
  }
  return { reasoning: '', answer: content };
}

/** 从 Verify 文本中提取状态 */
export function extractVerifyStatus(content: string): { status: 'pass' | 'fail' | 'pending'; details: string } {
  try {
    const parsed = JSON.parse(content);
    if (parsed.type === 'verify') {
      return {
        status: parsed.status || 'pending',
        details: parsed.details || '',
      };
    }
  } catch {
    if (/pass|通过|正确|✅/i.test(content)) {
      return { status: 'pass', details: content };
    }
    if (/fail|失败|错误|❌/i.test(content)) {
      return { status: 'fail', details: content };
    }
  }
  return { status: 'pending', details: content };
}