import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

/** Open a select and pick an option by its name, as a user would. */
export async function choose(select: HTMLElement, option: string) {
  await userEvent.click(select)
  await userEvent.click(await screen.findByRole('option', { name: option }))
}

/** The names of a select's options, read by opening it and closing it again. */
export async function optionsOf(select: HTMLElement): Promise<string[]> {
  await userEvent.click(select)
  const names = screen.getAllByRole('option').map((option) => option.textContent ?? '')
  await userEvent.keyboard('{Escape}')
  return names
}
