/**
 * Stands in for rehype-raw, which renders HTML in Markdown, through the alias in vite.config.ts.
 * Streamdown imports it for its default plugins, which keeps it and its HTML parser, about a
 * quarter of the Markdown renderer's code, in the build, though markdown.tsx leaves it out so a
 * model's HTML shows as text. Streamdown only compares plugins against it, so a stand-in that does
 * nothing changes nothing else.
 */
export default function rehypeRaw() {}
