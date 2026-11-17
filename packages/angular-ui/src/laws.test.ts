import axeCore, { type RunOptions } from 'axe-core'
import { beforeAll, describe, expect, it } from 'vitest'

import { installTestTheme } from '@polymorph/engine/testing'
import { gallerySlug, type StateEntry } from '@polymorph/angular'

import { GALLERIES } from './galleries'
import { mount, rootOf } from './mount'

/**
 * State completeness, identity and the accessibility pass, over every states
 * fixture in the Angular vocabulary: the laws `packages/react-ui/src/laws.test.tsx`
 * holds the React vocabulary to, run against the generated members.
 *
 * Every entry mounts and renders what it promises: each attribute its `expect`
 * names is the attribute it produces on the root, and an entry that renders
 * nothing says so. Every member's `data-member` appears in a rendered entry,
 * and every entry is clean under axe with the React law's rule exceptions,
 * each with its reason beside it. That the fixture has an entry for every spec
 * States row and lawful grid cell is checked in node, against the registry
 * (`packages/angular-ui/laws.test.ts`).
 */

beforeAll(installTestTheme)

/**
 * Rules switched off: the React law's four (`packages/react-ui/src/laws.test.tsx`),
 * each for the reason that law gives, restated here with the Angular shell's own
 * evidence where the reason rests on a test.
 */
const RULE_EXCEPTIONS = {
  // A member is not a page; the archetype that is one provides the landmarks.
  region: { enabled: false },

  // Four members render an `<h1>`; every other fixture would fail a rule about a page it is not.
  'page-has-heading-one': { enabled: false },

  // The system's contrast law is APCA, enforced over every pairing in
  // `packages/theme/src/laws.test.ts`; WCAG 2.1's ratio would be a second, contradictory law.
  'color-contrast': { enabled: false },

  /*
   * Fires only while a Dialog is open: Zag's modal dialog hides the page
   * behind it with `aria-hidden`, and that page still holds buttons. The focus
   * trap makes it safe, and axe cannot see the trap. `overlays/dialog.test.ts`
   * tests it in the Angular shell, by tabbing through the open panel and asserting
   * that focus never leaves it.
   */
  'aria-hidden-focus': { enabled: false },
} as const

const AXE_OPTIONS: RunOptions = { rules: RULE_EXCEPTIONS }

async function audit(target: Element): Promise<string[]> {
  const results = await axeCore.run(target, AXE_OPTIONS)
  return results.violations.map(
    (violation) =>
      `${violation.id}: ${violation.help} (${violation.nodes.length} node(s)) — ` +
      `${violation.nodes[0]?.html ?? ''}`,
  )
}

/** Attributes a rendered root must carry, per its fixture entry. `null` asserts absence. */
function checkExpectations(root: Element, entry: StateEntry): string[] {
  const failures: string[] = []
  for (const [attribute, value] of Object.entries(entry.expect ?? {})) {
    const actual = root.getAttribute(attribute)
    if (value === null) {
      if (root.hasAttribute(attribute))
        failures.push(`${attribute} should be absent, was "${actual}"`)
    } else if (actual !== value) {
      failures.push(
        `${attribute} should be "${value}", was ${actual === null ? 'absent' : `"${actual}"`}`,
      )
    }
  }
  return failures
}

describe('state completeness — every fixture entry renders what it promises', () => {
  for (const states of GALLERIES) {
    for (const entry of states.entries) {
      it(`${states.component} — ${entry.name}`, async () => {
        const { host } = await mount(states, entry.name)
        const root = rootOf(host)
        if (entry.rendersNothing) {
          expect(root, `${states.component}/${entry.name} claims to render nothing`).toBeNull()
          return
        }
        expect(root, `${states.component}/${entry.name} rendered nothing`).not.toBeNull()
        expect(checkExpectations(root as Element, entry)).toEqual([])
      })
    }
  }
})

describe('every member carries its name — the identity law', () => {
  for (const states of GALLERIES) {
    it(states.component, async () => {
      const slug = gallerySlug(states.component)
      for (const entry of states.entries) {
        if (entry.rendersNothing) continue
        const { unmount } = await mount(states, entry.name)
        const found = document.querySelector(`[data-member="${slug}"]`) !== null
        unmount()
        if (found) return
      }
      expect.fail(`${states.component}: no rendered fixture entry carries [data-member="${slug}"]`)
    })
  }
})

describe('the completeness check detects faults', () => {
  it('catches an attribute a fixture promised and did not produce', () => {
    const root = document.createElement('div')
    root.setAttribute('data-state', 'closed')
    expect(
      checkExpectations(root, {
        name: 'lying',
        expect: { 'data-state': 'open' },
      }),
    ).toEqual(['data-state should be "open", was "closed"'])
  })

  it('catches an attribute a fixture promised would be absent', () => {
    const root = document.createElement('div')
    root.setAttribute('data-disabled', '')
    expect(
      checkExpectations(root, {
        name: 'lying',
        expect: { 'data-disabled': null },
      }),
    ).toEqual(['data-disabled should be absent, was ""'])
  })
})

describe('axe — every fixture entry, zero violations', () => {
  for (const states of GALLERIES) {
    for (const entry of states.entries) {
      it(`${states.component} — ${entry.name}`, async () => {
        await mount(states, entry.name)
        expect(await audit(document.body), `${states.component}/${entry.name}`).toEqual([])
      })
    }
  }
})

describe('the axe pass detects faults', () => {
  it('finds a violation when there is one', async () => {
    const host = document.createElement('div')
    host.innerHTML = '<img src="data:," />'
    document.body.append(host)
    expect((await audit(host)).join('\n')).toContain('image-alt')
    host.remove()
  })

  it('names every rule it switched off, with a reason in the source', () => {
    // The React law's pin: rule-level exceptions are few, and each reason is
    // next to the rule. A fifth needs its reason here and in the React law.
    expect(Object.keys(RULE_EXCEPTIONS).sort()).toEqual([
      'aria-hidden-focus',
      'color-contrast',
      'page-has-heading-one',
      'region',
    ])
  })
})
