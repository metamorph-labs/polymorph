import { Heading, PageHeader, Stack, Text } from '@polymorph/react-ui'

import { DepotMap } from './DepotMap'
import { NoteEditor } from './NoteEditor'

/**
 * Two components another library draws, each inside a `<ThirdParty>` boundary
 * (`docs/rules.md`). The map takes the theme as data and the editor takes it through CSS.
 * Change the pairing or the mode in the toolbar and both follow.
 */
export function HostedPage() {
  return (
    <Stack gap={6} p={6}>
      <PageHeader
        title="Hosted components"
        description="A map and a rich-text editor from other libraries, themed by the pairing."
      />
      <Stack gap={3}>
        <Heading level={2}>Depots</Heading>
        <Text tone="secondary">Leaflet draws the map from the theme’s resolved values.</Text>
        <DepotMap />
      </Stack>
      <Stack gap={3}>
        <Heading level={2}>Shift note</Heading>
        <Text tone="secondary">Tiptap draws the text, which reads the theme’s tokens.</Text>
        <NoteEditor />
      </Stack>
    </Stack>
  )
}
