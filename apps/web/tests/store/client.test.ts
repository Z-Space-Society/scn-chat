import { afterEach, describe, expect, it, vi } from 'vitest'
import { openStore } from '../../src/store/client.ts'

afterEach(() => vi.unstubAllGlobals())

describe('openStore', () => {
  it('starts one worker per account, however often it is called', () => {
    const workers: unknown[] = []
    vi.stubGlobal(
      'Worker',
      class {
        constructor() {
          workers.push(this)
        }
        postMessage() {}
        addEventListener() {}
        removeEventListener() {}
      },
    )
    vi.stubGlobal(
      'BroadcastChannel',
      class {
        onmessage = null
        postMessage() {}
      },
    )
    vi.stubGlobal('navigator', { locks: { request: () => new Promise(() => {}) } })
    expect(openStore('did:plc:alice')).toBe(openStore('did:plc:alice'))
    expect(workers).toHaveLength(1)
  })
})
