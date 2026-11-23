import { richTextNodeText } from '../rich-text/index'

/**
 * The words an unknown node is drawn with inside the editor.
 *
 * The model finds them (`richTextNodeText`), so the editor draws an unknown
 * node with the same text the read-only renderer draws, and a reader sees the
 * same words before and after opening the field.
 */
export function unknownText(json: unknown): string {
  return richTextNodeText(json)
}
