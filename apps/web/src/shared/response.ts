export type Issue = { path: (string | number)[]; message: string }

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

export async function errorMessage(res: Response): Promise<string> {
  return (await errorDetails(res)).message
}
