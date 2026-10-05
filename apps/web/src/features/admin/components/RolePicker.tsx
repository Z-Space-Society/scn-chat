/** A checkbox for each role, for choosing several. */
export function RolePicker({
  names,
  picked,
  onChange,
}: {
  names: string[]
  picked: string[]
  onChange: (roles: string[]) => void
}) {
  return names.map((name) => (
    <label key={name}>
      <input
        type="checkbox"
        checked={picked.includes(name)}
        onChange={(e) =>
          onChange(e.target.checked ? [...picked, name] : picked.filter((role) => role !== name))
        }
      />{' '}
      {name}
    </label>
  ))
}
