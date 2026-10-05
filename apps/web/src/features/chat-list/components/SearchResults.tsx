import { Link } from '@tanstack/react-router'
import { MATCH_END, MATCH_START, type SearchResult } from '../../../store/search.ts'

const MATCH = new RegExp(`(${MATCH_START}[^${MATCH_END}]*${MATCH_END})`)

/** A snippet with its marked matches as highlight elements. */
export function Snippet({ text }: { text: string }) {
  // Each piece is keyed by where it starts in the text, which no other piece shares.
  const pieces: { piece: string; start: number }[] = []
  let start = 0
  for (const piece of text.split(MATCH)) {
    pieces.push({ piece, start })
    start += piece.length
  }
  return (
    <>
      {pieces.map(({ piece, start }) =>
        piece.startsWith(MATCH_START) ? <mark key={start}>{piece.slice(1, -1)}</mark> : piece,
      )}
    </>
  )
}

export function SearchResults({
  results,
  remaining,
}: {
  results: SearchResult[]
  remaining: number
}) {
  return (
    <div className="search-results">
      {remaining > 0 && (
        <p role="status">
          Still downloading {remaining} {remaining === 1 ? 'conversation' : 'conversations'}.
        </p>
      )}
      {results.length === 0 ? (
        <p>No matches.</p>
      ) : (
        <ul>
          {results.map((result) => (
            <li key={`${result.skey}/${result.rkey ?? ''}`}>
              <Link
                to="/chat/$skey"
                params={{ skey: result.skey }}
                search={result.rkey ? { m: result.rkey } : {}}
              >
                {result.rkey ? (
                  <>
                    <strong>{result.title || 'New chat'}</strong>
                    <small>
                      <Snippet text={result.snippet} />
                    </small>
                  </>
                ) : (
                  <strong>
                    <Snippet text={result.snippet} />
                  </strong>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
