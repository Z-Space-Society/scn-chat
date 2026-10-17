import { describe, expect, it } from 'vitest'
import { currentBranch } from '../../../../src/features/conversation/lib/branch.ts'
import { outlineOf } from '../../../../src/features/conversation/lib/outline.ts'
import { messageRecord } from '../../../helpers/records.ts'

const d = (name: string) => `network.sharedcomputer.chat.defs#${name}`
const message = (
  rkey: string,
  role: string,
  parts: Record<string, unknown>[],
  extra: Record<string, unknown> = {},
) => ({
  rkey,
  record: messageRecord({
    role,
    content: { $type: d('plainContent'), parts },
    createdAt: '2026-10-07T09:00:00Z',
    ...extra,
  }),
})
const text = (value: string) => ({ $type: d('textPart'), text: value })

describe('outlineOf', () => {
  const messages = [
    message('u', 'user', [text('first try')]),
    message('v', 'user', [{ $type: d('filePart'), name: 'plan.pdf' }, text('Read this plan')], {
      createdAt: '2026-10-07T09:01:00Z',
    }),
    message('v.r0', 'assistant', [text('An answer')], { parent: 'v', status: 'complete' }),
    message('w', 'user', [text('And then?')], { parent: 'v.r0' }),
    message('w.r0', 'assistant', [], { parent: 'w', status: 'pending' }),
  ]

  it("lists the user's messages on the branch, oldest first, without the replies", () => {
    expect(outlineOf(currentBranch(messages, {}))).toEqual([
      { rkey: 'v', text: 'Read this plan' },
      { rkey: 'w', text: 'And then?' },
    ])
  })
})
