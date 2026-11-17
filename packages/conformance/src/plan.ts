import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { installTestTheme } from '@polymorph/engine/testing'

/**
 * The law for what a Plan says and when it says it (`design/components/plan.md`,
 * A11y), which every web shell's Plan test calls with a mount of its own. A
 * contract statement reads one part in one fixture entry (`docs/conformance.md`).
 * This law reads what the contract grammar cannot state: the words each step
 * reads as, which step the status line names, that the line changes only when
 * the front of the run does, and that a long title wraps. The law changes the
 * steps itself, as the application around the Plan does while the run goes on.
 */

export type PlanLawStatus = 'pending' | 'running' | 'done' | 'error' | 'skipped'

/** A step as the law passes it, in the shape of the member's `PlanStep`. */
export interface PlanLawStep {
  id: string
  title: string
  description?: string
  status: PlanLawStatus
}

/** What the law sets on the Plan. A prop the law leaves out is not passed. */
export interface PlanLawProps {
  steps: PlanLawStep[]
  messages?: { status: Record<PlanLawStatus, string> }
}

export interface MountedPlan {
  /** Sets props on the Plan, as its parent's state would. */
  set(next: Partial<PlanLawProps>): void | Promise<void>
}

export interface PlanLaw {
  /** The shell's name as the law's titles say it: `Vue`. */
  readonly shell: string
  /** Mounts one Plan labelled `Plan for this run` with these props, and no other Plan. */
  mount(props: PlanLawProps): Promise<MountedPlan>
}

/**
 * What assistive technology reads in an element: its text, without the parts
 * hidden from it. Not normalised, so a missing or doubled space shows.
 */
function reading(element: Element): string {
  let read = ''
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) read += node.textContent ?? ''
    else if (node instanceof Element && node.getAttribute('aria-hidden') !== 'true') {
      node.childNodes.forEach(walk)
    }
  }
  walk(element)
  return read
}

const ENGLISH: Record<PlanLawStatus, string> = {
  pending: 'Pending',
  running: 'Running',
  done: 'Done',
  error: 'Failed',
  skipped: 'Skipped',
}

const GERMAN: Record<PlanLawStatus, string> = {
  pending: 'Ausstehend',
  running: 'Läuft',
  done: 'Erledigt',
  error: 'Fehlgeschlagen',
  skipped: 'Übersprungen',
}

const step = (id: string, status: PlanLawStatus, description?: string): PlanLawStep => ({
  id,
  title: `Step ${id}`,
  status,
  ...(description === undefined ? {} : { description }),
})

/** A run with its third step running: two done before it, two to come after it. */
const RUN: PlanLawStep[] = [
  step('a', 'done', 'Read three files'),
  step('b', 'done'),
  step('c', 'running', 'Editing deliver.ts'),
  step('d', 'pending'),
  step('e', 'pending'),
]

/** The one Plan on the page, or `null` when it renders nothing. */
const plan = () => document.querySelector<HTMLElement>('[data-member="plan"]')

const root = (): HTMLElement => {
  const element = plan()
  if (element === null) throw new Error('the Plan rendered nothing')
  return element
}

const steps = () => [...root().querySelectorAll<HTMLElement>('li')]

/** The status line: the member's one polite region. */
const line = (): HTMLElement => {
  const regions = [...root().querySelectorAll<HTMLElement>('[role="status"]')]
  expect(regions).toHaveLength(1)
  return regions[0] as HTMLElement
}

/** Two frames, in which a shell has committed a change it was handed. */
const frames = () =>
  new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  )

