import { richTextInputLaw } from '@polymorph/conformance/rich-text-input'

import { svelteAdapter } from '../conformance/svelte'

/**
 * What RichTextInput adds to the editor it mounts, in the Svelte shell: the
 * document it draws and reports, the toolbar's formats and their words, the
 * link form, the text style Menu, a suggestion's pick, the selection bar, the
 * handle the app's slots receive and a submit, as
 * `@polymorph/conformance/rich-text-input` states them for every web shell.
 */
richTextInputLaw({ shell: 'Svelte', adapter: svelteAdapter })
