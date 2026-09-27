/** Thrown when the store has moved to another tab. */
export class StoreClosed extends Error {
  constructor() {
    super('The DB store is not open in this tab')
    this.name = 'StoreClosed'
  }
}

// Match on the name, since Comlink only carries an error's name and message across.
export const isStoreClosed = (err: unknown) => (err as Error).name === 'StoreClosed'
