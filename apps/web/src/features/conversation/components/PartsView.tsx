import { useId } from 'react'
import { useFold } from '../../../parts/fold.ts'
import { StepsView, viewFor } from '../../../parts/index.ts'
import { groupParts } from '../../../parts/steps.ts'
import type { BlobUrl, Part } from '../../../parts/types.ts'
import { plural } from '../../../shared/plural.ts'

interface Props {
  parts: Part[]
  /** The message the parts belong to, which each part's view gets. */
  record: Record<string, unknown>
  /** Whether the reply is still streaming, so its last block of steps is still going. */
  live?: boolean
  blobUrl: BlobUrl
  /** The message's key, so the times measured for its steps follow it from stream to record. */
  scope?: string
}

/**
 * A message's parts in the order they were made, each through its view. The model's work shows
 * only while it is going, gathered into steps, and gives way to the reply once the reply starts.
 * Sources follow as numbered badges under a quiet count, each naming its site.
 */
export function PartsView(props: Props) {
  const { blocks, sources } = groupParts(props.parts)
  return (
    <>
      {blocks.map((block, i) => {
        if (block.kind === 'steps') {
          // A finished reply's steps open from its footer, so only work still going shows. Steps
          // that are done stay mounted while the reply streams, hidden, so their clocks record how
          // long they ran.
          if (!props.live) return null
          const current = i === blocks.length - 1
          return (
            <div key={block.key} hidden={!current}>
              <StepsView
                steps={block.steps}
                record={props.record}
                live={current}
                blobUrl={props.blobUrl}
                scope={props.scope}
              />
            </div>
          )
        }
        const View = viewFor(block.part)
        if (!View) return null
        return (
          <View
            key={block.key}
            part={block.part}
            record={props.record}
            blobUrl={props.blobUrl}
            live={props.live && i === blocks.length - 1}
          />
        )
      })}
      {sources.length > 0 && (
        <Sources sources={sources} record={props.record} blobUrl={props.blobUrl} />
      )}
    </>
  )
}

interface SourcesProps {
  sources: Part[]
  record: Record<string, unknown>
  blobUrl: BlobUrl
}

/**
 * A reply's sources as numbered badges under their count. Past seven, the rest fold behind a
 * badge that shows them, which then closes them again.
 */
function Sources(props: SourcesProps) {
  const fold = useFold(props.sources)
  const id = useId()
  return (
    <section aria-label="Sources" className="mt-3.5">
      <p className="mb-1.5 text-caption text-muted">
        {plural(props.sources.length, { one: '# source', other: '# sources' })}
      </p>
      {/* A flex item is no list item, so the badges count themselves. */}
      <ol id={id} ref={fold.list} className="flex flex-wrap gap-1.5 [counter-reset:source]">
        {fold.shown.map((part) => {
          const View = viewFor(part)
          return (
            <li
              key={part.url as string}
              className="inline-flex max-w-88 items-baseline gap-1.5 rounded-small bg-surface px-2.25 py-0.5 text-caption transition-colors duration-(--dur-feedback) [counter-increment:source] before:text-muted before:tabular-nums before:content-[counter(source)] has-[a:hover]:bg-accent-soft"
            >
              {View && <View part={part} record={props.record} blobUrl={props.blobUrl} />}
            </li>
          )
        })}
        {/* The button sits among the badges, but it is not a source, so it is no list item. */}
        {fold.folds && (
          <li role="none" className="inline-flex">
            <button
              type="button"
              aria-expanded={fold.open}
              aria-controls={id}
              onClick={fold.toggle}
              className="cursor-pointer rounded-small px-2.25 py-0.5 text-caption text-muted transition-colors duration-(--dur-feedback) hover:bg-accent-soft hover:text-ink focus-visible:text-ink"
            >
              {fold.open ? 'Show less' : `+${fold.hidden} more`}
            </button>
          </li>
        )}
      </ol>
    </section>
  )
}
