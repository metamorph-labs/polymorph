import type { Rule } from 'eslint'

import {
  actionScope,
  BUTTON,
  extraMainButtons,
  isMainButton,
  type ActionScope,
  type Branches,
} from '../usage'
import { fit } from './advice'
import { angularSelector, isAngularTemplate } from './angular'
import { composedTrees, isZone, type Composed, type ComposedElement } from './composition'
import { reporterFor } from './vue'

/**
 * Stage 2: one main Button leads a dialog or a section.
 *
 * A main Button is a `Button` whose `variant` is `solid` and whose `tone` is
 * `accent`, which are its defaults, so a Button that writes neither is one. A
 * dialog (Dialog, Drawer, Popover) or a section (Card, a Dashboard's panel)
 * holds one: it is where the eye goes for the next step, and a second one
 * leaves the reader to choose between two. The scopes and the defaults are
 * `@polymorph/rules/usage`'s, which the validation a screen spec gets reads too.
 *
 * **What it counts.** The Buttons a scope holds, between its tags and in the
 * props that carry content (a Dialog's `footer`), and not in a prop drawn
 * outside it (a Dialog's `trigger`, which stays on the page). A scope inside
 * another is counted apart: a Card in a Dialog holds its own main Button. A
 * page is not a scope, so a page's header actions are not counted.
 *
 * **What it leaves alone.** Buttons in different branches of one conditional
 * (a ternary, a `v-if` and its `v-else`, `{#if}` and `{:else}`, `@if` and
 * `@else`) never render together, so they are alternatives. A Button whose
 * `variant` or `tone` is computed, or that takes a spread, may or may not be a
 * main one, and the rule says nothing about it. Neither does it count Buttons
 * it cannot see: the ones a call such as `items.map(…)` writes, or a variable
 * holds. A `<Bespoke>` zone lifts the rule inside it.
 *
 * **Where it reports.** On each main Button after the first that can render
 * beside it, because that is the one to change. A member's props are read
 * before its content, as TSX writes them, so a Dialog's `footer` keeps its main
 * action and a second one in the body is the one reported.
 */

interface Scope {
  name: string
  scope: ActionScope
  buttons: { element: ComposedElement; branches: Branches }[]
}

export const oneMainButton: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: { description: 'A dialog or a section holds one main Button: one solid accent action.' },
    schema: [],
    messages: {
      secondMain:
        'Unexpected second main Button in <{{scope}}>: a {{kind}} has one solid accent Button, which marks its next step. {{advice}}',
    },
  },

  create(context) {
    const angular = isAngularTemplate(context)
    // A report on a Vue or an Angular file writes its answer in that template's syntax.
    const report = reporterFor(context, oneMainButton.meta?.messages)
    const named = (member: string) => (angular ? angularSelector(member) : member)

    return {
      'Program:exit'() {
        const scopes: Scope[] = []

        const walk = (content: readonly Composed[], scope: Scope | null, branches: Branches) => {
          for (const item of content) {
            if (item.type === 'branch') {
              item.branches.forEach((branch, index) =>
                walk(branch, scope, [...branches, [item.id, index]]),
              )
              continue
            }
            if (isZone(item)) continue
            if (item.name === BUTTON && scope !== null) {
              const main = isMainButton(item.prop('variant').value, item.prop('tone').value)
              if (main === true) scope.buttons.push({ element: item, branches })
            }
            const opened = actionScope(item.name)
            const inner: Scope | null =
              opened === null ? scope : { name: opened.name, scope: opened.scope, buttons: [] }
            if (opened !== null && inner !== null) scopes.push(inner)
            const innerBranches: Branches = opened === null ? branches : []
            // The props before the content, as TSX writes them: a Dialog's footer keeps its main
            // action, and a second one in the body is the one reported.
            for (const [slot, held] of item.slots) {
              const outside = opened !== null && opened.scope.outside.includes(slot)
              walk(held, outside ? scope : inner, outside ? branches : innerBranches)
            }
            walk(item.children, inner, innerBranches)
          }
        }
        walk(composedTrees(context), null, [])

        for (const scope of scopes) {
          const buttons = scope.buttons
          for (const index of extraMainButtons(buttons.map((button) => button.branches))) {
            const button = buttons[index]
            if (button === undefined) continue
            const head =
              `Unexpected second main Button in <${named(scope.name)}>: a ${scope.scope.kind} ` +
              'has one solid accent Button, which marks its next step.'
            report({
              ...button.element.at,
              messageId: 'secondMain',
              data: {
                scope: named(scope.name),
                kind: scope.scope.kind,
                advice: fit(head, [
                  'Make this one `<Button variant="outline" tone="neutral">` (rung 1).',
                  'A third is `<Button variant="ghost">`.',
                ]),
              },
            })
          }
        }
      },
    }
  },
}
