'use client'

import { RICH_TEXT_FORMAT, type ComponentStates, type RichTextDocument } from '@polymorph/react'
import { Avatar } from '../structure/Avatar'
import { Button } from './Button'
import { FormField } from './FormField'
import { RichTextInput, type RichTextEntitySource, type RichTextInputEditor } from './RichTextInput'

/** States fixture, from `design/components/rich-text-input.md`'s States table. */

const noop = () => {}

/** A document built from its blocks, as the app stores it. */
const richText = (...blocks: unknown[]): RichTextDocument =>
  ({ format: RICH_TEXT_FORMAT, blocks }) as RichTextDocument

const text = (words: string, ...marks: unknown[]) =>
  marks.length === 0 ? { type: 'text', text: words } : { type: 'text', text: words, marks }

const paragraph = (...content: unknown[]) => ({ type: 'paragraph', content })

export const PEOPLE: RichTextEntitySource = {
  kind: 'user',
  trigger: '@',
  label: 'People',
  options: [
    {
      id: 'ada',
      label: 'Ada Lovelace',
      description: 'Engineering',
      leading: <Avatar name="Ada Lovelace" size="sm" />,
    },
    { id: 'grace', label: 'Grace Hopper', description: 'Compilers' },
    { id: 'alan', label: 'Alan Turing', description: 'Research' },
  ],
}

/** People the app looks up for each query, while the first answer is on its way. */
const LOOKUP: RichTextEntitySource = {
  kind: 'user',
  trigger: '@',
  label: 'People',
  options: [],
  filter: false,
  loading: true,
}

export const CONTENT = richText(
  paragraph(
    text('The retry policy '),
    text('doubles', { type: 'bold' }),
    text(' the wait after each failure, as '),
    text('the runbook', { type: 'link', href: 'https://example.com/runbook' }),
    text(' says. '),
    { type: 'entity', kind: 'user', id: 'ada', label: '@Ada Lovelace' },
    text(' can you check '),
    text('maxAttempts', { type: 'code' }),
    text('?'),
  ),
  {
    type: 'list',
    ordered: false,
    items: [
      { type: 'listItem', content: [paragraph(text('One retry after a second'))] },
      { type: 'listItem', content: [paragraph(text('Then two, then four'))] },
    ],
  },
)

const DESCRIPTION = richText(
  { type: 'heading', level: 1, content: [text('Webhook retries')] },
  paragraph(text('A failed delivery is retried with a growing wait. The limit is a setting.')),
  { type: 'codeBlock', language: 'ts', text: 'const wait = base * 2 ** attempt' },
  { type: 'blockquote', content: [paragraph(text('Never retry a 4xx response.'))] },
)

const ANNOTATED = richText(
  paragraph(
    text('The retry policy '),
    text('doubles the wait', { type: 'annotation', id: 'thread-1' }),
    text(' after each failure, '),
    text('up to five times', { type: 'annotation', id: 'thread-2' }),
    text('.'),
  ),
)

/** A document a later version of the format wrote, which this version reads and never writes. */
const LATER = {
  format: 'polymorph-rich-text/2',
  blocks: [paragraph(text('Written by a later version of the format.'))],
} as unknown as RichTextDocument

/** Fifty-one code points, over a limit of forty. */
const LONG = richText(paragraph(text('A comment that runs past the limit the app has set.')))

/** How many frames the entry looks for the words before it stops, as the generated fixtures do. */
const SELECT_FRAMES = 60

/** How long after the field takes focus the words are selected, as the generated fixtures do. */
const SELECT_DELAY_MS = 60

/**
 * Selects `words` in the field once the editor holds them, so the selection
 * bar shows, as the generated fixtures' `selects` does: it looks once a frame
 * until the field holds the words, focuses it, and selects them after the
 * editor has written its own selection back on focus, which would otherwise
 * replace them. The ref's cleanup stops a mount that is taken down first.
 */
function selectOnMount(words: string) {
  return (element: HTMLDivElement | null) => {
    const view = element?.ownerDocument.defaultView
    if (element === null || view === null || view === undefined) return
    let frame = 0
    let frames = 0
    let timer = 0
    const select = () => {
      if (!element.isConnected || !(element.textContent ?? '').includes(words)) {
        frames += 1
        if (frames < SELECT_FRAMES) frame = view.requestAnimationFrame(select)
        return
      }
      element.focus()
      timer = view.setTimeout(() => {
        const walker = element.ownerDocument.createTreeWalker(element, view.NodeFilter.SHOW_TEXT)
        for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
          const at = node.textContent?.indexOf(words) ?? -1
          if (at === -1) continue
          element.ownerDocument.getSelection()?.setBaseAndExtent(node, at, node, at + words.length)
          return
        }
      }, SELECT_DELAY_MS)
    }
    frame = view.requestAnimationFrame(select)
    return () => {
      view.cancelAnimationFrame(frame)
      view.clearTimeout(timer)
    }
  }
}

/** One function for every mount, so a render of the field does not select the words again. */
const SELECT_THE_WAIT = selectOnMount('growing wait')

const attach = (editor: RichTextInputEditor) => (
  <Button
    variant="ghost"
    tone="neutral"
    size="sm"
    iconOnly
    icon="attach"
    label="Attach a file"
    disabled={editor.disabled}
    onClick={noop}
  />
)

