import { GALLERIES } from '../galleries'
import { mount } from '../mount'

/*
 * The runner's adapter interface (`@polymorph/conformance`), written out
 * structurally, as the React and Vue adapters write it. The law assigns the
 * adapter to the runner's `MountAdapter`, so the two cannot drift.
 */
type Override = string | number | boolean | readonly unknown[] | ((...args: never[]) => void)
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
 * The Angular shell's mount adapter (`docs/conformance.md`).
 *
 * It renders a states fixture entry, by the name the React fixture gives it,
 * into its own root on the page. `overrides` reach the member the entry
 * renders first through the fixture's `overrides` input, which the
 * `pmOverrides` directive hands to the member over its own props and its
 * slot's: a probe string for an accessible name, or a spy in a handler, by the
 * React prop's name (`onClick`), which the member calls in place of its
 * caller's `(click)` binding.
 */
export const angularAdapter: MountAdapter = {
  async mount(member, { state, overrides }) {
    const states = GALLERIES.find((gallery) => gallery.component === member)
    if (states === undefined) throw new Error(`conformance: no Angular fixture for ${member}`)
    const { host, unmount } = await mount(states, state, overrides ?? {})
    return { root: host, unmount }
  },
}
