export type ProjectStatus = 'normal' | 'watch' | 'red';

export type GuardrailType =
  | 'Capability'
  | 'Grounding'
  | 'Hallucination'
  | 'Goal'
  | 'Information Isolation'
  | 'Escalation';
