import { Link } from '@tanstack/react-router'
import { MATCH_END, MATCH_START, type SearchResult } from '../../../store/search.ts'

const MATCH = new RegExp(`(${MATCH_START}[^${MATCH_END}]*${MATCH_END})`)

interface SnippetProps {
  text: string
}

/** A snippet with its marked matches as highlight elements. */
export function Snippet(props: SnippetProps) {
  // Each piece is keyed by where it starts in the text, which no other piece shares.
  const pieces: { piece: string; start: number }[] = []
  let start = 0
  for (const piece of props.text.split(MATCH)) {
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

interface SearchResultsProps {
  results: SearchResult[]
  remaining: number
}

export function SearchResults(props: SearchResultsProps) {
  return (
    <div className="search-results">
      {props.remaining > 0 && (
        <p role="status">
          Still downloading {props.remaining}{' '}
          {props.remaining === 1 ? 'conversation' : 'conversations'}.
        </p>
      )}
      {props.results.length === 0 ? (
        <p>No matches.</p>
      ) : (
        <ul>
          {props.results.map((result) => (
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
