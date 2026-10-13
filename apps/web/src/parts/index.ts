import { FileView } from './FileView.tsx'
import { ImageView } from './ImageView.tsx'
import { SourceView } from './SourceView.tsx'
import { TextView } from './TextView.tsx'
import { kind, type Part, type PartView } from './types.ts'
import { WorkSteps } from './WorkSteps.tsx'

/**
 * The view for each kind of part that says or carries something, by the part's `$type` fragment,
 * like `textPart`. Reasoning and tool parts are the model's work, which `StepsView` shows.
 */
export const partViews: Record<string, PartView> = {
  textPart: TextView,
  sourcePart: SourceView,
  imagePart: ImageView,
  filePart: FileView,
}

/** The view for a run of the model's work: its reasoning and tool calls with their results. */
export const StepsView = WorkSteps

/**
 * The view for a part, or none for a kind this app doesn't know, such as one from a newer client.
 * Only the table's own keys count, so a `$type` like `#toString` finds nothing.
 */
export const viewFor = (part: Part): PartView | undefined => {
  const partKind = kind(part)
  return partKind && Object.hasOwn(partViews, partKind) ? partViews[partKind] : undefined
}
