/** The server's message from a failed response, or a line naming its status. */
export async function errorMessage(res: Response): Promise<string> {
  // Error bodies from a proxy may not be JSON.
  const body = (await res.json().catch(() => ({}))) as { message?: string; error?: string }
  return body.message ?? body.error ?? `Request failed with ${res.status}`
}
