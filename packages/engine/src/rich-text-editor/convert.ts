import { Mark, type Node as PMNode, type NodeType, type Schema } from 'prosemirror-model'

import { normalizeRichText } from '../rich-text/index'
import { RICH_TEXT_FORMAT, type RichTextDocument } from '../rich-text/types'
import { MARK, NODE } from './schema'

/**
 * Conversion between the stored document and the editor's document, both ways.
 *
 * The two trees have the same shape, so each node maps to one node: a list is
 * one of two node types by `ordered`, because the list commands work on a
 * node type, and a code block's `text` is the code block's one text node.
 *
 * Every known node and mark converts both ways without loss, inside what the
 * schema allows. What this version does not know is carried unchanged, because
 * a document a later version wrote must survive an edit here:
 *
 *  - a node of an unknown type is an atom holding the original JSON;
 *  - a mark of an unknown type is a mark holding the original JSON;
 *  - a field a known node or mark does not have is kept in the node's or
 *    mark's `fields` attribute, and a text's in a `textFields` mark, so it
 *    follows its text through an edit and is written back beside the known
 *    fields.
 *
 * The editor's document always holds one block, because a caret needs a
 * textblock to stand in. The empty document is one empty paragraph here, and
 * that paragraph converts back to no blocks. What the editor gives back is in
 * the model's normal form (`normalizeRichText`).
 */

type Json = Record<string, unknown>

const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const array = (value: unknown): unknown[] => (Array.isArray(value) ? value : [])

/** The fields each known node and mark has. Any other is kept in `fields`. */
const KNOWN_FIELDS: Record<string, ReadonlySet<string>> = {
  root: new Set(['format', 'blocks']),
  paragraph: new Set(['type', 'content']),
  heading: new Set(['type', 'level', 'content']),
  list: new Set(['type', 'ordered', 'start', 'items']),
  listItem: new Set(['type', 'content']),
  blockquote: new Set(['type', 'content']),
  codeBlock: new Set(['type', 'language', 'text']),
  text: new Set(['type', 'text', 'marks']),
  break: new Set(['type']),
  entity: new Set(['type', 'kind', 'id', 'label', 'marks']),
  link: new Set(['type', 'href']),
  annotation: new Set(['type', 'id']),
  mark: new Set(['type']),
}

/** The model's own mark names. Any other is an unknown mark. */
const KNOWN_MARKS = new Set<string>([
  MARK.link,
  MARK.bold,
  MARK.italic,
  MARK.strike,
  MARK.code,
  MARK.annotation,
])

/** The fields of `raw` its kind does not have, or null when it has none. */
function fieldsOf(raw: Json, kind: keyof typeof KNOWN_FIELDS): Json | null {
  const known = KNOWN_FIELDS[kind]!
  let out: Json | null = null
  for (const key of Object.keys(raw)) {
    if (!known.has(key)) (out ??= {})[key] = raw[key]
  }
  return out
}

/** A node or mark written back: its known fields, then the fields this version kept for it. */
function withFields<T extends object>(known: T, fields: unknown): T {
  return isObject(fields) ? Object.assign(known, fields) : known
}

/**
 * A text's marks, or with `entity` an entity's, which keeps only its
 * annotations and unknown marks. The reader writes annotations last, ordered
 * by id, and each is added in that order, so two texts with the same
 * annotations hold them in the same order here.
 */
function marksFor(schema: Schema, raw: Json, parent: NodeType, entity = false): readonly Mark[] {
  let set: readonly Mark[] = Mark.none
  const add = (mark: Mark | null) => {
    if (mark && parent.allowsMarkType(mark.type)) set = mark.addToSet(set)
  }
  for (const item of array(raw.marks)) {
    if (!isObject(item) || typeof item.type !== 'string') continue
    if (!KNOWN_MARKS.has(item.type)) {
      add(schema.marks[MARK.unknown]?.create({ json: item }) ?? null)
      continue
    }
    if (item.type === MARK.annotation) {
      if (typeof item.id !== 'string' || item.id === '') continue
      add(
        schema.marks[MARK.annotation]!.create({
          id: item.id,
          fields: fieldsOf(item, 'annotation'),
        }),
      )
      continue
    }
    const type = schema.marks[item.type]
    if (!type || entity) continue
    if (item.type === MARK.link) {
      if (typeof item.href !== 'string') continue
      add(type.create({ href: item.href, fields: fieldsOf(item, 'link') }))
    } else {
      add(type.create({ fields: fieldsOf(item, 'mark') }))
    }
  }
  if (entity) return set
  const fields = fieldsOf(raw, 'text')
  if (fields) add(schema.marks[MARK.textFields]!.create({ fields }))
  return set
}

