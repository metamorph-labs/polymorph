import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { countdownLaw } from '@polymorph/conformance/countdown'

import { mount } from '../mount'
import Countdown from './Countdown.vue'

/**
 * What a Countdown draws, when it changes and what it reports, in the Vue
 * shell (`design/components/countdown.md`), as `@polymorph/conformance/countdown`
 * states it for every web shell. After it, a server render hydrated later.
 */
countdownLaw({
  shell: 'Vue',
  mount: (props) => mount(() => h(Countdown, props)),
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('Countdown — a server render, hydrated later', () => {
  const NOW = new Date(2026, 7, 7, 12, 0, 0).getTime()

  const frames = async (count = 3) => {
    for (let index = 0; index < count; index += 1) {
      await new Promise<void>((settle) => requestAnimationFrame(() => settle()))
    }
  }

  const digits = (host: Element) =>
    host.querySelector('[data-member="countdown"] [aria-hidden="true"]')?.textContent?.trim()

  it('draws the browser’s time left once hydrated, and the end it reached before', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    vi.setSystemTime(NOW)
    const onEnd = vi.fn()
    const app = (until: number) =>
      createSSRApp({
        render: () =>
          h(Countdown, {
            until: new Date(NOW + until).toISOString(),
            label: 'Code',
            locale: 'en-US',
            onEnd,
          }),
      })
    // Every message Vue reports while it hydrates: none, because the member allows its time to
    // differ from the server's.
    const reported: unknown[][] = []
    vi.spyOn(console, 'warn').mockImplementation((...args) => void reported.push(args))
    vi.spyOn(console, 'error').mockImplementation((...args) => void reported.push(args))

    const host = document.createElement('div')
    host.innerHTML = await renderToString(app(10_000))
    document.body.append(host)
    expect(digits(host)).toBe('0:10')
    vi.setSystemTime(NOW + 3_500)
    const client = app(10_000)
    client.mount(host)
    await frames()
    expect(digits(host)).toBe('0:07')
    client.unmount()

    vi.setSystemTime(NOW)
    host.innerHTML = await renderToString(app(1_000))
    expect(digits(host)).toBe('0:01')
    vi.setSystemTime(NOW + 3_000)
    const ended = app(1_000)
    ended.mount(host)
    await frames()
    expect(digits(host)).toBe('0:00')
    expect(host.querySelector('[data-ended]')).not.toBeNull()
    expect(onEnd).toHaveBeenCalledTimes(1)
    expect(reported).toEqual([])
    ended.unmount()
    host.remove()
  })
})
