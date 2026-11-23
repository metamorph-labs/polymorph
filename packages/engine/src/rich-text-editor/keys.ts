import { baseKeymap } from 'prosemirror-commands'
import { keymap } from 'prosemirror-keymap'
import type { Schema } from 'prosemirror-model'
import type { Command, Plugin } from 'prosemirror-state'

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
 * one; anywhere else the browser moves focus, so the field never traps Tab.
 * ProseMirror offers no key while an input method composes.
 */

export interface KeyHooks {
  suggestionOpen: () => boolean
  onSuggestionKey: () => ((key: RichTextSuggestionKey) => boolean) | undefined
  onSubmit: () => (() => void) | undefined
  onLinkRequest: () => (() => void) | undefined
}

const SUGGESTION_KEYS: readonly RichTextSuggestionKey[] = [
  'ArrowDown',
  'ArrowUp',
  'Enter',
  'Tab',
  'Escape',
]

function isRtl(view: { dom: HTMLElement } | undefined): boolean {
  if (!view) return false
  return view.dom.ownerDocument.defaultView?.getComputedStyle(view.dom).direction === 'rtl'
}

export function keyPlugins(
  schema: Schema,
  formats: readonly RichTextFormat[],
  hooks: KeyHooks,
): Plugin[] {
  const allowed = new Set(formats)
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
    Tab: sinkCommand(schema),
    'Shift-Tab': liftCommand(schema),
    ArrowLeft: (state, dispatch, view) => stepOverUnit(isRtl(view) ? 1 : -1)(state, dispatch),
    ArrowRight: (state, dispatch, view) => stepOverUnit(isRtl(view) ? -1 : 1)(state, dispatch),
  }
  return [
    keymap(suggestion),
    keymap(submit),
    keymap(formatKeys),
    keymap(editing),
    keymap(baseKeymap),
  ]
}
