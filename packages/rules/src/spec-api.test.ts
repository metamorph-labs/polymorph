import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  auditSpecApi,
  findingId,
  isExemptFromSpecApi,
  PROP_ALLOWLIST,
  SPEC_API_EXEMPTIONS,
  type SpecApiFinding,
} from './spec-api'

/**
 * The spec-staleness law, over everything the vocabulary ships.
 *
 * `packages/react-ui/src/galleries.test.tsx` checks that every component has a
 * fixture. This file checks that every component has a spec that still
 * describes it. Both apply the same idea to the two parts of the contract. Specs
 * can drift without notice, because a stale markdown table breaks nothing at
 * runtime.
 *
 * It runs against this repo, so `pnpm test` enforces it. The fixture below shows
 * the audit fails on drift, and the repo suite shows it passes on what ships. A
 * law needs both to be meaningful.
 */

const ROOT = process.cwd()
const FIXTURE = resolve(ROOT, 'packages/rules/fixtures/spec-api')

const REPO = auditSpecApi(ROOT)

const format = (finding: SpecApiFinding) =>
  finding.direction === 'code-only'
    ? `${findingId(finding)} — ships, and ${finding.spec} does not declare it`
    : `${findingId(finding)} — ${finding.spec} declares it, and it does not ship`

describe('every component the gallery ships has a spec to compare against', () => {
  it('finds them, so a pass is meaningful', () => {
    // A law that resolves nothing passes every assertion below it.
    expect(REPO.subjects.length).toBeGreaterThanOrEqual(49)
  })

  it('turns every component into a comparison, or says why it cannot', () => {
    expect(REPO.unresolved).toEqual([])
  })

  it('names each subject after the type it read', () => {
    for (const subject of REPO.subjects) {
      // A part's props are its function's first parameter, which may be written inline.
      if (!subject.label.includes('.'))
        expect(subject.type, subject.label).toMatch(/Props$|Options$/)
      expect(subject.spec, subject.label).toMatch(/^design\/(components|archetypes)\/.+\.md$/)
    }
  })
})

describe('the shipped props match the specified props', () => {
  it('has no undeclared drift in either direction', () => {
    const undeclared = REPO.findings
      .filter((finding) => !isExemptFromSpecApi(finding.subject, finding.prop))
      .map(format)

    expect(undeclared).toEqual([])
  })

  it('reads the archetypes, whose API section is called something else', () => {
    // `## Anatomy & API`: for a page, the structure and the props are one topic.
    // Matching only `## API` would silently skip five specs.
    const archetypes = REPO.subjects.filter((subject) => subject.spec.includes('/archetypes/'))
    const pages = archetypes.filter((subject) => !subject.label.includes('.'))
    expect(pages.map((subject) => subject.label).sort()).toEqual([
      'AppShell',
      'AuthPage',
      'ConversationPage',
      'Dashboard',
      'DetailPage',
      'FormPage',
      'ListPage',
      'MasterDetailPage',
      'SearchPage',
      'SettingsPage',
    ])
  })

  it('reads a compound spec down to its parts', () => {
    // `table.md` describes four components in one table. Reading only the root
    // would leave every prop on Table.Row with nothing to compare against.
    const parts = REPO.subjects.filter((subject) => subject.label.startsWith('Table.'))
    expect(Object.fromEntries(parts.map((subject) => [subject.label, subject.type]))).toEqual({
      'Table.Head': '{ children?: ReactNode; }',
      'Table.Body': '{ children?: ReactNode; }',
      'Table.Foot': '{ children?: ReactNode; }',
      'Table.Row': 'RowProps',
      'Table.Header': 'HeaderProps',
      'Table.Cell': 'CellProps',
    })
  })

  it('compares every part a member export carries, wherever its spec puts the table', () => {
    // The parts are read from the export, as the registry reads them, so a new
    // part is compared in the commit that adds it. `AppShell.NavItem`'s table
    // is in a section headed with its name, not in `## API`.
    const parts = REPO.subjects
      .filter((subject) => subject.label.includes('.'))
      .map((subject) => subject.label)
    expect(parts).toEqual(
      expect.arrayContaining([
        'AppShell.NavItem',
        'AppShell.NavGroup',
        'AppShell.UserCard',
        'Avatar.Group',
        'Dashboard.Panel',
        'SettingsRow.Group',
        'Tabs.Content',
      ]),
    )
  })
})

