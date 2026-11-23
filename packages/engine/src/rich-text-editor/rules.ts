import { InputRule, inputRules } from 'prosemirror-inputrules'
import type { Attrs, MarkType, Node as PMNode, NodeType, Schema } from 'prosemirror-model'
import type { Plugin } from 'prosemirror-state'
import { canJoin, findWrapping } from 'prosemirror-transform'

import { RICH_TEXT_MAX_DEPTH } from '../rich-text/types'
import { EVENT_META, type PendingEvent, nestingDepth } from './commands'
import { LANGUAGE, MARK, NODE } from './schema'

/**
 * The typed shortcuts: Markdown's characters, turned into the format they
 * mean as they are typed.
 *
 * Block shortcuts (`# `, `- `, `1. `, `> `) apply at the start of a block;
 * inline ones (`**bold**`, `*italic*`, `_italic_`, `~~strike~~`, `` `code` ``)
 * apply when the closing characters are typed. A code block is three
 * backticks at the start of a block, then a language name or nothing, then a
 * space or Enter: ```` ```ts ```` and a space starts a TypeScript block. The
 * name is a language name as `codeLanguage` reads one; Enter is the key's
 * (`codeFenceCommand` in `commands.ts`), with the same pattern. Each exists only for
 * a format the field allows. The rules come from `prosemirror-inputrules`,
 * which records each one so that undo or Backspace directly after it gives the
 * typed characters back, and which runs no rule while an input method
 * composes or inside a code block.
 *
 * No rule runs inside inline code either (`inCodeMark: false`): there the
 * characters are code, and `x **ptr* y` keeps its asterisks. An inline rule's
 * pattern looks behind its opening characters instead of matching what comes
 * before them, so the text the rule reads, which must hold no code, starts at
 * the opening characters: bold typed right after inline code still applies.
 *
 * Each rule's transaction carries the event a live region announces, as a
 * key's does: the format the rule turned on.
 */

const OPTIONS = { inCodeMark: false } as const

/**
 * A rule that wraps the block the pattern starts in: a list or a quote. A list
 * joins the list just before it when `joins` says the numbering continues.
 */
function wrappingRule(
  pattern: RegExp,
  type: NodeType,
  event: PendingEvent,
  attrs: (match: RegExpMatchArray) => Attrs | null = () => null,
  joins: (match: RegExpMatchArray, before: PMNode) => boolean = () => true,
): InputRule {
  return new InputRule(
    pattern,
    (state, match, start, end) => {
      const tr = state.tr.delete(start, end)
      const range = tr.doc.resolve(start).blockRange()
      const wrapping = range && findWrapping(range, type, attrs(match))
      if (!range || !wrapping) return null
      tr.wrap(range, wrapping)
      const before = tr.doc.resolve(start - 1).nodeBefore
      if (before && before.type === type && canJoin(tr.doc, start - 1) && joins(match, before))
        tr.join(start - 1)
      if (nestingDepth(tr.doc) > RICH_TEXT_MAX_DEPTH) return null
      return tr.setMeta(EVENT_META, event)
    },
    OPTIONS,
  )
}

/** A rule that turns the textblock the pattern starts in into a heading or a code block. */
function textblockRule(
  pattern: RegExp,
  type: NodeType,
  attrs: (match: RegExpMatchArray) => Attrs | null,
  event: PendingEvent,
): InputRule {
  return new InputRule(
    pattern,
    (state, match, start, end) => {
      const $start = state.doc.resolve(start)
      if (!$start.node(-1).canReplaceWith($start.index(-1), $start.indexAfter(-1), type))
        return null
      return state.tr
        .delete(start, end)
        .setBlockType(start, start, type, attrs(match))
        .setMeta(EVENT_META, event)
    },
    OPTIONS,
  )
}

/**
 * A rule that formats the text between two delimiters and removes them. The
 * pattern matches from the opening delimiter, and its first group is the
 * formatted text.
 */
