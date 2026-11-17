import { describe, expect, it } from 'vitest'

import { glyphName, nameSimilarity, nearestRoles, noExternalIcons } from './no-external-icons'
import { APP_FILE, jsxRuleTester } from './rule-tester'

const MAP_FILE = 'packages/react/src/icon/map.tsx'

jsxRuleTester().run('no-external-icons', noExternalIcons, {
  valid: [
    { filename: APP_FILE, code: `import { Icon } from '@polymorph/react-ui'` },
    // The gateway's home is the correct import. No polymorph package ships
    // glyphs, so the name heuristic never applies to one.
    { filename: APP_FILE, code: `import { Icon } from '@polymorph/react'` },
    { filename: APP_FILE, code: `export const A = () => <Icon name="delete" label="Delete" />` },
    // The role-to-glyph map is the only file that may import the set.
    {
      filename: MAP_FILE,
      code: `import { Trash2 } from 'lucide-react'`,
      options: [{ allowIn: [MAP_FILE] }],
    },
    {
      filename: APP_FILE,
      code: `export const A = () => <Bespoke reason="brand mark"><svg /></Bespoke>`,
    },
    // Relative paths name files in this repo, never a glyph package. The name
    // heuristic would otherwise flag the vocabulary's own component.
    {
      filename: 'packages/react-ui/src/icon/icon.states.tsx',
      code: `import { Icon } from './Icon'`,
    },
    { filename: 'packages/react-ui/src/galleries.ts', code: `import x from './icon/icon.states'` },
    { filename: APP_FILE, code: `import { Icon } from '../icons/Icon'` },
  ],

  invalid: [
    {
      filename: APP_FILE,
      code: `import { Trash2 } from 'lucide-react'`,
      // Imported and never used: the import is the whole violation, and the fix removes it.
      output: ``,
      errors: [{ messageId: 'iconImport' }],
    },
    {
      filename: APP_FILE,
      code: `import { FiTrash } from 'react-icons/fi'`,
      errors: [{ messageId: 'iconImport' }],
    },
    // Caught by the name heuristic, not the list. New icon packages appear
    // faster than a list can be maintained.
    {
      filename: APP_FILE,
      code: `import x from '@acme/ui-icons'`,
      errors: [{ messageId: 'iconImport' }],
    },
    {
      filename: APP_FILE,
      code: `export const A = () => <svg viewBox="0 0 16 16" />`,
      errors: [{ messageId: 'inlineSvg' }],
    },
    // The map file is exempt only when the config says so.
    {
      filename: MAP_FILE,
      code: `import { Trash2 } from 'lucide-react'`,
      output: ``,
      errors: [{ messageId: 'iconImport' }],
    },
    // Mentioning `<Bespoke>` does not declare a zone. A file exempted by a
    // comment has no zone for `pnpm inventory` to report, so it would be an
    // undeclared exception, which the ladder exists to prevent.
    {
      filename: APP_FILE,
      code: `// <Bespoke> is the escape hatch, but a comment declares nothing.
import { Trash2 } from 'lucide-react'`,
      output: `// <Bespoke> is the escape hatch, but a comment declares nothing.
`,
      errors: [{ messageId: 'iconImport' }],
    },
    {
      filename: APP_FILE,
      code: `import { Trash2 } from 'lucide-react'
export const HINT = 'Wrap genuinely one-off art in <Bespoke reason="…">.'`,
      output: `export const HINT = 'Wrap genuinely one-off art in <Bespoke reason="…">.'`,
      errors: [{ messageId: 'iconImport' }],
    },
  ],
})

/**
 * The fix: a glyph is replaced by the role that draws it.
 *
 * `design/icons.json` maps `delete` to `trash-2`, so `<Trash2 />` and
 * `<Icon name="delete" />` are the same drawing, and only the second keeps
 * working after a remap. Every case here that is not fixed fails for one of
 * three reasons: the map has no single role, the glyph has a prop `Icon` has
 * no single place for, or the name `Icon` means something else at that point
 * than it does at the top of the file.
 */
