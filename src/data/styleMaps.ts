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