function inlines(schema: Schema, content: unknown, parent: NodeType): PMNode[] {
  const out: PMNode[] = []
  for (const raw of array(content)) {
    if (!isObject(raw)) continue
    switch (raw.type) {
      case 'text': {
        if (typeof raw.text !== 'string' || raw.text === '') break
        out.push(schema.text(raw.text, marksFor(schema, raw, parent)))
        break
      }
      case 'break':
        out.push(schema.node(NODE.hardBreak, { fields: fieldsOf(raw, 'break') }))
        break
      case 'entity':
        out.push(
          schema.node(
            NODE.entity,
            {
              kind: String(raw.kind ?? ''),
              id: String(raw.id ?? ''),
              label: String(raw.label ?? ''),
              fields: fieldsOf(raw, 'entity'),
            },
            undefined,
            marksFor(schema, raw, parent, true),
          ),
        )
        break
      default:
        out.push(schema.node(NODE.unknownInline, { json: raw }))
    }
  }
  return out
}

/** Text with line breaks as paragraph content: each line break a hard break. */
function linesToInlines(schema: Schema, text: string): PMNode[] {
  const out: PMNode[] = []
  text.split(/\r\n?|\n/).forEach((line, i) => {
    if (i > 0) out.push(schema.node(NODE.hardBreak))
    if (line) out.push(schema.text(line))
  })
  return out
}

function paragraph(schema: Schema, content: PMNode[] = [], fields: Json | null = null): PMNode {
  return schema.node(NODE.paragraph, { fields }, content)
}

function listItem(schema: Schema, raw: Json): PMNode {
  const content = blocks(schema, raw.content)
  if (content[0]?.type.name !== NODE.paragraph) content.unshift(paragraph(schema))
  return schema.node(NODE.listItem, { fields: fieldsOf(raw, 'listItem') }, content)
}

function block(schema: Schema, raw: Json): PMNode[] {
  const nodes = schema.nodes
  const paragraphType = nodes[NODE.paragraph]!
  switch (raw.type) {
    case 'paragraph':
      return [
        paragraph(schema, inlines(schema, raw.content, paragraphType), fieldsOf(raw, 'paragraph')),
      ]
    case 'heading': {
      const type = nodes[NODE.heading]
      if (!type) return [paragraph(schema, inlines(schema, raw.content, paragraphType))]
      const level = raw.level === 2 || raw.level === 3 ? raw.level : 1
      return [
        type.create(
          { level, fields: fieldsOf(raw, 'heading') },
          inlines(schema, raw.content, type),
        ),
      ]
    }
    case 'list': {
      const type = nodes[raw.ordered === true ? NODE.orderedList : NODE.bulletList]
      const items = array(raw.items).filter(isObject)
      if (!type) {
        // The field holds no list of this kind: the items' blocks stand in its place.
        return items.flatMap((item) => blocks(schema, item.content))
      }
      if (items.length === 0) return []
      const fields = fieldsOf(raw, 'list')
      const start = typeof raw.start === 'number' && Number.isInteger(raw.start) ? raw.start : 1
      const attrs = type.name === NODE.orderedList ? { start, fields } : { fields }
      return [
        type.create(
          attrs,
          items.map((item) => listItem(schema, item)),
        ),
      ]
    }
    case 'blockquote': {
      const content = blocks(schema, raw.content)
      const type = nodes[NODE.blockquote]
      if (!type) return content
      if (content.length === 0) return []
      return [type.create({ fields: fieldsOf(raw, 'blockquote') }, content)]
    }
    case 'codeBlock': {
      const text = typeof raw.text === 'string' ? raw.text : ''
      const type = nodes[NODE.codeBlock]
      if (!type) return [paragraph(schema, linesToInlines(schema, text))]
      const language = typeof raw.language === 'string' ? raw.language : ''
      return [
        type.create(
          { language, fields: fieldsOf(raw, 'codeBlock') },
          text ? schema.text(text) : null,
        ),
      ]
    }
    default:
      return [schema.node(NODE.unknownBlock, { json: raw })]
  }
}

function blocks(schema: Schema, content: unknown): PMNode[] {
  return array(content)
    .filter(isObject)
    .flatMap((raw) => block(schema, raw))
}

