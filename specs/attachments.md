# Attachments

## Summary

Users can attach images and PDFs to a message. Images are sent to vision-capable models as images. PDFs go through a file ingester that extracts their text, and the text is sent to the model. Attachments are blobs referenced from the message record: on the user's PDS for spaces users, and in a local blob store for fallback users. Extracted text is saved as its own blob, referenced from the file part, so a PDF is only processed once. PDF text extraction ships as the first ingester plugin, `@scn-chat/plugin-pdf-text`.

## Motivation

Vision and PDF support were on the original phase 1 list. Keeping the file bytes and extracted text as blobs in the user's own repo keeps attachments under the user's control like the rest of the conversation. Making extraction a plugin means OCR, Word documents, or other formats can be added later without core changes.

## Design

### Upload flow

1. The web UI sends the file to `POST /api/attachments` as the raw request body, with its `Content-Type` and an `X-Filename` header. Attachments are uploaded before the message is sent, so the user sees progress and errors early.
2. The server checks the MIME type and size. Images must be PNG, JPEG, WebP, or GIF, up to 20 MB. Other files are accepted when an ingester matches their type, up to 50 MB. These limits match the lexicon. The PDS may enforce a lower limit, and its error is passed through.
3. The server stores the bytes through the blob store below and gets back an atproto blob reference.
4. For non-image files, the matching ingester extracts text. The text is stored as a second `text/plain` blob.
5. The response carries the part to put in the message: an `imagePart`, or a `filePart` with `name` and `extracted: { text, method }`.

`GET /api/conversations/:skey/blobs/:cid` serves one of the signed-in owner's blobs, with its MIME type, `X-Content-Type-Options: nosniff`, and `Content-Disposition: attachment` for anything but images. For spaces users it calls `com.atproto.space.getBlob` for the conversation, and the PDS refuses any blob not referenced from a record in that space. The server passes that refusal on as 404, with no check of its own. For fallback users it serves the file from the owner's blob directory, or 404 when there is none. Shared conversations serve blobs through the sharing spec's route.

The web UI includes the returned parts in the message it sends. The server does not track which blobs a user uploaded. For spaces users, the PDS rejects a record that references a blob the account never uploaded, and for fallback users a blob either exists in the owner's directory or does not.

### Blob store

`apps/server/src/blobs/` has one interface with two implementations, chosen by the user's storage mode:

```ts
interface BlobStore {
  put(user, bytes: Uint8Array, mimeType: string): Promise<BlobRef>
  get(user, conversation, ref: BlobRef): Promise<Uint8Array>
}
```

- **Spaces users.** `put` calls `com.atproto.repo.uploadBlob` on the user's PDS with their OAuth session, which needs the blob permission in the permission set. `get` calls `com.atproto.space.getBlob` for the conversation.
- **Fallback users.** Bytes are written under `DATA_DIR/blobs/<did>/<cid>`, one directory per owner, with the CID computed the way a PDS computes it: CIDv1, raw codec, SHA-256. The same bytes therefore get the same CID if the user later moves to a spaces PDS, so their records' blob references stay valid after migration.

A PDS keeps an uploaded blob only if a record references it within a time window. An attachment that is never sent is cleaned up by the PDS for spaces users, and by a daily sweep of unreferenced files older than a day for fallback users.

Blobs are not cached on the server. A turn fetches the images it sends to the model from the blob store each time, and holds them in memory only for that turn.

### Ingesters

In `@scn-chat/plugin-api`:

```ts
interface Ingester {
  id: string
  accepts: string[]            // MIME types, e.g. ['application/pdf']
  priority?: number            // higher wins when several match, default 0
  method: 'text' | 'ocr'       // written to extracted.method
  ingest(file: { bytes: Uint8Array; mimeType: string; name?: string }): Promise<{ text: string }>
}
```

The highest-priority ingester that accepts the MIME type runs. An OCR plugin can therefore register as a fallback for scanned PDFs, or take over PDFs entirely with a higher priority. If no ingester accepts a non-image type, the upload is refused with 415.

`@scn-chat/plugin-pdf-text` uses `unpdf` to extract the text of every page, joined with page breaks. A PDF with no extractable text, such as a scan, fails with a clear message saying the PDF has no text layer.

### Sending attachments to the model

When the chat-turns spec builds the model's messages:

- An `imagePart` becomes an AI SDK file part with the image bytes and MIME type, if the resolved model has the vision capability. If it does not, the turn fails before calling the model with an error saying the model cannot read images. The web UI prevents this by disabling image attachments for such models.
- A `filePart` with extracted text becomes a text part: the file name as a heading, followed by the extracted text.
- A `filePart` without extracted text is left out, with a note in the text telling the model a file was attached but could not be read.

## Scope Boundaries

- No OCR. That is a future plugin.
- No sending PDFs to models as native PDF input.
- No attachments on assistant messages. Image generation is a future plugin.
- No audio or video.
- No attachments in encrypted conversations.
- No limit on how much extracted text is sent, beyond the model's own context limit.

## Edge Cases and Decisions

- Extraction runs at upload time, not at send time, so a failure shows up before the user sends the message.
- Fallback-mode blobs use the same CID scheme as a PDS, so migration to a spaces PDS keeps blob references valid.
- Spaces users' blobs are fetched from their PDS on every turn that needs them, with no server-side cache, keeping the PDS the only store of their attachments.

## Acceptance Criteria

- [ ] Uploading a PNG returns an `imagePart` whose blob can be fetched back through the conversation's blob route once the message is sent.
- [ ] The blob route returns 404 for a CID not referenced in the conversation, and for another user's conversation.
- [ ] Uploading a PDF with text returns a `filePart` with extracted text stored as a `text/plain` blob, with method `text`.
- [ ] A PDF without a text layer fails with a message saying it has no text.
- [ ] An unsupported MIME type is refused with 415.
- [ ] Files over the size limits are refused with 413.
- [ ] Fallback-mode blobs get the same CID a PDS would compute for the same bytes.
- [ ] When several ingesters accept a type, the highest priority runs.
- [ ] An image sent to a model without vision fails the turn before any model call.
- [ ] Extracted text reaches the model as a text part headed by the file name.
- [ ] The blob route returns the PDS's refusal as 404 for a blob not referenced in the conversation, without reading the conversation's records.
- [ ] No blob is written to server storage for a spaces user.
- [ ] The fallback sweep removes unreferenced blobs older than a day and keeps referenced ones.

## Files

- (to be populated during implementation)
