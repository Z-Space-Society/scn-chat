import { z } from 'zod'

/** The start of every turn's instructions. Placeholders: {{appName}}, {{date}}, {{time}}, {{timezone}}. */
export const DEFAULT_SYSTEM_PROMPT =
  'You are an AI assistant in {{appName}}. Today is {{date}} ({{timezone}}). ' +
  'Replies are rendered as Markdown. Raw HTML is not rendered, and images load only when the user clicks them.'

const minutes = (title: string, fallback: number) =>
  z.number().positive().default(fallback).meta({ title })

/** Admin settings kept in the app_setting table, one schema per key. */
export const settingSchemas = {
  access: z.object({
    registration: z.enum(['open', 'invite', 'closed']).default('open'),
    inviteRoles: z.array(z.string()).default([]),
  }),
  general: z.object({
    appName: z.string().trim().min(1).default('SCN Chat').meta({ title: 'App name' }),
  }),
  sessions: z.object({
    ttlDays: z.number().int().min(1).default(30).meta({ title: 'Days a web session lasts' }),
  }),
  turns: z.object({
    ratePerMinute: z.number().int().min(1).default(10).meta({ title: 'Turns per user per minute' }),
    maxSteps: z.number().int().min(1).default(8).meta({ title: 'Model steps per turn' }),
    timeoutSeconds: z.number().int().min(1).default(600).meta({ title: 'Turn timeout in seconds' }),
    backfillMinutes: z.number().int().min(0).default(60).meta({
      title: 'Backfill window in minutes',
      description: 'How old a synced message asking for a reply can be and still get one.',
    }),
    systemPrompt: z.string().default(DEFAULT_SYSTEM_PROMPT).meta({
      title: 'System prompt',
      description: 'Placeholders: {{appName}}, {{date}}, {{time}}, {{timezone}}.',
      multiline: true,
    }),
  }),
  sync: z.object({
    safetyNet: z
      .object({
        enabled: z.boolean().default(true).meta({ title: 'Enabled' }),
        intervalMinutes: minutes('Every this many minutes', 15),
        activeWithinHours: z
          .number()
          .positive()
          .default(24)
          .meta({ title: 'For users active within this many hours' }),
      })
      .prefault({})
      .meta({ title: 'Safety net' }),
    discovery: z
      .object({
        intervalMinutes: minutes('Every this many minutes', 60),
        activeWithinDays: z
          .number()
          .positive()
          .default(30)
          .meta({ title: 'For users active within this many days' }),
      })
      .prefault({})
      .meta({ title: 'Discovery' }),
    allowUserOptOut: z
      .boolean()
      .default(true)
      .meta({ title: 'Users can turn off background sync' }),
  }),
}

export type SettingKey = keyof typeof settingSchemas
export type Settings = { [K in SettingKey]: z.infer<(typeof settingSchemas)[K]> }

export const isSettingKey = (key: string): key is SettingKey => key in settingSchemas
