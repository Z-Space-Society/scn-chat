import {
  ArrowDown,
  ArrowUp,
  Box,
  createLucideIcon,
  Download,
  KeyRound,
  LoaderCircle,
  type LucideIcon,
  Puzzle,
  Users,
} from 'lucide-react'
import { cn } from './cn.ts'

interface IconOptions {
  /** Drawn solid, as the stop square is. */
  filled?: boolean
  /** Points along the line, as back and next do, so it mirrors in right-to-left text. */
  directional?: boolean
}

interface Props {
  /** Sizes, colors, or turns the icon where it is used. */
  className?: string
}

/**
 * The app's line icons, from Lucide, in the current text color. Their stroke is drawn in screen
 * pixels whatever their size, at the weight of the text beside them, heavier inside a button or a
 * link. They are decoration beside a visible label or an aria-label, so they are hidden from
 * assistive technology. A fork can swap these for another icon set without touching the
 * components that use them.
 */
function icon(Glyph: LucideIcon, options: IconOptions = {}) {
  return (props: Props) => (
    <Glyph
      className={cn(
        'stroke-(length:--icon-stroke) in-[:is(button,a)]:stroke-(length:--icon-stroke-control) size-icon shrink-0 *:[vector-effect:non-scaling-stroke]',
        options.directional && 'rtl:-scale-x-100',
        props.className,
      )}
      fill={options.filled ? 'currentColor' : 'none'}
      aria-hidden="true"
    />
  )
}

/**
 * Lucide's panel-left made puffy, to sit with the bubble letters of the logo: a wide, round box
 * whose sidebar is a short bar with round ends, floating inside it.
 */
const SoftPanelLeft = createLucideIcon('soft-panel-left', [
  ['rect', { width: '18', height: '15', x: '3', y: '4.5', rx: '5.5', key: 'box' }],
  ['path', { d: 'M7.75 8.75v6.5', key: 'divider' }],
])

/**
 * A puffy magnifier, to sit with the bubble letters of the logo: a round lens, and a short handle
 * with round ends floating just off it, as the sidebar toggle's bar floats in its box.
 */
const CompactSearch = createLucideIcon('compact-search', [
  ['circle', { cx: '10.5', cy: '10.5', r: '7', key: 'lens' }],
  ['path', { d: 'm17.25 17.25 2.5 2.5', key: 'handle' }],
])

/**
 * A wide, puffy speech bubble with a plus, its tail ending in a round tip, to sit with the bubble
 * letters of the logo.
 */
const PuffyChatPlus = createLucideIcon('puffy-chat-plus', [
  [
    'path',
    {
      d: 'M12 4c5.2 0 9 2.9 9 7s-3.8 7-9 7c-.7 0-1.4-.1-2.1-.2C8.6 19.7 6.8 20.6 5 20.5c-.6 0-.8-.5-.5-.9.6-.7.9-1.5.9-2.4C4 15.9 3 13.6 3 11c0-4.1 3.8-7 9-7z',
      key: 'bubble',
    },
  ],
  ['path', { d: 'M12 8.6v4.8M9.6 11h4.8', key: 'plus' }],
])

/**
 * A chubby paperclip, to sit with the bubble letters of the logo: two wide turns where Lucide's
 * has three tight ones, drawn upright and tilted.
 */
const PuffyPaperclip = createLucideIcon('puffy-paperclip', [
  [
    'path',
    {
      d: 'M12 10.75V17.75a2.5 2.5 0 0 0 5 0V8.25a5 5 0 0 0-10 0V20.75',
      transform: 'rotate(45 12 12)',
      key: 'clip',
    },
  ],
])

/**
 * An arrow pointing up, for Send: a solid head, as the stop square it trades places with is solid,
 * its corners softened by its stroke, on a stem as thin as a line icon's.
 */
