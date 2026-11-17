import { cond, describeMember, el, fx, identity, lit, member, text } from '../dsl'

const RETRY_SOURCE = {
  title: 'Webhook delivery and retries',
  href: 'https://docs.example.org/webhooks/retries',
  domain: 'docs.example.org',
  snippet:
    'Deliveries are retried with exponential backoff, up to five attempts, with the original ' +
    'idempotency key on every attempt.',
}

const BARE_SOURCE = {
  title: 'Idempotency keys',
  href: 'https://docs.example.org/idempotency',
}

/**
 * Citation (`design/components/citation.md`): the `[1]` after a sentence, a
 * real link to the source it rests on, with HoverCard's preview of that
 * source. The preview holds nothing the destination does not, so a touch
 * reader loses only a quick look, and focus on the mark opens it.
 *
 * The visible text is the number; the accessible name is the number and the
 * title, so a list of citations is not a list of bare numbers. It opens in a
 * new tab with the safe `rel`, as Link's `external` does. `CitationSource` is
 * SourceList's, the list the numbers refer to.
 */
export default describeMember({
  member: 'Citation',
  dir: 'ai',
  recipe: 'ai/citation',
  uses: ['CitationSource'],
  template: member(
    'HoverCard',
    {},
    {
      slots: {
        default: [
          el(
            'a',
            {
              part: 'mark',
              class: ['mark'],
              attrs: {
                href: 'source.href',
                target: lit('_blank'),
                rel: lit('noreferrer'),
                'aria-label': '`${index}. ${source.title}`',
                ...identity('Citation'),
              },
            },
            [text('index')],
          ),
        ],
        content: [
          el('span', { part: 'preview', class: ['preview'] }, [
            el('span', { class: ['previewTitle'] }, [text('source.title')]),
            cond('source.domain !== undefined', [
              el('span', { class: ['previewDomain'] }, [text('source.domain')]),
            ]),
            cond('source.snippet !== undefined', [
              el('span', { class: ['previewSnippet'] }, [text('source.snippet')]),
            ]),
          ]),
        ],
      },
    },
  ),
  states: [
    {
      name: 'in a sentence — the mark after the claim it supports',
      many: {
        within: { member: 'Text' },
        each: [],
        also: [
          'Retries carry the original idempotency key, so a duplicate delivery is refused rather than applied twice.',
          fx('Citation', { index: 1, source: RETRY_SOURCE }),
        ],
      },
    },
    {
      name: 'two marks — the numbers are the SourceList’s',
      many: {
        within: { member: 'Text' },
        each: [],
        also: [
          'The schedule is exponential',
          fx('Citation', { index: 1, source: RETRY_SOURCE }),
          ' and the key is the same on every attempt.',
          fx('Citation', { index: 2, source: BARE_SOURCE }),
        ],
      },
    },
    {
      name: 'a two-digit mark — the same square, wider',
      many: {
        within: { member: 'Text' },
        each: [],
        also: [
          'Eleven sources in, the mark still reads as one.',
          fx('Citation', { index: 11, source: BARE_SOURCE }),
        ],
      },
    },
  ],
})
