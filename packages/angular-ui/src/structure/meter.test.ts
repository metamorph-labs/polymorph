import { meterLaw } from '@polymorph/conformance/meter'

import { mountComponent } from '../mount'
import { Meter } from './Meter'

/**
 * What a Meter says and draws in the Angular shell
 * (`design/components/meter.md`), as `@polymorph/conformance/meter` states it
 * for every web shell.
 */
meterLaw({
  shell: 'Angular',
  // A prop the law leaves out is an input the test does not set.
  mount: (props) => mountComponent(Meter, { ...props }),
})
