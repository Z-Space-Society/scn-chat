import type { Logger } from '../logger.ts'

export type SdkReasoning = 'provider-default' | 'none' | 'low' | 'medium' | 'high' | 'xhigh'

const map: Record<string, SdkReasoning> = {
  none: 'none',
  low: 'low',
  medium: 'medium',
  high: 'high',
  max: 'xhigh',
}

/** The AI SDK reasoning setting for a lexicon effort value. */
export function mapEffort(effort: string | undefined, logger: Logger): SdkReasoning {
  if (effort === undefined) return 'provider-default'
  const mapped = map[effort]
  if (!mapped) logger.warn({ effort }, 'unknown effort value, using the provider default')
  return mapped ?? 'provider-default'
}
