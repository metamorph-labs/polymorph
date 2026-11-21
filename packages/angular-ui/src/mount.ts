import {
  type ApplicationRef,
  createComponent,
  provideZonelessChangeDetection,
  type ComponentRef,
  type EnvironmentInjector,
  type Type,
} from '@angular/core'
import { createApplication } from '@angular/platform-browser'

import type { ComponentStates } from '@polymorph/angular'

/**
 * Mounts a states fixture entry for a test, the way an application mounts its
 * root: the fixture component in its own host element at the end of the body,
 * attached to one zoneless application, with the entry chosen and the
 * runner's overrides set as its inputs. The test setup unmounts every one
 * after each test, and every component `mountComponent` mounts.
 */
const mounted = new Set<() => void>()

let hosts = 0
let application: Promise<{ appRef: ApplicationRef; injector: EnvironmentInjector }> | undefined

const app = () =>
  (application ??= createApplication({ providers: [provideZonelessChangeDetection()] }).then(
    (ref) => ({ appRef: ref, injector: ref.injector }),
  ))

/** A frame for the browser to paint, so effects and motion have started. */
const frame = () => new Promise<void>((settle) => requestAnimationFrame(() => settle()))

export interface Mounted {
  host: HTMLElement
  ref: ComponentRef<unknown>
  unmount(): void
}

export async function mount(
  states: ComponentStates,
  name: string,
  overrides: Readonly<Record<string, unknown>> = {},
): Promise<Mounted> {
  const entry = states.entries.findIndex((candidate) => candidate.name === name)
  if (entry === -1) throw new Error(`mount: ${states.component} has no entry "${name}"`)
  return mountComponent(states.fixture, { entry, overrides })
}

/**
 * Mounts any component, a test's own host of the members it exercises
 * included, the way `mount` mounts a fixture: in its own host element at the
 * end of the body, with its inputs set, once the application is stable.
 */
export async function mountComponent(
  type: Type<unknown>,
  inputs: Readonly<Record<string, unknown>> = {},
): Promise<Mounted> {
  const { appRef, injector } = await app()
  const host = document.createElement('div')
  // An id, so a pointer harness that addresses an element by a selector built
  // from its ancestors finds the host however portals come and go beside it.
  host.id = `angular-mount-${++hosts}`
  document.body.append(host)
  const element = document.createElement('div')
  host.append(element)
  const ref = createComponent(type, { environmentInjector: injector, hostElement: element })
  for (const [name, value] of Object.entries(inputs)) ref.setInput(name, value)
  appRef.attachView(ref.hostView)
  await appRef.whenStable()
  await frame()
  await appRef.whenStable()
  const unmount = () => {
    if (!mounted.delete(unmount)) return
    appRef.detachView(ref.hostView)
    ref.destroy()
    host.remove()
  }
  mounted.add(unmount)
  return { host, ref, unmount }
}

export function unmountAll(): void {
  for (const unmount of [...mounted]) unmount()
}

/**
 * The first element a member renders inside a mount: below the fixture's and
 * the members' own host elements (`pm-*`), which draw no box and carry no
 * attribute but their mark, and past a member's host that renders nothing (a
 * declared Toast).
 */
export function rootOf(host: Element): Element | null {
  const first = (parent: Element): Element | null => {
    for (const child of parent.children) {
      if (!child.tagName.startsWith('PM-')) return child
      const inner = first(child)
      if (inner !== null) return inner
    }
    return null
  }
  // The mount's element is the fixture's host.
  const fixture = host.firstElementChild
  return fixture === null ? null : first(fixture)
}
