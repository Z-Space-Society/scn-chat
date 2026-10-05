import type { ReactNode } from 'react'

export function LoginPage({
  error,
  next,
  notice,
  children,
}: {
  error?: string
  next?: string
  notice?: string | null
  children?: ReactNode
}) {
  return (
    <main className="login">
      {notice && <p role="status">{notice}</p>}
      <h1>Sign in</h1>
      <form method="get" action="/oauth/login">
        <label>
          Handle{' '}
          <input
            name="identifier"
            placeholder="alice.bsky.social"
            autoComplete="username"
            required
          />
        </label>
        {next && <input type="hidden" name="next" value={next} />}
        <button type="submit">Sign in</button>
      </form>
      {error && <p role="alert">{error}</p>}
      {children}
    </main>
  )
}
