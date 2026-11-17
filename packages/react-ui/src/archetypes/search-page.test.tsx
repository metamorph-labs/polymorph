import { render, screen } from '@testing-library/react'
import { page } from 'vitest/browser'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'

import { assertGoverned } from '@polymorph/react'
import { searchPageLaw, type SearchPageState } from '@polymorph/conformance/search-page'
import { installTestTheme } from '@polymorph/engine/testing'
import { Button } from '../controls/Button'
import { Input } from '../controls/Input'
import { SearchInput } from '../controls/SearchInput'
import { Select } from '../controls/Select'
import { Card } from '../structure/Card'
import { FormPage } from './FormPage'
import { ListPage } from './ListPage'
import { SearchPage, type SearchPageProps } from './SearchPage'

/**
 * SearchPage, in a real browser.
 *
 * The page's behaviour around its query is `searchPageLaw`, which every web
 * shell calls. What is left here is geometry: the scope on the page's own
 * root, the measure between FormPage's and ListPage's, the field across the
 * column with the filters under it, a filter row of four Selects on one line
 * at the measure, and a content box that keeps a FilterBar in one row at the
 * compact density.
 */

beforeAll(installTestTheme)
afterEach(async () => {
  await page.viewport(1280, 800)
})

const NOTHING = { title: 'No results' }

const root = () => document.querySelector('[data-member="search-page"]') as HTMLElement

describe('the closed surface', () => {
  it('has no style escape hatch', () => {
    assertGoverned<SearchPageProps>(true)
  })
})

searchPageLaw({
  shell: 'React',
  async mount({ onSubmit }) {
    let state: SearchPageState = { empty: false, pending: false }
    const draw = () => (
      <SearchPage
        title="Search"
        searchLabel="Workspace"
        search={<Input aria-label="Query" />}
        emptyState={NOTHING}
        empty={state.empty}
        pending={state.pending}
        {...(onSubmit === undefined ? {} : { onSubmit })}
      >
        <p>Results</p>
      </SearchPage>
    )
    const { rerender } = render(draw())
    return {
      set(next) {
        state = { ...state, ...next }
        rerender(draw())
      },
    }
  },
})

