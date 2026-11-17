import { afterEach, describe, expect, it, vi } from 'vitest'

import { clockTime, pauseOtherPlayers, spokenDuration } from './audio'

/**
 * The clock, the spoken length and the one-at-a-time rule that every
 * framework's AudioPlayer uses. The members' own tests play real recordings;
 * these pin the rules themselves.
 */

describe('clockTime', () => {
  it('writes minutes and two-digit seconds', () => {
    expect(clockTime(0, 'en-US')).toBe('0:00')
    expect(clockTime(5, 'en-US')).toBe('0:05')
    expect(clockTime(65, 'en-US')).toBe('1:05')
    expect(clockTime(600, 'en-US')).toBe('10:00')
  })

  it('puts the hours in front from an hour on, and pads the minutes then', () => {
    expect(clockTime(3599, 'en-US')).toBe('59:59')
    expect(clockTime(3600, 'en-US')).toBe('1:00:00')
    expect(clockTime(3725, 'en-US')).toBe('1:02:05')
  })

  it('drops the fraction, so the clock moves once a second', () => {
    expect(clockTime(12.9, 'en-US')).toBe('0:12')
  })

  it('reads a value that is not a length as no time', () => {
    expect(clockTime(Number.NaN, 'en-US')).toBe('0:00')
    expect(clockTime(Number.POSITIVE_INFINITY, 'en-US')).toBe('0:00')
    expect(clockTime(-4, 'en-US')).toBe('0:00')
  })

  it('writes the digits in the locale’s own numerals', () => {
    expect(clockTime(65, 'ar-EG')).toBe('١:٠٥')
  })
})

describe('spokenDuration', () => {
  it('says each unit that is not zero, in the locale’s words', () => {
    expect(spokenDuration(5, 'en-US')).toBe('5 seconds')
    expect(spokenDuration(60, 'en-US')).toBe('1 minute')
    expect(spokenDuration(65, 'en-US')).toBe('1 minute, 5 seconds')
    expect(spokenDuration(3725, 'en-US')).toBe('1 hour, 2 minutes, 5 seconds')
  })

  it('says no length as zero seconds', () => {
    expect(spokenDuration(0, 'en-US')).toBe('0 seconds')
    expect(spokenDuration(0.4, 'en-US')).toBe('0 seconds')
  })

  it('takes its words from the locale, not from the vocabulary', () => {
    expect(spokenDuration(65, 'de-DE')).toContain('Minute')
    expect(spokenDuration(65, 'de-DE')).toContain('Sekunden')
  })
})

describe('pauseOtherPlayers', () => {
  const hosts: HTMLElement[] = []

  afterEach(() => {
    for (const host of hosts.splice(0)) host.remove()
  })

  /** An audio element inside an element that carries `member`, playing or not. */
  function audioIn(member: string | null, playing: boolean) {
    const host = document.createElement('div')
    if (member !== null) host.dataset['member'] = member
    const audio = document.createElement('audio')
    Object.defineProperty(audio, 'paused', { value: !playing })
    const pause = vi.spyOn(audio, 'pause').mockImplementation(() => {})
    host.append(audio)
    document.body.append(host)
    hosts.push(host)
    return { audio, pause }
  }

  it('pauses every other AudioPlayer that is playing', () => {
    const starting = audioIn('audio-player', true)
    const playing = audioIn('audio-player', true)
    const paused = audioIn('audio-player', false)

    pauseOtherPlayers(starting.audio)

    expect(starting.pause).not.toHaveBeenCalled()
    expect(playing.pause).toHaveBeenCalledTimes(1)
    expect(paused.pause).not.toHaveBeenCalled()
  })

  it('leaves media the application plays itself alone', () => {
    const starting = audioIn('audio-player', true)
    const own = audioIn(null, true)

    pauseOtherPlayers(starting.audio)

    expect(own.pause).not.toHaveBeenCalled()
  })
})
