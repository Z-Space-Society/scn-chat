import { type ReactNode, useEffect, useState } from 'react'
import { cn } from '../../../shared/cn.ts'
import { ArrowRightIcon } from '../../../shared/icons.tsx'
import { Button } from '../../../shared/ui/Button.tsx'
import { field } from '../../../shared/ui/controls.tsx'
import { Logo } from '../../../shared/ui/Logo.tsx'

interface Props {
  appName: string
  /** The app's description from the admin area, under its name. */
  description: string
  error?: string
  next?: string
  /** Why a signed-in viewer can only open shared chats. */
  notice?: string | null
  /** Controls for a signed-in viewer, such as signing out. */
  children?: ReactNode
}

/**
 * The sign-in form, which signs in through the server's OAuth flow: one quiet column with the
 * app's logo, its description, and a handle field.
 */
export function LoginPage(props: Props) {
  const [redirecting, setRedirecting] = useState(false)
  // Coming back from the PDS with the browser's back button restores this page as it was left.
  useEffect(() => {
    const reset = () => setRedirecting(false)
    addEventListener('pageshow', reset)
    return () => removeEventListener('pageshow', reset)
  }, [])

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-panel px-4 py-12">
      <section className="w-full max-w-96 text-center">
        <Logo className="mx-auto mb-4 block h-10" />
        {/* The logo says the name to the eye, so the name is only the page's heading for screen readers. */}
        <h1 className="sr-only">{props.appName}</h1>
        <p className="mb-8 text-balance font-medium text-muted text-ui">{props.description}</p>
        {props.notice && (
          // Why a signed-in viewer is here: a quiet note over the form.
          <p
            role="status"
            className="-mt-3 mb-6 rounded-card bg-surface px-3.5 py-2.75 text-start text-ink text-ui"
          >
            {props.notice}
          </p>
        )}
        <form
          method="get"
          action="/oauth/login"
          onSubmit={() => setRedirecting(true)}
          className="flex flex-col gap-1.5 text-start"
        >
          <label htmlFor="identifier" className="font-medium text-ink-strong text-small">
            Sign in with your handle or DID
          </label>
          {/* The @ sits inside the field, since that's how people write a handle. */}
          <div className="relative">
            <span
              aria-hidden="true"
              className="pointer-events-none absolute start-3.25 top-1/2 -translate-y-1/2 text-muted"
            >
              @
            </span>
            <input
              id="identifier"
              name="identifier"
              placeholder="alice.bsky.social"
              autoComplete="username"
              // A handle is a domain name, which phone keyboards would otherwise capitalize and correct.
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              // biome-ignore lint/a11y/noAutofocus: signing in is all this page does.
              autoFocus
              required
              aria-invalid={props.error ? true : undefined}
              aria-describedby={props.error ? 'identifier-error' : undefined}
              className={cn(
                field,
                'h-10.5 w-full ps-7.5 aria-invalid:border-danger aria-invalid:focus-visible:border-danger aria-invalid:focus-visible:ring-danger-soft',
              )}
            />
          </div>
          {props.error && (
            <p
              id="identifier-error"
              role="alert"
              className="mt-0.75 rounded-small bg-danger-soft px-3 py-2.25 text-danger text-small"
            >
              {props.error}
            </p>
          )}
          <Button type="submit" busy={redirecting} className="mt-2.5 h-10.5">
            Continue <ArrowRightIcon />
          </Button>
          {props.next && <input type="hidden" name="next" value={props.next} />}
        </form>
        {props.children}
      </section>
    </main>
  )
}
