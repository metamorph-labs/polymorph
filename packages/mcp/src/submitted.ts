/** A screen spec as a tool is handed it: the document itself, or its JSON text. */
export type SubmittedSpec = string | Record<string, unknown>

/**
 * The document a tool was handed, or why its text is not one.
 *
 * A tool call's arguments are JSON already, so the document is accepted as an
 * argument beside its text. Text inside a JSON string is escaped a second
 * time, and a slip in that escaping fails the call before anything about the
 * screen is checked.
 */
export function submittedDocument(spec: SubmittedSpec): { document: unknown } | { fatal: string } {
  if (typeof spec !== 'string') return { document: spec }
  try {
    return { document: JSON.parse(spec) as unknown }
  } catch (error) {
    return {
      fatal: `the spec is not JSON: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}
