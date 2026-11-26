import { render } from '@testing-library/react'
import axeCore, { type RunOptions } from 'axe-core'
import { beforeAll, describe, expect, it } from 'vitest'

import { gallerySlug, type StateEntry } from '@polymorph/react'
import { GALLERIES } from './galleries'
import { disabledLaw } from '@polymorph/conformance/disabled'
import { installTestTheme } from '@polymorph/engine/testing'

/**
 * State completeness and the accessibility pass, over every states fixture in
 * the vocabulary.
 *
 * The fixture is the contract, and this file enforces it. `galleries.test.tsx`
 * checks the registry: that fixtures exist, are named, and have unique routes.
 * This file checks the states: every entry renders, every attribute it
 * promises is the attribute it produces, and it has no accessibility
 * violations.
 *
 * It runs against `GALLERIES` rather than a separate list, so a component added
 * to the vocabulary is checked in the same commit. A component cannot be added
 * without being checked.
 *
 * It uses `axe-core` directly rather than `vitest-axe`. The wrapper is a
 * matcher around this same call, and its 0.1.0 uses `createRequire`, which does
 * not exist in the browser these tests run in. Same engine and rules, one less
 * shim.
 */

beforeAll(installTestTheme)

/**
 * Rules switched off, each with its reason.
 *
 * Two of them come from auditing a fragment: axe gets one component rather than
 * a page, and those rules check what a page has around it. They belong to a
 * page audit, and both apply in full on a real page, such as the workbench's
 * Relay screens.
 *
 * The contrast rule is a real disagreement between two standards, and its
 * reason is the most important to read.
 */
const RULE_EXCEPTIONS = {
  // "All page content should be contained by landmarks." A Button is not a page,
  // and the archetype that is one (AppShell) provides the landmarks, as
  // `archetypes.test.tsx` asserts directly.
  region: { enabled: false },

  // "Page should contain a level-one heading." Four components in the vocabulary
  // render an `<h1>` (PageHeader, Hero, and the two archetypes that render their
  // own), and every other fixture would fail a rule about a page it is not. A
  // law in `packages/rules/src/repo-laws.test.ts` pins which four.
  'page-has-heading-one': { enabled: false },

  /*
   * "Elements must meet minimum color contrast ratio thresholds" — WCAG 2.1's
   * luminance ratio.
   *
   * The system's contrast law is APCA (a red rule, `docs/rules.md`), with a
   * different model and different numbers. It is enforced more strictly than
   * this rule would be: over every preset x mode x lawful pairing, measured from
   * the strings the emitter writes, in `packages/theme/src/laws.test.ts`.
   * Leaving axe's rule on would mean two contradictory contrast laws, and the
   * system's chosen one could lose.
   *
   * The cost of that choice is recorded. The same file lists every role where
   * APCA-lawful and WCAG-AA disagree, asserts that everything not on that list
   * passes both, and sets a minimum for the ones that are. A new divergence
   * fails that suite, not this one.
   */
  'color-contrast': { enabled: false },

  /*
   * "ARIA hidden element must not be focusable or contain focusable elements."
   *
   * Fires only while a Dialog is open: Radix hides the page behind a modal with
   * `aria-hidden`, and that page still contains buttons. The focus trap makes it
   * safe, and axe cannot see the trap. `dialog.test.tsx` tests it directly by
   * tabbing six times and asserting that focus never leaves the panel.
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
      it(`${states.component} — ${entry.name}`, () => {
        const { container } = render(<>{entry.render()}</>)
        const root = container.firstElementChild

        if (entry.rendersNothing) {
          // Checked in both directions: an entry that says it renders nothing
          // but renders something is as wrong as the reverse.
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
  /**
   * The exception seam's address. The emitter changes class tokens inside
   * `[data-member="<slug>"]`, so exceptions cannot reach a member whose
   * rendered output never has the attribute, and nothing reports it. The check
   * is over rendered fixtures rather than "the root element", because not every
   * member has one DOM root (Tooltip's bubble has it; portalled surfaces have
   * it on their content element). One match across a component's whole fixture
   * is enough, because some entries render only part of the member (a closed
   * overlay, a bare trigger).
   */
  for (const states of GALLERIES) {
    it(states.component, () => {
      const slug = gallerySlug(states.component)
      for (const entry of states.entries) {
        if (entry.rendersNothing) continue
        render(<>{entry.render()}</>)
        // Portals render into `document.body`, so the document is the correct
        // search scope; testing-library renders into it either way.
        if (document.querySelector(`[data-member="${slug}"]`) !== null) return
      }
      expect.fail(
        `${states.component}: no rendered fixture entry carries [data-member="${slug}"] — ` +
          'the exception seam cannot address this member',
      )
    })
  }
})

