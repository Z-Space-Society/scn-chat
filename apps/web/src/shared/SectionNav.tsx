import { type ActiveOptions, Link, type LinkProps } from '@tanstack/react-router'

export interface Section {
  to: NonNullable<LinkProps['to']>
  label: string
}

interface Props {
  sections: readonly Section[]
  /** When a section's link counts as the current page. */
  activeOptions: ActiveOptions
}

/** A list of links to a page's sections, marking the current one. */
export function SectionNav(props: Props) {
  return (
    <ul>
      {props.sections.map((section) => (
        <li key={section.to}>
          <Link to={section.to} activeOptions={props.activeOptions}>
            {section.label}
          </Link>
        </li>
      ))}
    </ul>
  )
}