export const states: ComponentStates = {
  component: 'RichTextInput',

  entries: [
    {
      name: 'empty — a placeholder, every format',
      render: () => <RichTextInput aria-label="Comment" placeholder="Write a comment…" />,
      expect: { 'data-empty': '', 'data-min-rows': '3', 'data-max-rows': '12' },
    },
    {
      name: 'with content — marks, a link, a list and a mention',
      render: () => (
        <RichTextInput aria-label="Comment" defaultValue={CONTENT} entities={[PEOPLE]} />
      ),
      expect: { 'data-empty': null },
    },
    {
      name: 'a comment composer — marks only, mentions, attach and the default footer',
      render: () => (
        <RichTextInput
          aria-label="Comment"
          placeholder="Write a comment…"
          formats={['bold', 'italic', 'strike', 'code', 'link']}
          entities={[PEOPLE]}
          minRows={1}
          maxRows={6}
          toolbar={attach}
          submitLabel="Comment"
          onSubmit={noop}
          cancelLabel="Cancel"
          onCancel={noop}
        />
      ),
      expect: { 'data-min-rows': '1', 'data-max-rows': '6' },
    },
    {
      name: 'a description editor — six rows, every format, a count',
      render: () => (
        <RichTextInput
          aria-label="Description"
          defaultValue={DESCRIPTION}
          minRows={6}
          maxRows={24}
          maxLength={2000}
        />
      ),
      expect: { 'data-min-rows': '6', 'data-max-rows': '24', 'data-invalid': null },
    },
    {
      // Focused on mount, because the list opens while the caret is in a token.
      name: 'suggesting — the people an @ lists under the token',
      render: () => (
        <RichTextInput
          aria-label="Comment"
          defaultValue={richText(paragraph(text('Thanks @')))}
          autoFocus
          entities={[PEOPLE]}
        />
      ),
    },
    {
      name: 'suggestions loading — the app looks people up for the query',
      render: () => (
        <RichTextInput
          aria-label="Comment"
          defaultValue={richText(paragraph(text('Ask @gr')))}
          autoFocus
          entities={[LOOKUP]}
        />
      ),
    },
    {
      // Focused on mount, because the list opens while the caret is in a token.
      name: 'one suggestion — the one person a query matches',
      render: () => (
        <RichTextInput
          aria-label="Comment"
          defaultValue={richText(paragraph(text('Thanks @gr')))}
          autoFocus
          entities={[PEOPLE]}
        />
      ),
    },
    {
      name: 'the app’s footer — its own controls under the field',
      render: () => (
        <RichTextInput
          aria-label="Description"
          defaultValue={DESCRIPTION}
          maxLength={2000}
          footer={(editor) => (
            <>
              <Button variant="ghost" tone="neutral" size="sm" label="Save draft" onClick={noop} />
              <Button
                variant="solid"
                tone="accent"
                size="sm"
                label="Publish"
                disabled={editor.empty || editor.overLimit}
                onClick={noop}
              />
            </>
          )}
        />
      ),
    },
    {
      name: 'over the limit — the count in danger, the field invalid',
      render: () => (
        <RichTextInput
          aria-label="Comment"
          defaultValue={LONG}
          maxLength={40}
          formats={['bold', 'italic', 'link']}
        />
      ),
      expect: { 'data-invalid': '' },
    },
    {
      name: 'invalid — inside a FormField with an error',
      render: () => (
        <FormField label="Description" error="Describe what changed." required>
          <RichTextInput formats={['bold', 'italic', 'link', 'bulletList']} />
        </FormField>
      ),
      expect: { 'data-invalid': '' },
    },
    {
      name: 'disabled',
      render: () => <RichTextInput aria-label="Comment" disabled defaultValue={CONTENT} />,
      expect: { 'data-disabled': '', 'data-readonly': null },
    },
    {
      name: 'read-only — selectable, not editable',
      render: () => <RichTextInput aria-label="Comment" readOnly defaultValue={CONTENT} />,
      expect: { 'data-readonly': '' },
    },
    {
      name: 'pending — the app is saving the comment',
      render: () => (
        <RichTextInput
          aria-label="Comment"
          pending
          defaultValue={CONTENT}
          submitLabel="Comment"
          onSubmit={noop}
        />
      ),
      expect: { 'data-readonly': '' },
    },
    {
      name: 'later format — a document a later version wrote, opened read-only',
      render: () => (
        <RichTextInput
          aria-label="Comment"
          name="body"
          defaultValue={LATER}
          submitLabel="Save"
          onSubmit={noop}
        />
      ),
      expect: { 'data-readonly': '' },
    },
    {
      name: 'annotated — two comment threads, one active',
      render: () => (
        <RichTextInput
          aria-label="Description"
          defaultValue={ANNOTATED}
          annotations={['thread-1', 'thread-2']}
          activeAnnotation="thread-2"
          onAnnotationSelect={noop}
        />
      ),
    },
    {
      // Focused on mount with words selected, because the bar is drawn at a selection.
      name: 'the selection bar — the format controls and a comment at the selected words',
      render: () => (
        <RichTextInput
          aria-label="Description"
          defaultValue={DESCRIPTION}
          toolbarPlacement="selection"
          selectionActions={() => (
            <Button
              variant="ghost"
              tone="neutral"
              size="sm"
              icon="comment"
              label="Comment"
              onClick={noop}
            />
          )}
          controlRef={SELECT_THE_WAIT}
        />
      ),
    },
  ],

  /*
   * The frame's hover and the ring on keyboard focus come from the pointer and
   * the keyboard. The placeholder and a selected entity are states the editor
   * draws itself.
   */
  requiredSelectors: [':hover', ':focus-visible', '[data-placeholder]', '[data-selected]'],
}
