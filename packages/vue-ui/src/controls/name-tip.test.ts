import { nameTipLaw } from '@polymorph/conformance/name-tip'

import { vueAdapter } from '../conformance/vue'

/** The name tip (`design/components/button.md`) in the Vue shell: the law every web shell runs. */
nameTipLaw({ shell: 'Vue', adapter: vueAdapter })
