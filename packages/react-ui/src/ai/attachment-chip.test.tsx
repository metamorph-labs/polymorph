import { render, screen } from '@testing-library/react'
import { userEvent } from 'vitest/browser'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { assertGoverned } from '@polymorph/react'
import { createAgentBridge } from '@polymorph/engine/agent'
import { agentRegistrations, installTestTheme } from '@polymorph/engine/testing'
import { AttachmentChip, type AttachmentChipProps } from './AttachmentChip'

/**
 * AttachmentChip, in a real browser.
 *
 * The chip has one control and one status, and both must work for a reader
 * who cannot see the chip. The remove button is named after the file, the
 * upload state is a named spinner, and a failure shows the app's text. The
 * rest is FileUpload's row and is tested there.
 */

beforeAll(installTestTheme)

describe('the closed surface', () => {
  it('has no style escape hatch', () => {
    assertGoverned<AttachmentChipProps>(true)
  })
})

describe('the remove control', () => {
  it('names the remove button after the file and calls onRemove', async () => {
    const onRemove = vi.fn()
    render(<AttachmentChip name="retry-policy.pdf" size={1536} onRemove={onRemove} />)
    await userEvent.click(screen.getByRole('button', { name: 'Remove retry-policy.pdf' }))
    expect(onRemove).toHaveBeenCalledTimes(1)
    expect(screen.getByText('1.5 KB')).toBeTruthy()
  })

  it('shows no remove button in a sent message', () => {
    render(<AttachmentChip name="retry-policy.pdf" />)
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })

  it('makes the name a link when the file can be opened', () => {
    render(<AttachmentChip name="retry-policy.pdf" href="https://files.example.org/a.pdf" />)
    const link = screen.getByRole('link', { name: 'retry-policy.pdf' })
    expect(link.getAttribute('target')).toBe('_blank')
  })
})

describe('status', () => {
  it('announces uploading through the spinner, not only through colour', () => {
    render(<AttachmentChip name="screenshot.png" status="uploading" />)
    const status = screen.getByRole('status')
    expect(status.textContent).toBe('screenshot.png: uploading')
  })

  it('shows the app’s failure text and hides the size', () => {
    const { container } = render(
      <AttachmentChip name="archive.zip" size={1024} status="error" message="Too large" />,
    )
    expect(screen.getByText('Too large')).toBeTruthy()
    expect(screen.queryByText('1 KB')).toBeNull()
    expect((container.firstElementChild as HTMLElement).dataset['status']).toBe('error')
  })
})

/**
 * An agent and a chip (`design/components/attachment-chip.md`, Agent): it removes a chip in the
 * composer through `onRemove`, and a sent chip refuses. The remove Button is the chip's own part
 * and is withheld.
 */
describe('an agent', () => {
  it('removes a chip through onRemove, and reaches no Button inside it', async () => {
    const onRemove = vi.fn()
    render(<AttachmentChip name="notes.pdf" status="uploading" onRemove={onRemove} />)
    const bridge = createAgentBridge()
    try {
      expect(bridge.snapshot().members).toEqual([
        {
          id: expect.any(String),
          member: 'AttachmentChip',
          name: 'notes.pdf',
          state: { name: 'notes.pdf', status: 'uploading' },
          actions: [{ name: 'remove' }],
        },
      ])
      const [button] = agentRegistrations().filter(({ member }) => member === 'Button')
      const pressed = await bridge.act([{ id: button?.id, action: 'press' }])
      expect(pressed.results[0]).toMatchObject({ ok: false, error: { code: 'unknown-member' } })
      expect(onRemove).not.toHaveBeenCalled()
      const [chip] = bridge.snapshot().members
      const removed = await bridge.act([{ id: chip?.id, action: 'remove' }])
      expect(removed.results[0]).toMatchObject({ ok: true })
      expect(onRemove).toHaveBeenCalledTimes(1)
    } finally {
      bridge.dispose()
    }
  })

  it('refuses to remove a sent file’s chip, which has no remove control', async () => {
    render(<AttachmentChip name="notes.pdf" href="https://files.example.org/notes.pdf" />)
    const bridge = createAgentBridge()
    try {
      const [chip] = bridge.snapshot().members
      expect(chip?.name).toBe('notes.pdf')
      const { results } = await bridge.act([{ id: chip?.id, action: 'remove' }])
      expect(results[0]).toMatchObject({
        ok: false,
        error: { code: 'failed', message: expect.stringContaining('sent file') },
      })
    } finally {
      bridge.dispose()
    }
  })
})
