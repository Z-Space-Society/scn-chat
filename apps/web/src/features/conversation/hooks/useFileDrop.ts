import { type DragEvent, type RefObject, useState } from 'react'

/** What can take the files dropped, such as the composer. */
interface Target {
  attach: (files: File[]) => void
}

/**
 * Props that let files dropped anywhere on an element attach to the composer, marking the element
 * with `data-dropping` while files are dragged over it.
 */
export function useFileDrop(target: RefObject<Target | null>) {
  const [dropping, setDropping] = useState(false)
  return {
    'data-dropping': dropping || undefined,
    onDragOver: (e: DragEvent) => {
      if (!e.dataTransfer.types.includes('Files')) return
      e.preventDefault()
      setDropping(true)
    },
    onDragLeave: (e: DragEvent) => {
      // Moving between the element's own children is not leaving it.
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropping(false)
    },
    onDrop: (e: DragEvent) => {
      if (!e.dataTransfer.types.includes('Files')) return
      e.preventDefault()
      setDropping(false)
      target.current?.attach(Array.from(e.dataTransfer.files))
    },
  }
}
