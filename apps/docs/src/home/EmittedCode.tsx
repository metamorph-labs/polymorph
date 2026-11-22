import { CodeBlock, Grid, Heading, Stack, Tabs } from '@polymorph/react-ui'
import { EMITTED, SCREEN_SPEC } from 'virtual:polymorph-docs/emitted-screen'

const FRAMEWORKS = [
  { value: 'react', label: 'React' },
  { value: 'vue', label: 'Vue' },
  { value: 'svelte', label: 'Svelte' },
  { value: 'solid', label: 'Solid' },
  { value: 'angular', label: 'Angular' },
] as const

/**
 * One screen spec beside the source the emitter writes from it for each web
 * framework. The text comes from the emitter at build time (`vite.config.ts`),
 * so it is what `pnpm emit` prints, without the header comment.
 */
export function EmittedCode() {
  return (
    <Grid columns={2} gap={4} align="start">
      <Stack gap={3}>
        <Heading level={3}>You describe the screen</Heading>
        <CodeBlock label="The screen, described once">{SCREEN_SPEC}</CodeBlock>
      </Stack>
      <Stack gap={3}>
        <Heading level={3}>You get code for your framework</Heading>
        <Tabs tabs={[...FRAMEWORKS]} defaultValue="react">
          {FRAMEWORKS.map((framework) => (
            <Tabs.Content key={framework.value} value={framework.value}>
              <CodeBlock label={`The same screen in ${framework.label}`} copyable copyLabel="Copy">
                {EMITTED[framework.value]}
              </CodeBlock>
            </Tabs.Content>
          ))}
        </Tabs>
      </Stack>
    </Grid>
  )
}
