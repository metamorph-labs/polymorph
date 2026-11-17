'use client'

import { type ComponentStates } from '@polymorph/react'
import type { ReactNode } from 'react'

import { ArtifactPane } from '../ai/ArtifactPane'
import { ChatThread } from '../ai/ChatThread'
import { TURNS } from '../ai/chat-thread.states'
import { PromptInput } from '../ai/PromptInput'
import { Button } from '../controls/Button'
import { CodeBlock } from '../structure/CodeBlock'
import { EmptyState } from '../structure/EmptyState'
import { ConversationPage } from './ConversationPage'
import styles from '@polymorph/recipes/archetypes/conversation-page.module.css'

/**
 * States fixture, from `design/archetypes/conversation-page.md`'s States table.
 *
 * The page fills its region (the shell's content region in a product), so
 * the entries render inside a fixed-height harness. The root attributes are
 * asserted in the browser test, where the width that sets them can be
 * controlled.
 */

const noop = () => {}

const CODE = `export async function deliver(event: WebhookEvent) {
  return retry(() => post(event), { attempts: 5, idempotencyKey: event.id })
}`

const composer = <PromptInput label="Message" placeholder="Ask Pilot anything…" onSubmit={noop} />

function Boxed({ children }: { children: ReactNode }) {
  return <div className={styles.harness}>{children}</div>
}

export const states: ComponentStates = {
  component: 'ConversationPage',

  entries: [
    {
      name: 'a conversation — the thread over the composer',
      render: () => (
        <Boxed>
          <ConversationPage
            title="Webhook retries"
            description="Pilot can read the workspace and cite what it finds."
            actions={
              <Button
                variant="outline"
                tone="neutral"
                size="sm"
                icon="add"
                label="New chat"
                onClick={noop}
              />
            }
            thread={<ChatThread label="Conversation">{TURNS}</ChatThread>}
            composer={composer}
          />
        </Boxed>
      ),
    },
    {
      name: 'with an aside — the artifact beside the thread',
      render: () => (
        <Boxed>
          <ConversationPage
            title="Webhook retries"
            thread={<ChatThread label="Conversation">{TURNS}</ChatThread>}
            composer={composer}
            aside={
              <ArtifactPane
                title="deliver.ts"
                kind="code"
                meta="TypeScript · 3 lines"
                onClose={noop}
              >
                <CodeBlock>{CODE}</CodeBlock>
              </ArtifactPane>
            }
            asideLabel="Artifact"
          />
        </Boxed>
      ),
    },
    {
      name: 'empty — the app’s first words in the thread’s room',
      render: () => (
        <Boxed>
          <ConversationPage
            title="New chat"
            thread={
              <ChatThread
                label="Conversation"
                empty={
                  <EmptyState
                    icon="model"
                    title="Ask Pilot anything"
                    description="It can read the workspace, run the tools you allow, and cite what it finds."
                  />
                }
              />
            }
            composer={composer}
          />
        </Boxed>
      ),
    },
  ],

  /*
   * Every state comes from a prop or a width. The split's divider and the
   * drawer belong to SplitPane and Drawer. So the list is empty.
   */
  requiredSelectors: [],
}
