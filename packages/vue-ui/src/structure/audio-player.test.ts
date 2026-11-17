import { h } from 'vue'

import { audioPlayerLaw } from '@polymorph/conformance/audio-player'

import { mount } from '../mount'
import AudioPlayer from './AudioPlayer.vue'

/**
 * What an AudioPlayer does with a real recording, in the Vue shell
 * (`design/components/audio-player.md`, Behaviour), as
 * `@polymorph/conformance/audio-player` states it for every web shell.
 */
audioPlayerLaw({
  shell: 'Vue',
  mount: (props) => mount(() => h(AudioPlayer, props)),
})
