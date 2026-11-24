import { main } from '@polymorph/cli'

import { shippedPrograms, shippedRegistry, SOURCE } from './shipped'

/**
 * `polymorph`, the published CLI: the checkout's `polymorph`, with the
 * registry and the source tree this package ships, so it needs no checkout.
 *
 * There are two roots, as in the checkout's bin. `SOURCE` is this package's
 * `dist/`, which holds the vocabulary an install copies from. The directory
 * the command runs in is the consumer's repository. `polymorph mcp` starts the
 * MCP server, the same server `polymorph-mcp` starts.
 *
 * The exit code is set, not forced, so a long report printed to a pipe is not
 * cut off.
 */

const argv = process.argv.slice(2)

if (argv[0] === 'mcp') {
  const { serve } = await import('./serve')
  await serve('polymorph mcp', argv.slice(1))
} else {
  const registry = shippedRegistry()
  const { code } = await main(
    {
      root: process.cwd(),
      source: SOURCE,
      registry,
      out: (line) => console.log(line),
      programs: shippedPrograms(registry),
      origin: 'published',
    },
    argv,
  )
  process.exitCode = code
}
