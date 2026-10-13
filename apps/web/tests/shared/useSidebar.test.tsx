import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SidebarToggle } from '../../src/shared/ui/SidebarToggle.tsx'
import { sidebarScript, useSidebar } from '../../src/shared/useSidebar.ts'

function Probe() {
  const sidebar = useSidebar()
  return (
    <div data-testid="probe" data-collapsed={sidebar.collapsed} data-drawer={sidebar.drawerOpen}>
      <SidebarToggle />
      <button type="button" onClick={sidebar.closeDrawer}>
        Close drawer
      </button>
    </div>
  )
}

const narrow = (matches: boolean) =>
  vi.stubGlobal('matchMedia', (query: string) => ({ matches, media: query }) as MediaQueryList)

afterEach(() => vi.unstubAllGlobals())

describe('useSidebar', () => {
  it('collapses the column on a wide screen, and remembers it', async () => {
    narrow(false)
    render(<Probe />)
    const probe = screen.getByTestId('probe')
    await userEvent.click(screen.getByRole('button', { name: 'Toggle sidebar' }))
    expect(probe).toHaveAttribute('data-collapsed', 'true')
    expect(localStorage.getItem('scn-chat:sidebar-collapsed')).toBe('1')
    expect(document.documentElement).toHaveAttribute('data-sidebar-collapsed')
    await userEvent.click(screen.getByRole('button', { name: 'Toggle sidebar' }))
    expect(probe).toHaveAttribute('data-collapsed', 'false')
    expect(document.documentElement).not.toHaveAttribute('data-sidebar-collapsed')
  })

  it('marks the root collapsed from the stored choice before the page renders', () => {
    localStorage.setItem('scn-chat:sidebar-collapsed', '1')
    new Function(sidebarScript)()
    expect(document.documentElement).toHaveAttribute('data-sidebar-collapsed')
    document.documentElement.removeAttribute('data-sidebar-collapsed')
    localStorage.setItem('scn-chat:sidebar-collapsed', '0')
    new Function(sidebarScript)()
    expect(document.documentElement).not.toHaveAttribute('data-sidebar-collapsed')
  })

  it('opens and closes the drawer on a narrow screen, leaving the column alone', async () => {
    narrow(true)
    render(<Probe />)
    const probe = screen.getByTestId('probe')
    await userEvent.click(screen.getByRole('button', { name: 'Toggle sidebar' }))
    expect(probe).toHaveAttribute('data-drawer', 'true')
    expect(probe).toHaveAttribute('data-collapsed', 'false')
    await userEvent.click(screen.getByRole('button', { name: 'Close drawer' }))
    expect(probe).toHaveAttribute('data-drawer', 'false')
  })
})
