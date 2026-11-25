import { nameTipLaw } from '@polymorph/conformance/name-tip'

import { svelteAdapter } from '../conformance/svelte'

/** The name tip (`design/components/button.md`) in the Svelte shell: the law every web shell runs. */
nameTipLaw({ shell: 'Svelte', adapter: svelteAdapter })
