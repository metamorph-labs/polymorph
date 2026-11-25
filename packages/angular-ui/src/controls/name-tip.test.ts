import { nameTipLaw } from '@polymorph/conformance/name-tip'

import { angularAdapter } from '../conformance/angular'

/** The name tip (`design/components/button.md`) in the Angular shell: the law every web shell runs. */
nameTipLaw({ shell: 'Angular', adapter: angularAdapter })
