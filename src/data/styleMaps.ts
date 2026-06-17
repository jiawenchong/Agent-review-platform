import type { ProjectStatus, PhaseState, QAType, GuardrailType, Severity } from './types';

export const STATUS: Record<ProjectStatus, { label: string; color: string; bg: string; border: string }> = {
  normal: { label: '正常', color: 'var(--green-text)', bg: 'var(--green-bg)', border: 'var(--green-border)' },
  watch: { label: '觀察中', color: 'var(--amber-text)', bg: 'var(--amber-bg)', border: 'var(--amber-border)' },
  red: { label: '紅線觸發', color: 'var(--red-text)', bg: 'var(--red-bg)', border: 'var(--red-border)' },
};

export const PHASE: Record<PhaseState, { label: string; color: string; bg: string; icon: string }> = {
  done: { label: '已完成', color: 'var(--green-text)', bg: 'var(--green-bg)', icon: '✓' },
  active: { label: '進行中', color: 'var(--amber-text)', bg: 'var(--amber-bg)', icon: '●' },
  red: { label: '已觸發', color: 'var(--red-text)', bg: 'var(--red-bg)', icon: '!' },
  blocked: { label: '已暫停', color: 'var(--text-dim)', bg: 'var(--surface-alt)', icon: '✕' },
  pending: { label: '待執行', color: 'var(--text-dim)', bg: 'var(--surface-alt)', icon: '…' },
};

export const QA_TYPE: Record<QAType, { color: string; bg: string }> = {
  normal: { color: 'var(--green-text)', bg: 'var(--green-bg)' },
  watch: { color: 'var(--amber-text)', bg: 'var(--amber-bg)' },
  red: { color: 'var(--red-text)', bg: 'var(--red-bg)' },
  review: { color: 'var(--olive)', bg: 'var(--olive-bg)' },
};

export const GUARDRAIL_STRIP: Record<GuardrailType, { label: string; color: string }> = {
  Capability: { label: 'Capability', color: 'var(--text-mid)' },
  Grounding: { label: 'Grounding', color: 'var(--olive)' },
  Goal: { label: 'Goal', color: 'var(--amber)' },
  'Information Isolation': { label: 'Information Isolation', color: 'var(--text-heading)' },
  Escalation: { label: 'Escalation', color: 'var(--red)' },
};

export const SEV_MAP: Record<Severity, { label: string; color: string; bg: string }> = {
  critical: { label: '嚴重', color: 'var(--red)', bg: 'var(--red-bg)' },
  warning: { label: '警告', color: 'var(--amber)', bg: 'var(--amber-bg)' },
  info: { label: '一般', color: 'var(--olive)', bg: 'var(--olive-bg)' },
};

export function scoreColor(score: number): string {
  if (score >= 80) return 'var(--green-text)';
  if (score >= 55) return 'var(--amber-text)';
  return 'var(--red-text)';
}
