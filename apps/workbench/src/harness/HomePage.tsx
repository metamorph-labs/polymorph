import { Code, Heading, Icon, Inline, Stack, Text } from '@polymorph/react-ui'
import { lazy, Suspense } from 'react'

import { HarnessLink } from './HarnessLink'

/**
 * The index is the only part of this page that reads the registered fixtures, so it loads with
 * the gallery chunk instead of pulling the whole vocabulary into the boot bundle. The fallback is
 * `null`, not a styled placeholder, because a fallback is a style decision the app layer may not
 * make.
 */
const GalleryIndex = lazy(() =>
  import('./galleries').then((module) => ({ default: module.GalleryIndex })),
)

/**
 * The overview: a workbench page built only from vocabulary primitives, with **no stylesheet of
 * its own and no style prop**. Every space on the page is a token step set through
 * `Stack`/`Inline`/`Grid` props. The headings and text use Heading, Text and Code. The `<h1>` is a
 * plain element because Heading cannot render one: PageHeader owns the page title, and the
 * harness is not a product page.
 */
export function HomePage() {
  return (
    <Stack as="section" gap={8} p={7}>
      <Stack gap={3}>
        <h1>Polymorph workbench</h1>
        <Text>
          The theme engine resolves seeds and axes into a law-checked token set; the toolbar above
          re-scopes this page by attribute alone. The page is built on the vocabulary&rsquo;s
          infrastructure — the icon gateway, the focus convention and the three layout primitives.
        </Text>
        <Text size="sm" tone="secondary">
          The studio is the workbench&rsquo;s front door; this page, at <Code>/overview</Code>, is
          composed entirely of vocabulary primitives — no stylesheet of its own, no style prop.
        </Text>
      </Stack>

      <Stack gap={4}>
        <Heading>Relay</Heading>
        <Text>
          The demo product: a support inbox built from the vocabulary and nothing else — no CSS
          under <Code>apps/</Code>, no <Code>className</Code>, and exactly two declared exceptions,
          which <Code>pnpm inventory</Code> prints by name. It replaces this chrome and carries its
          own theme switchers, because a demo watched through the instrument is not a demo.
        </Text>
        <Inline gap={3}>
          <HarnessLink to="/relay">
            <Inline gap={2}>
              <Icon name="inbox" />
              Open Relay
            </Inline>
          </HarnessLink>
        </Inline>
      </Stack>

      <Stack gap={4}>
        <Heading>Galleries</Heading>
        <Text>
          Each component ships a states fixture; registering it is the whole of getting a gallery.
        </Text>
        <Suspense fallback={null}>
          <GalleryIndex />
        </Suspense>
      </Stack>

      <Stack gap={4}>
        <Heading>Layout, without CSS</Heading>
        <Text>
          This section is the proof. Composition below is props over the space scale — there is no
          way to express a value that is not on it.
        </Text>

        <Stack as="ul" gap={2}>
          <li>
            <Inline gap={2}>
              <Icon name="success" label="Done" />
              Stack — vertical rhythm, <Code>gap</Code> and padding from token steps
            </Inline>
          </li>
          <li>
            <Inline gap={2}>
              <Icon name="success" label="Done" />
              Inline — rows that centre mixed-height controls by default
            </Inline>
          </li>
          <li>
            <Inline gap={2}>
              <Icon name="success" label="Done" />
              Grid — equal tracks, <Code>minmax(0, 1fr)</Code>, no breakpoint props
            </Inline>
          </li>
        </Stack>

        <Inline gap={4} wrap>
          <Inline gap={2}>
            <Icon name="filter" />
            Filter
          </Inline>
          <Inline gap={2}>
            <Icon name="sort-asc" />
            Sort
          </Inline>
          <Inline gap={2}>
            <Icon name="refresh" />
            Refresh
          </Inline>
          <Inline gap={2}>
            <Icon name="settings" />
            Settings
          </Inline>
        </Inline>
      </Stack>
    </Stack>
  )
}