describe('the completeness check detects faults', () => {
  /**
   * A law is only trusted once it has been seen to fail on a broken fixture. A
   * broken fixture cannot be in the repo, so the checker runs on a broken entry
   * here instead: the same failure, while the suite passes.
   */
  it('catches an attribute a fixture promised and did not produce', () => {
    const { container } = render(<div data-state="closed" />)
    const root = container.firstElementChild as Element

    expect(
      checkExpectations(root, {
        name: 'lying fixture',
        render: () => null,
        expect: { 'data-state': 'open' },
      }),
    ).toEqual(['data-state should be "open", was "closed"'])
  })

  it('catches an attribute a fixture promised would be absent', () => {
    const { container } = render(<div data-disabled="" />)
    const root = container.firstElementChild as Element

    expect(
      checkExpectations(root, {
        name: 'lying fixture',
        render: () => null,
        expect: { 'data-disabled': null },
      }),
    ).toEqual(['data-disabled should be absent, was ""'])
  })

  it('passes a correct entry', () => {
    const { container } = render(<div data-state="open" data-size="md" />)
    const root = container.firstElementChild as Element

    expect(
      checkExpectations(root, {
        name: 'honest fixture',
        render: () => null,
        expect: { 'data-state': 'open', 'data-size': 'md', 'data-disabled': null },
      }),
    ).toEqual([])
  })
})

describe('axe — every fixture entry, zero violations', () => {
  for (const states of GALLERIES) {
    for (const entry of states.entries) {
      it(`${states.component} — ${entry.name}`, async () => {
        const { container } = render(<>{entry.render()}</>)

        // The whole body, not just the container: overlays portal out of it, and
        // an audit that skipped the portal would skip the dialog. Nothing is
        // removed by hand. RTL's `cleanup` unmounts each tree, and React removes
        // its portals with it. Removing a portal node manually would race that
        // unmount, and the error would name the next entry.
        expect(await audit(document.body), `${states.component}/${entry.name}`).toEqual([])
        expect(container).toBeTruthy()
      })
    }
  }
})

/*
 * A disabled control is not a tab stop, and nothing inside a disabled member is one
 * (`design/components/README.md`, Disabled), in every entry of every fixture
 * (`@polymorph/conformance/disabled`).
 */
disabledLaw({
  shell: 'React',
  galleries: GALLERIES,
  mount: (_states, entry) => render(<>{entry.render()}</>),
})

describe('the axe pass detects faults', () => {
  it('finds a violation when there is one', async () => {
    // The same demonstration as above, for the other half of the law: an image
    // with no alternative text is the standard failure, and the audit reports it.
    const host = document.createElement('div')
    host.innerHTML = '<img src="data:," />'
    document.body.append(host)

    expect((await audit(host)).join('\n')).toContain('image-alt')

    host.remove()
  })

  it('names every rule it switched off, with a reason in the source', () => {
    // The condition on rule-level exceptions: they are few, and each reason is
    // next to the rule rather than in a commit message.
    expect(Object.keys(RULE_EXCEPTIONS).sort()).toEqual([
      'aria-hidden-focus',
      'color-contrast',
      'page-has-heading-one',
      'region',
    ])
  })
})

describe('every fixture is reachable from a route', () => {
  it('has unique slugs, so no gallery hides another', () => {
    const slugs = GALLERIES.map((states) => gallerySlug(states.component))
    expect(new Set(slugs).size).toBe(slugs.length)
  })
})
