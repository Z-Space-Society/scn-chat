import type { Effort } from '@scn-chat/lexicons'

/** Each level from fastest to deepest, named as a step on a scale, and how much of a timer its pie fills. */
export const STEPS: { level: Effort; label: string; hint?: string; time: number }[] = [
  { level: 'none', label: 'Off', hint: 'Answers right away', time: 0 },
  { level: 'low', label: 'Low', time: 0.25 },
  { level: 'medium', label: 'Medium', time: 0.5 },
  { level: 'high', label: 'High', time: 0.75 },
  { level: 'max', label: 'Extra', time: 1 },
]

/** Whether a value is one of the effort levels, as one read back from storage should be. */
export const isEffort = (value: string): value is Effort =>
  STEPS.some((step) => step.level === value)
