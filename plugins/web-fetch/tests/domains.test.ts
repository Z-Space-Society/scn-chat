import { describe, expect, it } from 'vitest'
import { isHostAllowed } from '../src/domains.ts'

describe('isHostAllowed', () => {
  it('allows any host when both lists are empty', () => {
    expect(isHostAllowed('example.com', { allow: [], deny: [] })).toBe(true)
  })

  it('refuses a denied domain and its subdomains', () => {
    const lists = { allow: [], deny: ['example.com'] }
    expect(isHostAllowed('example.com', lists)).toBe(false)
    expect(isHostAllowed('docs.example.com', lists)).toBe(false)
  })

  it('does not treat a host that only ends with the same letters as a subdomain', () => {
    expect(isHostAllowed('badexample.com', { allow: [], deny: ['example.com'] })).toBe(true)
  })

  it('allows only listed domains and their subdomains when there is an allow list', () => {
    const lists = { allow: ['example.com'], deny: [] }
    expect(isHostAllowed('docs.example.com', lists)).toBe(true)
    expect(isHostAllowed('other.org', lists)).toBe(false)
  })

  it('checks the deny list before the allow list', () => {
    const lists = { allow: ['example.com'], deny: ['private.example.com'] }
    expect(isHostAllowed('private.example.com', lists)).toBe(false)
  })

  it('ignores case and a trailing dot in the host', () => {
    expect(isHostAllowed('Docs.Example.COM.', { allow: [], deny: ['example.com'] })).toBe(false)
  })
})
