import type { Effort, ModelRef } from '@scn-chat/lexicons'
import type { dataTagSymbol } from '@tanstack/react-query'
import type { modelsQuery } from './queries.ts'

/** The models on offer to the user, and the admin's default, as /api/models lists them. */
export type ModelCatalog = (typeof modelsQuery.queryKey)[typeof dataTagSymbol]

export type ModelOption = ModelCatalog['models'][number]

export const effortLevels = ['none', 'low', 'medium', 'high', 'max'] satisfies Effort[]

/** A model's reference, without the catalog's name and capabilities. */
export const modelRef = ({ provider, id }: ModelRef): ModelRef => ({ provider, id })

export const sameModel = (a: ModelRef, b: ModelRef) => a.provider === b.provider && a.id === b.id

/**
 * The fallback model, as chat-turns chooses it for a turn that names no model: the inherited
 * model, else the user's default model, else the admin's. Undefined until the preferences and
 * catalog load, so loading never blocks sending.
 */
export function fallbackModel(
  inherited: ModelRef | null,
  preferences: Record<string, unknown> | null | undefined,
  catalog: ModelCatalog | undefined,
): ModelRef | null | undefined {
  if (inherited) return inherited
  if (preferences === undefined || catalog === undefined) return undefined
  return (preferences?.defaultModel as ModelRef | undefined) ?? catalog.defaultModel
}
