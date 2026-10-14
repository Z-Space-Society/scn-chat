import { z } from 'zod'

/** The start of every turn's instructions. Placeholders: {{appName}}, {{date}}, {{time}}, {{timezone}}. */
export const DEFAULT_SYSTEM_PROMPT =
  'You are an AI assistant in {{appName}}. Today is {{date}} ({{timezone}}). ' +
  'Replies are rendered as Markdown. Raw HTML is not rendered, and images load only when the user clicks them.'

const minutes = (title: string, fallback: number) =>
  z.number().positive().default(fallback).meta({ title, unit: 'minutes' })

/** Admin settings kept in the app_setting table, one schema per key. */
export const settingSchemas = {
  access: z.object({
    registration: z.enum(['open', 'invite', 'closed']).default('open'),
    inviteRoles: z.array(z.string()).default([]),
  }),
  general: z.object({
    appName: z.string().trim().min(1).default('SCN Chat').meta({
      title: 'App name',
      description: 'Shown on the login page, in the sidebar, and in the browser tab.',
    }),
    description: z
      .string()
      .trim()
      .min(1)
      .default(
        'AI chats that live on your own PDS. Use any model, and every conversation stays yours.',
      )
      .meta({
        title: 'Description',
        description:
          'Shown under the logo on the login page, in search results, and in link previews.',
      }),
  }),
  sessions: z.object({
    ttlDays: z.number().int().min(1).default(30).meta({
      title: 'Session length',
      description: 'How long people stay signed in on the web before they have to sign in again.',
      unit: 'days',
    }),
  }),
  turns: z.object({
    ratePerMinute: z.number().int().min(1).default(10).meta({
      title: 'Turns per minute',
      description: 'How many replies each person can start in a minute. More wait their turn.',
    }),
    maxSteps: z.number().int().min(1).default(8).meta({
      title: 'Steps per turn',
      description: 'How many times a model can call tools and go on before it has to answer.',
    }),
    timeoutSeconds: z.number().int().min(1).default(600).meta({
      title: 'Turn timeout',
      description: 'A reply still running after this long is stopped.',
      unit: 'seconds',
    }),
    backfillMinutes: z.number().int().min(0).default(60).meta({
      title: 'Backfill window',
      description: 'How old a synced message asking for a reply can be and still get one.',
      unit: 'minutes',
    }),
    systemPrompt: z.string().default(DEFAULT_SYSTEM_PROMPT).meta({
      title: 'System prompt',
      description:
        'Sent with every turn. Placeholders: {{appName}}, {{date}}, {{time}}, {{timezone}}.',
      multiline: true,
    }),
  }),
  sync: z.object({
    safetyNet: z
      .object({
        enabled: z.boolean().default(true).meta({ title: 'Enabled' }),
        intervalMinutes: minutes('Runs every', 15),
        activeWithinHours: z
          .number()
          .positive()
          .default(24)
          .meta({ title: 'For people active in the last', unit: 'hours' }),
      })
      .prefault({})
      .meta({
        title: 'Safety net',
        description:
          'Syncs the chats of recently active people now and then, in case a change notice from their PDS was missed.',
      }),
    discovery: z
      .object({
        intervalMinutes: minutes('Runs every', 60),
        activeWithinDays: z
          .number()
          .positive()
          .default(30)
          .meta({ title: 'For people active in the last', unit: 'days' }),
      })
      .prefault({})
      .meta({
        title: 'Discovery',
        description:
          "Looks for chats missing from people's chat index, such as ones another app made, and adds them.",
      }),
    allowUserOptOut: z.boolean().default(true).meta({
      title: 'People can turn off background sync',
      description:
        'Each person can turn it off in their own Sync settings. When this is off, it runs for everyone.',
    }),
  }),
}

export type SettingKey = keyof typeof settingSchemas
export type Settings = { [K in SettingKey]: z.infer<(typeof settingSchemas)[K]> }

export const isSettingKey = (key: string): key is SettingKey => key in settingSchemas
