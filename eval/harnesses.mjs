import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, symlinkSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'

import { messageOf } from './toolbox.mjs'

/**
 * What the eval's runners share about the two coding harnesses they start:
 * Claude Code (`claude -p`, the `cli` runner) and Codex (`codex exec`, the
 * `codex` runner). Each harness is started with the owner's sign-in and
 * nothing else of the owner's: no settings, plugins, hooks, skills, memories
 * or MCP servers of theirs (`docs/verification.md`, "The agent eval").
 */

/**
 * The harness failed, or reported an error of its own, such as one from the
 * model's API. The eval stops, with the runs it finished written. `reason` is
 * `cli` or `usage-limit`, as the results file's `stopped.reason` names them.
 */
export class HarnessError extends Error {
  constructor(reason, message) {
    super(message)
    this.reason = reason
  }
}

/** How a harness words a usage or rate limit on the account it is signed in to. */
export const LIMIT_WORDS = /hit your (?:\w+ )?limit|usage limit|rate limit/i

/** The end of what a harness wrote to stderr, for a failure's message. */
export const tail = (text) => (text.trim() === '' ? '' : `: ${text.trim().slice(-2000)}`)

/* -------------------------------------------------------------------------- */
/* Claude Code                                                                */
/* -------------------------------------------------------------------------- */

/**
 * The `CLAUDE*` variables kept for Claude Code: the ones that choose how it
 * signs in and where it keeps its configuration.
 */
const CLAUDE_SIGN_IN = new Set([
  'CLAUDE_CODE_OAUTH_TOKEN',
  'CLAUDE_CODE_USE_BEDROCK',
  'CLAUDE_CODE_USE_VERTEX',
  'CLAUDE_CODE_USE_FOUNDRY',
  'CLAUDE_CONFIG_DIR',
])

/**
 * The environment Claude Code runs in: the eval's own, without the other
 * `CLAUDE*` variables. A Claude Code session sets those for the processes it
 * starts, among them the session's effort and a switch that drops the `mcp__`
 * prefix from tool names, and an eval started from inside one would otherwise
 * run the CLI as part of that session. `extra` is added last.
 */
export function claudeEnvironment(extra = {}) {
  const kept = Object.entries(process.env).filter(
    ([name]) => !name.startsWith('CLAUDE') || CLAUDE_SIGN_IN.has(name),
  )
  return { ...Object.fromEntries(kept), ...extra }
}

/* -------------------------------------------------------------------------- */
/* Codex                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The `CODEX*` variables kept for Codex: the API key and access token a
 * process with no saved sign-in uses, and the certificate bundle it trusts
 * (https://learn.chatgpt.com/docs/config-file/environment-variables). Every
 * other one is dropped, so an eval started from inside a Codex session does
 * not run Codex as part of it.
 */
const CODEX_SIGN_IN = new Set(['CODEX_API_KEY', 'CODEX_ACCESS_TOKEN', 'CODEX_CA_CERTIFICATE'])

/**
 * A Codex home of the run's own, at `directory`: empty but for the owner's
 * saved sign-in, linked in. `CODEX_HOME` holds Codex's configuration, its
 * sign-in, its sessions and the global `AGENTS.md`
 * (https://learn.chatgpt.com/docs/config-file/environment-variables,
 * https://learn.chatgpt.com/docs/agent-configuration/agents-md), so a run
 * pointed at this one reads none of the owner's `config.toml` (their MCP
 * servers, plugins, profiles, hooks and memories) and none of their
 * instructions. `--ignore-user-config` would leave the global `AGENTS.md` in.
 *
 * The sign-in is `auth.json` in the owner's Codex home, the one `CODEX_HOME`
 * names or `~/.codex` (https://learn.chatgpt.com/docs/non-interactive-mode
 * names `~/.codex/auth.json`). It is linked rather than copied, so a token
 * Codex refreshes is refreshed for the owner. Without one, Codex signs in
 * with `CODEX_API_KEY`, which the environment keeps.
 */
export function codexHome(directory, env = process.env) {
  mkdirSync(directory, { recursive: true })
  const own = env.CODEX_HOME === undefined ? resolve(homedir(), '.codex') : env.CODEX_HOME
  const auth = resolve(own, 'auth.json')
  if (existsSync(auth) && !existsSync(resolve(directory, 'auth.json'))) {
    symlinkSync(auth, resolve(directory, 'auth.json'))
  }
  return directory
}

/** The environment Codex runs in: the eval's own, without the `CODEX*` variables it does not keep, and `home` as its home. */
export function codexEnvironment(home, extra = {}) {
  const kept = Object.entries(process.env).filter(
    ([name]) => !name.startsWith('CODEX') || CODEX_SIGN_IN.has(name),
  )
  return { ...Object.fromEntries(kept), CODEX_HOME: home, ...extra }
}