function markRule(
  pattern: RegExp,
  type: MarkType,
  delimiter: number,
  event: PendingEvent,
): InputRule {
  return new InputRule(
    pattern,
    (state, match, start, end) => {
      const inner = match[1] ?? ''
      const $start = state.doc.resolve(start)
      if (!$start.parent.type.allowsMarkType(type)) return null
      const textFrom = start + delimiter
      const textTo = textFrom + inner.length
      // The closing delimiter's last character is being typed, so only `delimiter - 1` of it is in the document.
      const tr = state.tr
      tr.delete(textTo, end)
      tr.delete(start, textFrom)
      tr.addMark(start, start + inner.length, type.create())
      tr.removeStoredMark(type)
      return tr.setMeta(EVENT_META, event)
    },
    OPTIONS,
  )
}

export function rulesPlugin(schema: Schema): Plugin {
  const rules: InputRule[] = []
  const nodes = schema.nodes
  const marks = schema.marks
  const heading = nodes[NODE.heading]
  if (heading) {
    for (const level of [1, 2, 3] as const) {
      rules.push(
        textblockRule(new RegExp(`^#{${level}}\\s$`), heading, () => ({ level }), {
          type: 'heading',
          level,
        }),
      )
    }
  }
  const bullet = nodes[NODE.bulletList]
  if (bullet)
    rules.push(
      wrappingRule(/^\s*[-*]\s$/, bullet, { type: 'format', format: 'bulletList', active: true }),
    )
  const ordered = nodes[NODE.orderedList]
  if (ordered) {
    rules.push(
      wrappingRule(
        /^(\d{1,9})\.\s$/,
        ordered,
        { type: 'format', format: 'orderedList', active: true },
        (match) => ({ start: Number(match[1]) }),
        (match, before) => before.childCount + (before.attrs.start as number) === Number(match[1]),
      ),
    )
  }
  const quote = nodes[NODE.blockquote]
  if (quote)
    rules.push(
      wrappingRule(/^\s*>\s$/, quote, { type: 'format', format: 'blockquote', active: true }),
    )
  const code = nodes[NODE.codeBlock]
  if (code) {
    rules.push(
      textblockRule(
        new RegExp(`^\`\`\`(${LANGUAGE})?\\s$`),
        code,
        (match) => ({ language: match[1] ?? '' }),
        { type: 'format', format: 'codeBlock', active: true },
      ),
    )
  }

  const bold = marks[MARK.bold]
  if (bold) {
    rules.push(
      markRule(/(?<=^|[^*])\*\*([^*\s](?:[^*]*[^*\s])?)\*\*$/, bold, 2, {
        type: 'format',
        format: 'bold',
        active: true,
      }),
    )
  }
  const italic = marks[MARK.italic]
  if (italic) {
    rules.push(
      markRule(/(?<=^|[^*\w])\*([^*\s](?:[^*]*[^*\s])?)\*$/, italic, 1, {
        type: 'format',
        format: 'italic',
        active: true,
      }),
    )
    rules.push(
      markRule(/(?<=^|[^_\w])_([^_\s](?:[^_]*[^_\s])?)_$/, italic, 1, {
        type: 'format',
        format: 'italic',
        active: true,
      }),
    )
  }
  const strike = marks[MARK.strike]
  if (strike) {
    rules.push(
      markRule(/(?<=^|[^~])~~([^~\s](?:[^~]*[^~\s])?)~~$/, strike, 2, {
        type: 'format',
        format: 'strike',
        active: true,
      }),
    )
  }
  const inlineCode = marks[MARK.code]
  if (inlineCode) {
    rules.push(
      markRule(/(?<=^|[^`])`([^`]+)`$/, inlineCode, 1, {
        type: 'format',
        format: 'code',
        active: true,
      }),
    )
  }
  return inputRules({ rules })
}
