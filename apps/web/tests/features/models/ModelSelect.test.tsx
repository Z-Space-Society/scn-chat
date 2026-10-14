import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { ModelSelect } from '../../../src/features/models/components/ModelSelect.tsx'

const caps = { vision: false, reasoning: false, tools: false }
const models = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    provider: 'router',
    id: `vendor/model-${i}`,
    name: `Model ${i}`,
    capabilities: caps,
    source: 'user' as const,
    default: false,
  }))

const shown = () => screen.getAllByRole('option').map((option) => option.textContent)

describe('ModelSelect', () => {
  it('offers no search while the list is short', async () => {
    render(<ModelSelect aria-label="Model" models={models(7)} value={null} onChange={() => {}} />)
    await userEvent.click(screen.getByRole('combobox', { name: 'Model' }))
    expect(screen.queryByRole('combobox', { name: 'Search models' })).toBeNull()
  })

  it('searches a long list by name, ID, or provider', async () => {
    render(<ModelSelect aria-label="Model" models={models(8)} value={null} onChange={() => {}} />)
    await userEvent.click(screen.getByRole('combobox', { name: 'Model' }))
    const search = screen.getByRole('combobox', { name: 'Search models' })
    await userEvent.type(search, 'model-7')
    expect(shown()).toEqual(['Model 7'])
    await userEvent.clear(search)
    await userEvent.type(search, 'router 3')
    expect(shown()).toEqual(['Model 3'])
  })
})
