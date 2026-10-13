import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import {
  DetailsButton,
  recordRows,
} from '../../../../src/features/conversation/components/RecordDetails.tsx'

describe('RecordDetails', () => {
  it('shows what the record says about a reply, when it was written, and where it lives', async () => {
    const createdAt = '2026-09-26T09:05:00Z'
    const rows = recordRows({
      rkey: 'u.r0',
      storedIn: 'Your PDS',
      record: {
        role: 'assistant',
        status: 'complete',
        model: { provider: 'anthropic', id: 'claude-sonnet-5-5' },
        usage: { inputTokens: 1200, outputTokens: 80 },
        createdAt,
      },
    })
    render(<DetailsButton rows={rows} />)
    await userEvent.click(screen.getByRole('button', { name: 'Details' }))
    expect(screen.getByText('anthropic / claude-sonnet-5-5')).toBeVisible()
    expect(screen.getByText('1,200 in · 80 out')).toBeVisible()
    expect(screen.getByText(new Date(createdAt).toLocaleString())).toBeVisible()
    expect(screen.getByText('u.r0')).toBeVisible()
    expect(screen.getByText('Your PDS')).toBeVisible()
  })

  it('closes on Escape and gives focus back to its button', async () => {
    render(<DetailsButton rows={[['Record key', 'u']]} />)
    const button = screen.getByRole('button', { name: 'Details' })
    await userEvent.click(button)
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByText('Record key')).toBeNull()
    expect(button).toHaveFocus()
  })
})
