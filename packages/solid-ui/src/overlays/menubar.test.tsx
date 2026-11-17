import { menubarLaw } from '@polymorph/conformance/menubar'

import { mount } from '../mount'
import Menubar from './Menubar'

/**
 * Menubar's keys, its tab stop, the hand-off between menus, the pointer rule and
 * the phone form in the Solid shell (`design/components/menubar.md`), as
 * `@polymorph/conformance/menubar` states them for every web shell.
 */
menubarLaw({
  shell: 'Solid',
  mount: ({ menus }) => mount(() => <Menubar label="Document" menus={menus} />),
})
