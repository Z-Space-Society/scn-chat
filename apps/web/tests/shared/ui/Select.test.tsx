import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { Select, type SelectOption } from '../../../src/shared/ui/Select.tsx'

const options: SelectOption[] = [
  { value: 'a', label: 'Apple' },
  { value: 'b', label: 'Banana', disabled: true },
  { value: 'c', label: 'Cherry' },
  { value: 'd', label: 'Date' },
]

interface FruitProps {
  onChange?: (value: string) => void
  /** The fruit on offer, the four above unless given. */
  options?: SelectOption[]
  searchLabel?: string
}

function Fruit(props: FruitProps) {
  const [value, setValue] = useState('')
  return (
    <Select
      aria-label="Fruit"
      placeholder="Pick a fruit"
      options={props.options ?? options}
      value={value}
      searchLabel={props.searchLabel}
      onChange={(next) => {
        setValue(next)
        props.onChange?.(next)
      }}
    />
  )
}

const box = () => screen.getByRole('combobox', { name: 'Fruit' })
/** The active option's id, as the button, or else the search box, names it. */
const active = (owner = box()) => owner.getAttribute('aria-activedescendant')
const activeName = (owner = box()) => document.getElementById(active(owner) ?? '')?.textContent

describe('Select', () => {
  it('shows its placeholder, then the option picked with the mouse', async () => {
    render(<Fruit />)
    expect(box()).toHaveTextContent('Pick a fruit')
    expect(screen.queryByRole('listbox')).toBeNull()
    await userEvent.click(box())
    expect(box()).toHaveAttribute('aria-expanded', 'true')
    await userEvent.click(screen.getByRole('option', { name: 'Cherry' }))
    expect(box()).toHaveTextContent('Cherry')
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(box()).toHaveFocus()
  })

  it('moves with the arrow keys past disabled options, and picks with Enter', async () => {
    const onChange = vi.fn()
    render(<Fruit onChange={onChange} />)
    box().focus()
    await userEvent.keyboard('{ArrowDown}')
    expect(activeName()).toBe('Apple')
    await userEvent.keyboard('{ArrowDown}')
    expect(activeName()).toBe('Cherry')
    await userEvent.keyboard('{End}{ArrowDown}')
    expect(activeName()).toBe('Date')
    await userEvent.keyboard('{Home}{ArrowUp}')
    expect(activeName()).toBe('Apple')
    await userEvent.keyboard('{Enter}')
    expect(onChange).toHaveBeenCalledWith('a')
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('scrolls the active option into view only when it changes, so the list can be scrolled', async () => {
    const scrollIntoView = vi.fn()
    const original = Element.prototype.scrollIntoView
    Element.prototype.scrollIntoView = scrollIntoView
    onTestFinished(() => {
      Element.prototype.scrollIntoView = original
    })
    const { rerender } = render(<Fruit />)
    box().focus()
    await userEvent.keyboard('{ArrowDown}')
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    expect(scrollIntoView.mock.contexts[0]).toHaveTextContent('Apple')
    fireEvent.scroll(screen.getByRole('listbox'))
    rerender(<Fruit />)
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    await userEvent.keyboard('{ArrowDown}')
    expect(scrollIntoView).toHaveBeenCalledTimes(2)
    expect(scrollIntoView.mock.contexts[1]).toHaveTextContent('Cherry')
  })

  it('does not pick a disabled option', async () => {
    const onChange = vi.fn()
    render(<Fruit onChange={onChange} />)
    await userEvent.click(box())
    await userEvent.click(screen.getByRole('option', { name: 'Banana' }))
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('listbox')).toBeInTheDocument()
  })

  it('closes on Escape without picking, and keeps Escape from the page', async () => {
    const onKeyDown = vi.fn()
    document.addEventListener('keydown', onKeyDown)
    const onChange = vi.fn()
    render(<Fruit onChange={onChange} />)
    box().focus()
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Escape}')
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(onChange).not.toHaveBeenCalled()
    expect(onKeyDown.mock.calls.map(([event]) => event.key)).not.toContain('Escape')
    document.removeEventListener('keydown', onKeyDown)
  })

  it('jumps to the option starting with what is typed', async () => {
    render(<Fruit />)
    box().focus()
    await userEvent.keyboard('d')
    expect(activeName()).toBe('Date')
    await userEvent.keyboard('{Enter}')
    expect(box()).toHaveTextContent('Date')
  })

  it('closes when focus leaves it', async () => {
    render(
      <>
        <Fruit />
        <button type="button">Elsewhere</button>
      </>,
    )
    await userEvent.click(box())
    await userEvent.click(screen.getByRole('button', { name: 'Elsewhere' }))
    expect(screen.queryByRole('listbox')).toBeNull()
  })
})

/** Enough fruit for a search. */
const fruits: SelectOption[] = [
  { value: 'a', label: 'Apple', keywords: 'malus' },
  { value: 'b', label: 'Blood orange' },
  { value: 'c', label: 'Cherry' },
  { value: 'd', label: 'Date' },
  { value: 'e', label: 'Elderberry' },
  { value: 'f', label: 'Fig' },
  { value: 'g', label: 'Grape' },
  { value: 'o', label: 'Orange', disabled: true },
]