/** The editor's document for a stored one, which is in normal form and restricted to the schema's formats. */
export function toEditorDoc(schema: Schema, value: RichTextDocument): PMNode {
  const content = blocks(schema, value.blocks)
  if (content.length === 0) content.push(paragraph(schema))
  return schema.node(NODE.doc, { fields: fieldsOf(value as unknown as Json, 'root') }, content)
}

function markJson(mark: Mark): Json {
  const name = mark.type.name
  if (name === MARK.unknown) return mark.attrs.json as Json
  if (name === MARK.link)
    return withFields({ type: 'link', href: mark.attrs.href as string }, mark.attrs.fields)
  if (name === MARK.annotation)
    return withFields({ type: 'annotation', id: mark.attrs.id as string }, mark.attrs.fields)
  return withFields({ type: name }, mark.attrs.fields)
}

function marksJson(node: PMNode): { marks: Json[]; fields: unknown } {
  const marks: Json[] = []
  let fields: unknown = null
  for (const mark of node.marks) {
    if (mark.type.name === MARK.textFields) fields = mark.attrs.fields
    else marks.push(markJson(mark))
  }
  return { marks, fields }
}

/**
 * An entity's marks as written: its annotations and unknown marks. A format a
 * command put on it while it was edited (bold over a selection with an entity
 * in it) is not written, because the model keeps none on an entity.
 */
function entityMarksJson(node: PMNode): Json[] {
  return node.marks
    .filter((mark) => mark.type.name === MARK.annotation || mark.type.name === MARK.unknown)
    .map(markJson)
}

function inlineJson(parent: PMNode): Json[] {
  const out: Json[] = []
  parent.forEach((node) => {
    switch (node.type.name) {
      case NODE.text: {
        const { marks, fields } = marksJson(node)
        const text: Json = { type: 'text', text: node.text ?? '' }
        if (marks.length) text.marks = marks
        out.push(withFields(text, fields))
        break
      }
      case NODE.hardBreak:
        out.push(withFields({ type: 'break' }, node.attrs.fields))
        break
      case NODE.entity: {
        const entity: Json = {
          type: 'entity',
          kind: node.attrs.kind,
          id: node.attrs.id,
          label: node.attrs.label,
        }
        const marks = entityMarksJson(node)
        if (marks.length) entity.marks = marks
        out.push(withFields(entity, node.attrs.fields))
        break
      }
      case NODE.unknownInline:
        out.push(node.attrs.json as Json)
        break
    }
  })
  return out
}

function blockJson(node: PMNode): Json {
  const fields = node.attrs.fields
  switch (node.type.name) {
    case NODE.heading:
      return withFields(
        { type: 'heading', level: node.attrs.level, content: inlineJson(node) },
        fields,
      )
    case NODE.bulletList:
    case NODE.orderedList: {
      const ordered = node.type.name === NODE.orderedList
      const list: Json = { type: 'list', ordered }
      const start = node.attrs.start as number | undefined
      if (ordered && start !== undefined && start !== 1) list.start = start
      const items: Json[] = []
      node.forEach((item) =>
        items.push(withFields({ type: 'listItem', content: blocksJson(item) }, item.attrs.fields)),
      )
      list.items = items
      return withFields(list, fields)
    }
    case NODE.blockquote:
      return withFields({ type: 'blockquote', content: blocksJson(node) }, fields)
    case NODE.codeBlock: {
      const code: Json = { type: 'codeBlock' }
      const language = node.attrs.language as string
      if (language) code.language = language
      code.text = node.textContent
      return withFields(code, fields)
    }
    case NODE.unknownBlock:
      return node.attrs.json as Json
    default:
      return withFields({ type: 'paragraph', content: inlineJson(node) }, fields)
  }
}

function blocksJson(parent: PMNode): Json[] {
  const out: Json[] = []
  parent.forEach((child) => out.push(blockJson(child)))
  return out
}

/** Whether the editor's document is the empty one: a single paragraph with nothing in it and no fields. */
export function isBareDoc(doc: PMNode): boolean {
  const first = doc.firstChild
  return (
    doc.childCount === 1 &&
    first !== null &&
    first.type.name === NODE.paragraph &&
    first.content.size === 0 &&
    first.attrs.fields === null
  )
}

/** The stored document for the editor's, in the model's normal form. */
export function fromEditorDoc(doc: PMNode): RichTextDocument {
  const stored = withFields(
    { format: RICH_TEXT_FORMAT, blocks: isBareDoc(doc) ? [] : blocksJson(doc) },
    doc.attrs.fields,
  )
  return normalizeRichText(stored)
}
