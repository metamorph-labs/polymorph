import type { JSX } from 'solid-js'
import { render } from 'solid-js/web'

/**
 * Mounts an element for a test, the way an application mounts its root, and
 * remembers it so the test setup unmounts every one after each test.
 */
const mounted = new Set<() => void>()

let hosts = 0

/** A frame for the browser to paint, so effects and motion have started. */
const frame = () => new Promise<void>((settle) => requestAnimationFrame(() => settle()))

export async function mount(
  view: () => JSX.Element,
): Promise<{ host: HTMLElement; unmount(): void }> {
  const host = document.createElement('div')
  // An id, so a pointer harness that addresses an element by a selector built
  // from its ancestors finds the host however portals come and go beside it.
  host.id = `solid-mount-${++hosts}`
  document.body.append(host)
  const dispose = render(view, host)
  await Promise.resolve()
  await frame()
  const unmount = () => {
    if (!mounted.delete(unmount)) return
    dispose()
    host.remove()
  }
  mounted.add(unmount)
  return { host, unmount }
}

export function unmountAll(): void {
  for (const unmount of [...mounted]) unmount()
}
