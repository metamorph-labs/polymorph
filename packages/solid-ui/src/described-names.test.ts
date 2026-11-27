import { describedNamesLaw } from '@polymorph/conformance/described-names'

import { solidAdapter } from './conformance/solid'

/**
 * The names this shell's members give in their own words where the React
 * member takes a name from React Aria: Command's list, ColorInput's sliders and
 * PhoneInput's list of countries, as `@polymorph/conformance/described-names`
 * states them for every generated shell.
 */
describedNamesLaw({ shell: 'Solid', adapter: solidAdapter })
