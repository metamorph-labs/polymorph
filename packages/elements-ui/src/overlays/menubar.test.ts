import { menubarLaw } from '@polymorph/conformance/menubar'

import { mountElement } from '../mount'
import './Menubar'

/**
 * Menubar's keys along its row, the hand-off between its menus, its pointer rule
 * and its phone form, as `@polymorph/conformance/menubar` states them for every
 * shell. The menus are set as a property, with the law's callbacks in them.
 */
menubarLaw({
  shell: 'Elements',
  mount: ({ menus }) => mountElement('poly-menubar', { label: 'Document', menus }),
})
