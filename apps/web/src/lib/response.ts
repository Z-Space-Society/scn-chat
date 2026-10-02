export type Issue = { path: (string | number)[]; message: string }

/** Return the error message and field issues. */
export async function errorDetails(res: Response): Promise<{ message: string; issues: Issue[] }> {
  // Error bodies from a proxy may not be JSON.
  const body = (await res.json().catch(() => ({}))) as {
    message?: string
    error?: string
    issues?: Issue[]
  }
  return {
    message: body.message ?? body.error ?? `Request failed with ${res.status}`,
    issues: Array.isArray(body.issues) ? body.issues : [],
  }
}

/** The server's message from a failed response, or a line naming its status. */
export async function errorMessage(res: Response): Promise<string> {
  return (await errorDetails(res)).message
}
