import { ZAG_LEDGER, type ConformanceDivergence } from '@polymorph/conformance'

import { GALLERIES } from '../galleries'

/**
 * The elements' conformance ledger: every statement they deliberately do not
 * meet, and why (`docs/conformance.md`). The elements render the Solid
 * members, so their entries are the Solid shell's, the ones every Zag-based
 * shell shares (`ZAG_LEDGER`), for the members the elements vocabulary ships.
 *
 * The law runs every entry and fails on one that passes or fails for another
 * reason.
 */
export const CONFORMANCE_LEDGER: readonly ConformanceDivergence[] = ZAG_LEDGER.filter((entry) =>
  GALLERIES.some((gallery) => gallery.component === entry.member),
)
