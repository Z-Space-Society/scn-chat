import { FileView } from './FileView.tsx'
import { ImageView } from './ImageView.tsx'
import { ReasoningView } from './ReasoningView.tsx'
import { SourceView } from './SourceView.tsx'
import { TextView } from './TextView.tsx'
import { ToolCallView } from './ToolCallView.tsx'
import { ToolResultView } from './ToolResultView.tsx'
import { kind, type Part, type PartView } from './types.ts'

/** The view for each kind of part, by the part's `$type` fragment, like `textPart`. */
export const partViews: Record<string, PartView> = {
  textPart: TextView,
  reasoningPart: ReasoningView,
  toolCallPart: ToolCallView,
  toolResultPart: ToolResultView,
  sourcePart: SourceView,
  imagePart: ImageView,
  filePart: FileView,
}

/**
 * The view for a part, or none for a kind this app doesn't know, such as one from a newer client.
 * Only the table's own keys count, so a `$type` like `#toString` finds nothing.
 */
export const viewFor = (part: Part): PartView | undefined => {
  const partKind = kind(part)
  return partKind && Object.hasOwn(partViews, partKind) ? partViews[partKind] : undefined
}
