/** Save text as a file, the way a link to a download would. */
export function downloadText(text: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  // The download has its own copy of the file once it starts.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

/** A language's usual file extension, where its name isn't one. */
const extensions: Record<string, string> = {
  bash: 'sh',
  csharp: 'cs',
  'c#': 'cs',
  cpp: 'cpp',
  'c++': 'cpp',
  elixir: 'ex',
  golang: 'go',
  haskell: 'hs',
  javascript: 'js',
  jsx: 'jsx',
  kotlin: 'kt',
  markdown: 'md',
  objectivec: 'm',
  perl: 'pl',
  powershell: 'ps1',
  python: 'py',
  ruby: 'rb',
  rust: 'rs',
  shell: 'sh',
  shellscript: 'sh',
  text: 'txt',
  plaintext: 'txt',
  typescript: 'ts',
  yaml: 'yml',
  zsh: 'sh',
}

/** A file name for code in a language, such as "code.py", or "code.txt" when it names none. */
export function codeFilename(language: string) {
  const name = language.toLowerCase()
  const extension = extensions[name] ?? (/^[a-z0-9]{1,8}$/.test(name) ? name : 'txt')
  return `code.${extension}`
}
