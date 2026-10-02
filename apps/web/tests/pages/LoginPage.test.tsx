import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { LoginPage } from '../../src/pages/LoginPage.tsx'

describe('LoginPage', () => {
  it('starts OAuth with the handle', () => {
    const { container } = render(<LoginPage />)
    const form = container.querySelector('form')
    expect(form).toHaveAttribute('action', '/oauth/login')
    expect(screen.getByRole('textbox')).toHaveAttribute('name', 'identifier')
  })

  it('shows a sign-in error from the server', () => {
    render(<LoginPage error="invalid_scope" />)
    expect(screen.getByRole('alert')).toHaveTextContent('invalid_scope')
  })
})