const PuffyArrowUp = createLucideIcon('puffy-arrow-up', [
  ['path', { d: 'M12 6l4 4.25H8z', key: 'head' }],
  ['path', { d: 'M12 10v8', key: 'stem' }],
])

/**
 * Three round dots, a little larger than Lucide's, to sit with the bubble letters of the logo. The
 * stroke drawn around each fill makes them half again as wide, so they keep Lucide's spacing.
 */
const RoundDots = createLucideIcon('round-dots', [
  ['circle', { cx: '5', cy: '12', r: '1', key: 'start' }],
  ['circle', { cx: '12', cy: '12', r: '1', key: 'middle' }],
  ['circle', { cx: '19', cy: '12', r: '1', key: 'end' }],
])

/** The round dots stacked upright. */
const RoundDotsVertical = createLucideIcon('round-dots-vertical', [
  ['circle', { cx: '12', cy: '5', r: '1', key: 'top' }],
  ['circle', { cx: '12', cy: '12', r: '1', key: 'middle' }],
  ['circle', { cx: '12', cy: '19', r: '1', key: 'bottom' }],
])

/**
 * A soft list, to sit with the bubble letters of the logo: small round bullets, and short lines
 * whose last runs shorter, as a list's last line of text often does.
 */
const SoftList = createLucideIcon('soft-list', [
  ['circle', { cx: '5.5', cy: '6.5', r: '0.5', key: 'bullet-1' }],
  ['circle', { cx: '5.5', cy: '12', r: '0.5', key: 'bullet-2' }],
  ['circle', { cx: '5.5', cy: '17.5', r: '0.5', key: 'bullet-3' }],
  ['path', { d: 'M9.5 6.5h9M9.5 12h9M9.5 17.5h6', fill: 'none', key: 'lines' }],
])

/**
 * Lucide's share made puffy, to sit with the bubble letters of the logo: a shorter arrow, and a
 * tray rounded deep at its corners.
 */
const PuffyShare = createLucideIcon('puffy-share', [
  ['path', { d: 'M12 4v9.5', key: 'stem' }],
  ['path', { d: 'm8.5 7.5 3.5-3.5 3.5 3.5', key: 'head' }],
  ['path', { d: 'M5.5 11.5v4a4.5 4.5 0 0 0 4.5 4.5h4a4.5 4.5 0 0 0 4.5-4.5v-4', key: 'tray' }],
])

/**
 * Lucide's copy made puffy, to sit with the bubble letters of the logo: two deeply rounded
 * squares, the one behind showing only its top and side.
 */
const PuffyCopy = createLucideIcon('puffy-copy', [
  ['rect', { width: '12', height: '12', x: '8.5', y: '8.5', rx: '3.5', key: 'front' }],
  [
    'path',
    {
      d: 'M15.5 8.5V7a3.5 3.5 0 0 0-3.5-3.5H7A3.5 3.5 0 0 0 3.5 7v5A3.5 3.5 0 0 0 7 15.5h1.5',
      key: 'back',
    },
  ],
])

/**
 * Lucide's file made puffy, to sit with the bubble letters of the logo: a page rounded deep at its
 * corners, as Copy's squares are, with a soft fold.
 */
const PuffyFile = createLucideIcon('puffy-file', [
  [
    'path',
    {
      d: 'M13.5 3.5H8A3.5 3.5 0 0 0 4.5 7v10A3.5 3.5 0 0 0 8 20.5h8a3.5 3.5 0 0 0 3.5-3.5V9.5z',
      key: 'page',
    },
  ],
  ['path', { d: 'M13.5 3.5V7A2.5 2.5 0 0 0 16 9.5h3.5', key: 'fold' }],
])

/**
 * Lucide's lightbulb made puffy, to sit with the bubble letters of the logo: a rounder bulb closed
 * at its neck, over one short bar.
 */
