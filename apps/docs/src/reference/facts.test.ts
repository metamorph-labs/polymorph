import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  PUBLISHED_NAMES as REGISTRY_NAMES,
  PUBLISHED_REGISTRY as REGISTRY_HOST,
} from '@polymorph/registry'
import { describe, expect, it } from 'vitest'

import { READ_TOOL_NAMES, WRITE_TOOL_NAMES } from '../../../../packages/mcp/src/server'
import { CLI_BIN as LLMS_CLI_BIN, LLMS_PATHS, MCP_BIN as LLMS_MCP_BIN } from '../llms'
import {
  AGENT_FILES,
  CLI_BIN,
  MCP_BIN,
  MCP_READ_TOOLS,
  MCP_WRITE_TOOLS,
  PUBLISHED_NAMES,
  PUBLISHED_REGISTRY,
  PUBLISHED_SCOPE,
  REGISTRY_ACCESS,
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
  it('name bins that exist, the ones /llms.txt names', () => {
    expect(CLI_BIN).toBe(LLMS_CLI_BIN)
    expect(MCP_BIN).toBe(LLMS_MCP_BIN)
    expect(existsSync(resolve(ROOT, CLI_BIN))).toBe(true)
    expect(existsSync(resolve(ROOT, MCP_BIN))).toBe(true)
  })

  it('link the files the site serves for agents', () => {
    expect(AGENT_FILES).toEqual(LLMS_PATHS)
  })
})
