import { type ComponentStates } from '@polymorph/react'
import { RETRY_SOURCE } from './citation.states'
import { SourceList } from './SourceList'
import type { CitationSource } from './sources'

/** States fixture, from `design/components/source-list.md`'s States table. */

export const SOURCES: CitationSource[] = [
  RETRY_SOURCE,
  {
    title: 'Idempotency keys',
    href: 'https://docs.example.org/idempotency',
    domain: 'docs.example.org',
    snippet: 'A key is honoured for 24 hours after the first request that carried it.',
  },
  {
    title: 'Incident 2026-08-14: duplicate promo codes on retry',
    href: 'https://status.example.org/incidents/2026-08-14',
    domain: 'status.example.org',
  },
]

export const states: ComponentStates = {
  component: 'SourceList',

  entries: [
    {
      name: 'three sources — title, host and the passage that answered',
      render: () => <SourceList sources={SOURCES} label="Sources" />,
      expect: { 'aria-label': 'Sources' },
    },
    {
      name: 'titles only — the app knew nothing more',
      render: () => (
        <SourceList sources={SOURCES.map(({ title, href }) => ({ title, href }))} label="Sources" />
      ),
    },
    {
      name: 'one source',
      render: () => <SourceList sources={SOURCES.slice(0, 1)} label="Sources" />,
    },
    {
      name: 'empty — a reply with no sources says nothing about sources',
      render: () => <SourceList sources={[]} label="Sources" />,
      rendersNothing: true,
    },
  ],

  /*
   * The title is this member's own link, because Link's style does not wrap.
   * So this stylesheet must define its hover and focus.
   */
  requiredSelectors: [':hover', ':focus-visible'],
}
