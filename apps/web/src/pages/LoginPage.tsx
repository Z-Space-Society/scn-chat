export function LoginPage() {
  const params = new URLSearchParams(location.search)
  const error = params.get('error')
  const next = params.get('next')
  return (
    <main className="login">
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
    </main>
  )
}
