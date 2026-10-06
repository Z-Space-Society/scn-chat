import type { ReactNode } from 'react'

interface Props {
  error?: string
  next?: string
  notice?: string | null
  children?: ReactNode
}

export function LoginPage(props: Props) {
  return (
    <main className="login">
      {props.notice && <p role="status">{props.notice}</p>}
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
        {props.next && <input type="hidden" name="next" value={props.next} />}
        <button type="submit">Sign in</button>
      </form>
      {props.error && <p role="alert">{props.error}</p>}
      {props.children}
    </main>
  )
}
