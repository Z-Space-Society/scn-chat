const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`)

/** Fill the web app's index.html with the configured app name. */
export function renderIndexHtml(html: string, appName: string): string {
  return html.replaceAll('__APP_NAME__', escapeHtml(appName))
}
