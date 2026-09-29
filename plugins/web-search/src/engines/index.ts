import { brave } from './brave.ts'
import { duckduckgo } from './duckduckgo.ts'
import { kagi } from './kagi.ts'
import { searxng } from './searxng.ts'
import { tavily } from './tavily.ts'
import type { SearchEngine } from './types.ts'

/** Every engine the plugin offers. */
export const engines: SearchEngine[] = [duckduckgo, brave, tavily, searxng, kagi]
