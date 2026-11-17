import { cond, describeMember, each, el, identity, lit, member, text } from '../dsl'

export const SOURCES = [
  {
    title: 'Webhook delivery and retries',
    href: 'https://docs.example.org/webhooks/retries',
    domain: 'docs.example.org',
    snippet:
      'Deliveries are retried with exponential backoff, up to five attempts, with the original ' +
      'idempotency key on every attempt.',
  },
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

/**
 * SourceList (`design/components/source-list.md`): the numbered list of
 * sources a reply cites, in the order the reply numbers them. An empty list
 * renders nothing. It owns `CitationSource`, the shape Citation shares.
 */
export default describeMember({
  member: 'SourceList',
  dir: 'ai',
  recipe: 'ai/source-list',
  types: {
    // `href` is required: a source nobody can open is an assertion, not a citation. The app
    // formats the rest.
    CitationSource: '{ title: string; href: string; domain?: string; snippet?: string }',
  },
  template: cond('sources.length > 0', [
    el(
      'section',
      { class: ['root'], attrs: { 'aria-label': 'label', ...identity('SourceList') } },
      [
        // Decorative: `label` already names the region.
        el('span', { part: 'heading', class: ['heading'], attrs: { 'aria-hidden': lit('true') } }, [
          member('Icon', { name: lit('cite'), size: lit('sm') }),
          text('label'),
        ]),
        el('ol', { part: 'list', class: ['list'] }, [
          // Keyed by position: citations point at the number, and the list is never reordered.
          each(
            'sources',
            'source',
            'position',
            [
              el('li', { part: 'item', class: ['item'] }, [
                // Hidden: the ordered list announces its numbers already.
                el(
                  'span',
                  { part: 'index', class: ['index'], attrs: { 'aria-hidden': lit('true') } },
                  [text('position + 1')],
                ),
                el('span', { part: 'body', class: ['body'] }, [
                  // A plain link, not Link, whose external style does not wrap a sentence-long
                  // title; Link's external behaviour is kept: a new tab, the safe `rel`, the glyph.
                  el(
                    'a',
                    {
                      part: 'title',
                      class: ['title'],
                      attrs: { href: 'source.href', target: lit('_blank'), rel: lit('noreferrer') },
                    },
                    [
                      text('source.title'),
                      el('span', { class: ['glyph'] }, [
                        member('Icon', { name: lit('open-external'), size: lit('sm') }),
                      ]),
                    ],
                  ),
                  cond('source.domain !== undefined', [
                    el('span', { part: 'domain', class: ['domain'] }, [text('source.domain')]),
                  ]),
                  cond('source.snippet !== undefined', [
                    el('span', { part: 'snippet', class: ['snippet'] }, [text('source.snippet')]),
                  ]),
                ]),
              ]),
            ],
            'position',
          ),
        ]),
      ],
    ),
  ]),
  states: [
    {
      name: 'three sources — title, host and the passage that answered',
      props: { sources: SOURCES, label: 'Sources' },
      expect: { 'aria-label': 'Sources' },
    },
    {
      name: 'titles only — the app knew nothing more',
      props: { sources: SOURCES.map(({ title, href }) => ({ title, href })), label: 'Sources' },
    },
    { name: 'one source', props: { sources: SOURCES.slice(0, 1), label: 'Sources' } },
    {
      name: 'empty — a reply with no sources says nothing about sources',
      props: { sources: [], label: 'Sources' },
      rendersNothing: true,
    },
  ],
})
