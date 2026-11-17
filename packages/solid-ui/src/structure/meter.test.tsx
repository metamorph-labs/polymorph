import { meterLaw } from '@polymorph/conformance/meter'

import { mount } from '../mount'
import Meter from './Meter'

/**
 * What a Meter says and draws in the Solid shell (`design/components/meter.md`),
 * as `@polymorph/conformance/meter` states it for every web shell.
 */
meterLaw({
  shell: 'Solid',
  mount: (props) => mount(() => <Meter {...props} />),
})
