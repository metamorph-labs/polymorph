import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { build } from 'vite'

/**
 * Builds the screen page (`screen.html`) in memory and sends its files to the process that
 * started this one.
 *
 * The MCP server runs this as a child process the first time `render_screen` is called
 * (`docs/tooling.md`). It is a separate process for two reasons. The server's stdout is its
 * protocol, and a build that printed one line there would disconnect the client. The server also
 * has a pinned dependency list with no bundler in it, and this program belongs to the app that
 * owns one.
 *
 * Nothing is written to disk. The build uses the workbench's own configuration, so the page is
 * resolved, aliased and transformed exactly as the workbench is, and its one input is the screen
 * page, so the rest of the workbench is not built.
 *
 * The files go over the process channel as `{ files: [{ name, body }] }`, or `{ error }` when
 * the build fails. The parent must start this program with an IPC channel and the `advanced`
 * serialization, which carries the bytes of a font without encoding them.
 */

const here = dirname(fileURLToPath(import.meta.url))

if (typeof process.send !== 'function') {
  process.stderr.write('screen.build.mjs sends the page to its parent process and has none.\n')
  process.exit(1)
}

try {
  const built = await build({
    root: here,
    configFile: resolve(here, 'vite.config.ts'),
    logLevel: 'silent',
    build: {
      write: false,
      // A string replaces the configuration's two inputs. An object would be merged with them.
      rolldownOptions: { input: resolve(here, 'screen.html') },
    },
  })

  const files = (Array.isArray(built) ? built : [built])
    .flatMap((result) => result.output)
    .map((file) => ({
      name: file.fileName,
      body: file.type === 'chunk' ? file.code : file.source,
    }))

  process.send({ files }, () => process.exit(0))
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  process.send({ error: message }, () => process.exit(1))
}
