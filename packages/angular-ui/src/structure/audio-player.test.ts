import type { OutputEmitterRef } from '@angular/core'

import { audioPlayerLaw } from '@polymorph/conformance/audio-player'

import { mountComponent } from '../mount'
import { AudioPlayer } from './AudioPlayer'

/**
 * What an AudioPlayer does with a real recording, in the Angular shell
 * (`design/components/audio-player.md`, Behaviour), as
 * `@polymorph/conformance/audio-player` states it for every web shell. The
 * law's handlers are the component's outputs, so the test subscribes to them.
 */
audioPlayerLaw({
  shell: 'Angular',
  async mount({ onPlay, onEnded, ...inputs }) {
    const { ref } = await mountComponent(AudioPlayer, { ...inputs })
    const player = ref.instance as {
      onPlay: OutputEmitterRef<void>
      onEnded: OutputEmitterRef<void>
    }
    if (onPlay !== undefined) player.onPlay.subscribe(onPlay)
    if (onEnded !== undefined) player.onEnded.subscribe(onEnded)
  },
})
