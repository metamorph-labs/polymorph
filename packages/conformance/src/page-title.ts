import { getByRole, queryByRole } from '@testing-library/dom'
import { page, userEvent } from 'vitest/browser'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { installTestTheme } from '@polymorph/engine/testing'

/**
 * The law for a page title edited in place (`design/components/page-header.md`, A title edited
 * in place), which every web shell's PageHeader test calls with a mount of its own. It covers
 * the three members that take `titleEdit`: PageHeader, DetailPage and Dashboard.
 *
 * What the reader does with the field is InlineEdit's, and its own law holds it. This law holds
 * what the page adds: one `<h1>` named by the saved title in both forms, the controls outside
 * the heading, the `valueHidden` the page hands the InlineEdit, the header's height and the
 * actions' place when the field opens, and the markup of a title given alone.
 *
 * The law focuses a button from a script and reads `document.activeElement`, because Tab passes
 * over buttons in WebKit. It waits for focus, because a shell moves focus a moment after the
 * change that draws the field or the text.
 */

export type PageTitleMember = 'PageHeader' | 'DetailPage' | 'Dashboard'

/** What the law sets on the page after it mounts, as the application's state would. */
export interface PageTitleLawProps {
  title: string
  /** Whether the InlineEdit's field is open, which the application holds. */
  editing: boolean
  pending: boolean
  error: string | undefined
}

export interface PageTitleLawMount {
  readonly member: PageTitleMember
  /** Whether the page is given an InlineEdit in `titleEdit`. */
  readonly edit: boolean
  readonly props: PageTitleLawProps
  /** The InlineEdit's two handlers. */
  readonly onCommit: (value: string) => void
  readonly onEditingChange: (editing: boolean) => void
}

export interface MountedPageTitle {
  /** Sets props on the page and its InlineEdit, as the application's state would. */
  set(next: Partial<PageTitleLawProps>): void | Promise<void>
}

export interface PageTitleLaw {
  /** The shell's name as the law's titles say it: `Vue`. */
  readonly shell: string
  /**
   * Mounts the member with `title` and an `actions` slot that holds one Button labelled
   * `Export`. DetailPage takes `backLabel="Back"`, a handler for `onBack` and a paragraph as its
   * body, and Dashboard a paragraph as its `primary`. With `edit`, `titleEdit` holds an
   * InlineEdit labelled `Project name` at `size="lg"`, whose `value` is the title and whose
   * `editing`, `pending` and `error` are the props', with the two handlers.
   */
  mount(options: PageTitleLawMount): Promise<MountedPageTitle>
}

const TITLE = 'Acme billing'
const RENAMED = 'Acme payments'

const MEMBERS: readonly PageTitleMember[] = ['PageHeader', 'DetailPage', 'Dashboard']

const SLUGS: Record<PageTitleMember, string> = {
  PageHeader: 'page-header',
  DetailPage: 'detail-page',
  Dashboard: 'dashboard',
}

/**
 * The markup each member draws for `title` and one action, with no `titleEdit`, written by
 * `shape` below. PageHeader's is its `<header>`, Dashboard's the PageHeader it composes, and
 * DetailPage's its header row. Each composed member is written by its slug alone.
 */
const PLAIN: Record<PageTitleMember, string> = {
  PageHeader: `header[data-member="page-header"].1(div.1(h1.1("${TITLE}")) @inline)`,
  Dashboard: `header[data-member="page-header"].1(div.1(h1.1("${TITLE}")) @inline)`,
  DetailPage: `div.1(div.1(h1.1("${TITLE}")) div.1(@button))`,
}

/**
 * An element as tags, attributes, class counts and text. A class is counted and not named,
 * because a recipe's class names are hashed. A composed member is its `@slug`, because its own
 * markup is its own law's. An Angular host is its children, because it draws no box and carries
 * no attribute the page sets.
 */
