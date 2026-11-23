import {
  DOMParser as ParserOfSchema,
  DOMSerializer,
  Fragment,
  Schema,
  type DOMOutputSpec,
  type MarkSpec,
  type Node as PMNode,
  type NodeSpec,
  type StyleParseRule,
  type TagParseRule,
} from 'prosemirror-model'

import { richTextHref } from '../rich-text/index'
import type { RichTextFormat } from '../rich-text/types'
import type { RichTextEditorClasses, RichTextEditorEntityKind } from './types'
import { unknownText } from './unknown'

/**
 * The editor's schema: which nodes and marks a document in the editor may
 * hold, how each is drawn inside the element, and how pasted HTML is read.
 *
 * The schema holds only what the field allows. A format outside `formats` has
 * no node or mark type, so nothing can create it: a paste, a drop or a
 * browser's own editing command that would produce one is read as the text it
 * holds. For a format the field does not allow, a paste ends as
 * `restrictRichText` would make the same document: a heading reads as a
 * paragraph, a list as its items' blocks, a quote as its blocks, preformatted
 * text as a paragraph with hard breaks, and a mark is left off its text. A
 * heading takes no bold, italic or strike, and inline code no other format but
 * a link, as the model's normal form keeps them (`rich-text/read.ts`), so what
 * the field holds is what the model keeps. A paste differs from
 * `restrictRichText` in two ways: it never makes a node or mark this version
 * does not know, and it keeps an entity only when the entity was copied from
 * an editor in this page (below).
 *
 * Every element and attribute the editable surface shows is written here. Each
 * takes its class from the member's recipe (`classes`). The clipboard gets a
 * second drawing of the same nodes with no class and with the document's own
 * heading levels, so a copy pasted elsewhere carries no recipe's hashed class
 * and a copy pasted back keeps its levels.
 *
 * Unknown nodes and marks are always in the schema: a document a later
 * version wrote must pass through an edit unchanged. They have no parse rule,
 * so a paste never creates one. The annotation mark is always in the schema
 * too, because it is not a format, and it has no parse rule and no clipboard
 * drawing for the same reason (`annotations.ts`).
 *
 * Which marks an inline node may carry is decided by its parent's `marks`, so
 * a command over a selection puts a format on an entity in it, as on a text.
 * The editor takes it off again in the same step (`marks.ts`), and the
 * conversion writes back only an entity's annotations and unknown marks
 * (`convert.ts`), because a format means nothing on an entity.
 *
 * An entity names something in the application, so a paste may not make one
 * up: a page could put `<span data-entity-kind="user" data-entity-id="admin">`
 * on the clipboard and the reader would mention someone they never saw. Each
 * time an editor in this page draws an entity for the clipboard, it records the
 * entity's kind, id and label in this module under a new random value, and the
 * drawn span carries that value. A pasted entity is kept only when its value is
 * on record, the record's kind, id and label are the span's, and the field
 * suggests its kind. Any other reads as its label. So an entity copied from an
 * editor in this page pastes as an entity in any field of the page, and one
 * copied from another tab or another application pastes as text. A page the
 * copy was pasted into learns its values, but a value replays only the entity
 * it was drawn for: a span with another id, label or kind reads as text. The
 * record holds the last `ENTITY_COPIES` entities drawn, so it cannot grow
 * without bound; an older copy pastes as text. A drag inside the field moves
 * the editor's own nodes and reads no HTML.
 *
 * What other applications put on the clipboard is read for the structure and
 * the emphasis a person sees, and nothing else (the rules are each beside the
 * node or mark they make):
 *
 *  - Emphasis written as a style: `font-weight` from 600 or `bold`,
 *    `font-style: italic` and a `text-decoration` with `line-through`, as a
 *    word processor or a document editor writes it. A weight under 600 and
 *    `font-style: normal` take the format off what they wrap, so a wrapper
 *    with `font-weight: normal` does not make everything bold. No colour,
 *    size, font or other style is read.
 *  - A table: each row a paragraph, its cells separated by a tab.
 *  - A word processor's list paragraphs (`mso-list`): list items, numbered
 *    when the number the word processor drew is a number or a letter followed
 *    by `.` or `)` (`paste.ts` groups them into lists).
 *  - A code editor's copy, a `div` with `white-space: pre` in a monospace
 *    font holding more than one line: one code block.
 *  - A code block's language, from `data-language` or a `language-` or
 *    `lang-` class on the `pre` or its `code`, kept when it is a language name
 *    (`codeLanguage`).
 */

