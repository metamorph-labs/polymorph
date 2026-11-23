import {
  DOMSerializer,
  Schema,
  type DOMOutputSpec,
  type MarkSpec,
  type Node as PMNode,
  type NodeSpec,
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
 * holds. That is the same mapping `restrictRichText` applies to a document: a
 * heading reads as a paragraph, a list as its items' blocks, a quote as its
 * blocks, preformatted text as a paragraph with hard breaks.
 *
 * Every element and attribute the editable surface shows is written here. Each
 * takes its class from the member's recipe (`classes`). The clipboard gets a
 * second drawing of the same nodes with no class and with the document's own
 * heading levels, so a copy pasted elsewhere carries no recipe's hashed class
 * and a copy pasted back keeps its levels.
 *
 * Unknown nodes and marks are always in the schema: a document a later
 * version wrote must pass through an edit unchanged. They have no parse rule,
 * so a paste never creates one.
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
    entity: (node: PMNode): DOMOutputSpec => [
      'span',
      attrs({
        class: cls((c) => c.entity),
        'data-entity-kind': node.attrs.kind as string,
        'data-entity-id': node.attrs.id as string,
        contenteditable: 'false',
      }),
      node.attrs.label as string,
    ],
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
      attrs: { fields: FIELDS },
      content: 'inline*',
      group: 'block',
      parseDOM: [{ tag: 'p' }],
      toDOM: draw.paragraph,
    },
  }
  if (allowed.has('heading')) {
    nodes[NODE.heading] = {
      attrs: { level: { default: 1, validate: 'number' }, fields: FIELDS },
      content: 'inline*',
      group: 'block',
      // A heading holds text, entities, inline code and links: no bold,
      // italic or strike, because a heading is already set apart.
      marks: [MARK.link, MARK.code, MARK.unknown, MARK.textFields]
        .filter((m) => m === MARK.unknown || m === MARK.textFields || allowed.has(m))
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
          getAttrs: (dom) => ({
            language:
              dom.getAttribute('data-language') ??
              dom.querySelector('code')?.getAttribute('data-language') ??
              '',
          }),
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
            const start = Number(dom.getAttribute('start') ?? '1')
            return { start: Number.isInteger(start) && start >= 0 ? start : 1 }
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
        // A pasted entity is kept when the field suggests its kind; any other
        // reads as its label.
        tag: 'span[data-entity-kind][data-entity-id]',
        getAttrs: (dom) => {
          const kind = dom.getAttribute('data-entity-kind') ?? ''
          if (!kinds.has(kind)) return false
          return {
            kind,
            id: dom.getAttribute('data-entity-id') ?? '',
            label: dom.textContent ?? '',
          }
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
        // A word processor wraps a whole copy in `<b style="font-weight:normal">`.
        { tag: 'b', getAttrs: (dom) => (dom.style.fontWeight === 'normal' ? false : null) },
      ],
      toDOM: draw.bold,
    }
  }
  if (allowed.has('italic')) {
    markSpecs[MARK.italic] = {
      attrs: { fields: FIELDS },
      parseDOM: [{ tag: 'em' }, { tag: 'i' }],
      toDOM: draw.italic,
    }
  }
  if (allowed.has('strike')) {
    markSpecs[MARK.strike] = {
      attrs: { fields: FIELDS },
      parseDOM: [{ tag: 's' }, { tag: 'del' }, { tag: 'strike' }],
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
