import { GALLERIES } from '../galleries'
import { mount } from '../mount'

/*
 * The runner's adapter interface (`@polymorph/conformance`), written out
 * structurally, as the Solid and Vue adapters write it. The law assigns the
 * adapter to the runner's `MountAdapter`, so the two cannot drift.
 */
type Override = string | ((...args: never[]) => void)
interface MountProps {
  state: string
  overrides?: Readonly<Record<string, Override>>
}
interface Mounted {
  root: HTMLElement
  unmount(): void
}
interface MountAdapter {
  mount(member: string, props: MountProps): Promise<Mounted>
}

/**
 * The elements' mount adapter (`docs/conformance.md`).
 *
 * It mounts a states fixture entry, by the name the React fixture gives it,
 * as the page's markup in its own root. `overrides` reach the entry's
 * subject, the first element of the member's tag: a probe string through the
 * element's property for the prop, and a spy in a handler prop as a listener
 * for the event of its name (`onClick` is `poly-click`).
 */
export const elementsAdapter: MountAdapter = {
  async mount(member, { state, overrides }) {
    const entry = GALLERIES.find((gallery) => gallery.component === member)?.entries.find(
      (candidate) => candidate.name === state,
    )
    if (entry === undefined) throw new Error(`conformance: ${member} has no entry "${state}"`)
    const { host, unmount } = await mount(entry, overrides ?? {})
    return { root: host, unmount }
  },
}
