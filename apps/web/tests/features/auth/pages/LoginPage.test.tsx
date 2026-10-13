import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { LoginPage } from '../../../../src/features/auth/pages/LoginPage.tsx'

describe('LoginPage', () => {
  it('starts OAuth with the handle', () => {
    const { container } = render(<LoginPage appName="SCN Chat" />)
    const form = container.querySelector('form')
    expect(form).toHaveAttribute('action', '/oauth/login')
    expect(screen.getByRole('textbox')).toHaveAttribute('name', 'identifier')
  })

  it('names the app', () => {
    render(<LoginPage appName="SCN Chat" />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('SCN Chat')
  })

  it('shows a sign-in error from the server on the field', () => {
    render(<LoginPage appName="SCN Chat" error="invalid_scope" />)
    expect(screen.getByRole('alert')).toHaveTextContent('invalid_scope')
    expect(screen.getByRole('textbox')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('textbox')).toHaveAccessibleDescription('invalid_scope')
  })

  it('shows it is redirecting once submitted', () => {
    const { container } = render(<LoginPage appName="SCN Chat" />)
    // jsdom doesn't navigate, so submitting only runs the handler.
    fireEvent.submit(container.querySelector('form') as HTMLFormElement)
    expect(screen.getByRole('button')).toBeDisabled()
    expect(screen.getByRole('button')).toHaveTextContent('Redirecting to your PDS')
  })
})
