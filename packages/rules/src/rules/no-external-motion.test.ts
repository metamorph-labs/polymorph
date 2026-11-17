import { noExternalMotion } from './no-external-motion'
import { APP_FILE, jsxRuleTester } from './rule-tester'

jsxRuleTester().run('no-external-motion', noExternalMotion, {
  valid: [
    { filename: APP_FILE, code: `import { Dialog } from '@polymorph/react-ui'` },
    // A package that only starts with the same letters is not the engine.
    { filename: APP_FILE, code: `import x from 'motionless'` },
    // The vocabulary's own motion internals may import the engine.
    {
      filename: 'packages/react-ui/src/motion/engine.ts',
      code: `import { animate } from 'motion'`,
      options: [{ allowIn: ['packages/react-ui/src/motion/**'] }],
    },
    {
      filename: APP_FILE,
      code: `import { animate } from 'motion'
             export const A = () => <Bespoke reason="one-off chart">{animate}</Bespoke>`,
    },
    // A childless `<Bespoke />` also declares a zone, because it is the same element.
    {
      filename: APP_FILE,
      code: `import { animate } from 'motion'
             export const A = () => <Bespoke reason="one-off chart" />`,
    },
  ],

  invalid: [
    {
      filename: APP_FILE,
      code: `import { motion } from 'framer-motion'`,
      errors: [{ messageId: 'motionImport' }],
    },
    {
      filename: APP_FILE,
      code: `import { animate } from 'motion/react'`,
      errors: [{ messageId: 'motionImport' }],
    },
    {
      filename: APP_FILE,
      code: `const m = await import('gsap')`,
      errors: [{ messageId: 'motionImport' }],
    },
    // Re-exporting the engine leaks it just as importing does, and it is the
    // leak that would make the engine impossible to replace.
    // The report names the answer: the member that moves, or the zone.
    {
      filename: 'packages/react-ui/src/index.ts',
      code: `export * from 'motion'`,
      errors: [
        {
          message:
            'Unexpected re-export of `motion`. Drop it: compose the member that moves (rung 1), ' +
            'or keep a one-off in a `<Bespoke reason="…">` zone (rung 4). A re-export leaks the ' +
            'library as an import does.',
        },
      ],
    },
    {
      filename: 'packages/react-ui/src/index.ts',
      code: `export { animate } from 'motion/react'`,
      errors: [{ messageId: 'motionReexport' }],
    },
    // A re-exported presence is an entrance, which the overlays already make.
    {
      filename: APP_FILE,
      code: `export { AnimatePresence } from 'framer-motion'`,
      errors: [
        {
          message:
            'Unexpected re-export of `framer-motion`. `AnimatePresence` is an entrance and exit: ' +
            '`<Dialog>`, `<Drawer>`, `<Popover>` and `<Toast>` animate their own (rung 1).',
        },
      ],
    },
    // Mentioning `<Bespoke>` does not declare a zone. A file exempted by a
    // comment has no zone for `pnpm inventory` to report, so it would be an
    // undeclared exception, which the ladder exists to prevent.
    {
      filename: APP_FILE,
      code: `// <Bespoke> is the escape hatch, but a comment declares nothing.
import { motion } from 'framer-motion'`,
      errors: [{ messageId: 'motionImport' }],
    },
    {
      filename: APP_FILE,
      code: `import { motion } from 'framer-motion'
export const HINT = 'Wrap a genuine one-off in <Bespoke reason="…">.'`,
      errors: [{ messageId: 'motionImport' }],
    },
  ],
})

/**
 * What the report names: the member whose states already animate what the
 * file does with the library, or the zone when no member makes the call.
 */
jsxRuleTester().run('no-external-motion — what the report names', noExternalMotion, {
  valid: [],
  invalid: [
    {
      filename: APP_FILE,
      code: `import { motion } from 'framer-motion'
export const A = () => <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} />`,
      errors: [
        {
          message:
            'Unexpected motion library `framer-motion`. `motion.div` animating opacity is an ' +
            'entrance and exit: `<Dialog>`, `<Drawer>`, `<Popover>` and `<Toast>` animate their ' +
            'own (rung 1).',
        },
      ],
    },
    {
      filename: APP_FILE,
      code: `import { motion } from 'motion/react'
export const A = () => <motion.section animate={{ height: open ? 'auto' : 0 }} />`,
      errors: [
        {
          message:
            'Unexpected motion library `motion/react`. `motion.section` animating its height is ' +
            'a section opening and closing: `<Collapsible>` and `<Accordion>` animate their own ' +
            '(rung 1).',
        },
      ],
    },
    {
      filename: APP_FILE,
      code: `import { motion } from 'framer-motion'
export const A = () => <motion.button whileTap={{ scale: 0.97 }} />`,
      errors: [
        {
          message:
            'Unexpected motion library `framer-motion`. `motion.button` with whileTap is press ' +
            'feedback: `<Button>` already has it (rung 1). A one-off goes in a ' +
            '`<Bespoke reason="…">` zone.',
        },
      ],
    },
    {
      filename: APP_FILE,
      code: `import { CSSTransition } from 'react-transition-group'`,
      errors: [
        {
          message:
            'Unexpected motion library `react-transition-group`. `CSSTransition` is an entrance ' +
            'and exit: `<Dialog>`, `<Drawer>`, `<Popover>` and `<Toast>` animate their own (rung 1).',
        },
      ],
    },
    // A timeline library: no member makes the call, so the answer is the zone.
    {
      filename: APP_FILE,
      code: `import gsap from 'gsap'`,
      errors: [
        {
          message:
            'Unexpected motion library `gsap`. No member makes this call: motion binds to a ' +
            'member\'s states, so a one-off goes in a `<Bespoke reason="…">` zone (rung 4).',
        },
      ],
    },
  ],
})
