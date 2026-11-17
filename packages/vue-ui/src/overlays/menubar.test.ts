import { h } from 'vue'

import { menubarLaw } from '@polymorph/conformance/menubar'

import { mount } from '../mount'
import Menubar from './Menubar.vue'

/**
 * Menubar's keys, its tab stop, the hand-off between menus, the pointer rule and
 * the phone form in the Vue shell (`design/components/menubar.md`), as
 * `@polymorph/conformance/menubar` states them for every web shell.
 */
menubarLaw({
  shell: 'Vue',
  mount: ({ menus }) => mount(() => h(Menubar, { label: 'Document', menus })),
})
