import { useStore } from '@tanstack/react-form'
import { type ReactNode, useEffect, useId, useRef, useState } from 'react'
import { cn } from '../cn.ts'
import { useFormContext } from '../form.tsx'
import { CheckIcon } from '../icons.tsx'
import { Button, IconButton } from './Button.tsx'
import { Radio } from './controls.tsx'
import { Loading, Skeleton, SkeletonText } from './Skeleton.tsx'

/*
 * The pieces settings and admin pages are built from: a page of cards, each holding rows of
 * settings or a form, with Save in a bar at the foot of the panel.
 */

interface PageProps {
  title: ReactNode
  /** One line under the title saying what the section is for. */
  description?: ReactNode
  /** A link above the title back to where this page was opened from, styled with backLink. */
  back?: ReactNode
  /** Buttons or links beside the title that act on the whole page, such as adding an item. */
  actions?: ReactNode
  children?: ReactNode
}

/**
 * A settings section: its title and what it is for, over its groups, in a column that reads at a
 * glance. Its rows lay themselves out for its width, so they stack beside the nav just past the
 * phone breakpoint as well as on a phone.
 */
export function SettingsPage(props: PageProps) {
  return (
    <section className="@container mx-auto w-full max-w-settings pt-9.5 pb-12 max-wide:pt-0 [&>[role=alert]]:mb-4">
      {props.back && <div className="mb-2.5 text-small">{props.back}</div>}
      <header className="mb-9 flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 shrink grow basis-80">
          <h2 className="text-balance font-semibold text-ink-strong text-title leading-tight tracking-title">
            {props.title}
          </h2>
          {props.description && <p className="mt-0.75 text-muted text-ui">{props.description}</p>}
        </div>
        {props.actions && <div className="flex items-center gap-2">{props.actions}</div>}
      </header>
      {props.children}
    </section>
  )
}

/** The way back to the page this one was opened from, quiet above the title. */
export const backLink = 'inline-flex items-center gap-1.5 text-muted no-underline hover:text-ink'

interface GroupProps {
  title?: string
  description?: ReactNode
  /** Whether the card holds actions that can't be undone, which edges it in red. */
  danger?: boolean
  /** A note under the card, such as who its settings don't apply to. */
  note?: ReactNode
  children: ReactNode
}

const note = 'mx-card-pad mt-2.5 text-muted text-small'

const heading = 'ms-card-pad font-semibold text-muted text-small leading-tight'

/** What a card is for, under its heading, in its words' own line height since it may wrap. */
const groupDescription = cn(heading, '-mt-1 mb-2.5 font-normal leading-[1.45]')

/**
 * A card of related settings under a quiet heading in line with the text of its rows. The card
 * holds settings rather than being one to press, so it lies flat: a tint with no edge of its own,
 * its rows divided by lines inset to their text, as in a system settings list.
 */
export function SettingsGroup(props: GroupProps) {
  const id = useId()
  return (
    // A group named by its heading when it has one, as one plugin's settings are.
    <fieldset aria-labelledby={props.title ? id : undefined} className="mb-8 min-w-0">
      {props.title && (
        <h3 id={id} className={cn(heading, 'mb-2.25')}>
          {props.title}
        </h3>
      )}
      {props.description && <p className={groupDescription}>{props.description}</p>}
      <SettingsCard danger={props.danger}>{props.children}</SettingsCard>
      {props.note && <p className={note}>{props.note}</p>}
    </fieldset>
  )
}

interface CardProps {
  danger?: boolean
  children: ReactNode
}

/** What a card holds after something it continues, such as a search's results, with no line between. */
export const undivided = 'before:hidden'

/** A form of one field and its button across a card, such as a search or adding a person. */
export const inlineForm = 'flex gap-2 p-card-pad [&>input]:min-w-0 [&>input]:flex-1'

/** An error at the foot of a card, across it. */
export const cardAlert = 'bg-danger-soft p-card-pad text-small'

/** Rows divided by lines inset to their text, for a card's rows or a set of rows within one. */
export const dividedRows =
  '[&>*+*]:relative [&>*+*]:before:absolute [&>*+*]:before:inset-x-card-pad [&>*+*]:before:top-0 [&>*+*]:before:border-line [&>*+*]:before:border-t'

