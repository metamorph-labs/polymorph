import { nameTipLaw } from '@polymorph/conformance/name-tip'

import { solidAdapter } from '../conformance/solid'

/** The name tip (`design/components/button.md`) in the Solid shell: the law every web shell runs. */
nameTipLaw({ shell: 'Solid', adapter: solidAdapter })
