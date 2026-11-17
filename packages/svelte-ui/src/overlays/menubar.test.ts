import { menubarLaw } from '@polymorph/conformance/menubar'

import { render } from '../mount'
import Menubar from './Menubar.svelte'

/**
 * Menubar's keys, its tab stop, the hand-off between menus, the pointer rule and
 * the phone form in the Svelte shell (`design/components/menubar.md`), as
 * `@polymorph/conformance/menubar` states them for every web shell.
 */
menubarLaw({
  shell: 'Svelte',
  mount: ({ menus }) => render(Menubar, { label: 'Document', menus }),
})