/** group/card lets what a card holds line up with the rest of it, as number fields do by their units. */
function SettingsCard(props: CardProps) {
  return (
    <div
      className={cn(
        'group/card overflow-clip rounded-panel border border-transparent bg-card',
        dividedRows,
        props.danger && 'border-danger-border',
      )}
    >
      {props.children}
    </div>
  )
}

interface ChoicesProps {
  /** What the choice is about, read as the group's name and shown as its heading. */
  title: string
  description?: ReactNode
  /** A note under the card, such as who the choice doesn't apply to. */
  note?: ReactNode
  children: ReactNode
}

/** A choice among a few modes, as a card whose rows each hold one with what it means. */
export function Choices(props: ChoicesProps) {
  return (
    <fieldset className="mb-8 min-w-0">
      <legend className={cn(heading, 'float-start mb-2.25 w-full')}>{props.title}</legend>
      {props.description && <p className={groupDescription}>{props.description}</p>}
      <div className="clear-both">
        <SettingsCard>{props.children}</SettingsCard>
      </div>
      {props.note && <p className={note}>{props.note}</p>}
    </fieldset>
  )
}

interface ChoiceProps {
  name: string
  value: string
  checked: boolean
  onChange: (value: string) => void
  label: ReactNode
  description?: ReactNode
  disabled?: boolean
}

/** One mode, with what it means and a radio at its end. The whole row picks it. */
export function Choice(props: ChoiceProps) {
  const id = useId()
  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-center justify-between gap-4 p-card-pad hover:bg-row-hover"
    >
      <span className="flex flex-col">
        <strong className="font-medium text-ink-strong">{props.label}</strong>
        {props.description && <small className={description}>{props.description}</small>}
      </span>
      <Radio
        id={id}
        name={props.name}
        value={props.value}
        checked={props.checked}
        disabled={props.disabled}
        onChange={() => props.onChange(props.value)}
      />
    </label>
  )
}

const description = 'mt-0.5 text-muted text-small leading-[1.45]'

interface RowProps {
  label: ReactNode
  /** The control the label names. */
  htmlFor?: string
  description?: ReactNode
  /** Problems with the value, such as ones the server found, under the description. */
  issues?: ReactNode
  /** Whether the control takes the row's whole width under its label, as a textarea does. */
  wide?: boolean
  children?: ReactNode
}

/**
 * One setting: what it is on the left, its control on the right, or under it when the row is wide
 * or the column narrow. A switch stays beside its words, since it fits.
 */
export function SettingRow(props: RowProps) {
  return (
    <div
      data-wide={props.wide || undefined}
      className="flex @max-narrow:not-has-[[data-switch]]:flex-col items-center @max-narrow:not-has-[[data-switch]]:items-stretch justify-between gap-x-8 gap-y-3 p-card-pad data-wide:flex-col data-wide:items-stretch"
    >
      <div className="min-w-0 flex-1">
        <SettingLabel htmlFor={props.htmlFor}>{props.label}</SettingLabel>
        {props.description && <p className={description}>{props.description}</p>}
        {props.issues}
      </div>
      {props.children && (
        <div
          className={cn(
            'flex @max-narrow:max-w-none in-data-wide:max-w-none max-w-11/20 flex-none items-center gap-2',
            // A text field keeps a steady width beside its label and takes the row under it.
            '@max-narrow:[&>input:not([type=checkbox])]:w-full [&>input:not([type=checkbox])]:w-64 in-data-wide:[&>input:not([type=checkbox])]:w-full',
            '@max-narrow:[&>[role=combobox]]:w-full [&>[role=combobox]]:min-w-52',
            // A textarea starts at a few lines and grows with what is typed in it.
            '[&>textarea]:field-sizing-content [&>textarea]:max-h-96 [&>textarea]:min-h-24 [&>textarea]:w-full [&>textarea]:resize-y',
          )}
        >
          {props.children}
        </div>
      )}
    </div>
  )
}

interface LabelProps {
  htmlFor?: string
  children: ReactNode
}

/** A label for a control, or plain text over an action, which a click on its name should not run. */
function SettingLabel(props: LabelProps) {
  const className = 'block font-medium text-ink-strong'
  if (!props.htmlFor) return <span className={className}>{props.children}</span>
  return (
    <label className={className} htmlFor={props.htmlFor}>
      {props.children}
    </label>
  )
}

