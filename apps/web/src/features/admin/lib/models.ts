import type { AdminModelEntry } from '../queries.ts'

/** An admin model as it is saved, without the server's warning about it. */
export type AdminModel = Omit<AdminModelEntry, 'warning'>

/** The model as it is saved. */
export const storedModel = ({ warning: _warning, ...model }: AdminModelEntry): AdminModel => model
