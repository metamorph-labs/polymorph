import { audioPlayerLaw } from '@polymorph/conformance/audio-player'

import { render } from '../mount'
import AudioPlayer from './AudioPlayer.svelte'

/**
 * What an AudioPlayer does with a real recording, in the Svelte shell
 * (`design/components/audio-player.md`, Behaviour), as
 * `@polymorph/conformance/audio-player` states it for every web shell.
 */
audioPlayerLaw({
  shell: 'Svelte',
  mount: (props) => render(AudioPlayer, props),
})
