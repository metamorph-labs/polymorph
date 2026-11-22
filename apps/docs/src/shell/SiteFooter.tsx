import { Inline, Link, Separator, Stack, Text } from '@polymorph/react-ui'

import { SITE } from '../site'

/**
 * The foot of every page: the licence and the links that leave the site.
 *
 * `inset` is for a route whose page is an archetype. The archetype brings its
 * own measure and padding, and the footer sits outside it, so the footer takes
 * the page inset itself. A route in the shell's reading surface is already
 * padded.
 */
export function SiteFooter({ inset = false }: { inset?: boolean }) {
  return (
    <footer>
      <Stack gap={5} px={inset ? 7 : undefined} py={7}>
        <Separator />
        <Inline gap={5} wrap justify="between" align="center">
          <Text size="sm" tone="secondary">
            {`${SITE.name} is free and open source, under the ${SITE.license} licence.`}
          </Text>
          <Inline gap={5} wrap>
            <Link variant="standalone" href="/install">
              Get started
            </Link>
            <Link variant="standalone" href="/llms.txt">
              llms.txt
            </Link>
            <Link variant="standalone" href={SITE.npm} external>
              npm
            </Link>
            <Link variant="standalone" href={SITE.repository} external>
              GitHub
            </Link>
          </Inline>
        </Inline>
      </Stack>
    </footer>
  )
}
