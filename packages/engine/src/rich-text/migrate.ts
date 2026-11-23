import { isJson, own, type Json } from './nodes'

/**
 * Upgrading a stored document to the format this version reads
 * (`docs/rich-text.md`, Versioning).
 *
 * The format's number changes only for a change an older reader would
 * misread. Adding a node type, a mark type or an optional field does not
 * change it, because an older reader keeps what it does not know. When the
 * number does change, the new version adds one step here that rewrites a
 * document of the previous format as the next one, and an old document is
 * upgraded one step at a time, so no step is written for more than one
 * version's difference.
 *
 * There is one format today, so there are no steps. A document of a later
 * format than this reader's is left as it is: `parseRichText` reads it as far
 * as it can and says so with a `newer-format` fault.
 */

/** The format names this module reads: `polymorph-rich-text/` and a whole number from 1. */
const FORMAT = /^polymorph-rich-text\/([1-9]\d*)$/

/** The number of the format this version writes: the one `RICH_TEXT_FORMAT` names. */
export const RICH_TEXT_VERSION = 1

/** The format's name for version `version`. */
export const richTextFormatName = (version: number): string => `polymorph-rich-text/${version}`

/** The version a `format` field names, or `null` when it names no rich-text format. */
export function richTextFormatVersion(format: unknown): number | null {
  if (typeof format !== 'string') return null
  const match = FORMAT.exec(format)
  return match === null ? null : Number(match[1])
}

/** One step: a document of format `from`, rewritten as format `from + 1`. */
export interface RichTextMigrationStep {
  from: number
  migrate: (doc: Json) => Json
}

/** Every step, oldest first. Empty while there is one format. */
const STEPS: readonly RichTextMigrationStep[] = []

/**
 * The upgrade, with its steps and the target version as arguments, so a test
 * can run the loop a second format will use. `migrateRichText` calls it with
 * this version's.
 */
export function migrateRichTextWith(
  input: unknown,
  steps: readonly RichTextMigrationStep[],
  current: number,
): unknown {
  if (!isJson(input)) return input
  const version = richTextFormatVersion(own(input, 'format'))
  if (version === null || version >= current) return input
  let doc = input
  for (let at = version; at < current; at += 1) {
    const step = steps.find((candidate) => candidate.from === at)
    // A version with no step to the next is not one this reader can upgrade.
    if (step === undefined) return input
    doc = { ...step.migrate(doc), format: richTextFormatName(at + 1) }
  }
  return doc
}

/**
 * A stored document in the format this version reads.
 *
 * A document of an older format is upgraded one version at a time. Anything
 * else is returned as it is: a document of this format, one of a later format,
 * and a value that is not a document. `parseRichText` migrates before it reads,
 * so an application calls this only to upgrade documents without reading them.
 */
export function migrateRichText(input: unknown): unknown {
  return migrateRichTextWith(input, STEPS, RICH_TEXT_VERSION)
}
