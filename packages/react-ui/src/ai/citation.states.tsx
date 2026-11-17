import { type ComponentStates } from '@polymorph/react'
import { Text } from '../structure/Text'
import { Citation } from './Citation'
import type { CitationSource } from './sources'

/** States fixture, from `design/components/citation.md`'s States table. */

export const RETRY_SOURCE: CitationSource = {
  title: 'Webhook delivery and retries',
  href: 'https://docs.example.org/webhooks/retries',
  domain: 'docs.example.org',
  snippet:
    'Deliveries are retried with exponential backoff, up to five attempts, with the original ' +
    'idempotency key on every attempt.',
}

const BARE_SOURCE: CitationSource = {
  title: 'Idempotency keys',
  href: 'https://docs.example.org/idempotency',
}

export const states: ComponentStates = {
  component: 'Citation',

  entries: [
    {
      name: 'in a sentence — the mark after the claim it supports',
      render: () => (
        <Text>
          Retries carry the original idempotency key, so a duplicate delivery is refused rather than
          applied twice.
          <Citation index={1} source={RETRY_SOURCE} />
        </Text>
      ),
    },
    {
      name: 'two marks — the numbers are the SourceList’s',
      render: () => (
        <Text>
          The schedule is exponential
          <Citation index={1} source={RETRY_SOURCE} /> and the key is the same on every attempt.
          <Citation index={2} source={BARE_SOURCE} />
        </Text>
      ),
    },
    {
      name: 'a two-digit mark — the same square, wider',
      render: () => (
        <Text>
          Eleven sources in, the mark still reads as one.
          <Citation index={11} source={BARE_SOURCE} />
        </Text>
      ),
    },
  ],

  /*
   * The mark is a link. Its hover and focus come from the pointer and the
   * keyboard, so the law reads them from the stylesheet. The preview that
   * opens on hover is HoverCard's state and is tested in HoverCard's fixture.
   */
  requiredSelectors: [':hover', ':focus-visible'],
}
