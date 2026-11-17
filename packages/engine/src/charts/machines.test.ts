import { afterEach, describe, expect, it, vi } from 'vitest'

import { createBrush, type BrushOptions } from './brush'
import { readChartCap } from './cap'
import { measureBox, observeBox, sameBox } from './measured-box'
import { createReading, readingRest, readingView, type ReadingPosition } from './reading'
import { createSyncMember, syncGroupSize } from './sync'
import { createWarningLog } from './warnings'

/**
 * The frame's state machines, without a framework: what React's hooks and
 * every described member drive. The React members' tests cover the same
 * behaviour through the DOM; these cover each rule of the machines directly,
 * so a renderer that drives them gets the rule whatever it renders with.
 */

describe('the reading machine', () => {
  const positions = (reading: ReturnType<typeof createReading>) => {
    const seen: ReadingPosition[] = []
    reading.subscribe((now) => seen.push(now))
    return seen
  }

  it('lands the first arrow on an end, then steps and stops at the ends', () => {
    const reading = createReading({ count: 3 })
    expect(reading.key('ArrowRight')).toBe(true)
    expect(reading.now().index).toBe(0)
    reading.key('ArrowRight')
    reading.key('ArrowRight')
    reading.key('ArrowRight')
    expect(reading.now().index).toBe(2)

    const fromRest = createReading({ count: 3 })
    fromRest.key('ArrowLeft')
    expect(fromRest.now().index).toBe(2)
  })

  it('wraps past the ends when asked, and keeps Home and End', () => {
    const reading = createReading({ count: 3, wrap: true })
    reading.key('ArrowLeft')
    reading.key('ArrowRight')
    expect(reading.now().index).toBe(0)
    reading.key('ArrowLeft')
    expect(reading.now().index).toBe(2)
    reading.key('Home')
    expect(reading.now().index).toBe(0)
    reading.key('End')
    expect(reading.now().index).toBe(2)
  })

  it('walks the series with Up and Down only when asked and only while reading', () => {
    const still = createReading({ count: 3, seriesCount: 2 })
    still.key('ArrowRight')
    expect(still.key('ArrowDown')).toBe(false)

    const walk = createReading({ count: 3, seriesCount: 3, walkSeries: true })
    expect(walk.key('ArrowDown'), 'nothing is read yet').toBe(false)
    walk.key('ArrowRight')
    walk.key('ArrowUp')
    expect(walk.now().series, 'the first Up lands on the last series').toBe(2)
    walk.key('ArrowDown')
    walk.key('ArrowDown')
    expect(walk.now().series).toBe(2)
    walk.key('ArrowUp')
    expect(walk.now().series).toBe(1)
  })

  it('clears on Escape, and leaves Escape alone at rest', () => {
    const reading = createReading({ count: 3, seriesStart: 0 })
    expect(reading.key('Escape')).toBe(false)
    reading.key('ArrowRight')
    expect(reading.key('Escape')).toBe(true)
    expect(reading.now()).toEqual(readingRest(0))
  })

  it('ignores every key with no positions, and keys it does not own', () => {
    const reading = createReading({ count: 0 })
    expect(reading.key('ArrowRight')).toBe(false)
    expect(createReading({ count: 2 }).key('a')).toBe(false)
  })

  it('tells its listeners once per change, and never for a move to the same position', () => {
    const reading = createReading({ count: 5 })
    const seen = positions(reading)
    reading.moveTo(2)
    reading.moveTo(2)
    reading.moveTo(2, null)
    reading.clear()
    reading.clear()
    expect(seen).toEqual([
      { index: 2, series: null },
      { index: null, series: null },
    ])
  })

  it('passes the position before the change, so a listener can hear index moves alone', () => {
    const reading = createReading({ count: 4, seriesCount: 2, walkSeries: true })
    const moves: (number | null)[] = []
    reading.subscribe((now, was) => {
      if (now.index !== was.index) moves.push(now.index)
    })
    reading.key('ArrowRight')
    reading.key('ArrowDown')
    reading.key('ArrowRight')
    expect(moves).toEqual([0, 1])
  })

  it('reads the counts the latest update gives it', () => {
    const reading = createReading({ count: 2 })
    reading.update({ count: 4 })
    reading.key('End')
    expect(reading.now().index).toBe(3)
  })

  it('stops a listener that unsubscribes', () => {
    const reading = createReading({ count: 2 })
    const listener = vi.fn()
    const stop = reading.subscribe(listener)
    stop()
    reading.moveTo(1)
    expect(listener).not.toHaveBeenCalled()
  })

  it('shows a position clamped to the counts a render has', () => {
    expect(readingView({ index: 7, series: 4 }, 3, 2)).toEqual({
      index: 2,
      series: 1,
      active: true,
    })
    expect(readingView({ index: 1, series: null }, 0)).toEqual({
      index: 0,
      series: null,
      active: false,
    })
    expect(readingView(readingRest(), 3).active).toBe(false)
  })
})

