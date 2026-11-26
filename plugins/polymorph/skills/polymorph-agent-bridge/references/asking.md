# Asking the person

`confirm` is the application's, and it asks the person at the page. The bridge calls it with
`{ id, member, name, action, value? }` before an action that needs a person, and runs the action
only when it resolves `true`. An agent cannot answer it, and a `confirm` that throws is a no.

## In React, through a `ConfirmDialog`

This component starts the bridge with `startPageAgent` from step 4 of the skill, and asks through
a `ConfirmDialog`. The dialog withholds its confirm, so no agent presses Allow.

```tsx
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { AgentConfirmRequest } from '@polymorph/engine/agent'
import { ConfirmDialog } from '@polymorph/react-ui'

import { startPageAgent } from './page-agent'

export function PageAgent() {
  const [asking, setAsking] = useState<AgentConfirmRequest | null>(null)
  const answer = useRef<(yes: boolean) => void>(() => {})
  const ask = useCallback(
    (request: AgentConfirmRequest) =>
      new Promise<boolean>((resolve) => {
        answer.current = (yes) => {
          setAsking(null)
          resolve(yes)
        }
        setAsking(request)
      }),
    [],
  )
  useEffect(() => {
    const stop = startPageAgent(ask)
    return () => {
      stop()
      answer.current(false)
    }
  }, [ask])
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

- `ask` keeps its identity, so the bridge is made once.
- Closing the dialog any other way, and unmounting the page while the person is asked, answer no.
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

A step whose `changed` is empty dispatches one too, and a step that fails dispatches none. Write
the audit line the product keeps, or tell the person what the agent changed, from this detail.

## Telling an agent's change from a person's

`bridge.acting` is `true` while a step's action runs. A member's handler keeps its signature, so
`Checkbox`'s `onCheckedChange` receives the same value from an agent's
`check` as from a person's press. A handler that must treat the two apart reads `bridge.acting`
when it is called: a `Button`'s `onClick` runs inside the agent's
`press`, so it reads `true` there.