/** The node and mark names. They are the model's names where the model has one. */
export const NODE = {
  doc: 'doc',
  paragraph: 'paragraph',
  heading: 'heading',
  bulletList: 'bulletList',
  orderedList: 'orderedList',
  listItem: 'listItem',
  blockquote: 'blockquote',
  codeBlock: 'codeBlock',
  text: 'text',
  hardBreak: 'hardBreak',
  entity: 'entity',
  unknownBlock: 'unknownBlock',
  unknownInline: 'unknownInline',
} as const

export const MARK = {
  link: 'link',
  bold: 'bold',
  italic: 'italic',
  strike: 'strike',
  code: 'code',
  annotation: 'annotation',
  unknown: 'unknown',
  textFields: 'textFields',
} as const

export type MarkName = (typeof MARK)[keyof typeof MARK]

/**
 * The attribute that holds the fields a known node or mark carries and this
 * version does not know (`convert.ts`). Null for one the editor made.
 */
const FIELDS = { default: null }

export interface SchemaOptions {
  formats: readonly RichTextFormat[]
  entities: readonly RichTextEditorEntityKind[]
  classes: RichTextEditorClasses
  /** The page level a document's level 1 heading is drawn at. */
  headingLevel: 2 | 3 | 4
}

/** The page level a document heading is drawn at: one deeper per level, never deeper than 4. */
export function pageHeadingLevel(level: number, headingLevel: number): number {
  return Math.min(headingLevel + level - 1, 4)
}

/** Attributes with the empty ones left out, so no element carries `class=""`. */
function attrs(entries: Record<string, string | null | undefined>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [name, value] of Object.entries(entries)) {
    if (value !== null && value !== undefined && value !== '') out[name] = value
  }
  return out
}

/* -------------------------------------------------------------------------- */
/* What a paste may keep                                                       */
/* -------------------------------------------------------------------------- */

/** The attribute an entity's clipboard drawing carries its recorded value in. */
export const ENTITY_TOKEN = 'data-entity-token'

/** How many entities drawn for the clipboard the record holds. The oldest is forgotten first. */
export const ENTITY_COPIES = 500

interface Drawn {
  kind: string
  id: string
  label: string
}

/**
 * The entities drawn for the clipboard, by the value each span carries, oldest
 * first (the file's header says why). It lives only here and is never part of
 * the document, the editable surface or a state.
 */
const drawnEntities = new Map<string, Drawn>()

/**
 * Records an entity drawn for the clipboard and returns the value its span
 * carries: 16 bytes from the platform's random source, new for every drawing.
 */
function recordEntity(entity: Drawn): string {
  const bytes = new Uint8Array(16)
  globalThis.crypto.getRandomValues(bytes)
  const value = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  drawnEntities.set(value, entity)
  while (drawnEntities.size > ENTITY_COPIES) {
    const oldest = drawnEntities.keys().next().value
    if (oldest === undefined) break
    drawnEntities.delete(oldest)
  }
  return value
}

/** Whether a pasted span carries a recorded value drawn for this very entity. */
function wasDrawn(value: string | null, entity: Drawn): boolean {
  const drawn = value === null ? undefined : drawnEntities.get(value)
  return (
    drawn !== undefined &&
    drawn.kind === entity.kind &&
    drawn.id === entity.id &&
    drawn.label === entity.label
  )
}

/**
 * A language name a code block takes from what was typed or pasted: one to 32
 * letters, digits, `_`, `+`, `#`, `.` or `-` (`ts`, `c++`, `c#`,
 * `objective-c`). The model keeps any language it is given; the editor makes
 * only a name like these, so a class list or a sentence is not one.
 */
export const LANGUAGE = '[A-Za-z0-9_+#.-]{1,32}'

const LANGUAGE_NAME = new RegExp(`^${LANGUAGE}$`)

