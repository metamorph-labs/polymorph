import { emitCommand } from '@polymorph/spec'

import { shippedRegistry, SOURCE } from './shipped'

/**
 * The screen emitter of the published tools: `node emit.js <spec.json> [out]`,
 * the checkout's `pnpm emit` over the registry and the native member packages
 * this package ships. `polymorph init` runs it in a new app to write the
 * welcome screen, with the app as the working directory, so the screen is
 * formatted with the app's Prettier settings.
 */
process.exitCode = await emitCommand({
  registry: shippedRegistry(),
  source: SOURCE,
  cwd: process.cwd(),
  argv: process.argv.slice(2),
  print: (text) => process.stdout.write(text),
  complain: (line) => console.error(line),
})
