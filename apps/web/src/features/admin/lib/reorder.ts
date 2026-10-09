/** The items with the one at `index` moved `by` places. */
export function moveItem<T>(items: T[], index: number, by: number): T[] {
  const moved = [...items]
  const [item] = moved.splice(index, 1)
  if (item !== undefined) moved.splice(index + by, 0, item)
  return moved
}
