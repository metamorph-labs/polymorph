/**
 * The QR Code symbol, as data (`design/components/qr-code.md`).
 *
 * ISO/IEC 18004 Model 2, byte mode, versions 1–40, all four correction levels:
 * all `QRCode` needs, with no option that could produce an unreadable symbol.
 * Byte mode only, because numeric and alphanumeric modes only shrink payloads
 * this vocabulary does not draw (`otpauth://` URIs, deep links and pairing
 * tokens are mixed-case), and a segment optimiser is the most error-prone part.
 *
 * Written here, not installed: a few hundred lines of table-driven arithmetic
 * from a published standard, with no new dependency, and a symbol is computed
 * geometry, as chart marks are. `encode.test.ts` pins it to reference
 * matrices.
 *
 * Pure: no DOM and no framework, so every framework's QRCode draws the same
 * modules. `true` is a dark module.
 */

export type QrErrorCorrection = 'L' | 'M' | 'Q' | 'H'

export interface QrSymbol {
  /** 1–40. */
  version: number
  /** Modules per side: `version * 4 + 17`, excluding the quiet zone the renderer adds. */
  size: number
  /** 0–7, the mask the penalty rules chose (or the one that was forced). */
  mask: number
  /** `modules[y][x]`. */
  modules: readonly (readonly boolean[])[]
}

export interface QrEncodeOptions {
  /** A minimum version; the symbol still grows past it when the payload needs more room. */
  minVersion?: number
  /** Skips the penalty search. For tests and reference comparison; a screen never forces one. */
  mask?: number
}

/** The payload does not fit the largest symbol at this correction level. */
export class QrCapacityError extends Error {
  constructor(bytes: number, level: QrErrorCorrection) {
    super(
      `polymorph: ${bytes} bytes do not fit a version-40 QR symbol at correction level ${level}`,
    )
    this.name = 'QrCapacityError'
  }
}

const MIN_VERSION = 1
const MAX_VERSION = 40