export function planLaw({ shell, mount }: PlanLaw): void {
  describe(`${shell} Plan — what it says, and when`, () => {
    beforeAll(installTestTheme)

    let observer: MutationObserver | undefined

    afterEach(() => {
      observer?.disconnect()
      observer = undefined
    })

    async function mounted(props: PlanLawProps): Promise<MountedPlan> {
      const handle = await mount(props)
      await vi.waitFor(() => expect(plan()).not.toBeNull())
      return handle
    }

    it('reads each step as its title, its status words and its description', async () => {
      await mounted({ steps: RUN })

      expect(steps().map(reading)).toEqual([
        'Step a, DoneRead three files',
        'Step b, Done',
        'Step c, RunningEditing deliver.ts',
        'Step d, Pending',
        'Step e, Pending',
      ])
      // The glyph is drawn, and hidden from assistive technology.
      for (const item of steps()) {
        expect(item.querySelector('[aria-hidden="true"] svg')).not.toBeNull()
      }
      const list = root().querySelector('ol')
      expect(list?.getAttribute('role')).toBe('list')
      expect(list?.getAttribute('aria-label')).toBe('Plan for this run')
    })

    it('marks the first running step current, and every running step busy', async () => {
      await mounted({
        steps: [
          step('a', 'done'),
          step('b', 'running'),
          step('c', 'running'),
          step('d', 'pending'),
        ],
      })

      expect(steps().map((item) => item.getAttribute('aria-current'))).toEqual([
        null,
        'step',
        null,
        null,
      ])
      expect(steps().map((item) => item.getAttribute('aria-busy'))).toEqual([
        null,
        'true',
        'true',
        null,
      ])
      expect(steps().map((item) => item.getAttribute('data-status'))).toEqual([
        'done',
        'running',
        'running',
        'pending',
      ])
    })

    it('names the step at the front of the run in its status line', async () => {
      const { set } = await mounted({ steps: RUN.map((each) => ({ ...each, status: 'pending' })) })

      // Nothing has started, so the line is there and says nothing.
      expect(line().textContent).toBe('')

      const says = async (next: PlanLawStep[], words: string) => {
        await set({ steps: next })
        await vi.waitFor(() => expect(line().textContent).toBe(words))
      }

      // The first running step, ahead of a failed one before it and a running one after it.
      await says(RUN, 'Step c, Running')
      await says(
        [step('a', 'error'), step('b', 'running'), step('c', 'running')],
        'Step b, Running',
      )
      // With none running, the first failed step, ahead of the skipped ones after it.
      await says(
        [step('a', 'done'), step('b', 'error'), step('c', 'skipped'), step('d', 'error')],
        'Step b, Failed',
      )
      // With neither, the last step that is done or skipped.
      await says([step('a', 'done'), step('b', 'skipped'), step('c', 'pending')], 'Step b, Skipped')
      await says(
        RUN.map((each) => ({ ...each, status: 'done' })),
        'Step e, Done',
      )
    })

    it('changes its status line only when the front of the run changes', async () => {
      const { set } = await mounted({ steps: RUN })
      expect(line().textContent).toBe('Step c, Running')

      const records: MutationRecord[] = []
      observer = new MutationObserver((batch) => records.push(...batch))
      observer.observe(line(), { childList: true, characterData: true, subtree: true })

      // The running step's description and a later step's title change: the
      // front of the run does not, so the line is not touched.
      await set({
        steps: RUN.map((each) =>
          each.id === 'c'
            ? { ...each, description: 'Editing deliver.ts and retry.ts' }
            : each.id === 'e'
              ? { ...each, title: 'Step e, renamed' }
              : each,
        ),
      })
      await vi.waitFor(() =>
        expect(root().textContent).toContain('Editing deliver.ts and retry.ts'),
      )
      await frames()
      expect(records).toEqual([])
      expect(line().textContent).toBe('Step c, Running')

      // The run moves on: the line names the next step.
      await set({
        steps: RUN.map((each) =>
          each.id === 'c'
            ? { ...each, status: 'done' }
            : each.id === 'd'
              ? { ...each, status: 'running' }
              : each,
        ),
      })
      await vi.waitFor(() => expect(line().textContent).toBe('Step d, Running'))
      expect(records.length).toBeGreaterThan(0)
    })

    it('reads every word it writes from messages', async () => {
      await mounted({ steps: RUN, messages: { status: GERMAN } })

      expect(steps().map(reading)).toEqual([
        'Step a, ErledigtRead three files',
        'Step b, Erledigt',
        'Step c, LäuftEditing deliver.ts',
        'Step d, Ausstehend',
        'Step e, Ausstehend',
      ])
      expect(line().textContent).toBe('Step c, Läuft')
      for (const word of Object.values(ENGLISH)) {
        expect(reading(root())).not.toContain(word)
      }
    })

    it('wraps a long title and never widens its container', async () => {
      const long = `Read src/${'deeply-nested-directory/'.repeat(8)}retry.ts`
      await mounted({
        steps: [
          {
            id: 'path',
            title: long,
            description: `Found ${'idempotency-key-'.repeat(6)}builder`,
            status: 'running',
          },
          step('b', 'pending'),
        ],
      })
      root().style.inlineSize = '12rem'

      await vi.waitFor(() => {
        expect(root().scrollWidth).toBeLessThanOrEqual(root().clientWidth)
        for (const item of steps()) {
          expect(item.getBoundingClientRect().right).toBeLessThanOrEqual(
            root().getBoundingClientRect().right + 0.5,
          )
        }
      })
      const title = [...(steps()[0]?.querySelectorAll('span') ?? [])].find(
        (part) => part.textContent === long,
      ) as HTMLElement
      const lineHeight = Number.parseFloat(getComputedStyle(title).lineHeight)
      expect(title.getBoundingClientRect().height).toBeGreaterThan(lineHeight * 2)
    })

    it('renders nothing for a plan with no steps', async () => {
      await mount({ steps: [] })
      await frames()
      expect(plan()).toBeNull()
    })
  })
}
