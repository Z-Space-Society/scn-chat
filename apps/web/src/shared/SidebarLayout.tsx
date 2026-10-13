import { useLoaderData, useLocation } from '@tanstack/react-router'
import { type ReactNode, useEffect } from 'react'
import { cn } from './cn.ts'
import { Logo } from './ui/Logo.tsx'
import { SidebarToggle } from './ui/SidebarToggle.tsx'
import { useSidebar } from './useSidebar.ts'

interface Props {
  /**
   * The chats, whose sidebar is a column beside the panel that collapses off the window's edge, or
   * settings and admin, whose nav sits inside the panel beside the section.
   */
  kind: 'chats' | 'settings'
  /** What the sidebar holds, such as the chat list or links to each section. */
  nav?: ReactNode
  /** The page's frame while its code loads, with no head. */
  frame?: boolean
  children?: ReactNode
}

/**
 * The sidebar, after Linear's: dense one-line rows of small text on the frame. On a narrow screen it
 * is a drawer over the page, closed until opened, which closes again once a link in it is followed.
 */
export function SidebarLayout(props: Props) {
  const sidebar = useSidebar()
  const pathname = useLocation({ select: (location) => location.pathname })
  const { closeDrawer } = sidebar
  // biome-ignore lint/correctness/useExhaustiveDependencies: closing follows each navigation.
  useEffect(() => closeDrawer(), [pathname])
  const backdrop = sidebar.drawerOpen && (
    <button
      type="button"
      aria-label="Close sidebar"
      onClick={closeDrawer}
      className="fixed inset-0 z-19 wide:hidden animate-fade-in cursor-default bg-backdrop motion-reduce:animate-none"
    />
  )
  if (props.kind === 'settings')
    return (
      // The panel fills the window, with the nav at its start and the section centered in the rest,
      // so the nav stays put from section to section. The nav sits as far from the window's edge
      // as the chat list does, with the chat's gutter on the other side.
      <div data-drawer-open={sidebar.drawerOpen || undefined} className="flex h-dvh">
        <main className="relative min-w-0 flex-1 overflow-y-auto bg-panel ps-sidebar-pad pe-gutter max-wide:px-gutter max-wide:pt-gutter">
          {/* On a narrow screen the toggle opens the page, a gutter from the panel's corner like
              the section under it, and stays there as the page scrolls, since a sticky element
              keeps clear of its scroll container's padding. */}
          <div className="sticky top-0 z-3 mb-3 wide:hidden w-fit">
            <SidebarToggle className="border border-line bg-raised" />
          </div>
          <div className="flex gap-12">
            <nav
              className={cn(
                sidebarClass,
                'wide:sticky wide:top-0 wide:max-h-dvh wide:w-settings-nav wide:flex-none wide:self-start overflow-y-auto wide:bg-transparent wide:px-0 wide:pt-2.5 wide:pb-4',
              )}
            >
              {props.nav}
            </nav>
            {backdrop}
            {/* A section pads its own foot, so its Save bar can stick to the panel's very bottom. */}
            <div className="min-w-0 flex-1">{props.children}</div>
          </div>
        </main>
      </div>
    )
  return (
    // Whether the sidebar is collapsed is an attribute on the root, set before the first paint.
    <div
      data-drawer-open={sidebar.drawerOpen || undefined}
      aria-busy={props.frame || undefined}
      className="flex h-dvh min-h-0 overflow-x-clip"
    >
      <nav
        className={cn(
          sidebarClass,
          'wide:in-data-sidebar-collapsed:invisible wide:in-data-sidebar-collapsed:-ms-sidebar wide:w-sidebar wide:flex-none overflow-hidden wide:in-data-sidebar-collapsed:opacity-0',
          // Collapsing slides the sidebar off the window's edge, fading as it goes, while the panel
          // widens into its room.
          'wide:transition-[margin-inline-start,opacity,visibility] wide:duration-(--dur-slide) wide:ease-slide',
        )}
      >
        {!props.frame && (
          // The logo and the toggle, on one row as tall as the chat's header.
          <header className="-mt-2.5 flex h-bar flex-none items-center gap-0.5">
            <AppLogo />
            <SidebarToggle className="ms-auto" />
          </header>
        )}
        {props.nav}
      </nav>
      {backdrop}
      {/* A size container, so the conversation's header can reach the panel's edges, and the block
          its absolutely placed parts are placed in, so none of them can stretch the page past the
          panel's scroll. */}
      <main className="@container relative flex min-w-0 flex-1 flex-col overflow-y-auto border-divider in-data-sidebar-collapsed:border-transparent border-s-2 bg-panel transition-[border-color] duration-(--dur-slide) ease-slide max-wide:border-none">
        <MainBar />
        {props.children}
      </main>
    </div>
  )
}

const sidebarClass = cn(
  'flex flex-col gap-0.5 overscroll-contain bg-sidebar px-sidebar-pad pt-sidebar-pad pb-3 text-ui',
  // On a narrow screen, a drawer over the page that stays visible until it has slid away.
  'motion-reduce:transition-none max-wide:in-data-drawer-open:visible max-wide:invisible max-wide:fixed max-wide:inset-y-0 max-wide:start-0 max-wide:z-20 max-wide:w-drawer max-wide:-translate-x-full max-wide:in-data-drawer-open:translate-x-0 max-wide:shadow-float max-wide:transition-[translate,visibility] max-wide:duration-(--dur-slide) max-wide:ease-slide rtl:max-wide:in-data-drawer-open:translate-x-0 rtl:max-wide:translate-x-full',
)

/**
 * The toggle in the panel, for when the sidebar is hidden: collapsed on a wide screen, or a closed
 * drawer on a narrow one. On a wide screen it fades in once the sidebar, with its own toggle, has
 * mostly slid away, and fades out at once as the sidebar comes back.
 */
function MainBar() {
  return (
    <div className="sticky top-0 z-3 h-0">
      <SidebarToggle className="wide:not-in-data-sidebar-collapsed:invisible absolute start-2.75 top-[calc((var(--spacing-bar)-var(--spacing-toggle))/2)] border border-line bg-raised wide:not-in-data-sidebar-collapsed:opacity-0 transition-[opacity,visibility] wide:in-data-sidebar-collapsed:delay-[calc(var(--dur-slide)/2)] duration-(--dur-feedback) motion-reduce:transition-none" />
    </div>
  )
}

/** The app's logo, named for screen readers by the app's name. */
function AppLogo() {
  const name = useLoaderData({ from: '__root__', select: (data) => data.appName })
  return <Logo label={name ?? ''} className="h-5" />
}
