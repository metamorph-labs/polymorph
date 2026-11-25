import { baseKeymap } from 'prosemirror-commands'
import { keydownHandler } from 'prosemirror-keymap'
import type { Schema } from 'prosemirror-model'
import { type Command, Plugin } from 'prosemirror-state'
import type { EditorView } from 'prosemirror-view'

import { composingKey } from '../conventions/composition'
import type { RichTextFormat } from '../rich-text/types'
import {
  backspaceCommand,
  codeBlockCommand,
  deleteCommand,
  enterCommand,
  hardBreakCommand,
  headingCommand,
  liftCommand,
  listCommand,
  markCommand,
  quoteCommand,
  redoCommand,
  sinkCommand,
  stepOverUnit,
  undoCommand,
} from './commands'
import type { RichTextSuggestionKey } from './types'

/**
 * The editor's keys, in the order they are offered.
 *
 * 1. The five keys an open suggestion list takes, offered to the member
 *    first. Shift-Tab is not one of them: it is the list item's key or the
 *    browser's.
 * 2. Mod-Enter, the member's submit, when the member gave one.
 * 3. The format keys, bound only for a format the field allows. A key left
 *    unbound changes nothing: the browser's own formatting is refused by the
 *    editor's `beforeinput` handler.
 * 4. Editing keys: Enter, Shift-Enter, Backspace, Delete, Tab and Shift-Tab
 *    in a list, and the arrows beside an entity.
 * 5. ProseMirror's base keymap for the rest.
 *
 * Tab is taken only when it sinks a list item and Shift-Tab only when it lifts
 * a nested one out of its list; anywhere else the browser moves focus, so the
 * field never traps Tab. Shift-Tab on an item of a top-level list leaves it
 * where it is, so a person who Shift-Tabs out of the field from a list changes
 * nothing. Escape releases Tab: the next Tab or Shift-Tab is the browser's
 * wherever the caret is, so focus leaves the field from any list item and the
 * text does not change (WCAG 2.1.2). Any other key, a press in the text or
 * focus leaving the field takes Tab back.
 *
 * No key an input method is handling is taken: ProseMirror offers none while
 * it knows a composition is open, and a key marked `isComposing`, or one the
 * browser reports with key code 229 (the key an input method processed, such
 * as Safari's Enter that confirms a composition after `compositionend`), is
 * left to the input method too. So the Enter that confirms Japanese or Chinese
 * text never picks a suggestion and never splits a block.
 *
 * In a read-only field that keeps its caret (`readOnly`), only the keys that
 * move the caret or the selection, and Mod-Enter, are the editor's: every
 * other key is left to the browser, whose edits the editor refuses, so Tab
 * still moves focus and no format key turns anything on.
 */

export interface KeyHooks {
  suggestionOpen: () => boolean
  onSuggestionKey: () => ((key: RichTextSuggestionKey) => boolean) | undefined
  onSubmit: () => (() => void) | undefined
  onLinkRequest: () => (() => void) | undefined
  /** Whether the field is read-only with a caret: no key that edits is the editor's. */
  readOnly: () => boolean
}

const SUGGESTION_KEYS: readonly RichTextSuggestionKey[] = [
  'ArrowDown',
  'ArrowUp',
  'Enter',
  'Tab',
  'Escape',
]

/** The base keymap's keys that move the caret or select: a read-only field keeps them. */
const SELECTING = new Set(['Mod-a', 'Ctrl-a', 'Ctrl-e'])

/** Keys that only modify another: Shift before Tab keeps Tab released. */
const MODIFIERS = new Set(['Shift', 'Control', 'Alt', 'Meta'])

function isRtl(view: { dom: HTMLElement } | undefined): boolean {
  if (!view) return false
  return view.dom.ownerDocument.defaultView?.getComputedStyle(view.dom).direction === 'rtl'
}

/** Whether a key belongs to an input method: one ProseMirror knows is composing, or `composingKey`. */
function inputMethodKey(view: EditorView, event: KeyboardEvent): boolean {
  return view.composing || composingKey(event)
}

/** A keymap that takes no key an input method is handling. */
function keys(bindings: Record<string, Command>): Plugin {
  const handle = keydownHandler(bindings)
  return new Plugin({
    props: {
      handleKeyDown: (view, event) => !inputMethodKey(view, event) && handle(view, event),
    },
  })
}

