import { cn } from '../../../shared/cn.ts'
import { ChevronRightIcon, CloseIcon, HashIcon } from '../../../shared/icons.tsx'
import { plural } from '../../../shared/plural.ts'
import { sectionHeading, sidebarRow } from '../../../shared/ui/sidebar.ts'

interface Props {
  /** Every tag on the user's chats, with how many chats carry it, in order of first use. */
  tags: { tag: string; count: number }[]
  /** The tag the list is filtered to, if any. */
  active: string | null
  onChange: (tag: string | null) => void
}

/**
 * The user's tags as a section of rows that filter the list to one tag, which folds away under its
 * heading, whose small chevron follows the label, as in Linear. Picking the active tag again, or
 * the clear button at the heading's end, shows every chat.
 */
export function TagFilter(props: Props) {
  return (
    <details className="group/tags relative" open>
      <summary
        className={cn(
          sectionHeading,
          'mt-0 w-fit cursor-pointer list-none rounded-row hover:bg-row-hover hover:text-ink [&::-webkit-details-marker]:hidden',
        )}
      >
        Tags
        <ChevronRightIcon className="size-3.25 opacity-70 transition-[rotate] duration-(--dur-feedback) ease-out group-open/tags:rotate-90 motion-reduce:transition-none rtl:rotate-180 rtl:group-open/tags:rotate-90" />
      </summary>
      {props.active && (
        <button
          type="button"
          aria-label="Clear the tag filter"
          title="Clear the tag filter"
          onClick={() => props.onChange(null)}
          className="absolute end-0 top-0 inline-flex cursor-pointer rounded-row p-0.75 text-muted hover:bg-row-hover"
        >
          <CloseIcon className="size-3.75" />
        </button>
      )}
      <ul aria-label="Filter by tag" className="flex flex-col gap-0.5">
        {props.tags.map((t) => (
          <li key={t.tag}>
            <button
              type="button"
              aria-label={`${t.tag}, ${plural(t.count, { one: '# chat', other: '# chats' })}`}
              aria-pressed={t.tag === props.active}
              onClick={() => props.onChange(t.tag === props.active ? null : t.tag)}
              className={cn(
                sidebarRow,
                'cursor-pointer aria-pressed:bg-row-current aria-pressed:text-ink-strong aria-pressed:[&_svg]:text-accent-strong',
              )}
            >
              <HashIcon />
              <span className="min-w-0 flex-1 truncate">{t.tag}</span>
              <span className="text-caption text-muted tabular-nums">{t.count}</span>
            </button>
          </li>
        ))}
      </ul>
    </details>
  )
}
