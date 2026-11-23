import { own, typeOf, type Json } from './nodes'
import { laterRichText, linesOf, normalizeRichText, paragraphOfLines } from './read'
import type { RichTextDocument, RichTextFormat } from './types'

/**
 * The document a field that allows only some formats holds
 * (`restrictRichText`).
 *
 * A field told to allow only bold and links must not hold a heading it cannot
 * draw a control for, or a document pasted into it would carry formats the
 * field's own toolbar cannot remove. So each format the field does not allow
 * becomes the plainest thing that keeps its words: a heading a paragraph, a
 * list its items' blocks, a quote its blocks, a code block one paragraph of
 * its lines, and a mark is removed from its text. Entities and hard breaks
 * are not formats, so a field always holds them. A node or mark this version
 * does not know is kept, because nothing can say which format it is.
 */

const MARK_FORMATS: ReadonlySet<string> = new Set(['bold', 'italic', 'strike', 'code', 'link'])

function restrictInlines(nodes: readonly unknown[], allowed: ReadonlySet<string>): unknown[] {
  return nodes.map((node) => {
    if (typeOf(node) !== 'text') return node
    const marks = own(node as Json, 'marks')
    if (!Array.isArray(marks)) return node
    const kept = marks.filter((mark) => {
      const type = typeOf(mark)
      return type === null || !MARK_FORMATS.has(type) || allowed.has(type)
    })
    return kept.length === marks.length ? node : { ...(node as Json), marks: kept }
  })
}

function restrictBlocks(blocks: readonly unknown[], allowed: ReadonlySet<string>): unknown[] {
  const out: unknown[] = []
  for (const block of blocks) {
    const json = block as Json
    switch (typeOf(block)) {
      case 'paragraph':
        out.push({ ...json, content: restrictInlines(own(json, 'content') as unknown[], allowed) })
        break
      case 'heading': {
        const content = restrictInlines(own(json, 'content') as unknown[], allowed)
        out.push(allowed.has('heading') ? { ...json, content } : { type: 'paragraph', content })
        break
      }
      case 'list': {
        const format = own(json, 'ordered') === true ? 'orderedList' : 'bulletList'
        const items = own(json, 'items') as Json[]
        if (allowed.has(format)) {
          out.push({
            ...json,
            items: items.map((item) => ({
              ...item,
              content: restrictBlocks(own(item, 'content') as unknown[], allowed),
            })),
          })
        } else {
          for (const item of items)
            out.push(...restrictBlocks(own(item, 'content') as unknown[], allowed))
        }
        break
      }
      case 'blockquote': {
        const content = restrictBlocks(own(json, 'content') as unknown[], allowed)
        if (allowed.has('blockquote')) out.push({ ...json, content })
        else out.push(...content)
        break
      }
      case 'codeBlock':
        out.push(
          allowed.has('codeBlock') ? block : paragraphOfLines(linesOf(own(json, 'text') as string)),
        )
        break
      default:
        out.push(block)
    }
  }
  return out
}

/**
 * The document as a field that allows only `formats` holds it, in normal form.
 * With every format allowed it is the document's normal form.
 *
 * A document of a later format is returned as it came (`isRichTextNewer`):
 * this version cannot write that format, and a version 1 document made from
 * it would lose what it does not understand once it was stored. A server that
 * enforces a field's formats refuses such a document instead.
 */
export function restrictRichText(
  doc: unknown,
  formats: readonly RichTextFormat[],
): RichTextDocument {
  const later = laterRichText(doc)
  if (later !== null) return later
  const allowed: ReadonlySet<string> = new Set(Array.isArray(formats) ? formats : [])
  const read = normalizeRichText(doc)
  // The normal form again, so runs a removed mark separated are one run, and
  // a list item whose first block came out of a quote starts with a paragraph.
  return normalizeRichText({ ...read, blocks: restrictBlocks(read.blocks, allowed) })
}