function shape(element: Element): string {
  const children: string[] = []
  const visit = (parent: Element) => {
    for (const node of parent.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        const words = node.textContent?.trim() ?? ''
        if (words !== '') children.push(JSON.stringify(words))
      } else if (node instanceof Element) {
        if (node.tagName.includes('-')) visit(node)
        else if (node.hasAttribute('data-member'))
          children.push(`@${node.getAttribute('data-member')}`)
        else children.push(shape(node))
      }
    }
  }
  visit(element)
  const attributes = [...element.attributes]
    .filter(({ name }) => name !== 'class' && !name.startsWith('_ng') && !name.startsWith('ng-'))
    .map(({ name, value }) => `${name}=${JSON.stringify(value)}`)
    .sort()
  const named = attributes.length === 0 ? '' : `[${attributes.join(' ')}]`
  return `${element.tagName.toLowerCase()}${named}.${element.classList.length}(${children.join(' ')})`
}

const headings = () => [...document.querySelectorAll('h1')]
const heading = (name: string) => getByRole(document.body, 'heading', { level: 1, name })
const editControl = () =>
  getByRole<HTMLButtonElement>(document.body, 'button', { name: 'Edit Project name' })
const field = () => getByRole<HTMLInputElement>(document.body, 'textbox', { name: 'Project name' })
const actions = () => getByRole<HTMLButtonElement>(document.body, 'button', { name: 'Export' })

/** The text the edit control is described by. */
function described(control: HTMLElement): string {
  const ids = (control.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean)
  return ids
    .map((id) => document.getElementById(id)?.textContent ?? '')
    .join(' ')
    .trim()
}

/** The box that holds the title: PageHeader's `<header>`, or DetailPage's header row. */
function header(member: PageTitleMember): HTMLElement {
  const h1 = headings()[0] as HTMLElement
  if (member === 'DetailPage') {
    const identity = h1.closest('[data-member="detail-page"] > * > *') as HTMLElement
    return identity.parentElement as HTMLElement
  }
  return h1.closest('header') as HTMLElement
}

/** Two frames, in which a shell that moves focus after a change has moved it. */
const frames = () =>
  new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  )

/** The page has one `<h1>`, and its accessible name is `name`. */
function oneHeading(name: string) {
  expect(headings(), 'one h1 on the page').toHaveLength(1)
  expect(heading(name)).toBe(headings()[0])
}

/** No control of the title is inside the `<h1>`. */
function outsideHeading() {
  const h1 = headings()[0] as HTMLElement
  expect(h1.querySelector('button, input'), 'the h1 holds no control').toBeNull()
  expect(
    h1.closest('[data-member="inline-edit"]'),
    'the h1 is not inside the InlineEdit',
  ).toBeNull()
}

