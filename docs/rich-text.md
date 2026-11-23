# Rich text

How polymorph edits and shows formatted text a person wrote: a comment, a description, a note, a
message. For the model behind the vocabulary, read [concepts.md](concepts.md). For the laws every
member meets, read [rules.md](rules.md).

Terms used on this page: a **document** is the JSON value that holds the text and its formatting.
A **block** is a paragraph, a heading, a list, a quote or a code block. A **mark** is a format on
a run of text. An **entity** is a reference to something the application owns, such as a person or
an issue. An **annotation** is an anchor on a stretch of text for something the application keeps
about it, such as a comment thread.

## The parts

| Part | Where | What it is |
| --- | --- | --- |
| The document | `@polymorph/engine/rich-text` | the types, the reader, the normal form, plain text, annotations. No dependency and no DOM, so a server runs it |
| `RichTextContent` | the `structure` tier | draws a document, read-only, through the vocabulary |
| `RichTextInput` | the `controls` tier | the field a person writes in |
| The editor | `@polymorph/engine/rich-text-editor` | what `RichTextInput` is built on. An application does not call it |

`Markdown` draws text a model wrote, which arrives as Markdown and may be half-written.
`RichTextContent` draws a document a person wrote in `RichTextInput`. `Textarea` is the field for
text with no formatting, and `PromptInput` is the chat composer.

## The document

A document is plain JSON. An application stores it as it is, sends it over its own API and reads it
on its server with the same functions the members use.

```json
{
  "format": "polymorph-rich-text/1",
  "blocks": [
    { "type": "heading", "level": 1, "content": [{ "type": "text", "text": "Release notes" }] },
    {
      "type": "paragraph",
      "content": [
        { "type": "text", "text": "Thanks to " },
        { "type": "entity", "kind": "user", "id": "u_17", "label": "@Ada Lovelace" },
        { "type": "text", "text": " for the " },
        { "type": "text", "text": "fix", "marks": [{ "type": "bold" }] },
        { "type": "text", "text": "." }
      ]
    }
  ]
}
```