describe('the brush machine', () => {
  const commits: [number, number][] = []
  const options = (overrides: Partial<BrushOptions> = {}): BrushOptions => ({
    enabled: true,
    count: 5,
    positions: [0, 10, 20, 30, 40],
    onCommit: (a, b) => commits.push([a, b]),
    ...overrides,
  })
  afterEach(() => {
    commits.length = 0
  })

  it('extends a range from the reading position with Shift+Arrows, and commits on Enter', () => {
    const reading = createReading({ count: 5 })
    const brush = createBrush(options())
    reading.moveTo(1)
    expect(brush.key('ArrowRight', true, reading)).toBe(true)
    expect(brush.key('ArrowRight', true, reading)).toBe(true)
    expect(brush.state()).toEqual(expect.objectContaining({ anchor: 1, edge: 3, committed: false }))
    expect(reading.now().index, 'the reading follows the moving edge').toBe(3)
    expect(brush.key('Enter', false, reading)).toBe(true)
    expect(commits).toEqual([[1, 3]])
    expect(brush.state()?.committed).toBe(true)
  })

  it('starts from an end when nothing is read, as the reading does', () => {
    const reading = createReading({ count: 5 })
    const brush = createBrush(options())
    brush.key('ArrowLeft', true, reading)
    expect(brush.state()).toEqual(expect.objectContaining({ anchor: 4, edge: 4 }))
  })

  it('takes Escape first while a range is on screen, and leaves the next one to the reading', () => {
    const reading = createReading({ count: 5 })
    const brush = createBrush(options())
    reading.moveTo(0)
    brush.key('ArrowRight', true, reading)
    expect(brush.key('Escape', false, reading)).toBe(true)
    expect(brush.state()).toBeNull()
    expect(brush.key('Escape', false, reading)).toBe(false)
  })

  it('does not commit an empty range, and does nothing when it is off', () => {
    const reading = createReading({ count: 5 })
    const brush = createBrush(options())
    expect(brush.key('Enter', false, reading)).toBe(false)
    const off = createBrush(options({ enabled: false }))
    reading.moveTo(1)
    expect(off.key('ArrowRight', true, reading)).toBe(false)
    expect(off.state()).toBeNull()
  })

  it('builds a range by dragging across rows, commits on release and swallows the click', () => {
    const brush = createBrush(options())
    brush.pointerDown(11)
    brush.pointerMove(12)
    expect(brush.state(), 'a press that has not crossed a row paints nothing').toBeNull()
    brush.pointerMove(29)
    expect(brush.state()).toEqual(expect.objectContaining({ anchor: 1, edge: 3 }))
    brush.pointerUp()
    expect(commits).toEqual([[1, 3]])
    expect(brush.consumeClick()).toBe(true)
    expect(brush.consumeClick()).toBe(false)
  })

  it('drops a drag that returns to its anchor, and a press that never moved', () => {
    const brush = createBrush(options())
    brush.pointerDown(10)
    brush.pointerMove(30)
    brush.pointerMove(10)
    brush.pointerUp()
    expect(brush.state()).toBeNull()
    brush.pointerDown(10)
    brush.pointerUp()
    expect(commits).toEqual([])
    expect(brush.consumeClick()).toBe(false)
  })

  it('clears an open range on blur and keeps a committed one', () => {
    const reading = createReading({ count: 5 })
    const brush = createBrush(options())
    reading.moveTo(0)
    brush.key('ArrowRight', true, reading)
    brush.blur()
    expect(brush.state()).toBeNull()
    brush.key('ArrowRight', true, reading)
    brush.key('Enter', false, reading)
    brush.blur()
    expect(brush.state()?.committed).toBe(true)
  })

  it('reads a range built on other data as none', () => {
    const reading = createReading({ count: 5 })
    const brush = createBrush(options())
    reading.moveTo(0)
    brush.key('ArrowRight', true, reading)
    expect(brush.state(4), 'a render with four rows').toBeNull()
    brush.update(options({ count: 4 }))
    expect(brush.state()).toBeNull()
  })

  it('tells its listeners about each change', () => {
    const reading = createReading({ count: 5 })
    const brush = createBrush(options())
    const listener = vi.fn()
    brush.subscribe(listener)
    brush.key('ArrowRight', true, reading)
    brush.key('Escape', false, reading)
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('tells its listeners nothing for a drag that stays on the same row', () => {
    const brush = createBrush(options())
    const listener = vi.fn()
    brush.subscribe(listener)
    brush.pointerDown(10)
    brush.pointerMove(30)
    const range = brush.state()
    brush.pointerMove(31)
    brush.pointerMove(29)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(brush.state(), 'the range on screen is the same value').toBe(range)
    brush.pointerMove(40)
    expect(listener).toHaveBeenCalledTimes(2)
    expect(brush.state()).toEqual(expect.objectContaining({ anchor: 1, edge: 4 }))
  })
})

describe('the sync registry', () => {
  it('sends a value to every other member and never back to the sender', () => {
    const heard: (number | null)[] = []
    const echoed: (number | null)[] = []
    const sender = createSyncMember((value) => echoed.push(value))
    const receiver = createSyncMember((value) => heard.push(value))
    sender.join('pair')
    receiver.join('pair')
    expect(syncGroupSize('pair')).toBe(2)
    sender.broadcast(42)
    sender.broadcast(null)
    expect(heard).toEqual([42, null])
    expect(echoed).toEqual([])
    sender.leave()
    receiver.leave()
  })

  it('leaves the group and removes the empty group from the registry', () => {
    const member = createSyncMember(() => undefined)
    member.join('solo')
    expect(syncGroupSize('solo')).toBe(1)
    member.leave()
    expect(syncGroupSize('solo')).toBe(0)
  })

  it('joins nothing without an id, and broadcasts nowhere', () => {
    const heard = vi.fn()
    const sender = createSyncMember(() => undefined)
    const other = createSyncMember(heard)
    sender.join(undefined)
    other.join(undefined)
    sender.broadcast(1)
    sender.broadcast(null)
    expect(heard).not.toHaveBeenCalled()
  })

  it('moves to another group when the id changes', () => {
    const member = createSyncMember(() => undefined)
    member.join('one')
    member.join('two')
    expect(syncGroupSize('one')).toBe(0)
    expect(syncGroupSize('two')).toBe(1)
    member.leave()
  })

  it('skips a member whose element is out of the document, and reaches it when it returns', () => {
    const element = document.createElement('div')
    document.body.append(element)
    const heard = vi.fn()
    const sender = createSyncMember(() => undefined)
    const receiver = createSyncMember(heard)
    sender.join('page')
    receiver.join('page', element)
    element.remove()
    sender.broadcast(3)
    expect(heard).not.toHaveBeenCalled()
    expect(syncGroupSize('page'), 'a detached member stays in its group').toBe(2)

    // Attached again, as a kept-alive chart is: the same join changes nothing, and it hears again.
    document.body.append(element)
    receiver.join('page', element)
    expect(syncGroupSize('page')).toBe(2)
    sender.broadcast(4)
    expect(heard).toHaveBeenCalledExactlyOnceWith(4)

    receiver.leave()
    sender.leave()
    expect(syncGroupSize('page')).toBe(0)
    element.remove()
  })
})

describe('the measured box', () => {
  const sized = (width: number, height: number, parent: HTMLElement = document.body) => {
    const element = document.createElement('div')
    element.style.width = `${width}px`
    element.style.height = `${height}px`
    parent.append(element)
    return element
  }

  it('measures in whole pixels, so hairlines land on the pixel grid', () => {
    // At the page's origin, so the browser's rounding of the box is not moved by its position.
    const element = sized(100.4, 50.6)
    element.style.position = 'fixed'
    element.style.inset = '0 auto auto 0'
    expect(measureBox(element)).toEqual({ width: 100, height: 51 })
    element.remove()
  })

  it('measures the layout box, which an ancestor’s transform does not change', async () => {
    const scaled = document.createElement('div')
    scaled.style.transform = 'scale(0.5)'
    document.body.append(scaled)
    const element = sized(80, 40, scaled)
    expect(element.getBoundingClientRect().width, 'the drawn box is scaled').toBe(40)
    expect(measureBox(element)).toEqual({ width: 80, height: 40 })

    const boxes: { width: number; height: number }[] = []
    const release = observeBox(element, (box) => boxes.push(box))
    scaled.style.transform = 'scale(0.94)'
    element.style.width = '120px'
    await vi.waitFor(() => expect(boxes.at(-1)).toEqual({ width: 120, height: 40 }))
    expect(boxes).toEqual([
      { width: 80, height: 40 },
      { width: 120, height: 40 },
    ])
    release()
    scaled.remove()
  })

  it('keeps the box it had when a measurement repeats it', () => {
    const element = sized(80, 40)
    const first = measureBox(element)
    expect(measureBox(element, first)).toBe(first)
    expect(sameBox(first, { width: 80, height: 40 })).toBe(true)
    expect(sameBox(first, null)).toBe(false)
    element.remove()
  })

  it('measures at once and again on a resize, until released', async () => {
    const element = sized(80, 40)
    const boxes: { width: number; height: number }[] = []
    const release = observeBox(element, (box) => boxes.push(box))
    expect(boxes).toEqual([{ width: 80, height: 40 }])
    element.style.width = '120px'
    await vi.waitFor(() => expect(boxes.at(-1)).toEqual({ width: 120, height: 40 }))
    release()
    element.style.width = '160px'
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(boxes.at(-1)).toEqual({ width: 120, height: 40 })
    element.remove()
  })
})

describe('the warning log', () => {
  it('logs a message when it enters the list, and again only after it has left', () => {
    const log = createWarningLog()
    const said: string[] = []
    const warn = (message: string) => said.push(message)
    log.log(['one'], warn)
    log.log(['one', 'two'], warn)
    log.log(['two', 'one', 'one'], warn)
    expect(said).toEqual(['one', 'two'])
    log.log(['two'], warn)
    log.log(['one', 'two'], warn)
    expect(said).toEqual(['one', 'two', 'one'])
  })

  it('keeps one memory per log', () => {
    const said: string[] = []
    const warn = (message: string) => said.push(message)
    createWarningLog().log(['shared'], warn)
    createWarningLog().log(['shared'], warn)
    expect(said).toEqual(['shared', 'shared'])
  })
})

describe('the series cap', () => {
  it('reads the palette’s cap from the element, and null where none is set', () => {
    const element = document.createElement('div')
    document.body.append(element)
    expect(readChartCap(element)).toBeNull()
    element.style.setProperty('--pm-chart-cap', '3')
    expect(readChartCap(element)).toBe(3)
    element.style.setProperty('--pm-chart-cap', '0')
    expect(readChartCap(element)).toBeNull()
    element.remove()
  })
})
