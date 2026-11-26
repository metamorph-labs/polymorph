# Formatted text a person writes

## 1. Choose the member

| The text | The member |
| --- | --- |
| A person writes it with formatting: a comment, a description, a note | `RichTextInput` |
| A document a person wrote is shown | `RichTextContent` |
| A model wrote it, as Markdown | `Markdown` |
| A person writes it with no formatting | `Textarea` |
| It is the message to a model | `PromptInput` |

Do not bring in an editor library, and do not store or render HTML. The field's value is a JSON
document, and `RichTextContent` draws it through the vocabulary, so a stored document
cannot inject markup.

## 2. The document

```json
{
  "format": "polymorph-rich-text/1",
  "blocks": [
    {
      "type": "paragraph",
      "content": [
        { "type": "text", "text": "Thanks to " },
        { "type": "entity", "kind": "user", "id": "u_17", "label": "@Ada Lovelace" },
        { "type": "text", "text": " for the " },
        { "type": "text", "text": "fix", "marks": [{ "type": "bold" }] }
      ]
    }
  ]
}
```

- Blocks: `paragraph`, `heading` (`level` 1 to 3), `list` (`ordered`, `items` of
  `listItem`), `blockquote` and `codeBlock` (`text`, `language`).
- Inline nodes: `text`, `break` and `entity` (`kind`, `id`, `label`).
- Marks on text: `bold`, `italic`, `strike`, `code`, `link` (`href`) and `annotation`
  (`id`).

Store the value as it is, in a JSON column or as a string. Do not convert it to HTML or Markdown to
store it. Start an empty field from `emptyRichText``()`, and make a document from plain text
with `richTextFromText`.

## 3. The field

```tsx
import { useState } from 'react'
import { emptyRichText } from '@polymorph/engine/rich-text'
import { FormField, RichTextInput } from '@polymorph/react-ui'

import { save } from './comments'

export function CommentField() {
  const [body, setBody] = useState(emptyRichText())
  return (
    <FormField label="Comment">
      <RichTextInput
        value={body}
        onChange={setBody}
        placeholder="Write a comment"
        formats={['bold', 'italic', 'code', 'link']}
        maxLength={2000}
        submitLabel="Comment"
        onSubmit={async (value, editor) => {
          await save(value)
          editor.clear()
        }}
      />
    </FormField>
  )
}
```

- `value` with `onChange` controls the field. `defaultValue` leaves
  the document to the field. `name` adds a hidden input that holds the document as a
  string, for a form that posts.
- `formats` lists what the field allows. A document given to the field, and what a person
  pastes, is cut down to those formats. Leave it out to allow every format.
- The footer has three forms. `submitLabel` with `onSubmit`, and
  `cancelLabel` with `onCancel`, draw the default one. `footer` draws
  the app's own. With none of them there is no footer, which suits a form with its own buttons.
  Set `pending` while the app saves.
- `maxLength` is a soft limit. A person can type past it, the count shows how far, and the
  default submit control is disabled. The server enforces the limit (step 7).
- `onFiles` receives files a person pasted or dropped. The field inserts nothing for them
  and uploads nothing.
- The field shows no message after a save. The app shows a `Toast`.
- `toolbarPlacement` set to `selection` draws the format controls at the selected words
  in place of the fixed row, which suits a long document.

## 4. Mentions

```tsx
<RichTextInput
  value={body}
  onChange={setBody}
  entities={[
    { kind: 'user', trigger: '@', label: 'People', options: people.map((person) => ({ id: person.id, label: person.name })) },
    { kind: 'issue', trigger: '#', label: 'Issues', filter: false, options: issues, loading: searching, onQueryChange: setIssueQuery },
  ]}
/>
```

The app supplies each kind's `options`, and the field never fetches. With
`filter` set to `false` the app searches: it reads the query from
`onQueryChange` and passes `loading`, `options` and
`error` back. `error` is the app's sentence for a search that failed. An
option is an `id` and a `label`, and `component RichTextInput` prints the rest of both shapes
under `## Types`. The app waits for a pause in typing before it searches, and drops the answer to
a query that is no longer the latest: the field calls `onQueryChange` on every change.

The document stores the entity's `kind`, `id` and `label`, so it still reads when the thing
it names is gone.

## 5. Show a document

```tsx
<RichTextContent
  value={comment.body}
  headingLevel={3}
  onNavigate={(href) => router.push(href)}
  entity={(entity) => (entity.kind === 'user' ? <Link href={`/people/${entity.id}`}>{entity.label}</Link> : undefined)}
/>
```

`headingLevel` is the page level of the document's first heading level.
`onNavigate` receives a press on a link inside the site, for the app's router.
`entity` replaces the drawing of an entity, and an entity it returns nothing for is
drawn as its label.

## 6. Comments on words

