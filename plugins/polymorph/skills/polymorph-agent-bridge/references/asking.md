# Asking the person

`confirm` is the application's, and it asks the person at the page. The bridge calls it with
`{ id, member, name, action, value? }` before an action that needs a person, and runs the action
only when it resolves `true`. An agent cannot answer it, and a `confirm` that throws is a no.

## In React, through a `ConfirmDialog`

This component starts the page's one bridge with `startPageAgent` from step 4 of the skill, hands
what that returns to `onStart`, and asks through a `ConfirmDialog`. The dialog withholds
its confirm, so no agent presses Allow.

```tsx
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { AgentConfirmRequest } from '@polymorph/engine/agent'
import { ConfirmDialog } from '@polymorph/react-ui'

import { startPageAgent, type PageAgent } from './page-agent'

/** Starts the page's one bridge, hands it to `onStart`, and asks the person through a ConfirmDialog. */
export function PageAgentHost({ onStart }: { onStart: (agent: PageAgent | null) => void }) {
  const [asking, setAsking] = useState<AgentConfirmRequest | null>(null)
  const answer = useRef<(yes: boolean) => void>(() => {})
  const ask = useCallback(
    (request: AgentConfirmRequest) =>
      new Promise<boolean>((resolve) => {
        answer.current = (yes) => {
          // Once: the close ConfirmDialog makes after Allow finds nothing left to answer.
          answer.current = () => {}
          setAsking(null)
          resolve(yes)
        }
        setAsking(request)
      }),
    [],
  )
  useEffect(() => {
    const agent = startPageAgent(ask)
    onStart(agent)
    return () => {
      onStart(null)
      agent.stop()
      answer.current(false)
    }
  }, [ask, onStart])
  return (
    <ConfirmDialog
      open={asking !== null}
      title="Let the assistant do this?"
      description={asking === null ? '' : `The assistant asks to ${asking.action} “${asking.name}”.`}
      confirmLabel="Allow"
      onConfirm={() => answer.current(true)}
      onOpenChange={(open) => {
        if (!open) answer.current(false)
      }}
    />
  )
}
```

- Render it once on the page. Give it an `onStart` that keeps its identity, such as a state
  setter, and hand the agent it receives to the assistant (`assistantTools(agent)`, step 6). It
  receives `null` once the page unmounts.
- One question is open at a time. The page has one bridge, the bridge asks inside the one `act`
  it runs, and the next `act`, from the assistant or from WebMCP, waits.
- `answer` runs once per question. `ConfirmDialog` calls
  `onOpenChange` with `false` after `onConfirm`,
  and that close finds nothing left to answer.
- Closing the dialog any other way, and unmounting the page while the person is asked, answer no.
- `ask` keeps its identity, so the bridge is made once.
- `request.name` is the member's accessible name on this page, and `request.value` is what the
  agent asked to set or choose. Say both in the question, so the person knows what they allow.
- Other frameworks do the same with their own state and the framework's `ConfirmDialog`.
  A page with no build can ask with `window.confirm`, as `references/no-build.md` shows.

## Recording what an agent did

Each step that succeeds dispatches `AGENT_CHANGE_EVENT`, `polymorph:agentchange`,
bubbling, on its member's element, or on the document when the step removed that element. The
detail is `{ id, member, action, changed, source: 'agent' }`. `bridge.subscribe(listener)` hands
a listener the same object, and returns the function that stops it.

```ts
document.addEventListener('polymorph:agentchange', (event) => {
  const { id, member, action, changed } = (event as CustomEvent).detail
  console.info('the agent ran', action, 'on', member, id, changed)
})
```

A step whose `changed` is empty dispatches one too, and a step that fails dispatches none. The
event is for the page's own code: to tell the person what the agent changed, or to log it, which is
the product's choice. It is no audit record. Any script on the page can dispatch an event of that
name, so the record that counts is the one the server keeps of each request it authorises.

## Telling an agent's change from a person's

`bridge.acting` is `true` while a step's action runs. A member's handler keeps its signature, so
`Checkbox`'s `onCheckedChange` receives the same value from an agent's
`check` as from a person's press. A handler that must treat the two apart reads `bridge.acting`
when it is called: a `Button`'s `onClick` runs inside the agent's
`press`, so it reads `true` there. Such a handler can ask the person before it places an order,
in place of a policy that denies the press.
