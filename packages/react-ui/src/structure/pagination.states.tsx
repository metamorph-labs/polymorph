'use client'

import { type ComponentStates } from '@polymorph/react'
import { Pagination } from './Pagination'

/** States fixture, from `design/components/pagination.md`'s States table. */

const noop = () => {}

/** A page's address. A fragment, so a click a test leaves to the browser stays on the page. */
const pageHref = (page: number) => `#page-${page}`

export const states: ComponentStates = {
  component: 'Pagination',

  entries: [
    {
      name: 'five pages, at the first',
      render: () => <Pagination page={1} pageCount={5} onPageChange={noop} />,
    },
    {
      name: 'five pages, in the middle',
      render: () => <Pagination page={3} pageCount={5} onPageChange={noop} />,
    },
    {
      name: 'five pages, at the last',
      render: () => <Pagination page={5} pageCount={5} onPageChange={noop} />,
    },
    {
      name: 'twelve pages, in the middle — an ellipsis on each side',
      render: () => <Pagination page={6} pageCount={12} onPageChange={noop} />,
    },
    {
      name: 'twelve pages, with wider shoulders',
      render: () => <Pagination page={6} pageCount={12} siblingCount={2} onPageChange={noop} />,
    },
    {
      name: 'two pages — no room for a gap',
      render: () => <Pagination page={1} pageCount={2} onPageChange={noop} />,
    },
    {
      name: 'held by the app — no page can be asked for',
      render: () => <Pagination page={3} pageCount={5} disabled onPageChange={noop} />,
      expect: { 'data-disabled': '' },
    },
    {
      name: 'with addresses — every page but the current one is a link',
      render: () => (
        <Pagination page={3} pageCount={5} getPageHref={pageHref} onPageChange={noop} />
      ),
    },
    {
      name: 'held, with addresses — no links, every control a disabled button',
      render: () => (
        <Pagination page={3} pageCount={5} disabled getPageHref={pageHref} onPageChange={noop} />
      ),
      expect: { 'data-disabled': '' },
    },
    {
      name: 'one page — nothing at all, because one page is not a paginated list',
      render: () => <Pagination page={1} pageCount={1} onPageChange={noop} />,
      rendersNothing: true,
    },
  ],

  /*
   * The root takes focus when a hold disables the button that had it, so it
   * draws the focus ring. The Buttons' `[aria-current="page"]`, `:hover` and
   * `:focus-visible` live in `button.module.css`, asserted by
   * `button.states.tsx`. The links compose Button's class, so they are styled
   * by the same rules.
   */
  requiredSelectors: [':focus-visible'],
}