const error = { messageId: 'iconImport' } as const

/** A glyph in a file of its own, with whatever props a case needs. */
const glyph = (element: string) => `import { Trash2 } from 'lucide-react'
export const A = () => ${element}`

jsxRuleTester().run('no-external-icons — the fix', noExternalIcons, {
  valid: [],
  invalid: [
    // Nothing in the file imports the vocabulary yet, so an `Icon` import
    // replaces the glyph import. It comes from the React foundation, which every
    // consumer has, whether it installs the members or vendors them.
    {
      filename: APP_FILE,
      code: glyph('<Trash2 />'),
      output: `import { Icon } from '@polymorph/react'
export const A = () => <Icon name="delete" />`,
      errors: [error],
    },
    // A file that already imports members gets one more name on that line. An
    // accessible name becomes `Icon`'s `label`, and `Icon` without a label is
    // already decorative. All three names the package exports a glyph under
    // refer to the same glyph.
    {
      filename: APP_FILE,
      code: `import { Button } from '@polymorph/react-ui'
import { Search, Trash2Icon, LucideSettings } from 'lucide-react'
export const A = () => (
  <>
    <Search aria-hidden />
    <Trash2Icon aria-label="Delete" />
    <LucideSettings key="settings" aria-hidden={true} />
    <Button label="Go" />
  </>
)`,
      output: `import { Button, Icon } from '@polymorph/react-ui'
export const A = () => (
  <>
    <Icon name="search" />
    <Icon name="delete" label="Delete" />
    <Icon name="settings" key="settings" />
    <Button label="Go" />
  </>
)`,
      errors: [error],
    },
    // `Icon` is already in scope, so the fix only rewrites the element.
    {
      filename: APP_FILE,
      code: `import { Icon } from '@polymorph/react'
import { Trash2 } from 'lucide-react'
export const A = () => <><Icon name="add" /><Trash2 /></>`,
      output: `import { Icon } from '@polymorph/react'
export const A = () => <><Icon name="add" /><Icon name="delete" /></>`,
      errors: [error],
    },
    // The new import follows the file's quote and semicolon style, and keeps
    // the file's line endings.
    {
      filename: APP_FILE,
      code: `import { useState } from "react";
import { Trash2 } from "lucide-react";
export const A = () => <Trash2 />;`,
      output: `import { useState } from "react";
import { Icon } from "@polymorph/react";
export const A = () => <Icon name="delete" />;`,
      errors: [error],
    },
    {
      filename: APP_FILE,
      code: `import { Icon } from '@polymorph/react'\r\nimport { Trash2 } from 'lucide-react'\r\nexport const A = () => <Trash2 />\r\n`,
      output: `import { Icon } from '@polymorph/react'\r\nexport const A = () => <Icon name="delete" />\r\n`,
      errors: [error],
    },

    /* ---- the map has no single role ------------------------------------- */

    // Two roles share this drawing (`refresh` and `rotate` are different
    // meanings), and a fixer must not choose between meanings.
    {
      filename: APP_FILE,
      code: `import { RotateCw } from 'lucide-react'
export const A = () => <RotateCw />`,
      output: null,
      errors: [error],
    },
    // No role uses this glyph. The answer is a promotion: a new role.
    {
      filename: APP_FILE,
      code: `import { Rocket } from 'lucide-react'
export const A = () => <Rocket />`,
      output: null,
      errors: [error],
    },
    // All or nothing: an import that keeps one name cannot be removed, and a
    // partial rewrite leaves the violation.
    {
      filename: APP_FILE,
      code: `import { Rocket, Trash2 } from 'lucide-react'
export const A = () => <><Rocket /><Trash2 /></>`,
      output: null,
      errors: [error],
    },

    /* ---- the glyph has a prop `Icon` has no single place for ------------ */

    // A size has an effect: it draws the glyph at twenty pixels. `Icon`'s size
    // is one of three token steps, so the step is a choice. A fix that dropped
    // the prop would silently choose the default.
    { filename: APP_FILE, code: glyph('<Trash2 size={20} />'), output: null, errors: [error] },
    // `Icon` has no colour prop: an icon takes the text role of its context.
    // Whether this icon belongs in a different context is a decision.
    { filename: APP_FILE, code: glyph('<Trash2 color="red" />'), output: null, errors: [error] },
    {
      filename: APP_FILE,
      code: glyph('<Trash2 className="muted" />'),
      output: null,
      errors: [error],
    },
    // A glyph with a handler is a hand-built control.
    {
      filename: APP_FILE,
      code: glyph('<Trash2 onClick={remove} />'),
      output: null,
      errors: [error],
    },
    // Marked not decorative, with no label to announce.
    {
      filename: APP_FILE,
      code: glyph('<Trash2 aria-hidden={false} />'),
      output: null,
      errors: [error],
    },
    // Hidden and labelled at once. `Icon` is one or the other, so either
    // rewrite would change what a screen reader announces.
    {
      filename: APP_FILE,
      code: glyph('<Trash2 aria-hidden="true" aria-label="Delete" />'),
      output: null,
      errors: [error],
    },
    // A comment is inside the element the rewrite would replace.
    {
      filename: APP_FILE,
      code: glyph('<Trash2 /* decorative */ />'),
      output: null,
      errors: [error],
    },
    // Used as a value instead of rendered, so there is no element to rewrite.
    {
      filename: APP_FILE,
      code: `import { Trash2 } from 'lucide-react'
export const ICONS = { delete: Trash2 }`,
      output: null,
      errors: [error],
    },
    // A type-only import brings in no glyph to rewrite.
    {
      filename: APP_FILE,
      code: `import type { LucideIcon } from 'lucide-react'
export type Glyph = LucideIcon`,
      output: null,
      errors: [error],
    },

    // Named only in a comment: a JSDoc type in a file checked as JavaScript.
    // The AST shows no use, but the import is still in use.
    {
      filename: APP_FILE,
      code: `import { Trash2 } from 'lucide-react'
/** @type {typeof Trash2} */
export const glyph = undefined`,
      output: null,
      errors: [error],
    },
    // Imported under a lowercase name, `<trash />` is an intrinsic element with
    // that name, not the import.
    {
      filename: APP_FILE,
      code: `import { Trash2 as trash } from 'lucide-react'
export const A = () => <trash />`,
      output: null,
      errors: [error],
    },

    /* ---- `Icon` would not refer to the import at this point -------------- */

    // `Icon` already means something else in this file.
    {
      filename: APP_FILE,
      code: `import { Icon } from './my-icons'
import { Trash2 } from 'lucide-react'
export const A = () => <><Icon /><Trash2 /></>`,
      output: null,
      errors: [error],
    },
    // Or `Icon` is imported under another name, and the file's author decides
    // which name to render it by.
    {
      filename: APP_FILE,
      code: `import { Icon as Glyph } from '@polymorph/react'
import { Trash2 } from 'lucide-react'
export const A = () => <><Glyph name="add" /><Trash2 /></>`,
      output: null,
      errors: [error],
    },
    // Or `Icon` means something else only where the glyph is used: inside
    // `Row`, `Icon` is the prop.
    {
      filename: APP_FILE,
      code: `import { Trash2 } from 'lucide-react'
export function Row({ icon: Icon }) { return <><Icon /><Trash2 /></> }`,
      output: null,
      errors: [error],
    },
    // The glyph's own name is declared again in an inner scope, so not every
    // `Trash2` in the file is the import.
    {
      filename: APP_FILE,
      code: `import { Trash2 } from 'lucide-react'
export const A = () => <Trash2 />
export const B = ({ Trash2 }) => <Trash2 />`,
      output: null,
      errors: [error],
    },
  ],
})