describe('exemptions are declared, not implied', () => {
  it('gives every exemption a reason specific enough to review', () => {
    expect(SPEC_API_EXEMPTIONS.length).toBeGreaterThan(0)
    for (const exemption of SPEC_API_EXEMPTIONS) {
      expect(exemption.reason.length, `${exemption.subject}.${exemption.prop}`).toBeGreaterThan(40)
    }
  })

  it('keeps every exemption matched to a divergence that still exists', () => {
    // The ledger can go stale: a prop is added to the spec, the entry stays, and
    // the next drift on that prop is exempt before anyone records it.
    const live = new Set(REPO.findings.map(findingId))
    const stale = SPEC_API_EXEMPTIONS.map((entry) => `${entry.subject}.${entry.prop}`).filter(
      (id) => !live.has(id),
    )

    expect(stale, 'spec and code agree here now — delete the entry').toEqual([])
  })

  it('keeps the allowlist to what the conventions own', () => {
    // Widening this hides a prop for every component at once, which is why it is
    // asserted and not only documented.
    expect([...PROP_ALLOWLIST]).toEqual([
      'children',
      'aria-label',
      'aria-labelledby',
      'aria-describedby',
      'aria-required',
    ])
  })
})

/**
 * Seeded drift in a small copy of the repo layout, with its own `design/` and
 * its own `packages/react-ui`, audited by the same function.
 *
 * Showing the failure on the real tree would mean breaking it, so the fixture
 * holds the failures instead: one per direction, one per spec format, and one
 * component with no spec at all.
 */
describe('the audit reports seeded drift', () => {
  const found = auditSpecApi(FIXTURE)
  const ids = found.findings.map((finding) => `${findingId(finding)}:${finding.direction}`).sort()

  it('reports a shipped prop no spec declares, from a table and from a fence', () => {
    expect(ids).toContain('Widget.size:code-only')
    expect(ids).toContain('Panel.dense:code-only')
  })

  it('reports a specified prop that does not ship, from a table and from a fence', () => {
    expect(ids).toContain('Widget.ghost:spec-only')
    expect(ids).toContain('Panel.collapsible:spec-only')
  })

  it('reads a fence down to the named type, not to its supporting types', () => {
    // `PanelRegion` is in the same fence. Its `key` and `span` are not Panel's
    // props, and a fence parser that flattened the block would report them as such.
    expect(ids).not.toContain('Panel.key:spec-only')
    expect(ids).not.toContain('Panel.span:spec-only')
  })

  it('compares an allowlisted prop in neither direction', () => {
    expect(ids.some((id) => id.startsWith('Widget.children'))).toBe(false)
  })

  it('reports a component it could not audit instead of skipping it', () => {
    expect(found.unresolved).toEqual([
      'Panel: design/components/panel.md describes an unknown Panel.Footer',
      'Ghost: no spec file under design/components or design/archetypes',
    ])
  })

  it('compares a part read from the export against the section headed with its name', () => {
    expect(ids).toContain('Widget.Item.selected:code-only')
    expect(ids).toContain('Widget.Item.icon:spec-only')
  })

  it('takes a part only from a property named as a component is', () => {
    // `type` is callable, as `React.memo`'s is, and is not a part.
    expect(found.subjects.map((subject) => subject.label)).toEqual([
      'Widget',
      'Widget.Item',
      'Panel',
    ])
  })

  it('finds nothing else, because the fixture drifts only where documented', () => {
    expect(ids).toEqual([
      'Panel.collapsible:spec-only',
      'Panel.dense:code-only',
      'Widget.Item.icon:spec-only',
      'Widget.Item.selected:code-only',
      'Widget.ghost:spec-only',
      'Widget.size:code-only',
    ])
  })
})
