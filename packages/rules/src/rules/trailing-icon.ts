import type { Rule } from 'eslint'

import iconSet from '../../../../design/icons.json' with { type: 'json' }
import { BUTTON, isTrailingRole } from '../usage'
import { either } from './advice'
import { angularSelector, isAngularTemplate } from './angular'
import { composedTrees, eachElement } from './composition'
import { reporterFor } from './vue'

/**
 * Stage 2: a Button's trailing icon is a direction or a disclosure.
 *
 * An icon goes before the text it stands for. The exceptions point the way
 * the action goes or show that it opens something: a forward or next arrow, a
 * chevron that expands or collapses, the mark of a link that leaves the
 * product. `design/icons.json` owns that list as `trailing`, beside the roles
 * themselves, and the validation a screen spec gets reads the same list. Any
 * other role in `trailingIcon` belongs in `icon`. A back arrow goes before the
 * text, so it is not on the list.
 *
 * **The fix.** A Button with no `icon` has one lawful answer: the role moves
 * to `icon`, so the prop is renamed and its value kept. A Button that already
 * has an `icon` is reported and left, because one of the two icons has to go,
 * and which one is a choice. A role written as a computed value is not read.
 * A `<Bespoke>` zone lifts the rule inside it.
 */

/** The roles a trailing icon may take, in `design/icons.json`'s order. */
export const TRAILING_ROLES: readonly string[] = iconSet.trailing

export const trailingIcon: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: { description: "A Button's trailing icon is a direction or a disclosure." },
    fixable: 'code',
    schema: [],
    messages: {
      notTrailing:
        'Unexpected trailing icon "{{role}}" on <{{button}}>: an icon leads its text, and only {{roles}} trail it. {{advice}}',
    },
  },

  create(context) {
    const report = reporterFor(context, trailingIcon.meta?.messages)
    const angular = isAngularTemplate(context)
    return {
      'Program:exit'() {
        eachElement(composedTrees(context), (element) => {
          if (element.name !== BUTTON) return
          const trailing = element.prop('trailingIcon')
          const role = trailing.value
          if (typeof role !== 'string' || role === '' || isTrailingRole(role, TRAILING_ROLES))
            return
          const leading = element.prop('icon').value
          const rename = trailing.rename
          report({
            ...element.at,
            messageId: 'notTrailing',
            data: {
              role,
              button: angular ? angularSelector(BUTTON) : BUTTON,
              roles: either(TRAILING_ROLES, 'and'),
              advice:
                leading === undefined
                  ? `Use \`icon="${role}"\` (rung 1).`
                  : `Drop it, or use \`icon="${role}"\` in place of the other (rung 1).`,
            },
            ...(leading === undefined && rename !== undefined
              ? { fix: (fixer: Rule.RuleFixer) => rename(fixer, 'icon') }
              : {}),
          })
        })
      },
    }
  },
}