/** The language name `raw` is, or `''` when it is not one. */
export function codeLanguage(raw: string | null | undefined): string {
  const name = (raw ?? '').trim()
  return LANGUAGE_NAME.test(name) ? name : ''
}

/** The language a pasted `pre` names: its own or its `code`'s `data-language`, or a `language-` or `lang-` class. */
function pastedLanguage(pre: HTMLElement): string {
  const code = pre.querySelector('code')
  for (const element of [pre, code]) {
    if (!element) continue
    const named = codeLanguage(element.getAttribute('data-language'))
    if (named) return named
    for (const name of Array.from(element.classList)) {
      const match = /^(?:language|lang)-(.+)$/.exec(name)
      const language = match ? codeLanguage(match[1]) : ''
      if (language) return language
    }
  }
  return ''
}

/** Whether a `font-weight` is bold: `bold`, `bolder`, or a number from 600. */
function isBoldWeight(value: string): boolean {
  const weight = value.trim().toLowerCase()
  if (weight === 'bold' || weight === 'bolder') return true
  return /^\d+$/.test(weight) && Number(weight) >= 600
}

/**
 * A word processor's list paragraph: a `p` whose style names its list, level
 * and list format (`mso-list:l0 level2 lfo1`), with the number or bullet the
 * word processor drew in a span marked `mso-list:Ignore`. The style is read
 * from the attribute, because a browser drops a property it does not know
 * from the element's style.
 */
export interface WordListItem {
  /** Which list it belongs to: the list format's number. */
  list: string
  /** Its level, from 1. */
  level: number
  /** Whether the number it drew is a number or a letter followed by `.` or `)`. */
  ordered: boolean
  /** The number it drew, for a numbered item whose number is in digits. */
  start: number
}

const WORD_LIST = /mso-list:\s*l(\d+)\s+level(\d+)\s+lfo(\d+)/i
const WORD_IGNORE = /mso-list:\s*ignore/i
const NUMBERED = /^\(?(\d+|[a-z]|[ivxlcdm]+)[.)]$/i

const styleOf = (dom: HTMLElement): string => dom.getAttribute('style') ?? ''

function wordListItem(dom: HTMLElement): WordListItem | null {
  const match = WORD_LIST.exec(styleOf(dom))
  if (!match) return null
  const marker = Array.from(dom.querySelectorAll('span')).find((span) =>
    WORD_IGNORE.test(styleOf(span)),
  )
  const drawn = (marker?.textContent ?? '').replace(/\s+/g, '')
  const ordered = NUMBERED.test(drawn)
  const digits = /^\(?(\d+)[.)]$/.exec(drawn)
  const start = digits ? Number(digits[1]) : 1
  return {
    list: match[3] as string,
    level: Number(match[2]),
    ordered,
    start: Number.isSafeInteger(start) ? start : 1,
  }
}

/** A monospace font, as a code editor names its own. */
const MONOSPACE = /monospace|menlo|monaco|consolas|courier|mono\b|code\b/i

/**
 * The lines of a code editor's copy: a `div` with `white-space: pre` in a
 * monospace font, each line a `div` of its own and an empty line a `br` or a
 * `div` holding one. Null for any other element, and for one line, which
 * reads as text where it lands instead of becoming a block.
 */
function editorLines(dom: HTMLElement): string[] | null {
  if (!/^pre(?:-wrap)?$/.test(dom.style.whiteSpace) || !MONOSPACE.test(dom.style.fontFamily))
    return null
  const children = Array.from(dom.children)
  const lines =
    children.length > 0 &&
    children.every((child) => child.tagName === 'DIV' || child.tagName === 'BR')
      ? children.map((child) => (child.tagName === 'BR' ? '' : (child.textContent ?? '')))
      : (dom.textContent ?? '').split(/\r\n?|\n/)
  return lines.length > 1 ? lines : null
}

/**
 * A table row's content: each cell's inline content, the cells separated by
 * a tab, and the blocks inside one cell by a space. A cell is read through the
 * schema's own rules with its own style, so a bold cell, a link and an entity
 * in it stay as they would in a paragraph.
 */
