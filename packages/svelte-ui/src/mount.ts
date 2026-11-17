import { flushSync, mount as mountRoot, tick, unmount as unmountRoot, type Component } from 'svelte'

import type { Overrides, StateEntry } from '@polymorph/svelte'

import MountedEntry from './MountedEntry.svelte'

/**
 * Mounts a states fixture entry for a test, the way an application mounts its
 * root, with `overrides` spread over its member's props, and remembers it so
 * the test setup unmounts every one after each test. The first update and the
 * effects it starts have run when it returns.
 */
const mounted = new Set<() => void>()

let hosts = 0

export async function mount(
  entry: Pick<StateEntry, 'render'>,
  overrides: Overrides = {},
): Promise<{ host: HTMLElement; unmount(): void }> {
  return render(MountedEntry, { render: entry.render, overrides })
}

/**
 * Mounts a component with props, as `mount` mounts an entry. Props made with
 * `live` (`testing/live.svelte.ts`) stay reactive: a test that sets one sees
 * the component follow it, as a parent's state would.
 */
export async function render<Props extends object>(
  component: Component<Props>,
  props: Props,
): Promise<{ host: HTMLElement; unmount(): void }> {
  const host = document.createElement('div')
  // An id, so a pointer harness that addresses an element by a selector built
  // from its ancestors finds the host however portals come and go beside it.
  host.id = `svelte-mount-${++hosts}`
  document.body.append(host)
  const root = mountRoot(component, { target: host, props })
  flushSync()
  await tick()
  const unmount = () => {
    if (!mounted.delete(unmount)) return
    void unmountRoot(root)
    host.remove()
  }
  mounted.add(unmount)
  return { host, unmount }
}

export function unmountAll(): void {
  for (const unmount of [...mounted]) unmount()
}