/**
 * `drawIn` lifts the inline-`<svg>` clause for the chart tier, and nothing
 * else. This rule enforces two laws, and the chart tier needs exactly one of
 * them relaxed. A chart is SVG by nature, and a chart that needed a glyph would
 * still reference it by meaning.
 */
jsxRuleTester().run('no-external-icons — drawIn', noExternalIcons, {
  valid: [
    {
      filename: 'packages/react-ui/src/charts/frame/ChartAxis.tsx',
      code: `export const A = () => <svg><path d="M0 0" /></svg>`,
      options: [{ drawIn: ['packages/react-ui/src/charts/**'] }],
    },
  ],
  invalid: [
    // The glyph-import ban still applies: the tier may draw but not import glyphs.
    {
      filename: 'packages/react-ui/src/charts/frame/ChartLegend.tsx',
      code: `import { Check } from 'lucide-react'`,
      options: [{ drawIn: ['packages/react-ui/src/charts/**'] }],
      output: ``,
      errors: [{ messageId: 'iconImport' }],
    },
    // The exemption covers only the tier. Other files still cannot draw.
    {
      filename: 'packages/react-ui/src/structure/Badge.tsx',
      code: `export const A = () => <svg />`,
      options: [{ drawIn: ['packages/react-ui/src/charts/**'] }],
      errors: [{ messageId: 'inlineSvg' }],
    },
  ],
})

