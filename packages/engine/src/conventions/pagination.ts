/**
 * Pagination's window (`design/components/pagination.md`): which pages a pager
 * offers, as data. Every framework's Pagination renders it, so the arithmetic,
 * the only logic in the member that can be wrong, is written and tested once.
 */

/** A gap in the window: pages that are not offered. */
export const PAGINATION_ELLIPSIS = 'ellipsis' as const

export type PaginationEntry = number | typeof PAGINATION_ELLIPSIS

/**
 * The visible pages: always the first, the last and `page ± siblingCount`, in
 * order. A gap of two or more pages becomes an ellipsis. A gap of one shows the
 * page, because an ellipsis of the same width would hide it for nothing. Fewer
 * than two pages give nothing, because one page is not a paginated list.
 */
export function paginationWindow(
  page: number,
  pageCount: number,
  siblingCount = 1,
): PaginationEntry[] {
  if (pageCount <= 1) return []

  const wanted = new Set<number>([1, pageCount])
  for (let offset = -siblingCount; offset <= siblingCount; offset += 1) {
    const candidate = page + offset
    if (candidate >= 1 && candidate <= pageCount) wanted.add(candidate)
  }

  const pages = [...wanted].sort((a, b) => a - b)
  const out: PaginationEntry[] = []
  for (const [index, value] of pages.entries()) {
    const previous = pages[index - 1]
    if (previous !== undefined && value - previous > 1) {
      if (value - previous === 2) out.push(previous + 1)
      else out.push(PAGINATION_ELLIPSIS)
    }
    out.push(value)
  }
  return out
}