const PuffyBulb = createLucideIcon('puffy-bulb', [
  [
    'path',
    {
      d: 'M9.5 16c-.3-1.75-3.75-3.25-3.75-6.75a6.25 6.25 0 1 1 12.5 0c0 3.5-3.45 5-3.75 6.75z',
      key: 'bulb',
    },
  ],
  ['path', { d: 'M10 19.5h4', key: 'base' }],
])

/**
 * Lucide's sparkles made puffy, to sit with the bubble letters of the logo: two four-pointed stars
 * with full, soft sides, a large one and a small one, where Lucide's has a thin star and two marks.
 */
const PuffySparkles = createLucideIcon('puffy-sparkles', [
  [
    'path',
    {
      d: 'M10.5 5.5c2.4 5.6 2.4 5.6 8 8-5.6 2.4-5.6 2.4-8 8-2.4-5.6-2.4-5.6-8-8 5.6-2.4 5.6-2.4 8-8z',
      key: 'large',
    },
  ],
  [
    'path',
    {
      d: 'M18.5 2.5c.9 2.1.9 2.1 3 3-2.1.9-2.1.9-3 3-.9-2.1-.9-2.1-3-3 2.1-.9 2.1-.9 3-3z',
      key: 'small',
    },
  ],
])

/**
 * Lucide's tag made puffy, to sit with the bubble letters of the logo: a soft point and deeply
 * rounded corners, with a round hole, drawn upright and tilted.
 */
const PuffyTag = createLucideIcon('puffy-tag', [
  [
    'path',
    {
      d: 'M10.6 3.9a2 2 0 0 1 2.8 0L18.5 9v9a3.5 3.5 0 0 1-3.5 3.5H9A3.5 3.5 0 0 1 5.5 18V9z',
      transform: 'rotate(-45 12 12)',
      key: 'tag',
    },
  ],
  [
    'circle',
    {
      cx: '12',
      cy: '9.75',
      r: '1',
      fill: 'currentColor',
      transform: 'rotate(-45 12 12)',
      key: 'hole',
    },
  ],
])

/**
 * Lucide's trash made puffy, to sit with the bubble letters of the logo: a wide can that narrows
 * to a round bottom, a round handle on its lid, and no lines inside.
 */
const PuffyTrash = createLucideIcon('puffy-trash', [
  ['path', { d: 'M4 6.5h16', key: 'lid' }],
  ['path', { d: 'M9.5 6.5v-1a2 2 0 0 1 2-2h1a2 2 0 0 1 2 2v1', key: 'handle' }],
  [
    'path',
    { d: 'm6 6.5.8 10.8a3.5 3.5 0 0 0 3.5 3.2h3.4a3.5 3.5 0 0 0 3.5-3.2l.8-10.8', key: 'can' },
  ],
])

/**
 * Lucide's hash with shorter strokes, so its four crossing lines sit at the weight of the icons
 * beside it rather than darker.
 */
const SoftHash = createLucideIcon('soft-hash', [
  ['path', { d: 'M6 9.5h12M6 14.5h12', key: 'bars' }],
  ['path', { d: 'M10.5 5.5 9.25 18.5M14.75 5.5 13.5 18.5', key: 'posts' }],
])

/**
 * Lucide's settings gear made puffy, to sit with the bubble letters of the logo: six round-topped
 * teeth where Lucide's has eight, around a round hub.
 */
const PuffyGear = createLucideIcon('puffy-gear', [
  [
    'path',
    {
      d: 'M10 5.29V4.25a2 2 0 0 1 4 0v1.04a7 7 0 0 1 2.81 1.62l.9-.52a2 2 0 0 1 2 3.47l-.9.52a7 7 0 0 1 0 3.24l.9.52a2 2 0 0 1-2 3.47l-.9-.52A7 7 0 0 1 14 18.71v1.04a2 2 0 0 1-4 0v-1.04a7 7 0 0 1-2.81-1.62l-.9.52a2 2 0 0 1-2-3.47l.9-.52a7 7 0 0 1 0-3.24l-.9-.52a2 2 0 0 1 2-3.47l.9.52A7 7 0 0 1 10 5.29z',
      key: 'gear',
    },
  ],
  ['circle', { cx: '12', cy: '12', r: '2.75', key: 'hub' }],
])