export function pageTitleLaw({ shell, mount }: PageTitleLaw): void {
  describe(`${shell} page titles — a title edited in place`, () => {
    beforeAll(installTestTheme)

    afterEach(async () => {
      await page.viewport(1280, 800)
    })

    async function project(member: PageTitleMember, { edit = true } = {}) {
      const onCommit = vi.fn<(value: string) => void>()
      const onEditingChange = vi.fn<(editing: boolean) => void>()
      const mounted: { page?: MountedPageTitle } = {}
      mounted.page = await mount({
        member,
        edit,
        props: { title: TITLE, editing: false, pending: false, error: undefined },
        onCommit,
        // The application holds the open state, as an app whose save waits for a server does.
        onEditingChange: (next) => {
          onEditingChange(next)
          void mounted.page?.set({ editing: next })
        },
      })
      await vi.waitFor(() =>
        expect(document.querySelector(`[data-member="${SLUGS[member]}"]`)).toBeTruthy(),
      )
      const set = async (next: Partial<PageTitleLawProps>) => {
        await mounted.page?.set(next)
        await frames()
      }
      return { set, onCommit, onEditingChange }
    }

    async function focus(element: HTMLElement) {
      element.focus()
      await vi.waitFor(() => expect(document.activeElement).toBe(element))
    }

    /** Opens the field from the edit control, with Enter, and waits for focus in it. */
    async function open() {
      await focus(editControl())
      await userEvent.keyboard('{Enter}')
      await vi.waitFor(() => expect(document.activeElement).toBe(field()))
    }

    const onEditControl = () => vi.waitFor(() => expect(document.activeElement).toBe(editControl()))

    for (const member of MEMBERS) {
      describe(member, () => {
        it('draws a title given alone with no title row and an h1 that has only its class', async () => {
          await project(member, { edit: false })
          oneHeading(TITLE)
          expect(shape(header(member))).toBe(PLAIN[member])
          expect(queryByRole(document.body, 'button', { name: 'Edit Project name' })).toBeNull()
        })

        it('keeps one h1 named by the title, with the edit control beside it and outside it', async () => {
          await project(member)
          oneHeading(TITLE)
          outsideHeading()
          expect(described(editControl())).toBe(TITLE)
          const value = document.getElementById(
            (editControl().getAttribute('aria-describedby') ?? '').split(' ')[0] ?? '',
          )
          expect(value?.hidden, 'the page hands the InlineEdit valueHidden').toBe(true)
          const h1 = headings()[0] as HTMLElement
          expect(h1.getBoundingClientRect().width, 'the h1 is drawn').toBeGreaterThan(1)
        })

        it('opens the field with the title selected, and keeps the h1 named by the saved title while it is open', async () => {
          const { onEditingChange } = await project(member)
          await open()
          expect(onEditingChange.mock.calls).toEqual([[true]])
          const input = field()
          expect(input.value).toBe(TITLE)
          expect([input.selectionStart, input.selectionEnd]).toEqual([0, TITLE.length])

          await userEvent.keyboard('Acme')
          oneHeading(TITLE)
          outsideHeading()
          const h1 = headings()[0] as HTMLElement
          expect(h1.getBoundingClientRect().width, 'the h1 is visually hidden').toBeLessThanOrEqual(
            1,
          )
          // The `<h1>` leaves the layout, so the field takes the whole title row.
          const row = (h1.parentElement as HTMLElement).getBoundingClientRect()
          const edit = input.closest('[data-member="inline-edit"]') as HTMLElement
          expect(
            Math.abs(edit.getBoundingClientRect().width - row.width),
            'the field takes the title row',
          ).toBeLessThan(0.5)
        })

        it('reports the new text once, holds the field while the save is pending, and returns focus to the edit control', async () => {
          const { set, onCommit, onEditingChange } = await project(member)
          await open()
          await userEvent.keyboard(RENAMED)
          await userEvent.keyboard('{Enter}')
          expect(onCommit.mock.calls).toEqual([[RENAMED]])

          await set({ pending: true })
          const input = field()
          expect(input.readOnly).toBe(true)
          expect(document.activeElement).toBe(input)
          await userEvent.keyboard('{Enter}')
          await userEvent.keyboard('{Escape}')
          await frames()
          expect(onCommit).toHaveBeenCalledTimes(1)
          expect(onEditingChange.mock.calls).toEqual([[true]])
          oneHeading(TITLE)

          // The save succeeds: the app closes the field and passes the new title.
          await set({ pending: false, editing: false, title: RENAMED })
          await onEditControl()
          oneHeading(RENAMED)
          expect(described(editControl())).toBe(RENAMED)
        })

        it('cancels with Escape: nothing is reported, the h1 keeps the title and focus returns to the edit control', async () => {
          const { onCommit, onEditingChange } = await project(member)
          await open()
          await userEvent.keyboard('Something else')
          await userEvent.keyboard('{Escape}')
          await onEditControl()
          expect(onCommit).not.toHaveBeenCalled()
          expect(onEditingChange.mock.calls).toEqual([[true], [false]])
          oneHeading(TITLE)
        })

        for (const [width, label] of [
          [1280, 'beside the title'],
          [390, 'under the title'],
        ] as const) {
          it(`keeps the header's height and the actions' place when the field opens, with the actions ${label}`, async () => {
            await page.viewport(width, 800)
            await project(member)
            await frames()
            const reading = header(member).getBoundingClientRect()
            const before = actions().getBoundingClientRect()
            await open()
            const editing = header(member).getBoundingClientRect()
            const after = actions().getBoundingClientRect()
            expect(
              Math.abs(editing.height - reading.height),
              `${reading.height} then ${editing.height}`,
            ).toBeLessThan(0.5)
            expect(
              Math.abs(after.left - before.left),
              'the actions keep their column',
            ).toBeLessThan(0.5)
            expect(Math.abs(after.top - before.top), 'the actions keep their row').toBeLessThan(0.5)

            await userEvent.keyboard('{Escape}')
            await onEditControl()
            expect(
              Math.abs(header(member).getBoundingClientRect().height - reading.height),
            ).toBeLessThan(0.5)
          })
        }
      })
    }
  })
}
