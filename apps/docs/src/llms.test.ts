import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { GUIDES, guideMarkdownPath } from './guide-catalogue'
import { CLI_BIN, LLMS_PATHS, llmsPaths, MCP_BIN, readLlmsFiles } from './llms'
import { MCP_CONFIG, OWN_THE_CODE, QUICK_START, TARGETS, THEME_STEPS } from './reference/install'
import { REGISTRY } from './registry'

/**
 * The files an agent fetches first. They are read from the registry the
 * generator wrote, as `vite.config.ts` reads them, so these assertions hold for
 * what the site serves and writes into `dist/`.
 */

const ROOT = resolve(import.meta.dirname, '../../..')
const files = readLlmsFiles(ROOT)
const text = (path: string) => files[path]?.body ?? ''

describe('/llms.txt points an agent at the contract', () => {
  const index = text(LLMS_PATHS.index)

  it('links the system card and the full text', () => {
    expect(index).toContain(`](${LLMS_PATHS.card})`)
    expect(index).toContain(`](${LLMS_PATHS.full})`)
  })

  it('names the MCP server and `init`, by bins that exist', () => {
    expect(index).toContain(`node <checkout>/${MCP_BIN}`)
    expect(index).toContain(`node <checkout>/${CLI_BIN} init`)
    expect(existsSync(resolve(ROOT, MCP_BIN))).toBe(true)
    expect(existsSync(resolve(ROOT, CLI_BIN))).toBe(true)
  })

  it('states the three facts an agent works by', () => {
    expect(index).toContain('The vocabulary is closed.')
    expect(index).toContain('Screens are specs or TSX under the rules.')
    expect(index).toContain('Every violation names its fix.')
  })

  it('lists every rule on application code, and no rule on the vocabulary alone', () => {
    const named = (applies: string) =>
      new Set(REGISTRY.laws.filter((law) => law.applies === applies).map((law) => law.name))
    const application = named('application')
    expect(application.size).toBeGreaterThan(0)
    for (const name of application) expect(index).toContain(`\`${name}\``)
    for (const name of named('vocabulary')) {
      if (!application.has(name)) expect(index).not.toContain(`\`${name}\``)
    }
  })

  it('stays short enough to read before anything else', () => {
    // It is an index into the contract, not a copy of it. The card is the long read.
    expect(index.length).toBeLessThan(text(LLMS_PATHS.card).length / 4)
  })
})

describe('the files for agents', () => {
  it('are the ones the site knows the paths of before it reads them', () => {
    expect([...llmsPaths()].sort()).toEqual(Object.keys(files).sort())
  })
})

describe('/llms.txt lists the guides', () => {
  const index = text(LLMS_PATHS.index)

  it('links every guide’s markdown file, which the site serves', () => {
    for (const guide of GUIDES) {
      const path = guideMarkdownPath(guide.slug)
      expect(index).toContain(`- [${guide.title}](${path}): ${guide.description}`)
      expect(files[path]?.type, path).toBe('text/markdown')
    }
  })

  it('links only files the site serves and addresses outside it', () => {
    for (const match of index.matchAll(/\]\(([^)\s]+)\)/g)) {
      const href = match[1]!
      if (!href.startsWith('/')) expect(href).toMatch(/^https:\/\//)
      else expect(files[href], href).toBeDefined()
    }
  })

  it('writes each link in full when the build knows the site’s address', () => {
    const origin = 'https://site.test'
    const absolute = readLlmsFiles(ROOT, origin)[LLMS_PATHS.index]?.body ?? ''
    const hrefs = [...absolute.matchAll(/\]\(([^)\s]+)\)/g)].map((match) => match[1]!)
    expect(hrefs.length).toBeGreaterThan(GUIDES.length)
    for (const href of hrefs) expect(href).toMatch(/^https:\/\//)
    expect(absolute).toContain(`](${origin}${guideMarkdownPath('concepts')})`)
  })
})

describe('each guide’s markdown file', () => {
  // A code span or a fence may show link syntax, so both are removed before a check.
  const prose = (body: string) =>
    body.replace(/^( *)(`{3,}|~{3,})[\s\S]*?^\1\2\s*$/gm, '').replace(/(`+)[\s\S]*?\1/g, '')

  it('begins with the guide’s own heading', () => {
    for (const guide of GUIDES) {
      expect(text(guideMarkdownPath(guide.slug)).startsWith(`# ${guide.title}\n`), guide.slug).toBe(
        true,
      )
    }
  })

  it('links the other guides by their markdown files, and nothing by a relative path', () => {
    for (const guide of GUIDES) {
      const body = prose(text(guideMarkdownPath(guide.slug)))
      for (const match of body.matchAll(/\]\(([^)\s]+)\)/g)) {
        const href = match[1]!
        if (href.startsWith('#') || /^(https?:|mailto:)/.test(href)) continue
        // What is left is a path from the site's root, and the site serves a file there.
        expect(files[href.split('#')[0]!], `${guide.slug}: ${href}`).toBeDefined()
      }
    }
  })

  it('writes a link to another guide in full when the build knows the site’s address', () => {
    const origin = 'https://site.test'
    const body = readLlmsFiles(ROOT, origin)[guideMarkdownPath('concepts')]?.body ?? ''
    expect(body).toContain(`](${origin}${guideMarkdownPath('theming')})`)
    expect(prose(body)).not.toMatch(/\]\(\/[^)\s]*\)/)
  })
})

describe('the install page names the same bins', () => {
  // The page's commands are built in `reference/install.ts`, so these are the strings it shows.
  const commands = [
    QUICK_START,
    MCP_CONFIG,
    OWN_THE_CODE.code,
    ...THEME_STEPS.map((step) => step.code),
    ...TARGETS.flatMap((target) => [
      ...(target.create === undefined ? [] : [target.create.code]),
      ...target.add.map((step) => step.code),
    ]),
  ].join('\n')

  it('runs the CLI and the MCP server from a checkout, never by a bare name', () => {
    // Neither is published, so a bare `polymorph` or `polymorph-mcp` is a
    // command no reader has, and the CLI writes into the directory it runs in.
    expect(MCP_CONFIG).toContain('"command": "node"')
    expect(MCP_CONFIG).toContain(`/polymorph/${MCP_BIN}"`)
    expect(commands).toContain(`node ../polymorph/${CLI_BIN} add`)
    expect(commands).toContain(`node polymorph/${CLI_BIN} init`)
    expect(commands).not.toMatch(/^polymorph(-mcp)?\b/m)
  })
})

describe('/llms-full.txt is the contract in one fetch', () => {
  const card = readFileSync(resolve(ROOT, 'registry/system-card.md'), 'utf8')
  const full = text(LLMS_PATHS.full)

  it('begins with the system card’s first heading', () => {
    const heading = card.split('\n').find((line) => line.startsWith('# '))
    expect(heading).toBeDefined()
    expect(full.startsWith(`${heading}\n`)).toBe(true)
  })

  it('holds the whole card, then the rules page', () => {
    expect(full.startsWith(card.trimEnd())).toBe(true)
    // The rules are the text the site serves as the guide's markdown file, so
    // no link in them is relative to the repository.
    const rules = text(guideMarkdownPath('rules'))
    expect(rules).toContain('## The exception ladder')
    expect(full.endsWith(`${rules.trimEnd()}\n`)).toBe(true)
  })

  it('serves the card itself at /system-card.md', () => {
    expect(text(LLMS_PATHS.card)).toBe(card)
  })
})
