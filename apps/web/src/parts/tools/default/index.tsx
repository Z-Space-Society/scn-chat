import { pretty } from '../../steps.ts'
import type { BlobRef, ToolViewProps } from '../../types.ts'
import { StepCode } from '../ui.tsx'

/** A label over a tool's input or output. */
const stepLabel =
  'mt-2.5 font-semibold text-caption text-muted group-data-[state=error]/step:text-danger'

/**
 * A tool's input and its output, or its error, exactly as they were sent and returned, with a
 * link to the full output when it was too long for the record. Every tool without a view of its
 * own shows this, and a view falls back to it for anything it can't read.
 */
export function DefaultToolView(props: ToolViewProps) {
  const input = (props.call.input as string | undefined) ?? ''
  const result = props.result
  const outputBlob = result?.outputBlob as BlobRef | undefined
  return (
    <>
      {input && (
        <>
          <div className={stepLabel}>Input</div>
          <StepCode>{pretty(input)}</StepCode>
        </>
      )}
      {result && (
        <>
          <div className={stepLabel}>{result.isError ? 'Error' : 'Output'}</div>
          <StepCode>{pretty(result.output as string)}</StepCode>
          {outputBlob && (
            <a
              href={props.blobUrl(outputBlob.ref.$link, outputBlob.mimeType)}
              className="text-caption"
            >
              Full output
            </a>
          )}
        </>
      )}
    </>
  )
}