export function keyPlugins(
  schema: Schema,
  formats: readonly RichTextFormat[],
  hooks: KeyHooks,
): Plugin[] {
  const allowed = new Set(formats)

  /** Whether Escape has released Tab: the next Tab or Shift-Tab is the browser's. */
  let released = false
  const release = new Plugin({
    props: {
      handleKeyDown: (view, event) => {
        if (inputMethodKey(view, event)) return false
        if (event.key === 'Escape') released = true
        else if (event.key !== 'Tab' && !MODIFIERS.has(event.key)) released = false
        return false
      },
      handleDOMEvents: {
        mousedown: () => {
          released = false
          return false
        },
        blur: () => {
          released = false
          return false
        },
      },
    },
  })
  /** A Tab command that is the browser's while Escape has released Tab. */
  const unlessReleased =
    (command: Command): Command =>
    (state, dispatch, view) =>
      !released && command(state, dispatch, view)

  /** A command that edits: a read-only field leaves its key to the browser. */
  const writing =
    (command: Command): Command =>
    (state, dispatch, view) =>
      !hooks.readOnly() && command(state, dispatch, view)

  const suggestion: Record<string, Command> = {}
  for (const key of SUGGESTION_KEYS) {
    suggestion[key] = () => {
      if (!hooks.suggestionOpen()) return false
      return hooks.onSuggestionKey()?.(key) ?? false
    }
  }

  const submit: Record<string, Command> = {
    'Mod-Enter': () => {
      const onSubmit = hooks.onSubmit()
      if (!onSubmit) return false
      onSubmit()
      return true
    },
  }

  const formatKeys: Record<string, Command> = {}
  if (allowed.has('bold')) formatKeys['Mod-b'] = markCommand(schema, 'bold')
  if (allowed.has('italic')) formatKeys['Mod-i'] = markCommand(schema, 'italic')
  if (allowed.has('strike')) formatKeys['Mod-Shift-x'] = markCommand(schema, 'strike')
  if (allowed.has('code')) formatKeys['Mod-e'] = markCommand(schema, 'code')
  if (allowed.has('link')) {
    formatKeys['Mod-k'] = () => {
      const request = hooks.onLinkRequest()
      if (!request) return false
      request()
      return true
    }
  }
  if (allowed.has('bulletList')) formatKeys['Mod-Shift-8'] = listCommand(schema, 'bulletList')
  if (allowed.has('orderedList')) formatKeys['Mod-Shift-7'] = listCommand(schema, 'orderedList')
  if (allowed.has('blockquote')) formatKeys['Mod-Shift-9'] = quoteCommand(schema)
  if (allowed.has('heading') || allowed.has('codeBlock'))
    formatKeys['Mod-Alt-0'] = headingCommand(schema, 0)
  if (allowed.has('heading')) {
    formatKeys['Mod-Alt-1'] = headingCommand(schema, 1)
    formatKeys['Mod-Alt-2'] = headingCommand(schema, 2)
    formatKeys['Mod-Alt-3'] = headingCommand(schema, 3)
  }
  if (allowed.has('codeBlock')) formatKeys['Mod-Alt-c'] = codeBlockCommand(schema)

  const editing: Record<string, Command> = {
    'Mod-z': undoCommand,
    'Mod-Shift-z': redoCommand,
    'Mod-y': redoCommand,
    Enter: enterCommand(schema),
    'Shift-Enter': hardBreakCommand(schema),
    Backspace: backspaceCommand(schema),
    Delete: deleteCommand,
    Tab: unlessReleased(sinkCommand(schema)),
    'Shift-Tab': unlessReleased(liftCommand(schema)),
  }
  const moving: Record<string, Command> = {
    ArrowLeft: (state, dispatch, view) => stepOverUnit(isRtl(view) ? 1 : -1)(state, dispatch),
    ArrowRight: (state, dispatch, view) => stepOverUnit(isRtl(view) ? -1 : 1)(state, dispatch),
  }
  const base: Record<string, Command> = Object.fromEntries(
    Object.entries(baseKeymap).map(([key, command]) => [
      key,
      SELECTING.has(key) ? command : writing(command),
    ]),
  )
  const each = (bindings: Record<string, Command>) =>
    Object.fromEntries(Object.entries(bindings).map(([key, command]) => [key, writing(command)]))
  return [
    release,
    keys(suggestion),
    keys(submit),
    keys(each(formatKeys)),
    keys({ ...each(editing), ...moving }),
    keys(base),
  ]
}
