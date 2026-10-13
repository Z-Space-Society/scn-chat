import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Chips } from '../../../src/shared/ui/Badge.tsx'
import { Button } from '../../../src/shared/ui/Button.tsx'
import { CopyButton } from '../../../src/shared/ui/CopyButton.tsx'
import { Switch } from '../../../src/shared/ui/controls.tsx'
import { ItemNames } from '../../../src/shared/ui/ItemList.tsx'
import {
  Choice,
  Choices,
  ConfirmButton,
  SaveBar,
  SettingRow,
} from '../../../src/shared/ui/SettingsPage.tsx'
import { Loading, SkeletonText } from '../../../src/shared/ui/Skeleton.tsx'

describe('Button', () => {
  it('is a plain button unless it submits', () => {
    render(
      <form>
        <Button>Cancel</Button>
        <Button type="submit">Save</Button>
      </form>,
    )
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveAttribute('type', 'button')
    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('type', 'submit')
  })

  it('keeps its label while busy, disabled and marked busy', () => {
    render(<Button busy>Load models</Button>)
    const button = screen.getByRole('button', { name: 'Load models' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
  })
})

describe('Loading', () => {
  it('reads out what is loading once, with its skeletons hidden', () => {
    const { container } = render(
      <Loading label="Loading chats">
        <SkeletonText className="w-24" />
      </Loading>,
    )
    expect(screen.getByRole('status')).toHaveTextContent('Loading chats')
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true')
    expect(container.querySelector('[aria-hidden="true"]')).toBeInTheDocument()
  })
})

describe('ConfirmButton', () => {
  it('asks in place, moving focus to Cancel, and acts only once confirmed', async () => {
    const onConfirm = vi.fn()
    render(<ConfirmButton label="Delete role" question="Delete this role?" onConfirm={onConfirm} />)
    await userEvent.click(screen.getByRole('button', { name: 'Delete role' }))
    expect(screen.getByText('Delete this role?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onConfirm).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Delete role' }))
    await userEvent.click(screen.getByRole('button', { name: 'Delete role' }))
    expect(onConfirm).toHaveBeenCalledOnce()
    expect(screen.queryByText('Delete this role?')).not.toBeInTheDocument()
  })
})

describe('Switch', () => {
  it('is a checkbox named by its setting row', async () => {
    render(
      <SettingRow label="Generate titles" htmlFor="titles">
        <Switch id="titles" />
      </SettingRow>,
    )
    const toggle = screen.getByRole('checkbox', { name: 'Generate titles' })
    await userEvent.click(toggle)
    expect(toggle).toBeChecked()
  })
})

describe('Choice', () => {
  it('picks its value from anywhere on its row', async () => {
    const onChange = vi.fn()
    render(
      <Choices title="Registration">
        <Choice name="r" value="open" checked onChange={onChange} label="Open" />
        <Choice
          name="r"
          value="invite"
          checked={false}
          onChange={onChange}
          label="Invite only"
          description="Only people you invite."
        />
      </Choices>,
    )
    expect(screen.getByRole('group', { name: 'Registration' })).toBeInTheDocument()
    await userEvent.click(screen.getByText('Only people you invite.'))
    expect(onChange).toHaveBeenCalledWith('invite')
  })
})

describe('SaveBar', () => {
  it('says Saved in a status and shows the last error', () => {
    render(<SaveBar pending={false} saved error="Couldn't save." />)
    expect(screen.getByRole('status')).toHaveTextContent('Saved')
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't save.")
  })

  it('is busy while it saves, keeping its label', () => {
    render(<SaveBar pending saved={false} />)
    const save = screen.getByRole('button', { name: 'Save' })
    expect(save).toBeDisabled()
    expect(save).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })
})

describe('CopyButton', () => {
  it('copies its text and says so', async () => {
    const user = userEvent.setup()
    render(<CopyButton text="0 * * * * curl …" icon />)
    await user.click(screen.getByRole('button', { name: 'Copy' }))
    expect(await navigator.clipboard.readText()).toBe('0 * * * * curl …')
    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument()
  })
})

describe('ItemNames', () => {
  it('shows each detail, leaving out empty ones', () => {
    render(<ItemNames title="admin" details={['2 members', false, 'PDS on bsky.social']} />)
    expect(screen.getByText('2 members')).toBeInTheDocument()
    expect(screen.getByText('PDS on bsky.social')).toBeInTheDocument()
    expect(screen.getByText('admin').closest('span')?.querySelectorAll('small span')).toHaveLength(
      2,
    )
  })
})

describe('Chips', () => {
  it('says None for no values', () => {
    render(<Chips values={[]} />)
    expect(screen.getByText('None')).toBeInTheDocument()
  })
})
