import { GALLERIES } from '../galleries'
import { mount } from '../mount'

/*
 * The runner's adapter interface (`@polymorph/conformance`), written out
 * structurally, as the React adapter writes it. The law assigns the adapter
 * to the runner's `MountAdapter`, so the two cannot drift.
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
 * The Svelte shell's mount adapter (`docs/conformance.md`).
 *
 * It renders a states fixture entry, by the name the React fixture gives it,
 * into its own root on the page. `overrides` reach the member inside the
 * entry because a generated entry is a snippet that spreads them over its
 * member's props: a probe string for an accessible name, or a spy in a
 * callback prop, which is Svelte's event (`onClick`).
 */
export const svelteAdapter: MountAdapter = {
  async mount(member, { state, overrides }) {
    const entry = GALLERIES.find((gallery) => gallery.component === member)?.entries.find(
      (candidate) => candidate.name === state,
    )
    if (entry === undefined) throw new Error(`conformance: ${member} has no entry "${state}"`)
    const { host, unmount } = await mount(entry, overrides ?? {})
    return { root: host, unmount }
  },
}
