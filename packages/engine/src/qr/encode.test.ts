import { describe, expect, it } from 'vitest'

import {
  encodeQr,
  QR_QUIET_ZONE,
  QrCapacityError,
  qrByteCapacity,
  qrPath,
  qrSymbol,
  type QrSymbol,
} from './encode'

/**
 * Golden tests for the encoder.
 *
 * A symbol one module wrong in a correction block still *looks* right but does
 * not scan, so checking by eye proves nothing. These digests pin matrices that
 * match an independent reference encoder module for module, across every
 * version × correction level, every mask, and multi-byte UTF-8. A change to the
 * tables, interleave, zigzag or format bits fails a named cell.
 */

/** FNV-1a over the modules, row-major. A digest, not a security hash. */
function digest(symbol: QrSymbol): string {
  let hash = 0x811c9dc5
  for (const row of symbol.modules) {
    for (const module of row) {
      hash ^= module ? 1 : 0
      hash = Math.imul(hash, 0x01000193) >>> 0
    }
  }
  return hash.toString(16).padStart(8, '0')
}

/** Fills a version nearly to capacity, exercising padding, block splitting and interleave. */
function payloadFor(version: number, level: 'L' | 'M' | 'Q' | 'H'): string {
  const length = Math.max(1, qrByteCapacity(version, level) - (version % 3))
  let text = ''
  for (let i = 0; i < length; i += 1) text += String.fromCharCode(33 + ((i * 7 + version) % 90))
  return text
}

/** `mask:digest` per `version` + `level`; versions chosen for what changes at each (below). */
const GOLDEN: Record<string, string> = {
  // 1: no alignment pattern · 2: the first one · 6: the last version without version information
  '1L': '4:cdd18f0f',
  '1M': '4:f5a934f3',
  '1Q': '2:88395e25',
  '1H': '6:791876bb',
  '2L': '3:6088b4a5',
  '2M': '4:ded86431',
  '2Q': '0:b284a9e3',
  '2H': '2:01694b61',
  '6L': '7:e746007f',
  '6M': '3:0ed7342b',
  '6Q': '5:93fff376',
  '6H': '6:57c17697',
  // 7: version information appears · 10: the count field widens to sixteen bits
  '7L': '3:a27b4a83',
  '7M': '6:c3bb2daf',
  '7Q': '3:453b55fb',
  '7H': '2:b0c38a31',
  '10L': '3:ca88fecd',
  '10M': '2:d0fb1681',
  '10Q': '3:f6c34f29',
  '10H': '6:421ed7b5',
  // 14, 21, 27: long and short blocks mixed · 32: the one irregular alignment step · 40: the ceiling
  '14L': '2:7dce3a7b',
  '14M': '2:5f46efe5',
  '14Q': '3:bf9a20ff',
  '14H': '6:d8bec7e3',
  '21L': '2:543c9d39',
  '21M': '2:236ffe61',
  '21Q': '6:0d88b27b',
  '21H': '4:259caed3',
  '27L': '4:d45f8b2d',
  '27M': '2:c7847ecd',
  '27Q': '5:985338c0',
  '27H': '3:769cae71',
  '32L': '2:3d6cb78c',
  '32M': '4:2e456a4c',
  '32Q': '4:be81be98',
  '32H': '1:dc08dc78',
  '40L': '2:bf1aa0c9',
  '40M': '2:18912c27',
  '40Q': '5:3decf70b',
  '40H': '5:cc7d5707',
}

describe('the symbol, against reference matrices', () => {
  for (const [cell, expected] of Object.entries(GOLDEN)) {
    it(`version ${cell.slice(0, -1)}, level ${cell.slice(-1)}`, () => {
      const version = Number(cell.slice(0, -1))
      const level = cell.slice(-1) as 'L' | 'M' | 'Q' | 'H'
      const symbol = encodeQr(payloadFor(version, level), level, { minVersion: version })

      expect(symbol.version).toBe(version)
      expect(symbol.size).toBe(version * 4 + 17)
      expect(`${symbol.mask}:${digest(symbol)}`).toBe(expected)
    })
  }

  it('draws a whole symbol a person can check by eye', () => {
    const symbol = encodeQr('polymorph', 'M')
    expect(symbol.version).toBe(1)
    expect(symbol.mask).toBe(1)
    expect(symbol.modules.map((row) => row.map((dark) => (dark ? '#' : '.')).join(''))).toEqual([
      '#######.###.#.#######',
      '#.....#..##.#.#.....#',
      '#.###.#.#..##.#.###.#',
      '#.###.#...#.#.#.###.#',
      '#.###.#..####.#.###.#',
      '#.....#.#####.#.....#',
      '#######.#.#.#.#######',
      '.........##.#........',
      '#.#...##.#.....#..#.#',
      '...#.....###...####.#',
      '#.######.######.#...#',
      '.#..#...#.##.#..##...',
      '.#.#####.#.###.###.##',
      '........#.....#######',
      '#######.##...##.###.#',
      '#.....#...#.#..###.#.',
      '#.###.#..#...##....#.',
      '#.###.#...##.##.#.#..',
      '#.###.#.#..###..#.###',
      '#.....#..#.#.###.#...',
      '#######.#######..#..#',
    ])
  })
})

describe('capacity', () => {
  it('matches the standard’s byte-mode table at the corners', () => {
    const at = (version: number) =>
      (['L', 'M', 'Q', 'H'] as const).map((level) => qrByteCapacity(version, level))
    expect(at(1)).toEqual([17, 14, 11, 7])
    expect(at(9)).toEqual([230, 180, 130, 98])
    // Version 10 spends a second byte on the count field.
    expect(at(10)).toEqual([271, 213, 151, 119])
    expect(at(40)).toEqual([2953, 2331, 1663, 1273])
  })

  it('grows the version to fit, and no further', () => {
    expect(encodeQr('x'.repeat(14), 'M').version).toBe(1)
    expect(encodeQr('x'.repeat(15), 'M').version).toBe(2)
  })

  it('counts bytes, not characters', () => {
    // Seven characters, fourteen bytes of UTF-8: the last payload version 1-M holds.
    expect(encodeQr('ééééééé', 'M').version).toBe(1)
    expect(encodeQr('éééééééé', 'M').version).toBe(2)
  })

  it('throws for a payload too large for any version, rather than truncating it', () => {
    expect(() => encodeQr('x'.repeat(2954), 'L')).toThrow(QrCapacityError)
    expect(encodeQr('x'.repeat(2953), 'L').version).toBe(40)
  })

  it('has no symbol for a payload too large for any version, so a member draws nothing', () => {
    expect(qrSymbol('x'.repeat(2954), 'L')).toBeNull()
    expect(qrSymbol('x'.repeat(2953), 'L')?.version).toBe(40)
  })
})

describe('the path', () => {
  it('draws exactly the dark modules, offset by the quiet zone', () => {
    const symbol = encodeQr('polymorph', 'M')
    const path = qrPath(symbol, QR_QUIET_ZONE)

    // The first row opens with a finder's seven-module bar, four modules in.
    expect(path.startsWith('M4 4h7v1h-7z')).toBe(true)

    // Area is conserved: the runs cover as many modules as the symbol has dark.
    const drawn = [...path.matchAll(/h(\d+)v1/g)].reduce((sum, run) => sum + Number(run[1]), 0)
    const dark = symbol.modules.flat().filter(Boolean).length
    expect(drawn).toBe(dark)
  })
})
