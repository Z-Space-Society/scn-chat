import { Link } from '@tanstack/react-router'
import { MATCH_END, MATCH_START, type SearchResult } from '../store/search.ts'

/** A snippet with its marked matches as highlight elements. */
export function Snippet({ text }: { text: string }) {
  const pieces = text.split(new RegExp(`(${MATCH_START}[^${MATCH_END}]*${MATCH_END})`))
  return (
    <>
      {pieces.map((piece, i) =>
        piece.startsWith(MATCH_START) ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: pieces keep their order
          <mark key={i}>{piece.slice(1, -1)}</mark>
        ) : (
          piece
        ),
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