/**
 * Lucide's shield made puffy, to sit with the bubble letters of the logo: softer shoulders and a
 * rounder point.
 */
const PuffyShield = createLucideIcon('puffy-shield', [
  [
    'path',
    {
      d: 'M12 3.5c2.2 1.4 4.3 1.9 6.25 2.1a1 1 0 0 1 .75 1V12c0 4.4-3 7.1-7 8.5-4-1.4-7-4.1-7-8.5V6.6a1 1 0 0 1 .75-1C7.7 5.4 9.8 4.9 12 3.5z',
      key: 'shield',
    },
  ],
])

/**
 * Lucide's log-out made puffy, to sit with the bubble letters of the logo: a door rounded deep at
 * its corners, and an arrow with Share's shorter head.
 */
const PuffySignOut = createLucideIcon('puffy-sign-out', [
  ['path', { d: 'M9.5 4.5h-2A3.5 3.5 0 0 0 4 8v8a3.5 3.5 0 0 0 3.5 3.5h2', key: 'door' }],
  ['path', { d: 'M10 12h9.5', key: 'stem' }],
  ['path', { d: 'm16 8.5 3.5 3.5-3.5 3.5', key: 'head' }],
])

/**
 * Lucide's refresh made puffy, to sit with the bubble letters of the logo: two rounder turns, each
 * with an open head aimed along the curve just behind its tip, as Regenerate's is.
 */
const PuffySync = createLucideIcon('puffy-sync', [
  ['path', { d: 'M4.5 12A7.5 7.5 0 0 1 17.75 7.18', key: 'turn-1' }],
  ['path', { d: 'M17.41 4.2 17.75 7.18 14.76 7.52', key: 'head-1' }],
  ['path', { d: 'M19.5 12A7.5 7.5 0 0 1 6.25 16.82', key: 'turn-2' }],
  ['path', { d: 'M6.59 19.8 6.25 16.82 9.24 16.48', key: 'head-2' }],
])

/** A puffy cloud, to sit with the bubble letters of the logo: three even puffs on a flat base. */
const PuffyCloud = createLucideIcon('puffy-cloud', [
  [
    'path',
    {
      d: 'M6.5 19.25A4.25 4.25 0 0 1 5.76 10.82a6 6 0 0 1 11.98-.06 4.25 4.25 0 0 1-.24 8.49z',
      key: 'cloud',
    },
  ],
])

/**
 * Lucide's hard drive made puffy, to sit with the bubble letters of the logo: deep corners, soft
 * sloping shoulders, and one small light.
 */
const PuffyDrive = createLucideIcon('puffy-drive', [
  [
    'path',
    {
      d: 'M3 13.25 6.05 6.6A3.25 3.25 0 0 1 9 4.75h6a3.25 3.25 0 0 1 2.95 1.85L21 13.25v3A3.75 3.75 0 0 1 17.25 20H6.75A3.75 3.75 0 0 1 3 16.25z',
      key: 'case',
    },
  ],
  ['path', { d: 'M3 13.25h18', key: 'seam' }],
  ['circle', { cx: '7.25', cy: '16.6', r: '1', fill: 'currentColor', key: 'light' }],
])

/**
 * Lucide's sliders made puffy, to sit with the bubble letters of the logo: two tracks, each with a
 * round knob, where Lucide's has three with flat ticks.
 */
const SoftSliders = createLucideIcon('soft-sliders', [
  ['path', { d: 'M4 8h3.5M12.5 8H20', key: 'track-1' }],
  ['circle', { cx: '10', cy: '8', r: '2.5', key: 'knob-1' }],
  ['path', { d: 'M4 16h8.5M17.5 16H20', key: 'track-2' }],
  ['circle', { cx: '15', cy: '16', r: '2.5', key: 'knob-2' }],
])

