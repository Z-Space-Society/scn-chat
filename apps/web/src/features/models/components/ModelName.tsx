interface Props {
  model: { id: string; name: string }
}

/** A model's name, then its ID when the two differ, as in a list of models to tick. */
export function ModelName(props: Props) {
  if (props.model.name === props.model.id) return props.model.name
  return (
    <>
      {props.model.name} <code className="text-caption text-muted">{props.model.id}</code>
    </>
  )
}
