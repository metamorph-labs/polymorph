import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  PUBLISHED_NAMES as REGISTRY_NAMES,
  PUBLISHED_REGISTRY as REGISTRY_HOST,
  TOOLS_PACKAGE,
} from '@polymorph/registry'
import { describe, expect, it } from 'vitest'

import { READ_TOOL_NAMES, WRITE_TOOL_NAMES } from '../../../../packages/mcp/src/server'
import { LLMS_PATHS } from '../llms'
import {
  AGENT_FILES,
  MCP_READ_TOOLS,
  MCP_WRITE_TOOLS,
  PUBLISHED_NAMES,
  PUBLISHED_REGISTRY,
  PUBLISHED_SCOPE,
  REGISTRY_ACCESS,
  TOOLS_NAME,
} from './facts'

/**
 * `facts.ts` holds values whose sources the browser cannot import. Each one is held equal to its
 * source here, so the pages cannot print a stale name, registry, tool or path.
 */

const ROOT = resolve(import.meta.dirname, '../../../..')

describe('the published packages', () => {
  it('are the names the registry publishes', () => {
    expect(PUBLISHED_NAMES).toEqual(REGISTRY_NAMES)
  })

  it('live in the registry the registry package names', () => {
    expect(PUBLISHED_REGISTRY).toBe(REGISTRY_HOST)
  })

  it('are reached as the install page says', () => {
    // The access copy on the install page names GitHub Packages and its token. When the
    // registry changes, this fails, and `REGISTRY_ACCESS` and the install page change with it.
    expect(REGISTRY_HOST, 'REGISTRY_ACCESS is written for GitHub Packages').toBe(
      'https://npm.pkg.github.com',
    )
    expect(REGISTRY_ACCESS.npmrc).toBe(
      `${PUBLISHED_SCOPE}:registry=${REGISTRY_HOST}\n//npm.pkg.github.com/:_authToken=\${NODE_AUTH_TOKEN}`,
    )
    expect(PUBLISHED_SCOPE).toBe('@metamorph-labs')
  })
})

describe('the MCP server', () => {
  it('has the tools the install page lists', () => {
    expect([...MCP_READ_TOOLS]).toEqual([...READ_TOOL_NAMES])
    expect([...MCP_WRITE_TOOLS]).toEqual([...WRITE_TOOL_NAMES])
  })
})

describe('the commands and files', () => {
  it('run the tools by the name the registry publishes them under, scoped', () => {
    expect(TOOLS_NAME).toBe(REGISTRY_NAMES[TOOLS_PACKAGE])
    expect(TOOLS_NAME.startsWith(`${PUBLISHED_SCOPE}/`)).toBe(true)
    // The bins the published package carries, which a reader's `npx` runs.
    const manifest = JSON.parse(readFileSync(resolve(ROOT, 'packages/tools/package.json'), 'utf8'))
    expect(Object.keys((manifest as { bin: Record<string, string> }).bin)).toContain('polymorph')
  })

  it('link the files the site serves for agents', () => {
    expect(AGENT_FILES).toEqual(LLMS_PATHS)
  })
})
