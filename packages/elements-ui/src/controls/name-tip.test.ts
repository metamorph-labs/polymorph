import { nameTipLaw } from '@polymorph/conformance/name-tip'

import { elementsAdapter } from '../conformance/elements'

/** The name tip (`design/components/button.md`) in the elements shell: the law every web shell runs. */
nameTipLaw({ shell: 'elements', adapter: elementsAdapter })
