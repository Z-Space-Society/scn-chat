import { z } from 'zod'

/** Request body pieces shared by several routes. */
export const modelRef = z.object({ provider: z.string().min(1), id: z.string().min(1) })

export const jsonObject = z.record(z.string(), z.unknown())
