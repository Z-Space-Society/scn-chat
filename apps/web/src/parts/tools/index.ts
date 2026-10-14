import { inputGlimpse } from '../steps.ts'
import type { ToolEntry } from '../types.ts'
import { DefaultToolView } from './default/index.tsx'
import { webFetch } from './web-fetch/index.tsx'
import { webSearch } from './web-search/index.tsx'

/**
 * How each tool's steps read, by tool name: what they did, what they are doing, and what they show
 * once open. A tool missing here reads by its own name, with its input and output as they are.
 */
export const toolViews: Record<string, ToolEntry> = {
  web_search: webSearch,
  web_fetch: webFetch,
}

/** A tool's entry, or the default for a tool with none. Only the table's own keys count. */
export function toolEntry(tool: string): ToolEntry {
  if (Object.hasOwn(toolViews, tool)) return toolViews[tool] as ToolEntry
  return {
    label: tool,
    activity: `Running ${tool}`,
    code: true,
    glimpse: inputGlimpse,
    View: DefaultToolView,
  }
}
