import type { Rule } from 'eslint'

import { BUTTON, dangerBeforeOthers, type RowPlace } from '../usage'
import { angularSelector, isAngularTemplate } from './angular'
import {
  composedTrees,
  eachElement,
  isZone,
  type Composed,
  type ComposedElement,
} from './composition'
import { reporterFor } from './vue'

/**
 * Stage 2: a destructive Button comes last in its row.
 *
 * In one row of sibling Buttons (the content of one element, or of one prop
 * that holds several), a Button with `tone="danger"` has no Button without
 * that tone after it. A reader meets the safe choice first, and the
 * destructive one sits where a hasty press does not land on it. ConfirmDialog
 * draws its own two Buttons in this order by construction.
 *
 * The other half of the designer's rule, that a destructive Button never
 * takes focus first, is the vocabulary's: no member takes initial focus on a
 * danger Button (`modalFocusTarget` in the engine), and Button takes no
 * `autoFocus`, so an app cannot ask for it and the rule has nothing to read.
 *
 * **What it reads.** Each place in a row is a Button, or a conditional that
 * picks one Button per branch; a place where a conditional picks between
 * Buttons holds the tone of each. Anything else in the row (text, a Link, a
 * call such as `items.map(…)`) is not a place. A Button whose tone is computed
 * is neither destructive nor safe, so the rule says nothing about it. A
 * `<Bespoke>` zone lifts the rule inside it.
 */

export const dangerLast: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: { description: 'A danger Button comes last among the Buttons beside it.' },
    schema: [],
    messages: {
      dangerFirst:
        'Unexpected {{button}} before another Button in its row: the destructive action comes last, so a reader meets the safe one first. {{advice}}',
    },
  },

  create(context) {
    const report = reporterFor(context, dangerLast.meta?.messages)
    const angular = isAngularTemplate(context)
    const button = `<${angular ? angularSelector(BUTTON) : BUTTON} tone="danger">`

    /** The places of one row, each with the Buttons that can stand there. */
    const placesOf = (content: readonly Composed[]) => {
      const places: { place: RowPlace; buttons: ComposedElement[] }[] = []
      for (const item of content) {
        const candidates =
          item.type === 'element'
            ? [item]
            : item.branches.flatMap((branch) => {
                const [only] = branch
                return branch.length === 1 && only?.type === 'element' ? [only] : []
              })
        const buttons = candidates.filter(
          (candidate) => candidate.name === BUTTON && !isZone(candidate),
        )
        if (buttons.length === 0) continue
        places.push({ place: buttons.map((one) => one.prop('tone').value), buttons })
      }
      return places
    }

    /** Every row the trees hold: each element's content, each slot's, and each branch's. */
    const rows: (readonly Composed[])[] = []
    const collect = (content: readonly Composed[]) => {
      rows.push(content)
      for (const item of content) {
        if (item.type === 'branch') item.branches.forEach(collect)
      }
    }

    return {
      'Program:exit'() {
        const trees = composedTrees(context)
        collect(trees)
        eachElement(trees, (element) => {
          collect(element.children)
          for (const held of element.slots.values()) collect(held)
        })
        const reported = new Set<ComposedElement>()
        for (const row of rows) {
          const places = placesOf(row)
          for (const index of dangerBeforeOthers(places.map(({ place }) => place))) {
            for (const danger of places[index]?.buttons ?? []) {
              if (danger.prop('tone').value !== 'danger' || reported.has(danger)) continue
              reported.add(danger)
              report({
                ...danger.at,
                messageId: 'dangerFirst',
                data: { button, advice: 'Move it after the others (rung 1).' },
              })
            }
          }
        }
      },
    }
  },
}