| Block | Fields |
| --- | --- |
| `paragraph` | `content`: inline nodes |
| `heading` | `level` (1 to 3, the level inside the document), `content` |
| `list` | `ordered`, `start` (a numbered list's first number, omitted when 1), `items` |
| `listItem` | `content`: blocks, the first a paragraph |
| `blockquote` | `content`: blocks |
| `codeBlock` | `text`, `language` (omitted when none) |

| Inline node | Fields |
| --- | --- |
| `text` | `text`, `marks` (omitted when none) |
| `break` | a line break the writer asked for |
| `entity` | `kind`, `id`, `label`, and `marks` for the annotations it is inside. A format on an entity is dropped |

| Mark | Fields |
| --- | --- |
| `bold`, `italic`, `strike`, `code` | none |
| `link` | `href` |
| `annotation` | `id` |

The types name no editor. A stored document does not change when the library under the field does.

### Reading a document

Every function that reads a document takes any JSON value or a JSON string, and none throws.

```ts
import { parseRichText, serializeRichText } from '@polymorph/engine/rich-text'

const { value, faults } = parseRichText(stored)
```

`value` is always a usable document in normal form. `faults` lists what the reader repaired,
removed or did not know, each with a code and a path. An application that validates what a client
sent refuses a document whose faults are not empty, or stores `value`.

| Fault | What the reader did |
| --- | --- |
| `unreadable` | the input is not a document: the result is the empty document |
| `newer-format` | the format is later than this reader's: it is read as far as it can be |
| `unknown-node` | kept where it is, and drawn as the readable text found in it |
| `unknown-mark` | kept, and it draws nothing |
| `malformed` | a known node with a missing or mistyped field: repaired where the repair is certain, dropped otherwise |
| `unsafe-link` | the mark is removed and its text kept |
| `too-deep` | blocks nested past the limit are flattened to paragraphs of their text |

The normal form is one spelling for each document: neighbouring text with the same marks is one
node, marks are in one order, empty text is gone. `serializeRichText` writes it, and
`richTextEquals` compares two documents by it.

### Links

`richTextHref` decides which targets may be followed: `http`, `https`, `mailto` and `tel`, and
relative targets inside the site. The reader removes every other link from a document, so a
renderer never draws a `javascript:` target. The field checks a target with the same function
before it writes one.

### Plain text

| Function | Gives |
| --- | --- |
| `richTextPlainText(doc, options?)` | the text a person reads, for search, a notification or a model |
| `richTextExcerpt(doc, length)` | the first words on one line, for a list row |
| `richTextLength(doc)` | the length in code points, which is what a character limit counts |
| `isRichTextEmpty(doc)` | no entity, and no text but whitespace |
| `richTextEntities(doc)` | every entity, for sending notifications or checking permissions on the server |
| `richTextFromText(text)` | a document of paragraphs from plain text |

A character limit counts code points of the text a person sees. An entity counts as its label. An
emoji made of several code points counts as several, which is the rule a server can repeat in any
language without a segmentation library.

### Versions

The `format` field names the format and its version. The version changes only when an older reader
would misread the document. A new block, inline node or mark does not change it: an older reader
keeps what it does not know and draws its text, and writes it back unchanged.

When the version does change, `parseRichText` upgrades an older document one version at a time
before it reads it, and `migrateRichText` does the same for an application that upgrades stored
documents in bulk. A reader given a later format than its own reads what it can and reports
`newer-format`.

## Showing a document

```tsx
<RichTextContent value={comment.body} />
```

`RichTextContent` draws each block as the vocabulary's own member: a paragraph is `Text`, a
heading is `Heading`, a code block is `CodeBlock`, a link is `Link`. `headingLevel` sets the page
level of the document's level 1 heading. `size` sets the text size. `onNavigate` receives a press
on a link whose target is inside the site, for the application's router.

An entity is drawn as a token holding its label. `entity` replaces that drawing with the
application's, a `Link` to a profile or a `HoverCard` with details:

```tsx
<RichTextContent
  value={comment.body}
  entity={(entity) =>
    entity.kind === 'user' ? <Link href={`/people/${entity.id}`}>{entity.label}</Link> : undefined
  }
/>
```

The member renders on a server. It writes no HTML from the document: every node becomes an
element of a known kind, so a stored document cannot inject markup.

## The field

```tsx
const [body, setBody] = useState(emptyRichText())

<FormField label="Comment">
  <RichTextInput
    value={body}
    onChange={setBody}
    placeholder="Write a comment"
    submitLabel="Comment"
    onSubmit={async (value, editor) => {
      await save(value)
      editor.clear()
    }}
  />
</FormField>
```

`value` with `onChange` controls the field, and `defaultValue` leaves the document to the field.
`name` adds a hidden input holding the serialized document, for a form that posts.

`formats` lists what the field allows. A field for a short reply allows marks and links only:

```tsx
<RichTextInput formats={['bold', 'italic', 'code', 'link']} />
```

A document given to the field is restricted to those formats, and so is what a person pastes.
`restrictRichText` does the same on a server.

### What a person can do

- The toolbar holds a control for each allowed format, and undo and redo.
- Keys: Mod+B, Mod+I, Mod+Shift+X (strikethrough), Mod+E (code), Mod+K (link), Mod+Z and
  Mod+Shift+Z, Shift+Enter for a line break, Mod+Enter to submit, Alt+F10 to reach the toolbar.
  Mod is Command on a Mac and Control elsewhere.
- Typing `# `, `- `, `1. `, `> ` or three backticks at the start of a line starts that block.
- Paste keeps the formats the field allows and drops everything else: styles, scripts, images and
  unsafe links. Mod+Shift+V pastes plain text.
- A link is added and edited in a small form. A target that may not be followed is refused there.

### Entities

An application registers the kinds of entity a person can insert, each with the character that
opens its suggestions. The application supplies the options, and the field never fetches.

```tsx
<RichTextInput
  entities={[
    {
      kind: 'user',
      trigger: '@',
      label: 'People',
      options: people.map((person) => ({ id: person.id, label: person.name })),
    },
    {
      kind: 'issue',
      trigger: '#',
      label: 'Issues',
      filter: false,
      options: issues,
      loading: searching,
      error: searchFailed ? 'Issues could not be loaded' : undefined,
      onQueryChange: setIssueQuery,
    },
  ]}
/>
```

With `filter: false` the application filters, which is how an asynchronous search works: it reads
the query from `onQueryChange`, and passes `loading`, `options` and `error` back. Arrow keys move
through the list, Enter or Tab picks, and Escape closes the list and keeps what was typed. Nothing
is inserted unless a person picks an option.

The document stores the entity's `kind`, `id` and `label`. The label is what every reader draws,
so a document still reads when the thing it names is gone. An application that wants the current
name draws it through `RichTextContent`'s `entity`.

### The application's controls

| Prop | Where it is drawn | For |
| --- | --- | --- |
| `toolbar` | at the end of the toolbar | attach a file, pick an emoji |
| `footer` | in place of the default footer | the application's own submit row |
| `selectionActions` | in the bar at the selection | comment on the selected words |

Each receives the field's handle: `focus()`, `clear()`, `insertText(text)`,
`insertEntity(entity)`, `annotate(id)`, `removeAnnotation(id)`, and `value`, `empty`, `length`,
`overLimit`, `disabled` and `selection`.

The footer has three forms. `submitLabel` with `onSubmit`, and `cancelLabel` with `onCancel`, draw
the default one. `footer` draws the application's in its place. With neither there is no footer,
which suits a field in a form with its own buttons.

`onFiles` receives files a person pasted or dropped. The field inserts nothing for them.

### The selection bar

`toolbarPlacement="selection"` draws the format controls in a bar at the selected text, in place
of the fixed toolbar. This suits a long document, where a fixed row is far from the words.
`selectionActions` adds the application's controls to the front of that bar, and with the fixed
toolbar the bar holds them alone.

The bar is a toolbar: Tab from the text reaches it while it is drawn, Alt+F10 moves to it, and
Escape returns to the text with the selection as it was.

## Comments on text

An application shows a comment beside the words it is about. The words are highlighted, one
thread is active, and a press on a highlight opens its thread. The application owns the threads:
who wrote what, whether one is resolved, who may see it. The document holds only the anchor, an
`annotation` mark with the thread's identifier, which moves with its text through every edit.

In the field, the application's control anchors a new thread to the selection:

```tsx
<RichTextInput
  value={body}
  onChange={setBody}
  annotations={openThreads.map((thread) => thread.id)}
  activeAnnotation={activeThread}
  onAnnotationSelect={setActiveThread}
  selectionActions={(editor) => (
    <Button
      variant="ghost"
      iconOnly
      icon="comment"
      label="Comment"
      onClick={() => {
        const thread = createThread(editor.selection.text)
        editor.annotate(thread.id)
      }}
    />
  )}
/>
```

On a page that only shows the document, `RichTextContent` takes the same props, and its
`selectionActions` receives the selected range:

```tsx
<RichTextContent
  value={body}
  annotations={openThreads.map((thread) => thread.id)}
  activeAnnotation={activeThread}
  onAnnotationSelect={setActiveThread}
  selectionActions={({ range, text }) => (
    <Button
      label="Comment"
      onClick={() => {
        const thread = createThread(text)
        setBody(annotateRichText(body, range, thread.id))
      }}
    />
  )}
/>
```

`annotations` lists the annotations drawn. A resolved thread's anchor stays in the document and is
left out of the list. Without the prop every annotation is drawn.

In the reader, with `onAnnotationSelect`, each highlight is a button a person reaches by Tab, named
by its own words. Where annotations overlap, the innermost one takes the press. A press on a link
inside a highlight follows the link. An annotation on part of a link is drawn around the whole
link, and its anchor stays exact. When the application stores the annotated document and the
reader draws it again, the selection ends and the bar leaves. `messages` holds the bar's name and
its announcement.

In the field a highlight is text a person edits, not a button. `onAnnotationSelect` is called when
the caret enters an annotation, by the keys or by a press, and links are never followed while
editing.

A server works with annotations through the same entry:

| Function | Gives |
| --- | --- |
| `richTextAnnotations(doc)` | every annotation with the text it covers and its range |
| `annotateRichText(doc, range, id)` | the document with the annotation on that range |
| `removeRichTextAnnotation(doc, id)` | the document without it |
| `richTextFindText(doc, text)` | every range where the plain text holds `text` |
| `richTextRangeText(doc, range)` | the text in a range |

A range counts code points of the document's plain text with no separator between blocks. So a
reviewer that has only the text, a person or a model, anchors a comment by quoting words:
`richTextFindText` gives the range and `annotateRichText` anchors it. A match lies inside one
paragraph, heading or code block, and may cross formats, entities and line breaks. An annotation whose text was
deleted is gone from the document, and `richTextAnnotations` no longer lists it, which is how an
application finds a thread that lost its anchor.

Text that is pasted or dropped brings no annotation with it, so a copy never anchors one thread
in two places. Text dragged to another place in the same field keeps its own. Text typed or pasted
inside an annotation becomes part of it, and text typed at its edge does not.

Two people editing one document at the same time is not part of this. The editor's contract names
no library, so it can be added without changing a document or a caller.

## What the application owns

- **The network.** The field does not upload, fetch, save or retry. It calls `onChange`,
  `onSubmit`, `onFiles` and `onQueryChange`, and draws what its props say.
- **Storage and drafts.** The document is the application's value. A draft is that value kept
  wherever the application keeps drafts.
- **Permissions and notifications.** `richTextEntities` lists who and what a document names, on
  the server, from the stored value.
- **Validation.** A server reads what a client sent with `parseRichText`, restricts it with
  `restrictRichText`, and checks `richTextLength` against its own limit. A client can send any
  JSON, so the server also checks each entity: that its `id` names something the author may
  mention, and that its `label` is the name the server knows for it. The field keeps a pasted
  entity only when it was copied from a field on the same page, and a mention copied from anywhere
  else arrives as its text, so a web page cannot put a hidden mention on a person's clipboard. `maxLength` in the field
  is a soft limit: a person can type past it, the count shows how far, and the default submit
  control is disabled.
- **The words.** Every label and announcement comes from `messages`, with English defaults.
- **Messages after an act.** The field shows no toast. The application shows one when its save
  succeeded or failed.

## Accessibility

The text is a `textbox` that is multi-line. A `FormField` names it. The toolbar is a `toolbar`
with one tab stop, and each format control is a toggle that says whether it is on. The suggestion
list is a `listbox` the text controls, and focus stays in the text while a person moves through
it. One polite status region says what a sighted person sees change: a format turned on or off, a
link added, an entity inserted, the limit crossed, a refused submit, and the state of the
suggestions. In the reader, a highlight that can be pressed is reachable by Tab and activated by
Enter or Space.
Text entered through an input method is never changed while it is being composed.

## Frameworks and platforms

Both members are drawn by React, Vue, Svelte, Solid, Angular and the custom elements, from one
description each ([shells.md](shells.md)). The function props that receive the field's handle read
as each framework's own slot:

| Framework | `toolbar`, `selectionActions`, `footer` |
| --- | --- |
| React, Solid | a function prop: `toolbar={(editor) => …}` |
| Vue | a scoped slot: `<template #toolbar="editor">` |
| Svelte | a snippet: `{#snippet toolbar(editor)}` |
| Angular | a template: `<ng-template #tools let-editor>` given as `[toolbar]="tools"` |
| Elements | a property set from script, a function that returns a node or an array of nodes |

An Angular output and an element's event carry one value. So `submit` gives the document there,
and the handle reaches the application through the three slots.

`RichTextContent` is also drawn by SwiftUI and Compose. The native members take the document as
JSON and read it with their own tolerant reader, which follows the same rules. They draw
annotations and report a tap on one through `onAnnotationSelect`. They do not draw
`selectionActions`, because neither platform's text reports a selected range to a member, so a
phone application anchors a comment from its own control with `annotateRichText` on its server or
in a web view.

`RichTextInput` is a web member. On iOS and Android the platform maps name `Textarea` in its
place, and a phone application that needs formatted input shows a web view, or collects plain text
and stores `richTextFromText` of it.
