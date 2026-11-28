import { beforeAll, describe, expect, it } from 'vitest'

import { installTestTheme } from '@polymorph/engine/testing'

/**
 * The law for what an ArtifactPane says while its artifact is being written
 * (`design/components/artifact-pane.md`, A11y), which every web shell's
 * ArtifactPane test calls with a mount of its own. The words are the status
 * of the Spinner in the pane's mark: `streamingLabel`, and by default the
 * title followed by "still being written". A status is not named by its
 * content, so no contract statement reads it (`docs/conformance.md`); this law
 * reads the status's text.
 */

/** The props the law mounts an ArtifactPane with. A prop the law leaves out is not passed. */
export interface ArtifactPaneLawProps {
  title: string
  streaming: boolean
  streamingLabel?: string
}

export interface ArtifactPaneLaw {
  /** The shell's name as the law's titles say it: `Vue`. */
  readonly shell: string
  /** Mounts one ArtifactPane with these props, after any the test mounted before it. */
  mount(props: ArtifactPaneLawProps): Promise<unknown>
}

/** What the status in the mark of the pane mounted last says. */
function status(): string {
  const pane = [...document.querySelectorAll<HTMLElement>('[data-member="artifact-pane"]')].at(-1)
  if (pane === undefined) throw new Error('the ArtifactPane rendered nothing')
  const spinner = pane.querySelector<HTMLElement>('[role="status"]')
  if (spinner === null) throw new Error('the ArtifactPane drew no status while streaming')
  return (spinner.textContent ?? '').replace(/\s+/g, ' ').trim()
}

export function artifactPaneLaw({ shell, mount }: ArtifactPaneLaw): void {
  describe(`${shell} ArtifactPane — what it says while its artifact is being written`, () => {
    beforeAll(installTestTheme)

    it('says the title, then that it is still being written', async () => {
      await mount({ title: 'deliver.ts', streaming: true })
      expect(status()).toBe('deliver.ts: still being written')
    })

    it('says the host’s words from streamingLabel', async () => {
      await mount({
        title: 'deliver.ts',
        streaming: true,
        streamingLabel: 'deliver.ts : en cours d’écriture',
      })
      expect(status()).toBe('deliver.ts : en cours d’écriture')
    })
  })
}
