/** What a model can do, each with the switch that says so on a model's page. */
export const capabilities = [
  { key: 'vision', label: 'Vision', description: 'Reads images people attach.' },
  {
    key: 'reasoning',
    label: 'Thinking',
    description: 'Thinks before it answers, at the effort people pick.',
  },
  { key: 'tools', label: 'Tools', description: 'Calls the tools plugins offer.' },
] as const

/** What a model can do when nothing says, as for one typed by its ID. */
export const noCapabilities = { vision: false, reasoning: false, tools: false }