function rowContent(row: HTMLElement, schema: Schema): Fragment {
  const parser = ParserOfSchema.fromSchema(schema)
  const out: PMNode[] = []
  const cells = Array.from(row.children).filter((cell) => /^T[DH]$/.test(cell.tagName))
  cells.forEach((cell, index) => {
    if (index > 0) out.push(schema.text('\t'))
    // The cell's own style is read only when the cell is inside what is parsed.
    const holder = cell.ownerDocument.createElement('div')
    holder.append(cell.cloneNode(true))
    let gap = false
    const collect = (fragment: Fragment) =>
      fragment.forEach((node) => {
        if (node.isInline) {
          if (gap && out.length > 0) out.push(schema.text(' '))
          gap = false
          out.push(node)
        } else {
          gap = true
          collect(node.content)
          gap = true
        }
      })
    collect(parser.parseSlice(holder).content)
  })
  // A row of empty cells is an empty paragraph, not one of tabs.
  return out.every((node) => node.isText && /^\s*$/.test(node.text ?? ''))
    ? Fragment.empty
    : Fragment.from(out)
}

/**
 * The DOM for each node and mark. `classes` is null for the clipboard's
 * drawing, which carries no class and writes the document's heading levels.
 */
function drawing(classes: RichTextEditorClasses | null, headingLevel: number) {
  const cls = (pick: (c: RichTextEditorClasses) => string) => (classes ? pick(classes) : undefined)
  return {
    paragraph: (): DOMOutputSpec => ['p', attrs({ class: cls((c) => c.paragraph) }), 0],
    heading: (node: PMNode): DOMOutputSpec => {
      const level = node.attrs.level as 1 | 2 | 3
      const tag = classes ? pageHeadingLevel(level, headingLevel) : level
      return [`h${tag}`, attrs({ class: cls((c) => c.heading[level - 1] ?? '') }), 0]
    },
    bulletList: (): DOMOutputSpec => ['ul', attrs({ class: cls((c) => c.bulletList) }), 0],
    orderedList: (node: PMNode): DOMOutputSpec => {
      const start = node.attrs.start as number
      return [
        'ol',
        attrs({ class: cls((c) => c.orderedList), start: start === 1 ? null : String(start) }),
        0,
      ]
    },
    listItem: (): DOMOutputSpec => ['li', attrs({ class: cls((c) => c.listItem) }), 0],
    blockquote: (): DOMOutputSpec => ['blockquote', attrs({ class: cls((c) => c.blockquote) }), 0],
    codeBlock: (node: PMNode): DOMOutputSpec => [
      'pre',
      attrs({ class: cls((c) => c.codeBlock), 'data-language': node.attrs.language as string }),
      ['code', attrs({ class: cls((c) => c.codeBlockText) }), 0],
    ],
    entity: (node: PMNode): DOMOutputSpec => {
      const kind = node.attrs.kind as string
      const id = node.attrs.id as string
      const label = node.attrs.label as string
      return [
        'span',
        attrs({
          class: cls((c) => c.entity),
          'data-entity-kind': kind,
          'data-entity-id': id,
          // Only the clipboard's drawing is recorded and carries a value: the field's own DOM never does.
          [ENTITY_TOKEN]: classes ? null : recordEntity({ kind, id, label }),
          contenteditable: 'false',
        }),
        label,
      ]
    },
    unknown:
      (tag: 'div' | 'span') =>
      (node: PMNode): DOMOutputSpec => [
        tag,
        attrs({ class: cls((c) => c.unknown), contenteditable: classes ? 'false' : null }),
        unknownText(node.attrs.json),
      ],
    bold: (): DOMOutputSpec => ['strong', attrs({ class: cls((c) => c.bold) }), 0],
    italic: (): DOMOutputSpec => ['em', attrs({ class: cls((c) => c.italic) }), 0],
    strike: (): DOMOutputSpec => ['s', attrs({ class: cls((c) => c.strike) }), 0],
    code: (): DOMOutputSpec => ['code', attrs({ class: cls((c) => c.code) }), 0],
    link: (href: string): DOMOutputSpec => ['a', attrs({ class: cls((c) => c.link), href }), 0],
  }
}

/** A style rule that takes the mark `name` off what an element wraps, for a value `when` accepts. */
function clearing(style: string, name: string, when: (value: string) => boolean): StyleParseRule[] {
  return [
    {
      style,
      clearMark: (mark) => mark.type.name === name,
      getAttrs: (value) => (when(value) ? null : false),
    },
  ]
}

