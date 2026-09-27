import {
  definePlugin,
  type MessageRecord,
  type PlainContent,
  type TurnContext,
} from '@scn-chat/plugin-api'
import { z } from 'zod'

export const optionsSchema = z
  .object({
    model: z.object({ provider: z.string().min(1), id: z.string().min(1) }).optional(),
    maxWords: z.number().int().min(1).max(20).optional(),
  })
  .strict()

export type TitlesOptions = z.infer<typeof optionsSchema>

const INPUT_LIMIT = 2_000
// Output limit needs to support a model that sends back reasoning even when we send effort "none".
const OUTPUT_LIMIT = 1_000

/** Returns the text parts of a message. */
function textOf(record: MessageRecord): string {
  return (record.content as PlainContent).parts
    .flatMap((part) => (part.$type.endsWith('#textPart') ? [(part as { text: string }).text] : []))
    .join('\n')
    .slice(0, INPUT_LIMIT)
}

/** Collapse whitespace, strip quotes and trailing periods, and cut to the lexicon's 300 graphemes. */
export function cleanTitle(raw: string): string {
  const collapsed = raw.replace(/\s+/g, ' ').trim()
  const unquoted = collapsed.replace(/^["'“”‘’`]+|["'“”‘’`]+$/g, '').trim()
  const trimmed = unquoted.replace(/[.。]+$/, '').trim()
  const graphemes = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(trimmed)]
  return graphemes
    .slice(0, 300)
    .map((g) => g.segment)
    .join('')
}

/** Returns true if this turn should produce a title. */
export function wantsTitle(turn: TurnContext): boolean {
  const info = turn.conversation.info
  return (
    turn.reply.record.status === 'complete' &&
    // Skip conversations with no info record to store the title on.
    info !== undefined &&
    !info.title &&
    info.titleSource !== 'user' &&
    turn.preferences?.generateTitles !== false &&
    !info.sealed &&
    turn.userMessage.record.content.$type.endsWith('#plainContent')
  )
}

/** Generate a short title after a conversation's first completed reply. */
export default function titles(options: TitlesOptions = {}) {
  const maxWords = options.maxWords ?? 6
  return definePlugin({
    id: 'titles',
    name: 'Chat titles',
    apiVersion: 1,
    setup(ctx) {
      ctx.hooks.on('turn:after', async (turn) => {
        if (!wantsTitle(turn)) return
        try {
          const model = options.model ?? turn.model
          if (!model) throw new Error('A completed reply has no model')
          const { text, finishReason } = await ctx.models.generateText({
            user: turn.user,
            model,
            system: `Write a title of at most ${maxWords} words for this conversation, in the language of the conversation. Reply with the title only, with no quotes and no trailing punctuation.`,
            prompt: `User: ${textOf(turn.userMessage.record)}\n\nAssistant: ${textOf(turn.reply.record)}`,
            maxOutputTokens: OUTPUT_LIMIT,
            effort: 'none',
          })
          const title = cleanTitle(text)
          if (!title)
            throw new Error(`The model returned an empty title (finish reason: ${finishReason})`)
          await ctx.conversations.updateInfo(
            turn.user,
            turn.conversation.uri,
            { title, titleSource: 'generated' },
            { unlessUserTitled: true },
          )
        } catch (err) {
          ctx.logger.warn({ err, conversation: turn.conversation.uri }, 'title generation failed')
        }
      })
    },
  })
}