/**
 * Lucide's id card made puffy, to sit with the bubble letters of the logo: a card rounded deep at
 * its corners, with a person and two short lines.
 */
const PuffyIdCard = createLucideIcon('puffy-id-card', [
  ['rect', { x: '3', y: '5', width: '18', height: '14', rx: '4.5', key: 'card' }],
  ['circle', { cx: '9', cy: '10.5', r: '2', key: 'head' }],
  ['path', { d: 'M6.25 15.5a3 3 0 0 1 5.5 0', key: 'shoulders' }],
  ['path', { d: 'M15 10.5h2.5M15 14h2.5', key: 'lines' }],
])

/**
 * Lucide's lock made puffy, to sit with the bubble letters of the logo: a rounder body and
 * shackle, with a round keyhole.
 */
const PuffyLock = createLucideIcon('puffy-lock', [
  ['rect', { x: '4.5', y: '10.5', width: '15', height: '10', rx: '3.5', key: 'body' }],
  ['path', { d: 'M8 10.5V8a4 4 0 0 1 8 0v2.5', key: 'shackle' }],
  ['circle', { cx: '12', cy: '15.5', r: '1', fill: 'currentColor', key: 'keyhole' }],
])

/** New chat's puffy speech bubble without its plus, for a chat. */
const PuffyChat = createLucideIcon('puffy-chat', [
  [
    'path',
    {
      d: 'M12 4c5.2 0 9 2.9 9 7s-3.8 7-9 7c-.7 0-1.4-.1-2.1-.2C8.6 19.7 6.8 20.6 5 20.5c-.6 0-.8-.5-.5-.9.6-.7.9-1.5.9-2.4C4 15.9 3 13.6 3 11c0-4.1 3.8-7 9-7z',
      key: 'bubble',
    },
  ],
])

/** Lucide's clock in Info's softer circle, with shorter hands. */
const SoftClock = createLucideIcon('soft-clock', [
  ['circle', { cx: '12', cy: '12', r: '8.5', key: 'face' }],
  ['path', { d: 'M12 7.75V12l2.75 2', key: 'hands' }],
])

/** A check with shorter, softer arms than Lucide's, as Copy's turns to once it copies. */
const SoftCheck = createLucideIcon('soft-check', [
  ['path', { d: 'm5.5 12.5 4 4 9-9', key: 'check' }],
])

/**
 * Lucide's rotate-ccw made puffy, to sit with the bubble letters of the logo: a rounder turn whose
 * open head sits at its top. The head is aimed along the curve just behind its tip rather than
 * the flat tangent at it, so its arms sit evenly about the line as it bends away.
 */
const PuffyRetry = createLucideIcon('puffy-retry', [
  ['path', { d: 'M5.07 8A8 8 0 1 0 12 4', key: 'turn' }],
  ['path', { d: 'M14.92 2.01 12 4l1.99 2.92', key: 'head' }],
])

/**
 * Closing quote marks as type draws them, to sit with the bubble letters of the logo: round solid
 * heads with comma tails, where Lucide's are squared blocks.
 */
const RoundQuote = createLucideIcon('round-quote', [
  ['circle', { cx: '7.5', cy: '10', r: '2', fill: 'currentColor', key: 'head-1' }],
  ['path', { d: 'M9.5 10c0 3-1.2 5.3-3.75 6.6', key: 'tail-1' }],
  ['circle', { cx: '16.5', cy: '10', r: '2', fill: 'currentColor', key: 'head-2' }],
  ['path', { d: 'M18.5 10c0 3-1.2 5.3-3.75 6.6', key: 'tail-2' }],
])

/**
 * Lucide's link made puffy, to sit with the bubble letters of the logo: two wide, round halves
 * tilted on the diagonal, joined by a short bar.
 */
