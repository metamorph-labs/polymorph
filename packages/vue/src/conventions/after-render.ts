import { nextTick } from 'vue'

/**
 * Runs `fn` once Vue has written its pending changes to the document
 * (`nextTick`), so `fn` reads the document as a change made before the call
 * left it. MultiSelect puts a controlled field's text back only once its
 * caller's value has rendered.
 */
export function afterRender(fn: () => void): void {
  void nextTick(fn)
}