/**
 * A value written as TOML, for a `-c key=value` override, which Codex parses
 * as TOML (https://learn.chatgpt.com/docs/config-file/config-advanced). A
 * JSON string is a TOML basic string, so strings, numbers, booleans and
 * arrays are written as JSON writes them; an object is an inline table.
 */
export function toml(value) {
  if (Array.isArray(value)) return `[${value.map(toml).join(', ')}]`
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value).map(
      ([key, item]) =>
        `${/^[A-Za-z0-9_-]+$/.test(key) ? key : JSON.stringify(key)} = ${toml(item)}`,
    )
    return entries.length === 0 ? '{}' : `{ ${entries.join(', ')} }`
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return JSON.stringify(value)
  }
  throw new Error(`no TOML value for ${String(value)}`)
}

/** One `-c key=value` override. */
export const override = (key, value) => ['-c', `${key}=${toml(value)}`]

/**
 * A TOML value as `toml` writes one, read back: strings, numbers, booleans,
 * arrays and inline tables. The stand-in for Codex reads the overrides with
 * it. Anything else throws.
 */
export function readToml(text) {
  let at = 0
  const space = () => {
    while (at < text.length && /\s/.test(text[at])) at += 1
  }
  const fail = (what) => {
    throw new Error(`not a TOML value the eval writes: ${what} at ${at} in ${text}`)
  }
  const string = () => {
    const start = at
    at += 1
    while (at < text.length && text[at] !== '"') at += text[at] === '\\' ? 2 : 1
    if (at >= text.length) fail('an unclosed string')
    at += 1
    return JSON.parse(text.slice(start, at))
  }
  const key = () => {
    space()
    if (text[at] === '"') return string()
    const match = /^[A-Za-z0-9_-]+/.exec(text.slice(at))
    if (match === null) fail('a key')
    at += match[0].length
    return match[0]
  }
  const value = () => {
    space()
    const next = text[at]
    if (next === '"') return string()
    if (next === '[') {
      at += 1
      const items = []
      for (space(); text[at] !== ']'; space()) {
        items.push(value())
        space()
        if (text[at] === ',') at += 1
        else if (text[at] !== ']') fail('a list')
      }
      at += 1
      return items
    }
    if (next === '{') {
      at += 1
      const table = {}
      for (space(); text[at] !== '}'; space()) {
        const name = key()
        space()
        if (text[at] !== '=') fail('a table')
        at += 1
        table[name] = value()
        space()
        if (text[at] === ',') at += 1
        else if (text[at] !== '}') fail('a table')
      }
      at += 1
      return table
    }
    const match = /^(?:true|false|-?\d+(?:\.\d+)?)/.exec(text.slice(at))
    if (match === null) fail('a value')
    at += match[0].length
    return JSON.parse(match[0])
  }
  const read = value()
  space()
  if (at !== text.length) fail('text after the value')
  return read
}

/* -------------------------------------------------------------------------- */
/* Both                                                                       */
/* -------------------------------------------------------------------------- */

/** Every harness the eval has running, each with how to stop it at once. */
const live = new Set()

/**
 * Keeps `stop` while a harness runs, until `exited` settles, so a signal to
 * the eval stops the harness too. A harness the project lane starts runs in
 * a process group of its own, which a signal to the eval's group does not
 * reach.
 */
export function track(stop, exited) {
  const entry = { stop }
  live.add(entry)
  exited.finally(() => live.delete(entry))
}

/**
 * On SIGINT or SIGTERM, the eval stops every harness still running, removes
 * what `cleanup` removes (its scratch directories, the project lane's
 * template among them), and exits with 130 or 143. The results file holds
 * the runs that finished, marked partial. A signal that arrives while the
 * eval waits on a command it runs to the end (`polymorph init`, the judge's
 * check and build) is acted on when that command returns.
 */
export function onInterrupt(cleanup) {
  for (const [signal, code] of [
    ['SIGINT', 130],
    ['SIGTERM', 143],
  ]) {
    process.once(signal, () => {
      for (const entry of live) entry.stop()
      live.clear()
      try {
        cleanup()
      } finally {
        console.error(`eval: stopped by ${signal}; every harness it started is stopped`)
        process.exit(code)
      }
    })
  }
}

/**
 * A harness's version, as `--version` prints it: the first thing in it that
 * reads as a version number (`2.1.299 (Claude Code)`, `codex-cli 0.98.0`), or
 * its first word. A harness that does not run stops the eval before it
 * starts; `refuse` says so and exits.
 */
export function versionOf(launcher, env, name, refuse) {
  try {
    const printed = execFileSync(launcher.command, [...launcher.prefix, '--version'], {
      encoding: 'utf8',
      env,
      timeout: 60_000,
    }).trim()
    return /\d+\.\d+[\w.+-]*/.exec(printed)?.[0] ?? printed.split(/\s+/)[0] ?? 'unknown'
  } catch (error) {
    return refuse(
      `the ${name} did not run (\`${launcher.command} --version\`): ${messageOf(error)}`,
    )
  }
}