interface FieldProps {
  label: string
  htmlFor: string
  /** A quiet note under the control, such as what to type in it. */
  hint?: ReactNode
  optional?: boolean
  /** Whether the field spans the form's columns. */
  wide?: boolean
  children: ReactNode
}

/** A field in a form that stacks its label over its control, as for adding a key. */
export function Field(props: FieldProps) {
  return (
    <div
      className={cn(
        'flex min-w-0 flex-col gap-1.5 [&>:is(input,select,[role=combobox])]:h-9.25 [&>:is(input,select,[role=combobox])]:w-full',
        props.wide && 'col-span-full',
      )}
    >
      <label htmlFor={props.htmlFor} className="font-medium text-ink-strong text-ui">
        {props.label}{' '}
        {props.optional && (
          <span className="ms-1 font-normal text-caption text-muted">Optional</span>
        )}
      </label>
      {props.children}
      {props.hint && <p className="text-muted text-small">{props.hint}</p>}
    </div>
  )
}

/** A form's fields, labels over their controls, two to a row where there is room. */
export const fields = 'grid grid-cols-2 gap-4 @max-narrow:grid-cols-1'

interface SaveBarProps {
  /** What the button says, Save unless it does something else, such as Add. */
  label?: string
  /** Whether the form adds something new rather than editing what was saved, so it never says its changes are unsaved. */
  adds?: boolean
  /** Whether it is saving, which turns a spinner before its label. */
  pending: boolean
  /** Whether there is nothing to save yet, such as before a required choice. */
  disabled?: boolean
  /** Whether the last save succeeded and nothing has changed since, which the form must reset on any edit. */
  saved: boolean
  error?: string | null
}

/**
 * The form's Save, kept in view at the foot of the panel over the settings fading under it, with
 * how the last save went. It reads its form's changes itself: Save waits for one, and the bar says
 * there are changes to save.
 */
export function SaveBar(props: SaveBarProps) {
  const form = useFormContext()
  // Saved holds only until the next edit, so it covers a save the form doesn't start over from.
  const edited = useStore(form.store, (state) => !state.isDefaultValue)
  const changed = edited && !props.saved
  return (
    <div className="before:mask-t-from-[calc(100%-(--spacing(4)))] sticky bottom-0 isolate -mt-2 flex flex-wrap items-center justify-end gap-x-3 gap-y-2 pt-4 pb-5 before:absolute before:-inset-x-gutter before:inset-y-0 before:-z-1 before:bg-panel">
      {props.error && (
        <p role="alert" className="me-auto text-danger text-small">
          {props.error}
        </p>
      )}
      {/* The status is always there, so screen readers announce it when it fills. */}
      <span
        role="status"
        className="inline-flex items-center gap-1.25 font-medium text-small empty:hidden"
      >
        <SaveStatus saved={props.saved} changed={changed && !props.adds} />
      </span>
      <Button
        type="submit"
        className="px-5 py-1.5"
        busy={props.pending}
        disabled={props.disabled || !changed}
      >
        {props.label ?? 'Save'}
      </Button>
    </div>
  )
}

interface SaveStatusProps {
  saved: boolean
  /** Whether there are edits to save. */
  changed: boolean
}

/** That the last save went through, or that there are changes it doesn't hold yet. */
function SaveStatus(props: SaveStatusProps) {
  if (props.changed) return <span className="text-muted">Unsaved changes</span>
  if (!props.saved) return null
  return (
    <span className="inline-flex items-center gap-1.25 text-accent-strong">
      <CheckIcon /> Saved
    </span>
  )
}

interface ConfirmProps {
  /** What the button does, such as "Delete role". The confirming button says it again. */
  label: string
  /** What the button is read out as until asked, when its label is too short to say what it acts on. */
  name?: string
  /** The question asked before it happens, such as "Delete this role?" */
  question: string
  onConfirm: () => void
  disabled?: boolean
  /**
   * How it looks until asked, red by default. Quiet suits a row of a list, and default something
   * that loses nothing for good, as rebuilding this device's copy. Only the confirming button is red.
   */
  tone?: 'quiet' | 'default'
  /** An icon to show in place of the label until asked, with what it is read out as. */
  icon?: { icon: ReactNode; label: string }
}

