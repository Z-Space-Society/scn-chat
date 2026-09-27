import { definePlugin } from '@scn-chat/plugin-api'
import { extractText, getDocumentProxy } from 'unpdf'
import { z } from 'zod'

export const optionsSchema = z.object({}).strict()

export class NoTextLayerError extends Error {
  constructor() {
    super('This PDF has no text layer, its contents cannot be read.')
    this.name = 'NoTextLayerError'
  }
}

/** The text of every page of a PDF, joined with blank lines between pages. */
export async function pdfText(bytes: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(bytes))
  const { text } = await extractText(pdf, { mergePages: false })
  const pages = (Array.isArray(text) ? text : [text]).map((page) => page.trim())
  const joined = pages.filter(Boolean).join('\n\n')
  if (!joined) throw new NoTextLayerError()
  return joined
}

/** Extract the text layer of uploaded PDFs. */
export default function pdfTextPlugin() {
  return definePlugin({
    id: 'pdf-text',
    name: 'PDF text',
    apiVersion: 1,
    setup(ctx) {
      ctx.ingesters.register({
        id: 'pdf-text',
        accepts: ['application/pdf'],
        method: 'text',
        ingest: async ({ bytes }) => ({ text: await pdfText(bytes) }),
      })
    },
  })
}
