import { cn } from '../../../shared/cn.ts'
import { SettingsEmpty } from '../../../shared/ui/SettingsPage.tsx'

interface Props {
  names: string[]
  picked: string[]
  onChange: (roles: string[]) => void
  /** Classes for the row, such as dropping its padding inside a field that has its own. */
  className?: string
}

/** A checkbox for each role, for choosing several, drawn as a row of chips that turn green when picked. */
export function RolePicker(props: Props) {
  if (!props.names.length) return <SettingsEmpty>No roles yet.</SettingsEmpty>
  return (
    <div className={cn('flex flex-wrap gap-1.5 p-card-pad', props.className)}>
      {props.names.map((name) => (
        <label
          key={name}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-small border border-line bg-raised py-1 ps-2 pe-2.5 font-medium text-small transition-[background-color,border-color] duration-(--dur-feedback) has-checked:border-accent-border has-checked:bg-accent-soft has-checked:text-accent-strong"
        >
          <input
            type="checkbox"
            className="m-0 accent-accent"
            checked={props.picked.includes(name)}
            onChange={(e) =>
              props.onChange(
                e.target.checked
                  ? [...props.picked, name]
                  : props.picked.filter((role) => role !== name),
              )
            }
          />
          {name}
        </label>
      ))}
    </div>
  )
}
