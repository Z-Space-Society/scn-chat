import { setupForTest } from '@scn-chat/plugin-api/testing'
import { describe, expect, it } from 'vitest'
import plugin, { NoTextLayerError, optionsSchema, pdfText } from '../src/index.ts'

/** A minimal PDF with one page per entry, each drawing its text, or nothing for an empty string. */
function makePdf(pages: string[]): Uint8Array {
  const objects: string[] = []
  const pageIds = pages.map((_, i) => 3 + i * 2)
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>'
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`
  const fontId = 3 + pages.length * 2
  pages.forEach((text, i) => {
    const pageId = pageIds[i] as number
    const stream = text ? `BT /F1 12 Tf 72 720 Td (${text}) Tj ET` : ''
    objects[pageId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${pageId + 1} 0 R /Resources << /Font << /F1 ${fontId} 0 R >> >> >>`
    objects[pageId + 1] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`
  })
  objects[fontId] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  let pdf = '%PDF-1.4\n'
  const offsets: number[] = []
  for (let id = 1; id < objects.length; id++) {
    offsets[id] = pdf.length
    pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`
  }
  const xref = pdf.length
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`
  for (let id = 1; id < objects.length; id++)
    pdf += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  return new TextEncoder().encode(pdf)
}

describe('pdfText', () => {
  it('extracts the text of every page, separated by blank lines', async () => {
    expect(await pdfText(makePdf(['First page', 'Second page']))).toBe('First page\n\nSecond page')
  })

  it('fails with a clear message for a PDF without a text layer', async () => {
    await expect(pdfText(makePdf(['']))).rejects.toBeInstanceOf(NoTextLayerError)
  })
})

describe('pdf-text plugin', () => {
  it('registers an ingester for PDFs with the text method', async () => {
    const { ingesters } = await setupForTest(plugin())
    expect(ingesters).toMatchObject([
      { id: 'pdf-text', accepts: ['application/pdf'], method: 'text' },
    ])
    expect(
      await ingesters[0]?.ingest({ bytes: makePdf(['Hello PDF']), mimeType: 'application/pdf' }),
    ).toEqual({ text: 'Hello PDF' })
  })
})

describe('pdf-text optionsSchema', () => {
  it('accepts valid options', () => {
    expect(optionsSchema.safeParse({}).success).toBe(true)
  })

  it('rejects invalid or unknown options', () => {
    expect(optionsSchema.safeParse({ ocr: true }).success).toBe(false)
  })
})