/* prettier-ignore */
const ECC_CODEWORDS_PER_BLOCK: Record<QrErrorCorrection, readonly number[]> = {
  L: [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  M: [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  Q: [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  H: [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
}

/* prettier-ignore */
const ERROR_CORRECTION_BLOCKS: Record<QrErrorCorrection, readonly number[]> = {
  L: [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  M: [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  Q: [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  H: [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
}

/** The format information's two-bit indicator, in the standard's (non-alphabetical) order. */
const FORMAT_BITS: Record<QrErrorCorrection, number> = { L: 1, M: 0, Q: 3, H: 2 }

/** Every module that is not a function pattern, before any codewords are subtracted. */
function rawDataModules(version: number): number {
  let result = (16 * version + 128) * version + 64
  if (version >= 2) {
    const alignments = Math.floor(version / 7) + 2
    result -= (25 * alignments - 10) * alignments - 55
    if (version >= 7) result -= 36
  }
  return result
}

function dataCodewords(version: number, level: QrErrorCorrection): number {
  return (
    Math.floor(rawDataModules(version) / 8) -
    ECC_CODEWORDS_PER_BLOCK[level][version]! * ERROR_CORRECTION_BLOCKS[level][version]!
  )
}

/** Byte mode's character-count field: one byte of length up to version 9, two after. */
function countBits(version: number): number {
  return version <= 9 ? 8 : 16
}

/** How many payload bytes a version holds, after the mode indicator and count field. */
export function qrByteCapacity(version: number, level: QrErrorCorrection): number {
  return Math.floor((dataCodewords(version, level) * 8 - 4 - countBits(version)) / 8)
}

// ── Reed–Solomon over GF(2^8) / 0x11D ────────────────────────────────────────

function multiply(x: number, y: number): number {
  let z = 0
  for (let i = 7; i >= 0; i -= 1) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d)
    z ^= ((y >>> i) & 1) * x
  }
  return z & 0xff
}

function divisor(degree: number): number[] {
  const result = new Array<number>(degree).fill(0)
  result[degree - 1] = 1
  let root = 1
  for (let i = 0; i < degree; i += 1) {
    for (let j = 0; j < degree; j += 1) {
      result[j] = multiply(result[j]!, root)
      if (j + 1 < degree) result[j]! ^= result[j + 1]!
    }
    root = multiply(root, 0x02)
  }
  return result
}

function remainder(data: readonly number[], generator: readonly number[]): number[] {
  const result = new Array<number>(generator.length).fill(0)
  for (const byte of data) {
    const factor = byte ^ result.shift()!
    result.push(0)
    for (const [index, coefficient] of generator.entries()) {
      result[index]! ^= multiply(coefficient, factor)
    }
  }
  return result
}

// ── Codewords ────────────────────────────────────────────────────────────────

function dataBytes(payload: Uint8Array, version: number, level: QrErrorCorrection): number[] {
  const capacityBits = dataCodewords(version, level) * 8
  const bits: number[] = []
  const append = (value: number, length: number) => {
    for (let i = length - 1; i >= 0; i -= 1) bits.push((value >>> i) & 1)
  }

  append(0b0100, 4)
  append(payload.length, countBits(version))
  for (const byte of payload) append(byte, 8)

  // The terminator is up to four zeros — fewer when the symbol is already full.
  append(0, Math.min(4, capacityBits - bits.length))
  append(0, (8 - (bits.length % 8)) % 8)
  // Then the standard's two pad bytes, alternating, until the capacity is full.
  for (let pad = 0xec; bits.length < capacityBits; pad ^= 0xec ^ 0x11) append(pad, 8)

  const bytes: number[] = []
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0
    for (let j = 0; j < 8; j += 1) byte = (byte << 1) | bits[i + j]!
    bytes.push(byte)
  }
  return bytes
}

/** Splits into blocks, corrects each, and interleaves — data first, then correction. */
function interleave(data: readonly number[], version: number, level: QrErrorCorrection): number[] {
  const blockCount = ERROR_CORRECTION_BLOCKS[level][version]!
  const eccLength = ECC_CODEWORDS_PER_BLOCK[level][version]!
  const rawCodewords = Math.floor(rawDataModules(version) / 8)
  const shortBlocks = blockCount - (rawCodewords % blockCount)
  const shortLength = Math.floor(rawCodewords / blockCount) - eccLength

  const generator = divisor(eccLength)
  const blocks: { data: number[]; ecc: number[] }[] = []
  let offset = 0
  for (let i = 0; i < blockCount; i += 1) {
    const length = shortLength + (i < shortBlocks ? 0 : 1)
    const slice = data.slice(offset, offset + length)
    offset += length
    blocks.push({ data: slice, ecc: remainder(slice, generator) })
  }

  const result: number[] = []
  for (let i = 0; i <= shortLength; i += 1) {
    for (const block of blocks) if (i < block.data.length) result.push(block.data[i]!)
  }
  for (let i = 0; i < eccLength; i += 1) {
    for (const block of blocks) result.push(block.ecc[i]!)
  }
  return result
}

// ── The matrix ───────────────────────────────────────────────────────────────

function alignmentPositions(version: number): number[] {
  if (version === 1) return []
  const count = Math.floor(version / 7) + 2
  const step = version === 32 ? 26 : Math.ceil((version * 4 + 4) / (count * 2 - 2)) * 2
  const result = [6]
  for (let position = version * 4 + 10; result.length < count; position -= step) {
    result.splice(1, 0, position)
  }
  return result
}

interface Grid {
  size: number
  dark: boolean[][]
  /** Finder, timing, alignment, format and version modules: never masked, never data. */
  reserved: boolean[][]
}

function blankGrid(size: number): Grid {
  const rows = () => Array.from({ length: size }, () => new Array<boolean>(size).fill(false))
  return { size, dark: rows(), reserved: rows() }
}

function setFunction(grid: Grid, x: number, y: number, dark: boolean): void {
  grid.dark[y]![x] = dark
  grid.reserved[y]![x] = true
}

function drawFinder(grid: Grid, centreX: number, centreY: number): void {
  for (let dy = -4; dy <= 4; dy += 1) {
    for (let dx = -4; dx <= 4; dx += 1) {
      const x = centreX + dx
      const y = centreY + dy
      if (x < 0 || x >= grid.size || y < 0 || y >= grid.size) continue
      // Chebyshev rings: dark core, light ring, dark ring, light separator.
      const ring = Math.max(Math.abs(dx), Math.abs(dy))
      setFunction(grid, x, y, ring !== 2 && ring !== 4)
    }
  }
}

function drawAlignment(grid: Grid, centreX: number, centreY: number): void {
  for (let dy = -2; dy <= 2; dy += 1) {
    for (let dx = -2; dx <= 2; dx += 1) {
      setFunction(grid, centreX + dx, centreY + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1)
    }
  }
}

function drawFormat(grid: Grid, level: QrErrorCorrection, mask: number): void {
  const data = (FORMAT_BITS[level] << 3) | mask
  let rem = data
  for (let i = 0; i < 10; i += 1) rem = (rem << 1) ^ ((rem >>> 9) * 0x537)
  const bits = ((data << 10) | rem) ^ 0x5412
  const bit = (index: number) => ((bits >>> index) & 1) !== 0
  const { size } = grid

  for (let i = 0; i <= 5; i += 1) setFunction(grid, 8, i, bit(i))
  setFunction(grid, 8, 7, bit(6))
  setFunction(grid, 8, 8, bit(7))
  setFunction(grid, 7, 8, bit(8))
  for (let i = 9; i < 15; i += 1) setFunction(grid, 14 - i, 8, bit(i))

  for (let i = 0; i < 8; i += 1) setFunction(grid, size - 1 - i, 8, bit(i))
  for (let i = 8; i < 15; i += 1) setFunction(grid, 8, size - 15 + i, bit(i))
  // The one module that is dark in every symbol.
  setFunction(grid, 8, size - 8, true)
}

function drawVersion(grid: Grid, version: number): void {
  if (version < 7) return
  let rem = version
  for (let i = 0; i < 12; i += 1) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25)
  const bits = (version << 12) | rem

  for (let i = 0; i < 18; i += 1) {
    const dark = ((bits >>> i) & 1) !== 0
    const a = grid.size - 11 + (i % 3)
    const b = Math.floor(i / 3)
    setFunction(grid, a, b, dark)
    setFunction(grid, b, a, dark)
  }
}

function drawFunctionPatterns(grid: Grid, version: number, level: QrErrorCorrection): void {
  const { size } = grid

  for (let i = 0; i < size; i += 1) {
    setFunction(grid, 6, i, i % 2 === 0)
    setFunction(grid, i, 6, i % 2 === 0)
  }

  drawFinder(grid, 3, 3)
  drawFinder(grid, size - 4, 3)
  drawFinder(grid, 3, size - 4)

  const positions = alignmentPositions(version)
  const last = positions.length - 1
  for (const [i, x] of positions.entries()) {
    for (const [j, y] of positions.entries()) {
      // The three corners that already hold a finder take no alignment pattern.
      const onFinder = (i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)
      if (!onFinder) drawAlignment(grid, x, y)
    }
  }

  // Reserved now with a placeholder mask, so the zigzag walks around them; the
  // real bits are drawn once the mask is known.
  drawFormat(grid, level, 0)
  drawVersion(grid, version)
}

function drawCodewords(grid: Grid, codewords: readonly number[]): void {
  const { size } = grid
  let index = 0

  for (let right = size - 1; right >= 1; right -= 2) {
    // The vertical timing column is skipped whole, not stepped through.
    if (right === 6) right = 5
    for (let vertical = 0; vertical < size; vertical += 1) {
      for (let j = 0; j < 2; j += 1) {
        const x = right - j
        const upward = ((right + 1) & 2) === 0
        const y = upward ? size - 1 - vertical : vertical
        if (grid.reserved[y]![x] || index >= codewords.length * 8) continue
        grid.dark[y]![x] = ((codewords[index >>> 3]! >>> (7 - (index & 7))) & 1) !== 0
        index += 1
      }
    }
  }
}

const MASKS: readonly ((x: number, y: number) => boolean)[] = [
  (x, y) => (x + y) % 2 === 0,
  (_x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
]

/** XOR, so applying the same mask twice removes it. */
function applyMask(grid: Grid, mask: number): void {
  const invert = MASKS[mask]!
  for (let y = 0; y < grid.size; y += 1) {
    for (let x = 0; x < grid.size; x += 1) {
      if (!grid.reserved[y]![x] && invert(x, y)) grid.dark[y]![x] = !grid.dark[y]![x]
    }
  }
}

/** 1:1:3:1:1 with four light modules on one side — what a scanner mistakes for a finder. */
const FINDER_LIKE: readonly (readonly boolean[])[] = [
  [true, false, true, true, true, false, true, false, false, false, false],
  [false, false, false, false, true, false, true, true, true, false, true],
]

/** The standard's four penalty rules; the mask with the lowest total wins. */
function penalty(grid: Grid): number {
  const { size, dark } = grid
  let result = 0

  const line = (at: (i: number) => boolean) => {
    // Rule 1 — runs of five or more in one colour.
    let run = 1
    for (let i = 1; i <= size; i += 1) {
      if (i < size && at(i) === at(i - 1)) {
        run += 1
      } else {
        if (run >= 5) result += 3 + (run - 5)
        run = 1
      }
    }
    // Rule 3 — finder-like sequences.
    for (let i = 0; i + 11 <= size; i += 1) {
      for (const pattern of FINDER_LIKE) {
        if (pattern.every((module, offset) => at(i + offset) === module)) result += 40
      }
    }
  }

  for (let y = 0; y < size; y += 1) line((x) => dark[y]![x]!)
  for (let x = 0; x < size; x += 1) line((y) => dark[y]![x]!)

  // Rule 2 — 2×2 blocks of one colour.
  for (let y = 0; y < size - 1; y += 1) {
    for (let x = 0; x < size - 1; x += 1) {
      const colour = dark[y]![x]
      if (
        colour === dark[y]![x + 1] &&
        colour === dark[y + 1]![x] &&
        colour === dark[y + 1]![x + 1]
      )
        result += 3
    }
  }

  // Rule 4 — how far the dark share strays from half, in steps of five percent.
  let darkCount = 0
  for (const row of dark) for (const module of row) if (module) darkCount += 1
  const total = size * size
  result += (Math.ceil(Math.abs(darkCount * 20 - total * 10) / total) - 1) * 10

  return result
}

// ── Public API ───────────────────────────────────────────────────────────────

/** ISO/IEC 18004 §6.4.10: four clear modules on every side, or scanners may miss the finders. */
export const QR_QUIET_ZONE = 4

/** UTF-8, so a symbol made here reads the same on every scanner that follows ECI's default. */
export function qrPayload(value: string): Uint8Array {
  return new TextEncoder().encode(value)
}

export function encodeQr(
  value: string,
  level: QrErrorCorrection = 'M',
  options: QrEncodeOptions = {},
): QrSymbol {
  const payload = qrPayload(value)

  let version = Math.max(MIN_VERSION, Math.min(MAX_VERSION, options.minVersion ?? MIN_VERSION))
  while (payload.length > qrByteCapacity(version, level)) {
    version += 1
    if (version > MAX_VERSION) throw new QrCapacityError(payload.length, level)
  }

  const grid = blankGrid(version * 4 + 17)
  drawFunctionPatterns(grid, version, level)
  drawCodewords(grid, interleave(dataBytes(payload, version, level), version, level))

  let mask = options.mask ?? -1
  if (mask < 0 || mask > 7) {
    let best = Infinity
    for (let candidate = 0; candidate < 8; candidate += 1) {
      applyMask(grid, candidate)
      drawFormat(grid, level, candidate)
      const score = penalty(grid)
      if (score < best) {
        best = score
        mask = candidate
      }
      applyMask(grid, candidate)
    }
  }

  applyMask(grid, mask)
  drawFormat(grid, level, mask)

  return { version, size: grid.size, mask, modules: grid.dark }
}

/**
 * The dark modules as one SVG path, in module units, offset by the quiet zone.
 *
 * Horizontal runs, not one square per module: a version-5 symbol has about seven
 * hundred dark modules but a few hundred runs, and adjacent squares drawn
 * separately show hairline seams at fractional scales.
 */
export function qrPath(symbol: QrSymbol, quietZone: number): string {
  const parts: string[] = []
  for (const [y, row] of symbol.modules.entries()) {
    let start = -1
    for (let x = 0; x <= symbol.size; x += 1) {
      const dark = x < symbol.size && row[x] === true
      if (dark && start < 0) start = x
      if (!dark && start >= 0) {
        parts.push(`M${start + quietZone} ${y + quietZone}h${x - start}v1h-${x - start}z`)
        start = -1
      }
    }
  }
  return parts.join('')
}

/**
 * The symbol for `value`, or `null` when it has none: a payload past version
 * 40 has no valid symbol, and a truncated one would scan as a different
 * string. A member renders nothing for `null`.
 */
export function qrSymbol(value: string, level: QrErrorCorrection = 'M'): QrSymbol | null {
  try {
    return encodeQr(value, level)
  } catch (error) {
    if (error instanceof QrCapacityError) return null
    throw error
  }
}
