import { describe, expect, it } from 'vitest'

import { serverFlags, ServerFlagsError } from './flags'

/**
 * The server's command line, which every entry point reads with this parser:
 * the checkout's `bin/polymorph-mcp.js` and the published tools' two bins.
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