/** A pasted link keeps its target only when the model would keep it. */
function linkRule(): TagParseRule {
  return {
    tag: 'a[href]',
    getAttrs: (dom) => {
      const href = richTextHref(dom.getAttribute('href') ?? '')
      return href === null ? false : { href }
    },
  }
}

/** A pasted heading: `h1` to `h3` are levels 1 to 3, and anything deeper is level 3. */
function headingRules(): TagParseRule[] {
  return [1, 2, 3, 4, 5, 6].map((n) => ({ tag: `h${n}`, attrs: { level: Math.min(n, 3) } }))
}

export function buildSchema(options: SchemaOptions): Schema {
  const allowed = new Set(options.formats)
  const draw = drawing(options.classes, options.headingLevel)
  const kinds = new Set(options.entities.map((e) => e.kind))

  const nodes: Record<string, NodeSpec> = {
    [NODE.doc]: { attrs: { fields: FIELDS }, content: 'block+' },
    [NODE.paragraph]: {
      // `wordList` marks a word processor's list paragraph while a paste is
      // read; `paste.ts` makes lists of them and clears it before the slice
      // is inserted, so no paragraph in the document carries one.
      attrs: { fields: FIELDS, wordList: { default: null } },
      content: 'inline*',
      group: 'block',
      parseDOM: [
        {
          tag: 'p',
          priority: 60,
          getAttrs: (dom) => {
            const item = wordListItem(dom)
            return item ? { wordList: item } : false
          },
        },
        { tag: 'p' },
        // The number or bullet a word processor drew before a list paragraph's text.
        {
          tag: 'span',
          ignore: true,
          getAttrs: (dom) => (WORD_IGNORE.test(styleOf(dom)) ? null : false),
        },
        { tag: 'tr', getContent: (dom, schema) => rowContent(dom as HTMLElement, schema) },
      ],
      toDOM: draw.paragraph,
    },
  }
  if (allowed.has('heading')) {
    nodes[NODE.heading] = {
      attrs: { level: { default: 1, validate: 'number' }, fields: FIELDS },
      content: 'inline*',
      group: 'block',
      // A heading holds text, entities, inline code and links: no bold,
      // italic or strike, because a heading is already set apart. Annotations
      // are not formats, so a heading holds them.
      marks: [MARK.link, MARK.code, MARK.annotation, MARK.unknown, MARK.textFields]
        .filter((m) => (m !== MARK.link && m !== MARK.code) || allowed.has(m))
        .join(' '),
      defining: true,
      parseDOM: headingRules(),
      toDOM: draw.heading,
    }
  }
  if (allowed.has('blockquote')) {
    nodes[NODE.blockquote] = {
      attrs: { fields: FIELDS },
      content: 'block+',
      group: 'block',
      defining: true,
      parseDOM: [{ tag: 'blockquote' }],
      toDOM: draw.blockquote,
    }
  }
  if (allowed.has('codeBlock')) {
    nodes[NODE.codeBlock] = {
      attrs: { language: { default: '', validate: 'string' }, fields: FIELDS },
      content: 'text*',
      marks: '',
      group: 'block',
      code: true,
      defining: true,
      parseDOM: [
        {
          tag: 'pre',
          preserveWhitespace: 'full',
          getAttrs: (dom) => ({ language: pastedLanguage(dom) }),
        },
        {
          tag: 'div',
          getAttrs: (dom) => (editorLines(dom) ? { language: '' } : false),
          getContent: (dom, schema) => {
            const text = (editorLines(dom as HTMLElement) ?? []).join('\n')
            return text === '' ? Fragment.empty : Fragment.from(schema.text(text))
          },
        },
      ],
      toDOM: draw.codeBlock,
    }
  }
  const lists = allowed.has('bulletList') || allowed.has('orderedList')
  if (allowed.has('bulletList')) {
    nodes[NODE.bulletList] = {
      attrs: { fields: FIELDS },
      content: `${NODE.listItem}+`,
      group: 'block',
      parseDOM: [{ tag: 'ul' }],
      toDOM: draw.bulletList,
    }
  }
  if (allowed.has('orderedList')) {
    nodes[NODE.orderedList] = {
      attrs: { start: { default: 1, validate: 'number' }, fields: FIELDS },
      content: `${NODE.listItem}+`,
      group: 'block',
      parseDOM: [
        {
          tag: 'ol',
          getAttrs: (dom) => {
            const written = dom.getAttribute('start')?.trim() ?? ''
            const start = written === '' ? 1 : Number(written)
            // The reader's rule: a whole number from 0 that every language holds exactly.
            return { start: Number.isSafeInteger(start) && start >= 0 ? start : 1 }
          },
        },
      ],
      toDOM: draw.orderedList,
    }
  }
  if (lists) {
    nodes[NODE.listItem] = {
      attrs: { fields: FIELDS },
      content: `${NODE.paragraph} block*`,
      defining: true,
      parseDOM: [{ tag: 'li' }],
      toDOM: draw.listItem,
    }
  }
  nodes[NODE.unknownBlock] = {
    attrs: { json: {} },
    group: 'block',
    atom: true,
    selectable: true,
    toDOM: draw.unknown('div'),
  }
  nodes[NODE.text] = { group: 'inline' }
  nodes[NODE.hardBreak] = {
    attrs: { fields: FIELDS },
    inline: true,
    group: 'inline',
    selectable: false,
    // A code block's line break, when a block changes between code and text.
    linebreakReplacement: true,
    leafText: () => '\n',
    parseDOM: [{ tag: 'br' }],
    toDOM: () => ['br'],
  }
  nodes[NODE.entity] = {
    attrs: {
      kind: { validate: 'string' },
      id: { validate: 'string' },
      label: { validate: 'string' },
      fields: FIELDS,
    },
    inline: true,
    group: 'inline',
    atom: true,
    selectable: true,
    draggable: false,
    leafText: (node) => node.attrs.label as string,
    parseDOM: [
      {
        // A pasted entity is kept when an editor in this page drew this very
        // entity for the clipboard and the field suggests its kind; any other
        // reads as its label (the file's header says why).
        tag: `span[data-entity-kind][data-entity-id][${ENTITY_TOKEN}]`,
        getAttrs: (dom) => {
          const entity = {
            kind: dom.getAttribute('data-entity-kind') ?? '',
            id: dom.getAttribute('data-entity-id') ?? '',
            label: dom.textContent ?? '',
          }
          if (!wasDrawn(dom.getAttribute(ENTITY_TOKEN), entity) || !kinds.has(entity.kind))
            return false
          // The reader turns an entity with no kind, id or label into text.
          if (entity.kind === '' || entity.id === '' || entity.label === '') return false
          return entity
        },
      },
    ],
    toDOM: draw.entity,
  }
  nodes[NODE.unknownInline] = {
    attrs: { json: {} },
    inline: true,
    group: 'inline',
    atom: true,
    selectable: true,
    leafText: (node) => unknownText(node.attrs.json),
    toDOM: draw.unknown('span'),
  }

  const markSpecs: Record<string, MarkSpec> = {}
  if (allowed.has('link')) {
    markSpecs[MARK.link] = {
      attrs: { href: { validate: 'string' }, fields: FIELDS },
      // Text typed after a link is plain.
      inclusive: false,
      parseDOM: [linkRule()],
      toDOM: (mark) => draw.link(mark.attrs.href as string),
    }
  }
  if (allowed.has('bold')) {
    markSpecs[MARK.bold] = {
      attrs: { fields: FIELDS },
      parseDOM: [
        { tag: 'strong' },
        // A document editor wraps a whole copy in `<b style="font-weight:normal">`.
        {
          tag: 'b',
          getAttrs: (dom) =>
            dom.style.fontWeight && !isBoldWeight(dom.style.fontWeight) ? false : null,
        },
        { style: 'font-weight', getAttrs: (value) => (isBoldWeight(value) ? null : false) },
        ...clearing('font-weight', MARK.bold, (value) => !isBoldWeight(value)),
      ],
      toDOM: draw.bold,
    }
  }
  if (allowed.has('italic')) {
    markSpecs[MARK.italic] = {
      attrs: { fields: FIELDS },
      parseDOM: [
        { tag: 'em' },
        { tag: 'i' },
        {
          style: 'font-style',
          getAttrs: (value) => (/^(italic|oblique)/i.test(value) ? null : false),
        },
        ...clearing('font-style', MARK.italic, (value) => /^normal$/i.test(value)),
      ],
      toDOM: draw.italic,
    }
  }
  if (allowed.has('strike')) {
    const struck = (value: string) => (/line-through/i.test(value) ? null : false)
    markSpecs[MARK.strike] = {
      attrs: { fields: FIELDS },
      parseDOM: [
        { tag: 's' },
        { tag: 'del' },
        { tag: 'strike' },
        { style: 'text-decoration', getAttrs: struck },
        { style: 'text-decoration-line', getAttrs: struck },
      ],
      toDOM: draw.strike,
    }
  }
  if (allowed.has('code')) {
    markSpecs[MARK.code] = {
      attrs: { fields: FIELDS },
      // Inline code takes no other format but a link, and text typed after it is plain.
      excludes: [MARK.code, MARK.bold, MARK.italic, MARK.strike]
        .filter((m) => m === MARK.code || allowed.has(m))
        .join(' '),
      inclusive: false,
      code: true,
      parseDOM: [{ tag: 'code' }],
      toDOM: draw.code,
    }
  }
  // An anchor (`annotations.ts`). Text typed at its edge is outside it, and it
  // excludes nothing: two annotations of different ids sit on one text, as
  // marks of one type with different attributes do when the type does not
  // exclude itself. Its element is drawn bare; decorations draw it.
  markSpecs[MARK.annotation] = {
    attrs: { id: { validate: 'string' }, fields: FIELDS },
    inclusive: false,
    excludes: '',
    toDOM: () => ['span', 0],
  }
  // A mark of a type this version does not know. It draws nothing and keeps
  // its JSON; several may sit on one text.
  markSpecs[MARK.unknown] = {
    attrs: { json: {} },
    excludes: '',
    toDOM: () => ['span', 0],
  }
  // The fields a text carries that this version does not know, kept on the
  // run of text they belong to.
  markSpecs[MARK.textFields] = {
    attrs: { fields: {} },
    toDOM: () => ['span', 0],
  }

  return new Schema({ nodes, marks: markSpecs })
}

