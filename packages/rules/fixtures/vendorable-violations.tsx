/*
 * Seeded violations of the packaging boundary. Every import here resolves inside this
 * monorepo and resolves to nothing at all once the file is copied into a
 * consumer's repository, which is the whole of what the rule is about.
 *
 * Deliberately unlawful. `src/fixtures.test.ts` lints it.
 */
import { dataAttrs } from '../../../engine/src/conventions/attrs'
import icons from '../../../../design/icons.json'
import { cssVar } from '@polymorph/theme'
import { lawfulCells } from '@polymorph/engine/src/conventions/variants'

export { RUNGS } from '@polymorph/rules/inventory'

export const Broken = () => (
  <div {...dataAttrs({ size: 'md' })}>
    {cssVar('bg.app')} {Object.keys(icons).length} {lawfulCells({}).length}
  </div>
)
