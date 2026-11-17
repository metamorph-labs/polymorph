import { mergeProps } from 'vue'

/**
 * Several of a machine's prop getters on one element, merged as Vue merges
 * props: classes and styles combine, and handlers for the same event both run.
 * The getters return attribute objects typed for one element each, which
 * `mergeProps` does not take as they are.
 */
export function mergeParts(...parts: object[]): Record<string, unknown> {
  return mergeProps(...(parts as Record<string, unknown>[]))
}