const PuffyLink = createLucideIcon('puffy-link', [
  ['path', { d: 'M10 16.5H8a4.5 4.5 0 0 1 0-9h2', key: 'left', transform: 'rotate(-45 12 12)' }],
  ['path', { d: 'M14 7.5h2a4.5 4.5 0 0 1 0 9h-2', key: 'right', transform: 'rotate(-45 12 12)' }],
  ['path', { d: 'M9.5 12h5', key: 'bar', transform: 'rotate(-45 12 12)' }],
])

/**
 * Lucide's pencil made puffy, to sit with the bubble letters of the logo: a wider barrel with a
 * round end and a rounded point, drawn upright and tilted.
 */
const PuffyPencil = createLucideIcon('puffy-pencil', [
  [
    'path',
    {
      d: 'M8.5 17V4a3.5 3.5 0 0 1 7 0v13l-2.55 4.9a1.1 1.1 0 0 1-1.9 0z',
      transform: 'rotate(45 12 12)',
      key: 'barrel',
    },
  ],
  ['path', { d: 'M8.5 7.75h7', transform: 'rotate(45 12 12)', key: 'band' }],
])

/**
 * An arrow pointing down, for Jump to latest, softer than Lucide's: a shorter stem and a narrower
 * head, so it sits calmly in its round button.
 */
const SoftArrowDown = createLucideIcon('soft-arrow-down', [
  ['path', { d: 'M12 5.5v12.5', key: 'stem' }],
  ['path', { d: 'm7 13 5 5 5-5', key: 'head' }],
])

/**
 * Lucide's chevrons made wider and flatter, to sit with the wide bubble letters of the logo, turned
 * three ways.
 */
const SoftChevronDown = createLucideIcon('soft-chevron-down', [
  ['path', { d: 'm5.5 9.5 6.5 5 6.5-5', key: 'chevron' }],
])

const SoftChevronLeft = createLucideIcon('soft-chevron-left', [
  ['path', { d: 'm14.5 5.5-5 6.5 5 6.5', key: 'chevron' }],
])

const SoftChevronRight = createLucideIcon('soft-chevron-right', [
  ['path', { d: 'm9.5 5.5 5 6.5-5 6.5', key: 'chevron' }],
])

/** Jump to latest's arrow turned to point back, the way the text reads. */
const SoftArrowLeft = createLucideIcon('soft-arrow-left', [
  ['path', { d: 'M18.5 12H6', key: 'stem' }],
  ['path', { d: 'm11 7-5 5 5 5', key: 'head' }],
])

/** Jump to latest's arrow turned to point on. */
const SoftArrowRight = createLucideIcon('soft-arrow-right', [
  ['path', { d: 'M5.5 12H18', key: 'stem' }],
  ['path', { d: 'm13 7 5 5-5 5', key: 'head' }],
])

/** An arrow up and out of the line, for what opens in a new tab, as short as the soft arrows. */
const SoftArrowOut = createLucideIcon('soft-arrow-out', [
  ['path', { d: 'M8 16 16 8', key: 'stem' }],
  ['path', { d: 'M9.5 8H16v6.5', key: 'head' }],
])

/** A plus with shorter arms than Lucide's. */
const SoftPlus = createLucideIcon('soft-plus', [['path', { d: 'M12 6v12M6 12h12', key: 'plus' }]])

/** A cross with shorter arms than Lucide's, as the soft check's are. */
const SoftX = createLucideIcon('soft-x', [['path', { d: 'M17 7 7 17M7 7l10 10', key: 'cross' }]])

/**
 * A square with deeply rounded corners, for Stop, to sit with the bubble letters of the logo and
 * the soft head of the Send arrow it trades places with.
 */
const SoftSquare = createLucideIcon('soft-square', [
  ['rect', { width: '18', height: '18', x: '3', y: '3', rx: '5', key: 'square' }],
])

