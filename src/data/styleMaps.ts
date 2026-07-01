import type { ProjectStatus, GuardrailType } from './types';

export const STATUS: Record<ProjectStatus, { label: string; color: string; bg: string; border: string }> = {
  normal: { label: '正常', color: 'var(--green-text)', bg: 'var(--green-bg)', border: 'var(--green-border)' },
  watch: { label: '觀察中', color: 'var(--amber-text)', bg: 'var(--amber-bg)', border: 'var(--amber-border)' },
  red: { label: '紅線觸發', color: 'var(--red-text)', bg: 'var(--red-bg)', border: 'var(--red-border)' },
};

export const GUARDRAIL_STRIP: Record<GuardrailType, { label: string; color: string }> = {
  Capability: { label: 'Capability', color: 'var(--text-mid)' },
  Grounding: { label: 'Grounding', color: 'var(--olive)' },
  Hallucination: { label: 'Hallucination', color: 'var(--olive)' },
  Goal: { label: 'Goal', color: 'var(--amber)' },
  'Information Isolation': { label: 'Information Isolation', color: 'var(--text-heading)' },
  Escalation: { label: 'Escalation', color: 'var(--red)' },
};

export function scoreColor(score: number): string {
  if (score >= 80) return 'var(--green-text)';
  if (score >= 55) return 'var(--amber-text)';
  return 'var(--red-text)';
}

// AI 評審中心 verdict on an uploaded planning document (規劃書評估).
export const VERDICT_STYLE: Record<string, { color: string; bg: string }> = {
  綠燈: { color: 'var(--green-text)', bg: 'var(--green-bg)' },
  紅燈: { color: 'var(--red-text)', bg: 'var(--red-bg)' },
  待補件: { color: 'var(--amber-text)', bg: 'var(--amber-bg)' },
  無法審核: { color: 'var(--gray-text)', bg: 'var(--gray-bg)' },
};