function SearchableFruit(props: FruitProps) {
  return (
    <>
      <Fruit options={fruits} searchLabel="Search fruit" onChange={props.onChange} />
      <button type="button">Next</button>
    </>
  )
}

const searchBox = () => screen.getByRole('combobox', { name: 'Search fruit' })
const shown = () => screen.getAllByRole('option').map((option) => option.textContent)

describe('Select with search', () => {
  it('offers no search while the list is short', async () => {
    render(<Fruit options={fruits.slice(0, 7)} searchLabel="Search fruit" />)
    await userEvent.click(box())
    expect(screen.queryByRole('combobox', { name: 'Search fruit' })).toBeNull()
  })

  it('opens on a search box that narrows the options by label and keywords, every word in any case', async () => {
    render(<SearchableFruit />)
    await userEvent.click(box())
    expect(searchBox()).toHaveFocus()
    expect(shown()).toHaveLength(8)
    await userEvent.type(searchBox(), 'ORANGE')
    expect(shown()).toEqual(['Blood orange', 'Orange'])
    await userEvent.clear(searchBox())
    await userEvent.type(searchBox(), 'orange blood')
    expect(shown()).toEqual(['Blood orange'])
    await userEvent.clear(searchBox())
    await userEvent.type(searchBox(), 'mal')
    expect(shown()).toEqual(['Apple'])
  })

  it('names a different active option as the first match changes, and keeps it in view', async () => {
    const scrollIntoView = vi.fn()
    const original = Element.prototype.scrollIntoView
    Element.prototype.scrollIntoView = scrollIntoView
    onTestFinished(() => {
      Element.prototype.scrollIntoView = original
    })
    render(<SearchableFruit />)
    await userEvent.click(box())
    await userEvent.type(searchBox(), 'e')
    expect(activeName(searchBox())).toBe('Apple')
    const before = active(searchBox())
    await userEvent.type(searchBox(), 'r')
    expect(activeName(searchBox())).toBe('Cherry')
    expect(active(searchBox())).not.toBe(before)
    expect(scrollIntoView.mock.contexts.at(-1)).toHaveTextContent('Cherry')
  })

  it('moves with the arrow keys past disabled options and picks with Enter, back on the button', async () => {
    const onChange = vi.fn()
    render(<SearchableFruit onChange={onChange} />)
    await userEvent.click(box())
    await userEvent.type(searchBox(), 'or')
    expect(activeName(searchBox())).toBe('Blood orange')
    await userEvent.keyboard('{ArrowDown}')
    expect(activeName(searchBox())).toBe('Blood orange')
    await userEvent.keyboard('{Enter}')
    expect(onChange).toHaveBeenCalledWith('b')
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(box()).toHaveFocus()
    expect(box()).toHaveTextContent('Blood orange')
  })

  it('picks an option clicked while searching', async () => {
    render(<SearchableFruit />)
    await userEvent.click(box())
    await userEvent.type(searchBox(), 'ch')
    await userEvent.click(screen.getByRole('option', { name: 'Cherry' }))
    expect(box()).toHaveTextContent('Cherry')
    expect(box()).toHaveFocus()
  })

  it('says when nothing matches, and Escape closes it and clears the search', async () => {
    render(<SearchableFruit />)
    await userEvent.click(box())
    // The status is there before it has anything to say, so screen readers hear it when it does.
    expect(screen.getByRole('status')).toHaveTextContent('')
    await userEvent.type(searchBox(), 'kiwi')
    expect(screen.getByRole('status')).toHaveTextContent('No matches')
    expect(screen.queryAllByRole('option')).toEqual([])
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(box()).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    expect(searchBox()).toHaveValue('')
    expect(shown()).toHaveLength(8)
  })

  it('opens searching for a letter typed on the closed button', async () => {
    render(<SearchableFruit />)
    box().focus()
    await userEvent.keyboard('c')
    expect(searchBox()).toHaveFocus()
    expect(searchBox()).toHaveValue('c')
    expect(activeName(searchBox())).toBe('Cherry')
  })

  it('closes on Tab, which goes on from the button', async () => {
    render(<SearchableFruit />)
    await userEvent.click(box())
    await userEvent.tab()
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(screen.getByRole('button', { name: 'Next' })).toHaveFocus()
  })

  it('leaves the search box for a tap on a touch screen, so its keyboard does not cover the list', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(hover: none)',
      media: query,
    }))
    onTestFinished(() => {
      vi.unstubAllGlobals()
    })
    render(<SearchableFruit />)
    await userEvent.click(box())
    expect(searchBox()).not.toHaveFocus()
    await userEvent.click(searchBox())
    expect(searchBox()).toHaveFocus()
    expect(screen.getByRole('listbox')).toBeInTheDocument()
  })
})