/**
 * What the report says: the role each glyph is, or the nearest role by name,
 * and how to add one when there is none.
 */
const PROMOTE = "A meaning with no role becomes a new role in polymorph's icon set (rung 5)."

jsxRuleTester().run('no-external-icons — what the report names', noExternalIcons, {
  valid: [],
  invalid: [
    {
      filename: APP_FILE,
      code: glyph('<Trash2 />'),
      output: `import { Icon } from '@polymorph/react'
export const A = () => <Icon name="delete" />`,
      errors: [
        {
          message:
            'Unexpected icon import `lucide-react`. `Trash2` is `<Icon name="delete" />` (rung 1). ' +
            'The fix rewrites it.',
        },
      ],
    },
    // The role is known, but a prop stops the fix, and the report says so.
    {
      filename: APP_FILE,
      code: glyph('<Trash2 size={20} />'),
      output: null,
      errors: [
        {
          message:
            'Unexpected icon import `lucide-react`. `Trash2` is `<Icon name="delete" />` (rung 1). ' +
            "`Icon` takes `label` and a `size` step, so map the glyph's props by hand.",
        },
      ],
    },
    {
      filename: APP_FILE,
      code: `import { RotateCw } from 'lucide-react'
export const A = () => <RotateCw />`,
      output: null,
      errors: [
        {
          message:
            'Unexpected icon import `lucide-react`. `RotateCw` draws two roles, ' +
            '`<Icon name="refresh" />` or `<Icon name="rotate" />`; pick the meaning (rung 1).',
        },
      ],
    },
    // No role draws it and none is close by name: promotion, in one sentence.
    {
      filename: APP_FILE,
      code: `import { Rocket } from 'lucide-react'
export const A = () => <Rocket />`,
      output: null,
      errors: [
        {
          message:
            'Unexpected icon import `lucide-react`. `Rocket` has no role and none is close by ' +
            "name, so it becomes a new role in polymorph's icon set (rung 5).",
        },
      ],
    },
    // A long package and glyph name still keep the promotion, because it is
    // part of the first sentence.
    {
      filename: APP_FILE,
      code: `import { faWheatAwnCircleExclamation } from '@fortawesome/free-solid-svg-icons'`,
      output: null,
      errors: [
        {
          message:
            'Unexpected icon import `@fortawesome/free-solid-svg-icons`. ' +
            '`faWheatAwnCircleExclamation` has no role and none is close by name, so it becomes ' +
            "a new role in polymorph's icon set (rung 5).",
        },
      ],
    },
    // Font Awesome's `fa` prefix is not part of what the glyph draws.
    {
      filename: APP_FILE,
      code: `import { faTrashCan } from '@fortawesome/free-solid-svg-icons'`,
      output: null,
      errors: [
        {
          message:
            'Unexpected icon import `@fortawesome/free-solid-svg-icons`. `faTrashCan` reads as ' +
            `\`<Icon name="delete" />\` (rung 1). ${PROMOTE}`,
        },
      ],
    },
    // Another set's names are read as the glyph they draw.
    {
      filename: APP_FILE,
      code: `import { FiTrash } from 'react-icons/fi'`,
      output: null,
      errors: [
        {
          message: `Unexpected icon import \`react-icons/fi\`. \`FiTrash\` reads as \`<Icon name="delete" />\` (rung 1). ${PROMOTE}`,
        },
      ],
    },
    {
      filename: APP_FILE,
      code: `import { TrashIcon, CheckCircleIcon } from '@heroicons/react/24/outline'`,
      output: null,
      errors: [
        {
          message:
            'Unexpected icon import `@heroicons/react/24/outline`. `TrashIcon` reads as ' +
            '`<Icon name="delete" />` (rung 1). `CheckCircleIcon` reads as ' +
            '`<Icon name="success" />` (rung 1).',
        },
      ],
    },
    {
      filename: APP_FILE,
      code: `import { IconX } from '@tabler/icons-react'`,
      output: null,
      errors: [
        {
          message:
            'Unexpected icon import `@tabler/icons-react`. `IconX` reads as ' +
            `\`<Icon name="close" />\` or \`<Icon name="clear" />\` (rung 1). ${PROMOTE}`,
        },
      ],
    },
    // An inline drawing with a label is matched by its label.
    {
      filename: APP_FILE,
      code: `export const A = () => <svg aria-label="Close" viewBox="0 0 16 16" />`,
      output: null,
      errors: [
        {
          message:
            'Unexpected inline <svg>. Its label reads as `<Icon name="close" label="Close" />` ' +
            '(rung 1). One-off art goes in a `<Bespoke reason="…">` zone.',
        },
      ],
    },
    {
      filename: APP_FILE,
      code: `export const A = () => <svg viewBox="0 0 16 16" />`,
      output: null,
      errors: [
        {
          message:
            `Unexpected inline <svg>. Draw a role with \`<Icon name="…" />\` (rung 1). ${PROMOTE} ` +
            'One-off art goes in a `<Bespoke reason="…">` zone.',
        },
      ],
    },
  ],
})

