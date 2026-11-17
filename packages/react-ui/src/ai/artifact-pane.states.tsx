'use client'

import { type ComponentStates } from '@polymorph/react'
import type { ReactNode } from 'react'

import { Button } from '../controls/Button'
import { CodeBlock } from '../structure/CodeBlock'
import { ArtifactPane } from './ArtifactPane'
import styles from '@polymorph/recipes/ai/artifact-pane.module.css'
import { Markdown } from './Markdown'
import { STRUCTURE } from './markdown.states'

/**
 * States fixture, from `design/components/artifact-pane.md`'s States table.
 *
 * The pane fills its box, so every entry renders inside a fixed-height harness
 * (ScrollArea's pattern). Without a box the pane shows a header over an empty
 * body.
 */

const noop = () => {}

const CODE = `export async function deliver(event: WebhookEvent) {
  return retry(() => post(event), {
    attempts: 5,
    firstDelayMs: 2_000,
    idempotencyKey: event.id,
  })
}
`

const ACTIONS = (
  <>
    <Button
      variant="ghost"
      tone="neutral"
      size="sm"
      iconOnly
      icon="copy"
      label="Copy"
      onClick={noop}
    />
    <Button
      variant="ghost"
      tone="neutral"
      size="sm"
      iconOnly
      icon="download"
      label="Download"
      onClick={noop}
    />
  </>
)

function Boxed({ children }: { children: ReactNode }) {
  return <div className={styles.harness}>{children}</div>
}

export const states: ComponentStates = {
  component: 'ArtifactPane',

  entries: [
    {
      name: 'code — one reading, the app’s controls, close',
      render: () => (
        <Boxed>
          <ArtifactPane
            title="deliver.ts"
            kind="code"
            meta="TypeScript · 9 lines"
            actions={ACTIONS}
            onClose={noop}
          >
            <CodeBlock>{CODE}</CodeBlock>
          </ArtifactPane>
        </Boxed>
      ),
    },
    {
      name: 'two readings — the switch between code and preview',
      render: () => (
        <Boxed>
          <ArtifactPane
            title="Release notes"
            kind="document"
            meta="Markdown · 3 sections"
            actions={ACTIONS}
            onClose={noop}
            views={[
              { id: 'preview', label: 'Preview', content: <Markdown>{STRUCTURE}</Markdown> },
              { id: 'source', label: 'Source', content: <CodeBlock>{STRUCTURE}</CodeBlock> },
            ]}
          />
        </Boxed>
      ),
    },
    {
      name: 'streaming — still being written',
      render: () => (
        <Boxed>
          <ArtifactPane title="deliver.ts" kind="code" streaming>
            <CodeBlock>{CODE.slice(0, 120)}</CodeBlock>
          </ArtifactPane>
        </Boxed>
      ),
    },
    {
      name: 'a long artifact — the body scrolls inside the pane',
      render: () => (
        <Boxed>
          <ArtifactPane title="deliver.ts" kind="code" meta="TypeScript · 44 lines" onClose={noop}>
            <CodeBlock>{`${CODE}\n${CODE}\n${CODE}\n${CODE}`}</CodeBlock>
          </ArtifactPane>
        </Boxed>
      ),
    },
    {
      name: 'no kind — the tier’s own mark',
      render: () => (
        <Boxed>
          <ArtifactPane title="Untitled artifact">
            <Markdown>{STRUCTURE}</Markdown>
          </ArtifactPane>
        </Boxed>
      ),
    },
  ],

  /*
   * The body becomes a keyboard tab stop once the artifact overflows. The
   * switch's and the controls' states belong to SegmentedControl and Button.
   */
  requiredSelectors: [':focus-visible'],
}
