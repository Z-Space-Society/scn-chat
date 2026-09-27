export function LoginPage() {
  const error = new URLSearchParams(location.search).get('error')
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
        <button type="submit">Sign in</button>
      </form>
      {error && <p role="alert">{error}</p>}
    </main>
  )
}
