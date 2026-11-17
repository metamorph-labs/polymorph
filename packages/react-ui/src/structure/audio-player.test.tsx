import { render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { assertGoverned } from '@polymorph/react'
import { audioPlayerLaw, silentRecording } from '@polymorph/conformance/audio-player'
import { createAgentBridge } from '@polymorph/engine/agent'
import { installTestTheme } from '@polymorph/engine/testing'
import { AudioPlayer, type AudioPlayerMessages, type AudioPlayerProps } from './AudioPlayer'
import { tokenColor } from '../controls/token-probe'

/**
 * AudioPlayer with real recordings. What every web shell's player does with
 * one is the law `@polymorph/conformance/audio-player` states, which this file
 * calls for the React shell. The rest is what a React render can show at once:
 * the app's length before the file is read, the words in another locale, and
 * the recipe.
 */

beforeAll(installTestTheme)

audioPlayerLaw({
  shell: 'React',
  async mount(props) {
    render(<AudioPlayer {...props} />)
  },
})

const player = () =>
  document.querySelector<HTMLElement>('[data-member="audio-player"]') as HTMLElement
const time = () =>
  player().querySelector<HTMLElement>('[data-audio-player-part="time"]') as HTMLElement

describe('the closed surface', () => {
  it('has no style escape hatch', () => {
    assertGoverned<AudioPlayerProps>(true)
  })
})

describe('the length', () => {
  it('shows the app’s length in the first render, before the file is read', () => {
    // React renders at once, and the file is read in a later task, so this
    // render can only have the app's length.
    render(<AudioPlayer src={silentRecording(2)} duration={65} label="Voice message from Ada" />)
    expect(time().textContent?.replace(/\s/g, '')).toBe('0:00/1:05')
    expect(screen.getByRole('slider').getAttribute('aria-valuemax')).toBe('65')
  })

  it('shows the elapsed time alone, with the scrubber disabled, while no length is known', () => {
    render(<AudioPlayer src={silentRecording(2)} label="Voice message from Ada" />)
    expect(time().textContent).toBe('0:00')
    expect(screen.getByRole('slider').getAttribute('aria-disabled') ?? 'true').toBe('true')
    expect(screen.getByRole('slider').getAttribute('aria-valuetext')).toBe('0 seconds')
  })
})

describe('the words', () => {
  const german: AudioPlayerMessages = {
    play: 'Abspielen',
    pause: 'Pause',
    scrubber: 'Wiedergabeposition',
    position: (elapsed, total) => `${elapsed} von ${total}`,
    failed: 'Die Aufnahme konnte nicht geladen werden',
  }

  it('writes every word it says from messages, and the lengths in the locale', () => {
    render(
      <AudioPlayer
        src={silentRecording(2)}
        duration={65}
        label="Sprachnachricht von Ada"
        locale="de-DE"
        messages={german}
      />,
    )
    expect(screen.getByRole('button', { name: 'Abspielen' })).toBeTruthy()
    const scrubber = screen.getByRole('slider', { name: 'Wiedergabeposition' })
    // The word that joins a list of units is the engine's own CLDR data, which
    // differs between engines, so only the units and the catalog's word are read.
    const spoken = scrubber.getAttribute('aria-valuetext') ?? ''
    expect(spoken.startsWith('0 Sekunden von 1 Minute')).toBe(true)
    expect(spoken.endsWith('5 Sekunden')).toBe(true)
  })

  it('says the failure in the words it was given', async () => {
    render(<AudioPlayer src="" label="Sprachnachricht von Ada" locale="de-DE" messages={german} />)
    await vi.waitFor(() =>
      expect(player().textContent).toContain('Die Aufnahme konnte nicht geladen werden'),
    )
  })
})

describe('recipe', () => {
  it('draws the time in secondary text, with the theme’s figures', () => {
    render(<AudioPlayer src={silentRecording(2)} duration={2} label="Voice message from Ada" />)
    const style = getComputedStyle(time())
    expect(style.color).toBe(tokenColor('--pm-text-secondary'))
    expect(style.whiteSpace).toBe('nowrap')
  })

  it('draws the failure’s glyph in the danger text colour', () => {
    render(<AudioPlayer src="" label="Voice message from Ada" />)
    const glyph = player().querySelector<HTMLElement>(
      '[data-audio-player-part="failure"] [aria-hidden="true"]',
    ) as HTMLElement
    expect(getComputedStyle(glyph).color).toBe(tokenColor('--pm-danger-text'))
  })

  it('draws no surface of its own', () => {
    render(<AudioPlayer src={silentRecording(2)} duration={2} label="Voice message from Ada" />)
    const style = getComputedStyle(player())
    expect(style.backgroundColor).toBe('rgba(0, 0, 0, 0)')
    expect(style.borderTopStyle).toBe('none')
  })
})

/**
 * An agent reads a player through the bridge, as the spec's `agent` fence declares
 * (`design/components/audio-player.md`, Agent). A recording plays from a person's press, so the
 * player runs nothing and withholds its Button and its scrubber.
 */
describe('an agent', () => {
  it('reads the player, lists no part of it, and runs nothing', async () => {
    const bridge = createAgentBridge()
    try {
      render(<AudioPlayer src={silentRecording(2)} duration={65} label="Voice message from Ada" />)
      const { members } = bridge.snapshot()
      expect(members.map((member) => member.member)).toEqual(['AudioPlayer'])
      expect(members[0]).toMatchObject({
        name: 'Voice message from Ada',
        state: { playing: false, failed: false, position: 0 },
        actions: [],
      })
      const { results } = await bridge.act([{ id: members[0]?.id, action: 'play' }])
      expect(results[0]).toMatchObject({ ok: false, error: { code: 'not-allowed', allowed: [] } })
    } finally {
      bridge.dispose()
    }
  })

  it('reads a player that failed to load', () => {
    const bridge = createAgentBridge()
    try {
      render(<AudioPlayer src="" label="Voice message from Ada" />)
      const [player] = bridge.snapshot().members
      expect(player?.state).toMatchObject({ failed: true, duration: 0 })
    } finally {
      bridge.dispose()
    }
  })
})