describe('reading a glyph name from any set', () => {
  it('strips what a set adds to the name', () => {
    expect(glyphName('Trash2', 'lucide-react')).toBe('trash-2')
    expect(glyphName('LucideSettings', 'lucide-react')).toBe('settings')
    expect(glyphName('TrashIcon', '@heroicons/react/24/outline')).toBe('trash')
    expect(glyphName('IconX', '@tabler/icons-react')).toBe('x')
    expect(glyphName('DeleteOutlined', '@mui/icons-material')).toBe('delete')
    expect(glyphName('HiOutlineMail', 'react-icons/hi')).toBe('mail')
    expect(glyphName('FaRegTrashAlt', 'react-icons/fa')).toBe('trash')
    expect(glyphName('faTrashCan', '@fortawesome/free-solid-svg-icons')).toBe('trash-can')
  })

  it('finds a role by shared words or a near spelling, and nothing for a guess', () => {
    expect(nearestRoles('trash-can')).toEqual(['delete'])
    expect(nearestRoles('check-circle')).toEqual(['success'])
    expect(nearestRoles('serch')).toEqual(['search'])
    // One letter in two apart is a different word, not a misspelling.
    expect(nearestRoles('rocket')).toEqual([])
    expect(nameSimilarity('arrow-left', 'arrow-right')).toBe(0)
  })
})
