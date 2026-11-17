import { audioPlayerLaw } from '@polymorph/conformance/audio-player'

import { mountElement } from '../mount'
import './AudioPlayer'

/**
 * What an AudioPlayer does with a real recording, as
 * `@polymorph/conformance/audio-player` states it for every shell.
 * The element is made with the law's props, as a page's script makes one.
 */
audioPlayerLaw({
  shell: 'Elements',
  mount: (props) => mountElement('poly-audio-player', props),
})
