interface Props {
  names: string[]
  picked: string[]
  onChange: (roles: string[]) => void
}

/** A checkbox for each role, for choosing several. */
export function RolePicker(props: Props) {
  return (
    <>
      {props.names.map((name) => (
        <label key={name}>
          <input
            type="checkbox"
            checked={props.picked.includes(name)}
            onChange={(e) =>
              props.onChange(
                e.target.checked
                  ? [...props.picked, name]
                  : props.picked.filter((role) => role !== name),
              )
            }
          />{' '}
          {name}
        </label>
      ))}
    </>
  )
}
