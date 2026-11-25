import { describe, expect, it } from 'vitest'

import { serverFlags, ServerFlagsError } from './server-flags'

/**
 * The MCP server's command line, which everything that starts the server
 * reads with this parser: `polymorph mcp`, the checkout's `polymorph-mcp` and
 * the published tools' bins.
 */
describe('the server’s flags', () => {
  it('reads a project, in either spelling, and a read-only server', () => {
    expect(serverFlags([])).toEqual({ readOnly: false })
    expect(serverFlags(['--project', 'app'])).toEqual({ project: 'app', readOnly: false })
    expect(serverFlags(['--project=app'])).toEqual({ project: 'app', readOnly: false })
    expect(serverFlags(['--read-only'])).toEqual({ readOnly: true })
  })

  it('refuses an unknown flag, so a mistyped `--read-only` cannot start a server that writes', () => {
    expect(() => serverFlags(['--readonly'])).toThrow(ServerFlagsError)
    expect(() => serverFlags(['--readonly'])).toThrow('unknown argument "--readonly"')
  })

  it('refuses a project flag with no path', () => {
    for (const argv of [['--project'], ['--project', '--read-only'], ['--project=']]) {
      expect(() => serverFlags(argv), argv.join(' ')).toThrow('`--project` needs a path')
    }
  })
})