/** Lucide's info, rounder: a smaller circle, a shorter stem, and a round dot. */
const SoftInfo = createLucideIcon('soft-info', [
  ['circle', { cx: '12', cy: '12', r: '8.5', key: 'ring' }],
  ['path', { d: 'M12 16v-4.25', key: 'stem' }],
  ['circle', { cx: '12', cy: '8.25', r: '0.4', fill: 'currentColor', key: 'dot' }],
])

/** Info turned over, for an alert: the same circle, its stem above a round dot. */
const SoftAlert = createLucideIcon('soft-alert', [
  ['circle', { cx: '12', cy: '12', r: '8.5', key: 'ring' }],
  ['path', { d: 'M12 8v4.25', key: 'stem' }],
  ['circle', { cx: '12', cy: '15.75', r: '0.4', fill: 'currentColor', key: 'dot' }],
])

export const PlusIcon = icon(SoftPlus)
export const NewChatIcon = icon(PuffyChatPlus)
export const HashIcon = icon(SoftHash)
export const SidebarIcon = icon(SoftPanelLeft)
export const SettingsIcon = icon(PuffyGear)
export const SignOutIcon = icon(PuffySignOut)
export const ShieldIcon = icon(PuffyShield)
export const MoreIcon = icon(RoundDots, { filled: true })
export const ListIcon = icon(SoftList, { filled: true })
export const PencilIcon = icon(PuffyPencil)
export const TagIcon = icon(PuffyTag)
export const TrashIcon = icon(PuffyTrash)
export const CloseIcon = icon(SoftX)
export const CloudIcon = icon(PuffyCloud)
export const DriveIcon = icon(PuffyDrive)
export const ShareIcon = icon(PuffyShare)
export const SyncIcon = icon(PuffySync)
export const ChevronDownIcon = icon(SoftChevronDown)
export const ChevronLeftIcon = icon(SoftChevronLeft, { directional: true })
export const ChevronRightIcon = icon(SoftChevronRight, { directional: true })
export const MoreVerticalIcon = icon(RoundDotsVertical, { filled: true })
export const ArrowRightIcon = icon(SoftArrowRight, { directional: true })
export const ArrowLeftIcon = icon(SoftArrowLeft, { directional: true })
export const ArrowOutIcon = icon(SoftArrowOut, { directional: true })
export const CheckIcon = icon(SoftCheck)
export const CopyIcon = icon(PuffyCopy)
export const DownloadIcon = icon(Download)
export const InfoIcon = icon(SoftInfo)
export const QuoteIcon = icon(RoundQuote)
export const LinkIcon = icon(PuffyLink)
export const SlidersIcon = icon(SoftSliders)
export const KeyIcon = icon(KeyRound)
export const PuzzleIcon = icon(Puzzle)
export const UsersIcon = icon(Users)
export const RolesIcon = icon(PuffyIdCard)
export const LockIcon = icon(PuffyLock)
export const CubeIcon = icon(Box)
export const ChatIcon = icon(PuffyChat)
export const ClockIcon = icon(SoftClock)
export const ArrowUpIcon = icon(ArrowUp)
export const SendIcon = icon(PuffyArrowUp, { filled: true })
export const ArrowDownIcon = icon(ArrowDown)
export const JumpDownIcon = icon(SoftArrowDown)
export const PaperclipIcon = icon(PuffyPaperclip)
export const StopIcon = icon(SoftSquare, { filled: true })
export const FileIcon = icon(PuffyFile)
export const SearchIcon = icon(CompactSearch)
export const BulbIcon = icon(PuffyBulb)
export const SparkleIcon = icon(PuffySparkles)
export const AlertIcon = icon(SoftAlert)
export const RetryIcon = icon(PuffyRetry)

const LoaderIcon = icon(LoaderCircle)

/** A turning arc, for a control busy with what it was asked to do. It holds still for reduced motion. */
export function SpinnerIcon() {
  return <LoaderIcon className="animate-spin motion-reduce:animate-none" />
}
