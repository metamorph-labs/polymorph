import type { Registry } from '@polymorph/registry'

import { Facts } from './facts'

/** The module the document's functions come from. It has no DOM, so a server runs it. */
const DOCUMENT = '@polymorph/engine/rich-text'

/**
 * Formatted text a person writes: the field, the member that shows a
 * document, the document's JSON, mentions, comments anchored to words, and
 * what a server does with what a client sent. The screen skill sends a model
 * here for a comment, a description or a note with formatting.
 */
export function richTextReference(registry: Registry): string {
  const f = new Facts(registry)
  const x = (name: string) => f.x(name, DOCUMENT)
  const input = (prop: string) => f.p('RichTextInput', prop)
  const content = (prop: string) => f.p('RichTextContent', prop)
  const entity = (name: string) => f.field('RichTextEntitySource', name)
  return `
# Formatted text a person writes

## 1. Choose the member

| The text | The member |
| --- | --- |
| A person writes it with formatting: a comment, a description, a note | ${f.m('RichTextInput')} |
| A document a person wrote is shown | ${f.m('RichTextContent')} |
| A model wrote it, as Markdown | ${f.m('Markdown')} |
| A person writes it with no formatting | ${f.m('Textarea')} |
| It is the message to a model | ${f.m('PromptInput')} |

Do not bring in an editor library, and do not store or render HTML. The field's value is a JSON
document, and ${f.m('RichTextContent')} draws it through the vocabulary, so a stored document
cannot inject markup.

## 2. The document

\`\`\`json
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
\`\`\`

- Blocks: \`paragraph\`, \`heading\` (\`level\` 1 to 3), \`list\` (\`ordered\`, \`items\` of
  \`listItem\`), \`blockquote\` and \`codeBlock\` (\`text\`, \`language\`).
- Inline nodes: \`text\`, \`break\` and \`entity\` (\`kind\`, \`id\`, \`label\`).
- Marks on text: \`bold\`, \`italic\`, \`strike\`, \`code\`, \`link\` (\`href\`) and \`annotation\`
  (\`id\`).

Store the value as it is, in a JSON column or as a string. Do not convert it to HTML or Markdown to
store it. Start an empty field from ${x('emptyRichText')}\`()\`, and make a document from plain text
with ${x('richTextFromText')}.

## 3. The field

\`\`\`tsx
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
\`\`\`

- ${input('value')} with ${input('onChange')} controls the field. ${input('defaultValue')} leaves
  the document to the field. ${input('name')} adds a hidden input that holds the document as a
  string, for a form that posts.
- ${input('formats')} lists what the field allows. A document given to the field, and what a person
  pastes, is cut down to those formats. Leave it out to allow every format.
- The footer has three forms. ${input('submitLabel')} with ${input('onSubmit')}, and
  ${input('cancelLabel')} with ${input('onCancel')}, draw the default one. ${input('footer')} draws
  the app's own. With none of them there is no footer, which suits a form with its own buttons.
  Set ${input('pending')} while the app saves.
- ${input('maxLength')} is a soft limit. A person can type past it, the count shows how far, and the
  default submit control is disabled. The server enforces the limit (step 7).
- ${input('onFiles')} receives files a person pasted or dropped. The field inserts nothing for them
  and uploads nothing.
- The field shows no message after a save. The app shows a ${f.m('Toast')}.
- ${input('toolbarPlacement')} set to \`selection\` draws the format controls at the selected words
  in place of the fixed row, which suits a long document.

## 4. Mentions

\`\`\`tsx
<RichTextInput
  value={body}
  onChange={setBody}
  entities={[
    { kind: 'user', trigger: '@', label: 'People', options: people.map((person) => ({ id: person.id, label: person.name })) },
    { kind: 'issue', trigger: '#', label: 'Issues', filter: false, options: issues, loading: searching, onQueryChange: setIssueQuery },
  ]}
/>
\`\`\`

The app supplies each kind's ${entity('options')}, and the field never fetches. With
${entity('filter')} set to \`false\` the app searches: it reads the query from
${entity('onQueryChange')} and passes ${entity('loading')}, ${entity('options')} and
${entity('error')} back. ${entity('error')} is the app's sentence for a search that failed. An
option is an \`id\` and a \`label\`, and \`component RichTextInput\` prints the rest of both shapes
under \`## Types\`. The app waits for a pause in typing before it searches, and drops the answer to
a query that is no longer the latest: the field calls ${entity('onQueryChange')} on every change.

The document stores the entity's \`kind\`, \`id\` and \`label\`, so it still reads when the thing
it names is gone.

## 5. Show a document

\`\`\`tsx
<RichTextContent
  value={comment.body}
  headingLevel={3}
  onNavigate={(href) => router.push(href)}
  entity={(entity) => (entity.kind === 'user' ? <Link href={\`/people/\${entity.id}\`}>{entity.label}</Link> : undefined)}
/>
\`\`\`

${content('headingLevel')} is the page level of the document's first heading level.
${content('onNavigate')} receives a press on a link inside the site, for the app's router.
${content('entity')} replaces the drawing of an entity, and an entity it returns nothing for is
drawn as its label.

## 6. Comments on words

The app owns the threads: who wrote what, which are resolved, who may see them. The document holds
only an anchor, an \`annotation\` mark with the thread's id, which moves with its words through
every edit. Both members take ${input('annotations')} (the ids to highlight; leave a resolved
thread's id out), ${input('activeAnnotation')} and ${input('onAnnotationSelect')}.

In the field, the app's control in ${input('selectionActions')} anchors a new thread to the
selection through the handle it receives:

\`\`\`tsx
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
\`\`\`

On a page that only shows the document, ${f.m('RichTextContent')}'s
${content('selectionActions')} receives \`{ range, text }\`: the selected stretch and its words.
The app makes the thread, anchors it and saves the document:

\`\`\`tsx
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
\`\`\`

A range is \`{ start, end }\`, counted in code points of the document's plain text with nothing
between blocks, and \`end\` is not included. Every function here returns a new document and leaves
the one it was given as it was. Without ${content('onAnnotationSelect')} a highlight takes no press.

The thread is the app's to show: a ${f.m('CommentThread')} for the id in
${content('activeAnnotation')}, beside the document or in a ${f.m('Drawer')}.

A reviewer that has only the text, a person or a model, anchors a comment by quoting words:
${x('richTextFindText')}\`(doc, words)\` gives the ranges and ${x('annotateRichText')} anchors one.
${x('richTextAnnotations')} lists each annotation with the text it covers. An annotation whose words
were deleted is gone from that list, which is how the app finds a thread that lost its anchor.
${x('removeRichTextAnnotation')} removes one.

## 7. On the server

Every function is in \`${DOCUMENT}\`. It has no DOM, takes any JSON value or JSON string, and never
throws. A client can send any JSON, so before storing a document:

1. Refuse a document for which ${x('isRichTextNewer')} is true. This reader cannot check what it
   cannot read.
2. Read it with ${x('parseRichText')}, which returns \`{ value, faults }\`. \`value\` is always a
   usable document in normal form, and each fault has a \`code\`, a \`path\` and a \`message\`. The
   field writes no faults, so a document with one came from another client. Refuse it, or store
   \`value\`: the product decides.
3. Hold it to the formats the field allows with ${x('restrictRichText')}, which never refuses. It
   returns the document cut down: a heading or a list that is not allowed becomes paragraphs, a
   mark that is not allowed is dropped, and the words stay. Store the cut document, or refuse one
   the cut changed, as the example does. The format names are the ones the
   field's ${input('formats')} takes, and ${x('RICH_TEXT_FORMATS')} holds every one.
4. Check ${x('richTextLength')} against the limit. It counts code points of the text a person sees.
5. Check each entity ${x('richTextEntities')} lists: that its \`id\` names something the author may
   mention, and that its \`label\` is the name the server knows. The same list, by \`kind\`, is who
   was mentioned.

\`\`\`ts
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
\`\`\`

Every function takes \`unknown\`, so the same code reads a parsed body or a string from a column.
${x('RichTextDocument')} and ${x('RichTextFormat')} are types of the same module.

| For | Use |
| --- | --- |
| Search, a notification, text for a model | ${x('richTextPlainText')} |
| The first words on one line, for a list row | ${x('richTextExcerpt')} |
| Whether there is anything to save | ${x('isRichTextEmpty')} |
| Whether two documents are the same | ${x('richTextEquals')} |
| The string to store | ${x('serializeRichText')} |

## 8. Other frameworks and native

The members and props have the same names in Vue, Svelte, Solid, Angular and as elements. The
function props that receive the field's handle (${input('toolbar')}, ${input('selectionActions')},
${input('footer')}) and ${f.m('RichTextContent')}'s ${content('entity')} and
${content('selectionActions')} are each framework's own slot:

| Framework | How it is written |
| --- | --- |
| React, Solid | A function prop: \`toolbar={(editor) => …}\` |
| Vue | A scoped slot: \`<template #toolbar="editor">\` |
| Svelte | A snippet: \`{#snippet toolbar(editor)}\` |
| Angular | A template: \`<ng-template #tools let-editor>\`, given as \`[toolbar]="tools"\` |
| Elements | A property set from script: a function that returns a node or a list of nodes |

In Angular and as an element, \`submit\` carries the document alone, and the handle reaches the app
through those slots.

SwiftUI and Compose draw ${f.m('RichTextContent')} from the same JSON. ${f.m('RichTextInput')} is a
web member. A phone app that needs formatted input shows a web view, or collects plain text and
stores ${x('richTextFromText')} of it.

Two people editing one document at the same time is not part of this.
`.trimStart()
}
