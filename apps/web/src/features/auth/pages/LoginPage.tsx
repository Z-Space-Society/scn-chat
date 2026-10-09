import type { ReactNode } from 'react'
import { ErrorAlert } from '../../../shared/ErrorAlert.tsx'

interface Props {
  error?: string
  next?: string
  /** Why a signed-in viewer can only open shared chats. */
  notice?: string | null
  /** Controls for a signed-in viewer, such as signing out. */
  children?: ReactNode
}

/** The sign-in form, which signs in through the server's OAuth flow. */
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
      <ErrorAlert error={props.error} />
      {props.children}
    </main>
  )
}
