import type { ModelRef } from '@scn-chat/lexicons'
import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../../../shared/cn.ts'
import {
  ArrowLeftIcon,
  ChevronRightIcon,
  InfoIcon,
  MoreIcon,
  QuoteIcon,
  RetryIcon,
} from '../../../shared/icons.tsx'
import { iconAction } from '../../../shared/ui/actions.ts'
import { MenuItem } from '../../../shared/ui/MenuItem.tsx'
import { floating } from '../../../shared/ui/menu.ts'
import { useDismiss } from '../../../shared/useDismiss.ts'
import { usePlacement } from '../../../shared/usePlacement.ts'
import { type ModelOption, modelRef } from '../../models/models.ts'
import { DetailsList, detailsCard } from './RecordDetails.tsx'

type View = 'closed' | 'menu' | 'models' | 'details'

interface Props {
  /** The reply's element, to tell whether the reader selected text inside it. */
  elementId: string
  /** The whole reply's text, quoted when nothing in it is selected. */
  text: string
  /** Quote text into the composer, when the composer can take a quote. */
  onQuote?: (text: string) => void
  models: ModelOption[]
  /** Regenerate the reply with the model picked. */
  onRegenerate: (model: ModelRef) => void
  /** What the reply's record says, shown in its details. */
  rows: [string, string][]
}

const menu = cn(floating, 'fixed z-50 flex w-54 flex-col gap-0.5')

/**
 * A reply's less used actions behind one button: quote, regenerate with another model, and the
 * record's details. Regenerating and the details each take the menu's place, under a quiet way
 * back, so nothing opens beyond it. Escape or a click outside closes it.
 */
export function MoreActions(props: Props) {
  const id = useId()
  const button = useRef<HTMLButtonElement>(null)
  const floatingRef = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<View>('closed')
  // The selection, read as the menu opens, since choosing Quote would clear it.
  const [selected, setSelected] = useState('')
  const position = usePlacement(view !== 'closed', button, floatingRef)
  useDismiss(view !== 'closed', [button, floatingRef], (reason) => {
    setView('closed')
    if (reason === 'escape') button.current?.focus()
  })

  // Each view starts at its first control, so the keyboard lands inside it.
  useEffect(() => {
    if (view === 'closed') return
    floatingRef.current?.querySelector<HTMLElement>('button')?.focus()
  }, [view])

  const open = () => {
    if (view !== 'closed') return setView('closed')
    const selection = window.getSelection()
    const element = document.getElementById(props.elementId)
    const text = selection?.toString().trim() ?? ''
    const inside = selection?.anchorNode && element?.contains(selection.anchorNode)
    setSelected(text && inside ? text : '')
    setView('menu')
  }

  const close = () => {
    setView('closed')
    button.current?.focus()
  }

  return (
    <>
      <button
        ref={button}
        type="button"
        aria-label="More actions"
        title="More actions"
        aria-expanded={view !== 'closed'}
        aria-controls={view !== 'closed' ? id : undefined}
        // Pressing the button would otherwise clear the selection before it is read.
        onMouseDown={(e) => e.preventDefault()}
        onClick={open}
        className={iconAction}
      >
        <MoreIcon />
      </button>
      {view !== 'closed' &&
        createPortal(
          <>
            {view === 'menu' && (
              <div ref={floatingRef} id={id} style={position} className={menu}>
                {props.onQuote && (
                  <MenuItem
                    onClick={() => {
                      props.onQuote?.(selected || props.text)
                      close()
                    }}
                  >
                    <QuoteIcon /> {selected ? 'Quote selection' : 'Quote reply'}
                  </MenuItem>
                )}
                {props.models.length > 0 && (
                  <MenuItem onClick={() => setView('models')}>
                    <RetryIcon /> Regenerate with
                    <ChevronRightIcon className="ms-auto" />
                  </MenuItem>
                )}
                <MenuItem onClick={() => setView('details')}>
                  <InfoIcon /> Details
                </MenuItem>
              </div>
            )}
            {view === 'models' && (
              <div ref={floatingRef} id={id} style={position} className={menu}>
                <MenuItem
                  aria-label="Back from Regenerate with"
                  onClick={() => setView('menu')}
                  className="text-muted"
                >
                  <ArrowLeftIcon /> Regenerate with
                </MenuItem>
                <div className="flex max-h-64 flex-col gap-0.5 overflow-y-auto overscroll-contain">
                  {props.models.map((model) => (
                    <MenuItem
                      key={`${model.provider}/${model.id}`}
                      onClick={() => {
                        props.onRegenerate(modelRef(model))
                        close()
                      }}
                      className="[overflow-wrap:anywhere]"
                    >
                      {model.name}
                    </MenuItem>
                  ))}
                </div>
              </div>
            )}
            {view === 'details' && (
              <div ref={floatingRef} id={id} style={position} className={detailsCard}>
                <button
                  type="button"
                  aria-label="Back from Details"
                  onClick={() => setView('menu')}
                  className="-ms-1.75 -mt-1.25 mb-2 inline-flex cursor-pointer items-center gap-1.5 rounded-row px-1.75 py-0.75 text-caption text-muted hover:bg-row-hover hover:text-ink"
                >
                  <ArrowLeftIcon /> Details
                </button>
                <DetailsList rows={props.rows} />
              </div>
            )}
          </>,
          document.body,
        )}
    </>
  )
}
