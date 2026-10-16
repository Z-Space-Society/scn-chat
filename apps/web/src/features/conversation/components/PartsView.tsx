import { StepsView, viewFor } from '../../../parts/index.ts'
import { groupParts } from '../../../parts/steps.ts'
import type { BlobUrl, Part } from '../../../parts/types.ts'
import { ChevronDownIcon, LinkIcon } from '../../../shared/icons.tsx'
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
 * Sources follow behind a quiet count that opens onto them, one to a line, each naming its site.
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
 * A reply's sources behind their count, a chip shaped like the rows it opens onto: a numbered
 * list with one source to a line. The list starts closed, so the sources stay out of the way of
 * the reply.
 */
function Sources(props: SourcesProps) {
  return (
    <section aria-label="Sources" className="my-3.5">
      <details data-sources className="group/sources details-unfold">
        <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-small bg-well px-2.25 py-1 font-medium text-caption text-ink transition-colors duration-(--dur-feedback) hover:bg-accent-soft [&::-webkit-details-marker]:hidden">
          <LinkIcon className="size-3.5 flex-none text-muted" />
          {plural(props.sources.length, { one: '# source', other: '# sources' })}
          <ChevronDownIcon className="size-3.25 flex-none opacity-55 transition-transform duration-(--dur-layout) ease-out group-open/sources:rotate-180 motion-reduce:transition-none" />
        </summary>
        {/* A flex item is no list item, so the rows count themselves. */}
        <ol className="mt-2 flex flex-col gap-0.5 [counter-reset:source]">
          {props.sources.map((part) => {
            const View = viewFor(part)
            return (
              <li
                key={part.url as string}
                className="flex w-fit min-w-0 max-w-full items-baseline gap-1.5 rounded-small bg-well px-2.25 py-1 text-caption transition-colors duration-(--dur-feedback) [counter-increment:source] before:flex-none before:text-muted before:tabular-nums before:content-[counter(source)] has-[a:hover]:bg-accent-soft"
              >
                {View && <View part={part} record={props.record} blobUrl={props.blobUrl} />}
              </li>
            )
          })}
        </ol>
      </details>
    </section>
  )
}
