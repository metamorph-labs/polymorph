import { spawn } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

import { chromium } from 'playwright'

/**
 * Takes the screenshots for `pnpm proof` (`docs/verification.md`).
 *
 * Screenshots are the only part of the proof a reader must take on trust, so
 * they are taken strictly: one build, one browser, one viewport per studio, and
 * every scene described as data rather than as a sequence of clicks. A scene
 * that needs interaction declares it in `act`.
 *
 * It shoots the **built** app rather than the dev server. `vite preview` serves
 * what ships, and a proof taken against a dev bundle would only prove something
 * about the dev bundle.
 *
 * The viewport is a parameter rather than a constant, because the phone lane
 * (`docs/layout.md`, the phone register) is the same pipeline at a different
 * width, with the same build, scene shape and capture code. It is set per
 * studio, not per scene, because a lane stands for one device. A scene never
 * needs to know which device it is shot on, and all shots in a lane are
 * comparable.
 */

export const PORT = 4173
const ORIGIN = `http://localhost:${PORT}`

/** The desktop the baseline and churn scenes are shot at, and the phone lane's phone. */
export const DESKTOP = { width: 1440, height: 900 }
export const PHONE = { width: 375, height: 812 }

/** Long enough for a spring to settle and a font to swap, and short enough to run six times. */
const SETTLE_MS = 700

export function run(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: 'pipe', ...options })
    let out = ''
    child.stdout.on('data', (chunk) => (out += chunk))
    child.stderr.on('data', (chunk) => (out += chunk))
    child.on('close', (code) => resolve({ code, out }))
  })
}

/** stdout of a command that is expected to succeed, trimmed. */
export async function capture(command, args) {
  const { out } = await run(command, args)
  return out.trim()
}

async function reachable() {
  try {
    return (await fetch(ORIGIN)).ok
  } catch {
    return false
  }
}

async function waitForServer() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (await reachable()) return
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error(`proof: ${ORIGIN} never came up`)
}

/**
 * Builds, serves, and returns a shooter. The caller closes it.
 *
 * The build is the slow part, and it must run once per churn. A churn test
 * checks that the output changed, so a cached bundle would show the opposite of
 * the claim.
 */
export async function openStudio({ viewport = DESKTOP } = {}) {
  /*
   * Nothing else may be on the port.
   *
   * Otherwise `vite preview` without `--strictPort` moves to the next free port,
   * this script keeps polling the original, and every screenshot shows whatever
   * was already serving there. The proof would silently capture a stale build.
   * Both paths are closed: the check below, and `--strictPort` so vite refuses
   * to move.
   */
  if (await reachable()) {
    throw new Error(
      `proof: something is already serving ${ORIGIN}.\n` +
        'Stop it first — otherwise the screenshots would be of that, not of this build.',
    )
  }

  const build = await run('pnpm', ['build'])
  if (build.code !== 0) throw new Error(`proof: build failed\n${build.out}`)

  /*
   * `detached` so the whole process group can be killed. `pnpm exec` is a
   * wrapper. Killing the pid kills pnpm and leaves the real vite process holding
   * the port, which causes the stale-server problem above.
   */
  const server = spawn(
    'pnpm',
    [
      '--filter',
      '@polymorph/workbench',
      'exec',
      'vite',
      'preview',
      '--strictPort',
      '--port',
      String(PORT),
    ],
    { stdio: 'ignore', detached: true },
  )
  await waitForServer()

  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport, deviceScaleFactor: 2 })

  /**
   * Each problem is recorded with its cause. A run that reports only "something
   * 404'd" would ask the reader to trust it, which a proof script must not do.
   *
   * Failed responses are listened for as well as console errors, because the
   * console only says "Failed to load resource". The URL is on the response, and
   * the URL is what that finding needs.
   */
  const problems = []
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`))
  page.on('response', (response) => {
    if (response.status() >= 400) {
      problems.push(`http ${response.status()}: ${response.url()}`)
    }
  })
  page.on('console', (message) => {
    // Covered by the response listener above, with the URL attached.
    if (message.type() !== 'error') return
    if (message.text().startsWith('Failed to load resource')) return
    problems.push(`console: ${message.text()}`)
  })

  return {
    page,
    problems,

    /**
     * One scene. Scope attributes are set directly rather than through the
     * settings screen, because the claim under test is that the attribute
     * re-themes everything. Driving it through a control would test the control.
     */
    async shot(directory, name, scene) {
      mkdirSync(directory, { recursive: true })
      await page.goto(`${ORIGIN}${scene.route}`, { waitUntil: 'networkidle' })
      await page.evaluate((attributes) => {
        for (const [attribute, value] of Object.entries(attributes)) {
          if (value === undefined) document.documentElement.removeAttribute(attribute)
          else document.documentElement.setAttribute(attribute, value)
        }
      }, scene.attrs ?? {})
      if (scene.act) await scene.act(page)
      await page.waitForTimeout(scene.settleMs ?? SETTLE_MS)

      const file = join(directory, `${name}.png`)
      await page.screenshot({ path: file })
      return file
    },

    async close() {
      await browser.close()
      // The group, not the pid. See the `detached` note above.
      try {
        process.kill(-server.pid, 'SIGTERM')
      } catch {
        server.kill()
      }
      // The next churn rebuilds and serves on the same port. Returning before
      // the socket is free would trip the port check above.
      for (let attempt = 0; attempt < 50 && (await reachable()); attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 100))
      }
    },
  }
}

export function resetShots(directory) {
  rmSync(directory, { recursive: true, force: true })
  mkdirSync(directory, { recursive: true })
}
