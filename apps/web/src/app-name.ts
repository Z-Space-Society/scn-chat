/** The configured app name, used in index.html. */
const meta = document.querySelector<HTMLMetaElement>('meta[name="application-name"]')
if (!meta) throw new Error('index.html has no application-name meta tag')
export const appName = meta.content
