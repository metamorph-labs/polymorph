import { type ComponentStates } from '@polymorph/react'
import { Stack } from '../layout/Stack'
import { Link } from './Link'

/** States fixture, from `design/components/link.md`'s States table. */

export const states: ComponentStates = {
  component: 'Link',

  entries: [
    {
      name: 'inline — underlined inside the sentence it belongs to',
      render: () => (
        <p>
          Retries stop after the first 5xx; the <Link href="#delivery">delivery log</Link> has the
          response bodies.
        </p>
      ),
    },
    {
      name: 'standalone — a row, underlined on hover instead',
      render: () => (
        <Link href="#audit" variant="standalone">
          Open the audit trail
        </Link>
      ),
      expect: { 'data-variant': 'standalone' },
    },
    {
      name: 'external — a new tab, a glyph, and the rel that makes it safe',
      render: () => (
        <Link href="https://example.com/status" external>
          Status page
        </Link>
      ),
      expect: { 'data-external': '', target: '_blank', rel: 'noreferrer' },
    },
    {
      name: 'external and standalone',
      render: () => (
        <Link href="https://example.com/docs" variant="standalone" external>
          Webhook documentation
        </Link>
      ),
    },
    {
      name: 'inherits the step of the text around it',
      render: () => (
        <Stack gap={3}>
          <p>
            A link in body copy is <Link href="#a">the same size as the copy</Link>.
          </p>
        </Stack>
      ),
    },
    {
      name: 'the costume, default — soft, accent, md; navigation holding rank in a row of Buttons',
      render: () => (
        <Link href="#billing" variant="button">
          View billing
        </Link>
      ),
      expect: { 'data-variant': 'soft', 'data-tone': 'accent', 'data-size': 'md' },
    },
    {
      name: 'the costume as solid — a claim chosen into, never defaulted',
      render: () => (
        <Link href="#setup" variant="button" buttonVariant="solid">
          Start setup
        </Link>
      ),
      expect: { 'data-variant': 'solid', 'data-tone': 'accent' },
    },
    {
      name: 'the costume as outline neutral',
      render: () => (
        <Link href="#docs" variant="button" buttonVariant="outline" tone="neutral">
          Read the docs
        </Link>
      ),
      expect: { 'data-variant': 'outline', 'data-tone': 'neutral' },
    },
    {
      name: 'external in costume — the glyph rides Button’s trailing slot',
      render: () => (
        <Link href="https://example.com/status" variant="button" buttonVariant="outline" external>
          Status page
        </Link>
      ),
      expect: { 'data-external': '', target: '_blank', rel: 'noreferrer' },
    },
  ],

  /*
   * The costume adds no selectors of its own (link.md). Its cells are in Button's stylesheet and
   * are checked against button.md's own selectors.
   */
  requiredSelectors: [':hover', ':focus-visible', '[data-external]'],
}
