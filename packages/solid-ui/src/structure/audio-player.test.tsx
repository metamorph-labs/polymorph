import { audioPlayerLaw } from '@polymorph/conformance/audio-player'

import { mount } from '../mount'
import AudioPlayer from './AudioPlayer'

/**
 * What an AudioPlayer does with a real recording, in the Solid shell
 * (`design/components/audio-player.md`, Behaviour), as
 * `@polymorph/conformance/audio-player` states it for every web shell.
 */
audioPlayerLaw({
  shell: 'Solid',
  mount: (props) => mount(() => <AudioPlayer {...props} />),
})