/** A button for something that can't be undone, which asks in place before doing it. */
export function ConfirmButton(props: ConfirmProps) {
  const [asking, setAsking] = useState(false)
  const cancel = useRef<HTMLButtonElement>(null)
  // The button that was clicked is gone, so focus moves to the safe answer.
  useEffect(() => {
    if (asking) cancel.current?.focus()
  }, [asking])
  if (!asking && props.icon)
    return (
      <IconButton
        tone="danger"
        aria-label={props.icon.label}
        disabled={props.disabled}
        onClick={() => setAsking(true)}
      >
        {props.icon.icon}
      </IconButton>
    )
  if (!asking)
    return (
      <Button
        tone={props.tone ?? 'danger'}
        aria-label={props.name}
        disabled={props.disabled}
        onClick={() => setAsking(true)}
      >
        {props.label}
      </Button>
    )
  return (
    <span className="ms-auto inline-flex flex-wrap items-center justify-end gap-1.5 text-ink-strong text-small">
      <span className="me-1">{props.question}</span>
      <Button ref={cancel} size="small" onClick={() => setAsking(false)}>
        Cancel
      </Button>
      <Button
        tone="danger"
        size="small"
        onClick={() => {
          setAsking(false)
          props.onConfirm()
        }}
      >
        {props.label}
      </Button>
    </span>
  )
}

interface EmptyProps {
  /** Whether it stands in for the cards themselves, as a dashed outline of where they would be. */
  outlined?: boolean
  children: ReactNode
}

/** What a card or a section says when it has nothing to show. */
export function SettingsEmpty(props: EmptyProps) {
  return (
    <p
      className={cn(
        'px-card-pad py-6.5 text-center text-muted text-ui',
        props.outlined && 'rounded-panel border border-line border-dashed',
      )}
    >
      {props.children}
    </p>
  )
}

interface CalloutProps {
  /** Green for good news, red for a problem, grey otherwise. */
  tone?: 'good' | 'danger'
  /** An icon before the note, such as where something is kept. */
  icon?: ReactNode
  children: ReactNode
}

/** A note in the flow of the page. */
export function Callout(props: CalloutProps) {
  return (
    <div
      className={cn(
        'mb-7 flex items-start gap-3.5 rounded-panel bg-surface p-card-pad text-ink text-ui [&>svg]:mt-0.5 [&>svg]:size-5',
        props.tone === 'good' && 'bg-accent-soft text-accent-strong',
        props.tone === 'danger' && 'bg-danger-soft text-danger',
      )}
    >
      {props.icon}
      <div className="min-w-0 flex-1">{props.children}</div>
    </div>
  )
}

/** The widths of a page skeleton's rows, a setting's name over what it does, so they differ. */
const skeletonRows = [
  { name: 'w-1/3', about: 'w-3/5' },
  { name: 'w-1/4', about: 'w-1/2' },
  { name: 'w-2/5', about: 'w-2/3' },
]

/**
 * A settings page while it loads, in the page's own shape: its title and what it is for, over a
 * card of rows, each a setting's name and description beside its control. It is a route's pending
 * page, which the router already holds back until loading takes a while, so it shows at once.
 */
export function SettingsPageSkeleton() {
  return (
    <Loading immediate className="mx-auto w-full max-w-settings pt-9.5 pb-12 max-wide:pt-0">
      <div className="mb-9">
        <SkeletonText className="w-40 text-title leading-tight" />
        <SkeletonText className="mt-0.75 w-80 max-w-full text-ui" />
      </div>
      <SkeletonText className="ms-card-pad mb-2.25 w-24 text-small leading-tight" />
      <div className={cn('rounded-panel bg-card', dividedRows)}>
        {skeletonRows.map((row) => (
          <SettingRowShape key={row.name} name={row.name} about={row.about} />
        ))}
      </div>
    </Loading>
  )
}

/** A setting's row on its way, in a card of settings that has loaded, as one waiting on its own data. */
export function SettingRowSkeleton() {
  return (
    <Loading>
      <SettingRowShape name="w-2/5" about="w-3/5" />
    </Loading>
  )
}

interface ShapeProps {
  /** The widths of the setting's name and of what it does. */
  name: string
  about: string
}

function SettingRowShape(props: ShapeProps) {
  return (
    <div className="flex items-center justify-between gap-8 p-card-pad">
      <div className="min-w-0 flex-1">
        <SkeletonText className={props.name} />
        <SkeletonText className={cn('mt-0.5 text-small leading-[1.45]', props.about)} />
      </div>
      <Skeleton className="h-6 w-16 flex-none" />
    </div>
  )
}