describe('the geometry', () => {
  /** The page's `--pm-page-max-width`, resolved inside the page. */
  const measureOf = (node: HTMLElement) => {
    const probe = document.createElement('div')
    probe.style.inlineSize = 'var(--pm-page-max-width)'
    node.append(probe)
    const value = Number.parseFloat(getComputedStyle(probe).inlineSize)
    probe.remove()
    return value
  }

  it('declares the page scope on its own root and composes the one h1', () => {
    render(
      <SearchPage
        title="Search"
        searchLabel="Workspace"
        search={<SearchInput aria-label="Query" />}
        emptyState={NOTHING}
      />,
    )
    for (const token of ['--pm-page-padding-x', '--pm-page-max-width', '--pm-content-gutter']) {
      expect(getComputedStyle(root()).getPropertyValue(token).trim(), token).not.toBe('')
      expect(getComputedStyle(document.documentElement).getPropertyValue(token).trim()).toBe('')
    }
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })

  it('sets a measure between a form’s column and a table’s page', () => {
    const { container: search } = render(
      <SearchPage
        title="x"
        searchLabel="y"
        search={<SearchInput aria-label="Query" />}
        emptyState={NOTHING}
      />,
    )
    const { container: form } = render(
      <FormPage title="x" actions={<Button label="y" />}>
        <Card>body</Card>
      </FormPage>,
    )
    const { container: list } = render(
      <ListPage title="x" emptyState={NOTHING}>
        <p>rows</p>
      </ListPage>,
    )
    const measure = measureOf(search.firstElementChild as HTMLElement)
    expect(measure).toBeGreaterThan(measureOf(form.firstElementChild as HTMLElement))
    expect(measure).toBeLessThan(measureOf(list.firstElementChild as HTMLElement))
  })

  it('stretches the field across the column, with the filters one row-gap under it', () => {
    render(
      <SearchPage
        title="Search"
        searchLabel="Workspace"
        search={<SearchInput aria-label="Query" />}
        filters={
          <Select
            size="sm"
            aria-label="Kind"
            emptyOption="Any kind"
            options={[{ value: 'tickets', label: 'Tickets' }]}
          />
        }
        emptyState={NOTHING}
      >
        <p>Results</p>
      </SearchPage>,
    )
    const landmark = screen.getByRole('search', { name: 'Workspace' })
    const query = screen
      .getByRole('searchbox', { name: 'Query' })
      .closest('[data-member="search-input"]') as HTMLElement
    const kind = screen.getByRole('combobox', { name: 'Kind' })
    expect(query.getBoundingClientRect().width).toBeCloseTo(
      landmark.getBoundingClientRect().width,
      0,
    )
    const gap = kind.getBoundingClientRect().top - query.getBoundingClientRect().bottom
    expect(gap).toBeCloseTo(Number.parseFloat(getComputedStyle(landmark).rowGap), 0)
    // The results start below the whole block, a page gutter away.
    const results = screen.getByText('Results').getBoundingClientRect()
    expect(results.top - landmark.getBoundingClientRect().bottom).toBeCloseTo(
      Number.parseFloat(getComputedStyle(root()).rowGap),
      0,
    )
  })

  it('keeps a filter row of four sm Selects on one line at its measure', async () => {
    await page.viewport(1280, 800)
    const select = (label: string, empty: string) => (
      <Select
        size="sm"
        aria-label={label}
        emptyOption={empty}
        options={[{ value: 'a', label: 'A' }]}
      />
    )
    render(
      <SearchPage
        title="Search"
        searchLabel="Workspace"
        search={<SearchInput aria-label="Query" />}
        filters={
          <>
            {select('Kind', 'Any kind')}
            {select('Status', 'Any status')}
            {select('Assignee', 'Anyone')}
            {select('Updated', 'Any time')}
          </>
        }
        emptyState={NOTHING}
      />,
    )
    const tops = ['Kind', 'Status', 'Assignee', 'Updated'].map(
      (name) => screen.getByRole('combobox', { name }).getBoundingClientRect().top,
    )
    for (const top of tops) expect(top).toBeCloseTo(tops[0] as number, 0)
  })

  it('keeps a FilterBar in one row at the compact density, where a form’s column does not', async () => {
    await page.viewport(1280, 800)
    // FilterBar stacks its clusters below a `36rem` container (`filter-bar.md`).
    const line = 36 * Number.parseFloat(getComputedStyle(document.documentElement).fontSize)
    const compact = document.createElement('div')
    compact.setAttribute('data-density', 'compact')
    document.body.append(compact)
    render(
      <SearchPage
        title="x"
        searchLabel="y"
        search={<SearchInput aria-label="Query" />}
        emptyState={NOTHING}
      />,
      { container: compact },
    )
    const form = document.createElement('div')
    form.setAttribute('data-density', 'compact')
    document.body.append(form)
    render(
      <FormPage title="x" actions={<Button label="y" />}>
        <Card>body</Card>
      </FormPage>,
      { container: form },
    )
    const content = (node: HTMLElement) => {
      const style = getComputedStyle(node)
      return (
        node.getBoundingClientRect().width -
        Number.parseFloat(style.paddingInlineStart) -
        Number.parseFloat(style.paddingInlineEnd)
      )
    }
    expect(content(root())).toBeGreaterThan(line)
    expect(content(form.firstElementChild as HTMLElement)).toBeLessThan(line)
    compact.remove()
    form.remove()
  })

  it('steps its padding down one space step in a narrow region', () => {
    // The region answers the page's query, as AppShell's content area does.
    const region = document.createElement('div')
    region.style.cssText = 'container-type: inline-size; inline-size: 375px'
    document.body.append(region)
    render(
      <SearchPage
        title="Search"
        searchLabel="Workspace"
        search={<SearchInput aria-label="Query" />}
        emptyState={NOTHING}
      />,
      { container: region },
    )
    const probe = document.createElement('div')
    probe.style.inlineSize = 'var(--pm-space-6)'
    root().append(probe)
    expect(getComputedStyle(root()).paddingInlineStart).toBe(getComputedStyle(probe).inlineSize)
    probe.remove()
    region.remove()
  })
})
