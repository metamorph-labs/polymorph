import { describe, expect, it } from 'vitest'

import { formatBytes, gateFiles } from './files'

/**
 * The gate and the size format every framework's FileUpload, PromptInput and
 * AttachmentChip use. The components' own tests drive the gate through the
 * picker and a drop; these pin the rules themselves.
 */

const file = (name: string, bytes = 8, type = 'text/plain') =>
  new File([new Uint8Array(bytes)], name, { type })

describe('gateFiles', () => {
  it('reads the accept syntax the way the input does, ignoring case', () => {
    const { accepted, rejected } = gateFiles(
      [file('REPORT.PDF', 8, ''), file('logo.svg', 8, 'image/svg+xml'), file('notes.txt')],
      { accept: '.pdf, IMAGE/*' },
    )
    expect(accepted.map((item) => item.name)).toEqual(['REPORT.PDF', 'logo.svg'])
    expect(rejected).toEqual([
      { file: expect.objectContaining({ name: 'notes.txt' }), reason: 'type' },
    ])
  })

  it('accepts everything for `*/*`, and for a field with no rules', () => {
    expect(gateFiles([file('notes.txt')], { accept: '*/*' }).rejected).toEqual([])
    expect(gateFiles([file('notes.txt', 4096)], {}).rejected).toEqual([])
  })

  it('refuses a file for its type before its size', () => {
    const { rejected } = gateFiles([file('notes.txt', 4096)], { accept: '.pdf', maxSize: 16 })
    expect(rejected).toEqual([
      { file: expect.objectContaining({ name: 'notes.txt' }), reason: 'type' },
    ])
  })

  it('keeps the first file a single-file field passes and refuses the rest for their count', () => {
    const { accepted, rejected } = gateFiles(
      [file('large.txt', 64), file('a.txt'), file('b.txt')],
      { multiple: false, maxSize: 32 },
    )
    expect(accepted.map((item) => item.name)).toEqual(['a.txt'])
    expect(rejected.map(({ file: refused, reason }) => [refused.name, reason])).toEqual([
      ['large.txt', 'size'],
      ['b.txt', 'count'],
    ])
  })
})

describe('formatBytes', () => {
  it('scales to a readable unit, and keeps bytes whole', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(2_411_724)).toBe('2.3 MB')
    expect(formatBytes(2 * 1024 ** 3)).toBe('2 GB')
  })

  it('never reports a negative size', () => {
    expect(formatBytes(-1)).toBe('0 B')
  })
})
