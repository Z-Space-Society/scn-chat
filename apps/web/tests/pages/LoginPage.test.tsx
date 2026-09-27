import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { LoginPage } from '../../src/pages/LoginPage.tsx'

afterEach(() => window.history.replaceState(null, '', '/'))

describe('LoginPage', () => {
  it('starts OAuth with the handle', () => {
    const { container } = render(<LoginPage />)
    const form = container.querySelector('form')
    expect(form).toHaveAttribute('action', '/oauth/login')
    expect(screen.getByRole('textbox')).toHaveAttribute('name', 'identifier')
  })

  it('shows a sign-in error from the server', () => {
    window.history.replaceState(null, '', '/login?error=invalid_scope')
    render(<LoginPage />)
    expect(screen.getByRole('alert')).toHaveTextContent('invalid_scope')
  })
})
