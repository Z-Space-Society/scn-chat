import { useRouter } from '@tanstack/react-router'
import { messageOf } from './errors.ts'
import { AlertIcon, RetryIcon } from './icons.tsx'
import { Button } from './ui/Button.tsx'

interface Props {
  error: unknown
}

/**
 * What a page that failed to load or render shows: one quiet column under a red alert mark, with a
 * muted line on what happened and the error itself in a small mono well, since it is often
 * technical. Try again and a quiet link back to the chats sit side by side under it.
 */
export function ErrorPage(props: Props) {
  const router = useRouter()
  const message = messageOf(props.error)
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-panel px-4 py-12 text-center">
      <span className="mb-4.5 grid size-11 place-items-center rounded-full bg-danger-soft text-danger">
        <AlertIcon className="stroke-(length:--icon-stroke-control) size-5.25" />
      </span>
      <h1 className="text-balance font-semibold text-ink-strong text-title leading-tight tracking-title">
        Something went wrong
      </h1>
      <p className="mt-2 max-w-104 text-pretty text-body text-muted">This page couldn’t load.</p>
      {message && (
        <p
          role="alert"
          className="mt-5 max-w-120 rounded-small border border-line bg-sunken px-3.25 py-2.25 font-mono text-caption text-danger leading-normal [overflow-wrap:anywhere]"
        >
          {message}
        </p>
      )}
      <div className="mt-7 flex flex-wrap items-center justify-center gap-x-5 gap-y-3">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            // Loads the page's data again, which also clears this error.
            router.invalidate()
          }}
        >
          <Button type="submit" className="h-9.5 px-4">
            <RetryIcon />
            Try again
          </Button>
        </form>
        <a href="/" className="font-medium text-muted text-ui no-underline hover:text-ink-strong">
          Go to your chats
        </a>
      </div>
    </main>
  )
}
