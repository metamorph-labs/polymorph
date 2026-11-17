'use client'

import { useEffect, useLayoutEffect, useRef } from 'react'

import { agentMember, type AgentHandle } from '@polymorph/engine'

/**
 * Registers a member with the agent registry while it is mounted
 * (`@polymorph/engine`'s `agentMember`), so an agent bridge reads its declared
 * states and runs its declared actions.
 *
 * The member passes a new handle each render, with closures over that
 * render's values. The registry holds one handle per mount, whose functions
 * call the latest render's, so an agent reads the value on screen and an
 * action calls the setter that is current. The member is registered once,
 * when it mounts, and removed when it unmounts; a render does not register it
 * again.
 *
 * The latest handle is kept in a layout effect, which runs after each commit
 * and before the registration effect, so a render React discards never
 * reaches the registry. A server render runs neither effect and registers
 * nothing. Strict mode's second mount registers again after removing the
 * first, so one entry is registered at a time, each with its own id.
 *
 * `unless` registers nothing while it is true. A member that another one
 * draws in its own place passes it, so the bridge lists the member that
 * stands for it and not both (the Dialog a ConfirmDialog draws).
 */
export function useAgentMember(handle: AgentHandle, { unless = false } = {}): void {
  const latest = useRef(handle)

  useLayoutEffect(() => {
    latest.current = handle
  })

  useEffect(
    () =>
      unless
        ? undefined
        : agentMember({
            member: latest.current.member,
            element: () => latest.current.element(),
            state: () => latest.current.state(),
            get actions() {
              return latest.current.actions
            },
            get secret() {
              return latest.current.secret
            },
            destructive: () => latest.current.destructive?.() ?? false,
            withholds: () => latest.current.withholds?.(),
          }),
    [unless],
  )
}
