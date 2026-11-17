import { ZAG_LEDGER, type ConformanceDivergence } from '@polymorph/conformance'

/**
 * The Angular shell's conformance ledger: every statement it deliberately does
 * not meet, and why (`docs/conformance.md`). The React and Vue shells keep
 * their own (`packages/react-ui/src/conformance/ledger.ts`,
 * `packages/vue-ui/src/conformance/ledger.ts`).
 *
 * An entry belongs here only when the substrate (Zag) behaves differently from
 * the spec for a reason that can be stated and the spec keeps its claim. The
 * law runs every entry and fails on one that passes or fails for another
 * reason. The Angular shell's entries are the ones every Zag-based shell
 * shares (`ZAG_LEDGER`).
 */
export const CONFORMANCE_LEDGER: readonly ConformanceDivergence[] = [...ZAG_LEDGER]