/** The clipboard's drawing: the same elements with no class and the document's own heading levels. */
export function clipboardSerializer(schema: Schema): DOMSerializer {
  const draw = drawing(null, 1)
  const nodes: Record<string, (node: PMNode) => DOMOutputSpec> = {}
  const marks: Record<string, (mark: { attrs: Record<string, unknown> }) => DOMOutputSpec> = {}
  const nodeDraw: Record<string, (node: PMNode) => DOMOutputSpec> = {
    [NODE.paragraph]: draw.paragraph,
    [NODE.heading]: draw.heading,
    [NODE.bulletList]: draw.bulletList,
    [NODE.orderedList]: draw.orderedList,
    [NODE.listItem]: draw.listItem,
    [NODE.blockquote]: draw.blockquote,
    [NODE.codeBlock]: draw.codeBlock,
    [NODE.hardBreak]: () => ['br'],
    [NODE.entity]: draw.entity,
    [NODE.unknownBlock]: (node) => ['p', unknownText(node.attrs.json)],
    [NODE.unknownInline]: (node) => ['span', unknownText(node.attrs.json)],
  }
  for (const name of Object.keys(schema.nodes)) {
    const fn = nodeDraw[name]
    if (fn) nodes[name] = fn
  }
  const markDraw: Record<string, (mark: { attrs: Record<string, unknown> }) => DOMOutputSpec> = {
    [MARK.link]: (mark) => draw.link(mark.attrs.href as string),
    [MARK.bold]: draw.bold,
    [MARK.italic]: draw.italic,
    [MARK.strike]: draw.strike,
    [MARK.code]: draw.code,
    [MARK.unknown]: () => ['span', 0],
    [MARK.textFields]: () => ['span', 0],
  }
  for (const name of Object.keys(schema.marks)) {
    const fn = markDraw[name]
    if (fn) marks[name] = fn
  }
  return new DOMSerializer(nodes, marks)
}
