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

/** Whether a model can do each of the things above. */
export type Capabilities = Record<(typeof capabilities)[number]['key'], boolean>

/** What a model can do when nothing says, as for one typed by its ID. */
export const noCapabilities: Capabilities = { vision: false, reasoning: false, tools: false }