The app owns the threads: who wrote what, which are resolved, who may see them. The document holds
only an anchor, an `annotation` mark with the thread's id, which moves with its words through
every edit. Both members take `annotations` (the ids to highlight; leave a resolved
thread's id out), `activeAnnotation` and `onAnnotationSelect`.

In the field, the app's control in `selectionActions` anchors a new thread to the
selection through the handle it receives:

```tsx
<RichTextInput
  value={body}
  onChange={setBody}
  annotations={openThreads.map((thread) => thread.id)}
  activeAnnotation={activeThread}
  onAnnotationSelect={setActiveThread}
  selectionActions={(editor) => (
    <Button variant="ghost" label="Comment" onClick={() => editor.annotate(createThread(editor.selection.text).id)} />
  )}
/>
```

On a page that only shows the document, `RichTextContent`'s
`selectionActions` receives `{ range, text }`: the selected stretch and its words.
The app makes the thread, anchors it and saves the document:

```tsx
<RichTextContent
  value={description}
  annotations={openThreads.map((thread) => thread.id)}
  activeAnnotation={activeThread}
  onAnnotationSelect={setActiveThread}
  selectionActions={({ range, text }) => (
    <Button
      variant="ghost"
      label="Comment"
      onClick={() => {
        const thread = createThread(text)
        saveDescription(annotateRichText(description, range, thread.id))
        setActiveThread(thread.id)
      }}
    />
  )}
/>
```

A range is `{ start, end }`, counted in code points of the document's plain text with nothing
between blocks, and `end` is not included. Every function here returns a new document and leaves
the one it was given as it was. Without `onAnnotationSelect` a highlight takes no press.

The thread is the app's to show: a `CommentThread` for the id in
`activeAnnotation`, beside the document or in a `Drawer`.

A reviewer that has only the text, a person or a model, anchors a comment by quoting words:
`richTextFindText``(doc, words)` gives the ranges and `annotateRichText` anchors one.
`richTextAnnotations` lists each annotation with the text it covers. An annotation whose words
were deleted is gone from that list, which is how the app finds a thread that lost its anchor.
`removeRichTextAnnotation` removes one.

## 7. On the server

Every function is in `@polymorph/engine/rich-text`. It has no DOM, takes any JSON value or JSON string, and never
throws. A client can send any JSON, so before storing a document:

1. Refuse a document for which `isRichTextNewer` is true. This reader cannot check what it
   cannot read.
2. Read it with `parseRichText`, which returns `{ value, faults }`. `value` is always a
   usable document in normal form, and each fault has a `code`, a `path` and a `message`. The
   field writes no faults, so a document with one came from another client. Refuse it, or store
   `value`: the product decides.
3. Hold it to the formats the field allows with `restrictRichText`, which never refuses. It
   returns the document cut down: a heading or a list that is not allowed becomes paragraphs, a
   mark that is not allowed is dropped, and the words stay. Store the cut document, or refuse one
   the cut changed, as the example does. The format names are the ones the
   field's `formats` takes, and `RICH_TEXT_FORMATS` holds every one.
4. Check `richTextLength` against the limit. It counts code points of the text a person sees.
5. Check each entity `richTextEntities` lists: that its `id` names something the author may
   mention, and that its `label` is the name the server knows. The same list, by `kind`, is who
   was mentioned.

```ts
import {
  isRichTextNewer,
  parseRichText,
  restrictRichText,
  richTextEntities,
  richTextEquals,
  richTextLength,
  type RichTextDocument,
  type RichTextFormat,
} from '@polymorph/engine/rich-text'

const FORMATS: RichTextFormat[] = ['bold', 'italic', 'code', 'link']
const LIMIT = 5000

type Read =
  | { ok: true; body: RichTextDocument }
  | { ok: false; reason: 'newer' | 'malformed' | 'format' | 'length' }

/** A comment a client sent, as the document to store or the reason it is refused. */
export function readComment(sent: unknown): Read {
  if (isRichTextNewer(sent)) return { ok: false, reason: 'newer' }
  const { value, faults } = parseRichText(sent)
  if (faults.length > 0) return { ok: false, reason: 'malformed' }
  const body = restrictRichText(value, FORMATS)
  if (!richTextEquals(body, value)) return { ok: false, reason: 'format' }
  if (richTextLength(body) > LIMIT) return { ok: false, reason: 'length' }
  return { ok: true, body }
}

/** The ids of the people a stored comment mentions, each once. */
export function mentioned(body: RichTextDocument): string[] {
  const people = richTextEntities(body).filter((entity) => entity.kind === 'user')
  return [...new Set(people.map((entity) => entity.id))]
}
```

Every function takes `unknown`, so the same code reads a parsed body or a string from a column.
`RichTextDocument` and `RichTextFormat` are types of the same module.

| For | Use |
| --- | --- |
| Search, a notification, text for a model | `richTextPlainText` |
| The first words on one line, for a list row | `richTextExcerpt` |
| Whether there is anything to save | `isRichTextEmpty` |
| Whether two documents are the same | `richTextEquals` |
| The string to store | `serializeRichText` |

## 8. Other frameworks and native

The members and props have the same names in Vue, Svelte, Solid, Angular and as elements. The
function props that receive the field's handle (`toolbar`, `selectionActions`,
`footer`) and `RichTextContent`'s `entity` and
`selectionActions` are each framework's own slot:

| Framework | How it is written |
| --- | --- |
| React, Solid | A function prop: `toolbar={(editor) => …}` |
| Vue | A scoped slot: `<template #toolbar="editor">` |
| Svelte | A snippet: `{#snippet toolbar(editor)}` |
| Angular | A template: `<ng-template #tools let-editor>`, given as `[toolbar]="tools"` |
| Elements | A property set from script: a function that returns a node or a list of nodes |

In Angular and as an element, `submit` carries the document alone, and the handle reaches the app
through those slots.

SwiftUI and Compose draw `RichTextContent` from the same JSON. `RichTextInput` is a
web member. A phone app that needs formatted input shows a web view, or collects plain text and
stores `richTextFromText` of it.

Two people editing one document at the same time is not part of this.
