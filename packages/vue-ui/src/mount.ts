import { createApp, nextTick, type VNode } from 'vue'

/**
 * Mounts a node for a test, the way an application mounts its root, and
 * remembers it so the test setup unmounts every one after each test.
 */
const mounted = new Set<() => void>()

let hosts = 0

export async function mount(
  render: () => VNode | null,
): Promise<{ host: HTMLElement; unmount(): void }> {
  const host = document.createElement('div')
  // An id, so a pointer harness that addresses an element by a selector built
  // from its ancestors finds the host however portals come and go beside it.
  host.id = `vue-mount-${++hosts}`
  document.body.append(host)
  const app = createApp({ render })
  // Each app numbers `useId` from zero, so two apps on one page would give two
  // members one id, and a machine finds its parts by id. A prefix per mount
  // keeps them apart, as a page with several Vue apps must.
  app.config.idPrefix = `m${hosts}`
  app.mount(host)
  await nextTick()
  const unmount = () => {
    if (!mounted.delete(unmount)) return
    app.unmount()
    host.remove()
  }
  mounted.add(unmount)
  return { host, unmount }
}

export function unmountAll(): void {
  for (const unmount of [...mounted]) unmount()
}
