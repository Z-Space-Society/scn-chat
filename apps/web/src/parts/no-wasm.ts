/**
 * Stands in for Shiki's Oniguruma engine, a 600 KB wasm, through the alias in vite.config.ts.
 * Shiki's full bundle names it for its shorthand highlighter, which the app never uses, so it was
 * built but never loaded. highlight.ts highlights through @streamdown/code, which uses Shiki's
 * JavaScript engine instead. Loading the stand-in fails, so anything that did reach for the engine
 * would say why rather than highlight nothing.
 */
throw new Error(
  "Shiki's Oniguruma engine is left out of the build. Highlight through highlight.ts.",
)

export {}
