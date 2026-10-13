import { useEffect, useState } from 'react'
import { cn } from '../cn.ts'
import { CheckIcon, CopyIcon } from '../icons.tsx'
import { Button, IconButton } from './Button.tsx'

const swap =
  'col-start-1 row-start-1 transition-[opacity,scale,filter] duration-(--dur-swap) ease-swap motion-reduce:transition-opacity'

interface CopyIconSwapProps {
  copied: boolean
}

/** The copy icon, which gives way to a check once copied, shrinking and blurring as it fades where motion is welcome. */
export function CopyIconSwap(props: CopyIconSwapProps) {
  return (
    <span className="group inline-grid place-items-center" data-swapped={props.copied || undefined}>
      <CopyIcon
        className={cn(
          swap,
          'group-data-swapped:opacity-0 motion-safe:group-data-swapped:scale-25 motion-safe:group-data-swapped:blur-xs',
        )}
      />
      <CheckIcon
        className={cn(
          swap,
          'opacity-0 group-data-swapped:opacity-100 motion-safe:scale-25 motion-safe:blur-xs motion-safe:group-data-swapped:scale-100 motion-safe:group-data-swapped:blur-none',
        )}
      />
    </span>
  )
}

interface Props {
  text: string
  /** Show an icon in place of the words, as among a message's actions. */
  icon?: boolean
  className?: string
}

/** Copy text, saying so for a moment once it is copied. */
export function CopyButton(props: Props) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(timer)
  }, [copied])
  const copy = () => void navigator.clipboard.writeText(props.text).then(() => setCopied(true))
  const label = copied ? 'Copied' : 'Copy'
  if (!props.icon)
    return (
      <Button onClick={copy} className={props.className}>
        {label}
      </Button>
    )
  return (
    <IconButton aria-label={label} onClick={copy} className={props.className}>
      <CopyIconSwap copied={copied} />
    </IconButton>
  )
}
