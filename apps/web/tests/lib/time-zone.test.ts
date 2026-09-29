import { afterEach, describe, expect, it, vi } from 'vitest'
import { browserTimeZone, syncTimeZone } from '../../src/lib/time-zone.ts'

function stubPreferences(preferences: Record<string, unknown> | null) {
  const fetch = vi.fn(async (_url: string, init?: RequestInit) =>
    init?.method === 'PUT' ? Response.json({ ok: true }) : Response.json({ preferences }),
  )
  vi.stubGlobal('fetch', fetch)
  const puts = () =>
    fetch.mock.calls
      .filter(([, init]) => init?.method === 'PUT')
      .map(([, init]) => JSON.parse(String(init?.body)))
  return puts
}

afterEach(() => vi.unstubAllGlobals())

describe('syncTimeZone', () => {
  it("saves the browser's time zone, keeping the other preferences", async () => {
    const puts = stubPreferences({
      $type: 'network.sharedcomputer.chat.preferences',
      customInstructions: 'Metric units',
      timezone: 'Mars/Olympus',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })
    await syncTimeZone()
    expect(puts()).toEqual([{ customInstructions: 'Metric units', timezone: browserTimeZone() }])
  })

  it('creates preferences holding the time zone when there are none', async () => {
    const puts = stubPreferences(null)
    await syncTimeZone()
    expect(puts()).toEqual([{ timezone: browserTimeZone() }])
  })

  it('does not write when the stored time zone already matches', async () => {
    const puts = stubPreferences({ timezone: browserTimeZone() })
    await syncTimeZone()
    expect(puts()).toEqual([])
  })
})
