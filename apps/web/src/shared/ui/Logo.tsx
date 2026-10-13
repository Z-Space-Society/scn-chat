import { useId } from 'react'
import logo from '../../logo.svg?raw'
import { cn } from '../cn.ts'

// The logo's outlines come from the favicon's file, so there is one drawing of it: the outline
// that cuts the rim, the bubble letters' face, then their rim.
const [cutout, face, rim] = Array.from(logo.matchAll(/ d="([^"]+)"/g), (match) => match[1])

interface Props {
  /** The app's name, read out in place of the drawing. */
  label: string
  className?: string
}

/**
 * The app's logo in the theme's colors. It is drawn inline rather than loaded as the favicon's
 * file, since a picture follows the system's light or dark, not the scheme chosen in Preferences.
 */
export function Logo(props: Props) {
  const mask = useId()
  return (
    <svg
      viewBox="0 0 34 16"
      fill="none"
      role="img"
      aria-label={props.label}
      className={cn('h-4 w-auto', props.className)}
    >
      <mask
        id={mask}
        maskUnits="userSpaceOnUse"
        x="-0.4"
        y="-0.8"
        width="35"
        height="17"
        fill="black"
      >
        <rect fill="white" x="-0.4" y="-0.8" width="35" height="17" />
        <path d={cutout} />
      </mask>
      <path d={face} className="fill-logo-face" />
      <path d={rim} className="fill-logo-rim" mask={`url(#${mask})`} />
    </svg>
  )
}
