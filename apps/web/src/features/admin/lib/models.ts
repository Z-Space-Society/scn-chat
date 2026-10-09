import type { AdminModelEntry } from '../queries.ts'

/** An admin model as it is saved, without the server's warning about it. */
export type AdminModel = Omit<AdminModelEntry, 'warning'>

export type Capabilities = AdminModel['capabilities']

export const capabilityNames = ['vision', 'reasoning', 'tools'] as const

/** What a model can do when nothing says, as for one typed by its ID. */
export const noCapabilities: Capabilities = { vision: false, reasoning: false, tools: false }

/** The model as it is saved. */
export const storedModel = ({ warning: _warning, ...model }: AdminModelEntry): AdminModel => model
