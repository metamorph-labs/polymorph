import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { buildRegistry, FRAMEWORK_VOCABULARY, type Registry } from '@polymorph/registry'
import { EMITTED_MARKER } from '@polymorph/spec'
import { afterAll, describe, expect, it } from 'vitest'

import { createServer } from './server'
import {
  emitScreen,
  fix,
  fixFile,
  FrameworkMismatchError,
  getInstallPlan,
  getSystemCard,
  install,
  RefusedWriteError,
  searchComponents,
  validate,
  type ToolContext,
} from './tools'

/**
 * The tools, asked about Svelte and Solid, as `vue.test.ts` asks them about
 * Vue: every tool that reads `framework` takes both values, answers from the
 * registry's `frameworks` entries, and checks, writes and installs in that
 * framework's terms.
 *
 * The answers about what exists are checked against a copy of the registry in
 * which every member is native and `Badge` is absent, so they do not depend on
 * which members the live maps mark native. The install tools read the live
 * registry, whose native members publish the files an install copies.
 */

const ROOT = resolve(import.meta.dirname, '../../..')
const registry: Registry = buildRegistry(ROOT)

const FRAMEWORKS = ['svelte', 'solid'] as const

/** Every member native in Svelte and Solid, except `Badge`, marked absent. */
const mapped: Registry = {
  ...registry,
  components: registry.components.map((component) => ({
    ...component,
    frameworks: {
      ...component.frameworks,
      ...Object.fromEntries(
        FRAMEWORKS.map((framework) => [
          framework,
          component.name === 'Badge'
            ? { status: 'absent', reason: `no ${framework} shell yet` }
            : { status: 'native' },
        ]),
      ),
    },
  })),
  exceptions: {
    ...registry.exceptions,
    primitives: registry.exceptions.primitives.map((primitive) => ({
      ...primitive,
      frameworks: {
        ...primitive.frameworks,
        ...Object.fromEntries(FRAMEWORKS.map((framework) => [framework, { status: 'native' }])),
      },
    })),
  },
}

const temporaries: string[] = []
afterAll(() => {
  for (const path of temporaries) rmSync(path, { recursive: true, force: true })
})

function project(dependencies: Record<string, string> = {}): ToolContext & { project: string } {
  const path = mkdtempSync(resolve(tmpdir(), 'polymorph-mcp-fw-'))
  temporaries.push(path)
  writeFileSync(resolve(path, 'package.json'), JSON.stringify({ name: 'app', dependencies }))
  return { registry: mapped, root: ROOT, project: path }
}

const SPEC = JSON.stringify({
  spec: 'polymorph-screen/1',
  name: 'Probe',
  purpose: 'A probe.',
  inputs: [{ name: 'onSave', type: '() => void' }],
  root: {
    component: 'Stack',
    props: { gap: 4 },
    children: [{ component: 'Button', props: { label: 'Save', onClick: { $: 'onSave' } } }],
  },
})

const BADGE = JSON.stringify({
  ...(JSON.parse(SPEC) as object),
  root: { component: 'Badge', children: ['New'] },
})

describe.each(FRAMEWORKS)('the read tools, for %s', (framework) => {
  const context: ToolContext = { registry: mapped, root: ROOT }

  it('search leaves out a member with no shell in the framework, and only there', () => {
    const named = searchComponents(context, { framework, limit: 200 }).map((hit) => hit.name)
    const react = searchComponents(context, { limit: 200 }).map((hit) => hit.name)
    expect(named).not.toContain('Badge')
    expect(named).toHaveLength(react.length - 1)
  })

  it('renders the card for the framework', () => {
    const card = getSystemCard(context, { framework })
    expect(card).toContain(`imports members from \`${FRAMEWORK_VOCABULARY[framework]}\``)
    expect(card).not.toContain('- **Badge** ')
  })

  it('checks a spec against the framework’s vocabulary, naming the reason a member is absent', async () => {
    const answer = await validate(context, { spec: BADGE, framework })
    expect(answer.ok).toBe(false)
    expect(answer.faults).toEqual([
      {
        path: '$.root',
        message: `\`Badge\` is absent in ${framework} — no ${framework} shell yet`,
      },
    ])
  })

  it('lints TypeScript and CSS as themselves', async () => {
    const script = await validate(context, {
      code: "import { motion } from 'framer-motion'\nexport const fade = motion.div\n",
      framework,
    })
    expect(script.filename).toMatch(/\.tsx$/)
    expect(script.violations?.map((violation) => violation.rule)).toContain(
      'polymorph/no-external-motion',
    )
    const css = await validate(context, {
      code: '.hero {\n  transition: opacity 200ms;\n}\n',
      framework,
    })
    expect(css.filename).toMatch(/\.css$/)
    expect(css.ok).toBe(false)
  })
})

describe('validate, reading each framework’s code', () => {
  const context: ToolContext = { registry: mapped, root: ROOT }

  it('lints Svelte markup as a component, at the place it was given', async () => {
    const answer = await validate(context, {
      code: '<div style="padding: 12px"></div>',
      framework: 'svelte',
    })
    expect(answer.filename).toMatch(/\.svelte$/)
    expect(answer.ok).toBe(false)
    expect(answer.violations?.[0]).toMatchObject({
      rule: 'polymorph/no-raw-styles',
      line: 1,
      column: 6,
    })
    const component = `<script lang="ts">\nimport { Button } from '@polymorph/svelte-ui'\n</script>\n\n<Button class="wide" label="Go" />\n`
    const linted = await validate(context, { code: component, framework: 'svelte' })
    expect(linted.filename).toMatch(/\.svelte$/)
    expect(linted.violations?.map((violation) => violation.rule)).toEqual([
      'polymorph/no-raw-styles',
    ])
  })

  it('lints Solid TSX with Solid’s idioms', async () => {
    const code = `import { Button } from '@polymorph/solid-ui'\n\nexport const A = () => <Button class="wide" label="Go" />\n`
    const answer = await validate(context, { code, framework: 'solid' })
    expect(answer.filename).toMatch(/\.tsx$/)
    expect(answer.violations?.map((violation) => violation.rule)).toEqual([
      'polymorph/no-raw-styles',
    ])
  })
})

describe('fix and fix_file, for Svelte and Solid', () => {
  const RAW = 'export const A = () => <button type="button" onClick={go}>Go</button>\n'

  it('imports a rewritten `<button>` from the Solid vocabulary in a Solid project', async () => {
    const context = project({ '@polymorph/solid-ui': '^1.0.0' })
    const answer = await fix(context, { code: RAW })
    expect(answer.code).toBe(
      'import { Button } from \'@polymorph/solid-ui\'\n\nexport const A = () => <Button label="Go" onClick={go} />\n',
    )
    writeFileSync(resolve(context.project, 'A.tsx'), RAW)
    await fixFile(context, { path: 'A.tsx' })
    expect(readFileSync(resolve(context.project, 'A.tsx'), 'utf8')).toBe(answer.code)
  })

  it('keeps React’s vocabulary in a project that depends on it', async () => {
    const context = project({ '@polymorph/react-ui': '^1.0.0' })
    expect((await fix(context, { code: RAW })).code).toContain(
      "import { Button } from '@polymorph/react-ui'",
    )
  })

  it('fixes Svelte markup as a component', async () => {
    const component = `<script lang="ts">\nimport { Button } from '@polymorph/svelte-ui'\n</script>\n\n<Button class="wide" label="Go" />\n`
    const context = project({ '@polymorph/svelte-ui': '^1.0.0' })
    const answer = await fix(context, { code: component, framework: 'svelte' })
    expect(answer.filename).toMatch(/\.svelte$/)
    expect(answer.code).toBe(component.replace(' class="wide"', ''))
    writeFileSync(resolve(context.project, 'Probe.svelte'), component)
    await fixFile(context, { path: 'Probe.svelte' })
    expect(readFileSync(resolve(context.project, 'Probe.svelte'), 'utf8')).toBe(answer.code)
  })
})

describe('the tools that read code or a spec, in a Solid project without `framework`', () => {
  // `validate`, `fix`, `fix_file` and `emit_screen` ask one function which
  // framework the project writes TSX in, so a fragment `validate` passes is
  // one `fix` passes, and a spec `validate` accepts is one `emit_screen` writes.
  const solid = () => project({ '@polymorph/solid-ui': '^1.0.0' })
  const at = (violations: { rule: string; line: number; column: number }[] = []) =>
    violations.map(({ rule, line, column }) => `${rule}@${line}:${column}`)

  it('validate and fix agree on a fragment', async () => {
    const context = solid()
    const code = 'export const A = () => <div onclick={go} class="x" />\n'
    const checked = await validate(context, { code })
    const fixed = await fix(context, { code })
    expect(at(checked.violations)).toEqual([
      'polymorph/no-raw-interactive@1:24',
      'polymorph/no-raw-styles@1:42',
    ])
    expect(at(fixed.violations)).toEqual(at(checked.violations))
    expect(fixed).toMatchObject({ ok: false, changed: false })

    // The rewrite `validate` offers is the one `fix` applies.
    const raw = 'export const A = () => <button type="button" onClick={go}>Go</button>\n'
    const offered = (await validate(context, { code: raw })).violations?.[0]?.fix
    expect(offered?.text).toContain("from '@polymorph/solid-ui'")
    expect((await fix(context, { code: raw })).code).toContain("from '@polymorph/solid-ui'")
  })

  it('reads the same fragment as React’s in a React project, in both tools', async () => {
    const context = project({ '@polymorph/react-ui': '^1.0.0' })
    const code = 'export const A = () => <div onclick={go} class="x" />\n'
    expect((await validate(context, { code })).violations).toEqual([])
    expect((await fix(context, { code })).violations).toEqual([])
  })

  it('checks a spec in Solid, as emit_screen writes it', async () => {
    const context = solid()
    const absent = `\`Badge\` is absent in solid — no solid shell yet`
    expect((await validate(context, { spec: BADGE })).faults?.[0]?.message).toBe(absent)
    const refused = await emitScreen(context, { spec: BADGE, path: 'src/Probe.tsx' })
    expect(refused.faults[0]?.message).toBe(absent)

    expect((await validate(context, { spec: SPEC })).ok).toBe(true)
    const answer = await emitScreen(context, { spec: SPEC, path: 'src/Probe.tsx' })
    expect(answer).toMatchObject({ ok: true, language: 'tsx', notes: [] })
    const code = readFileSync(resolve(context.project, 'src/Probe.tsx'), 'utf8')
    expect(code).toMatch(/from ['"]@polymorph\/solid-ui['"]/)
    expect(code).toContain('onClick={props.onSave}')
  })

  it('checks a native spec in no web framework', async () => {
    const ios = JSON.stringify({
      spec: 'polymorph-screen/1',
      name: 'Alerts',
      purpose: 'Whether the app may send alerts.',
      platform: 'ios',
      inputs: [{ name: 'enabled', type: 'boolean' }],
      root: {
        component: 'SettingsPage',
        props: { title: 'Alerts' },
        children: [
          {
            component: 'SettingsRow',
            props: {
              label: 'Send alerts',
              control: { component: 'Switch', props: { checked: { $: 'enabled' } } },
            },
          },
        ],
      },
    })
    expect(await validate(solid(), { spec: ios })).toMatchObject({ ok: true, faults: [] })
  })
})

describe('emit_screen, for Svelte and Solid', () => {
  it('writes a Svelte component that validated against the Svelte vocabulary', async () => {
    const context = project({ '@polymorph/svelte-ui': '^1.0.0' })
    const answer = await emitScreen(context, { spec: SPEC, path: 'src/Probe.svelte' })
    expect(answer).toMatchObject({ ok: true, outcome: 'written', notes: [], language: 'svelte' })
    const code = readFileSync(resolve(context.project, 'src/Probe.svelte'), 'utf8')
    expect(code).toContain('<script module lang="ts">')
    expect(code).toContain(EMITTED_MARKER)
    expect(code).toContain('onClick={onSave}')
  })

  it('writes Solid TSX to a .tsx path when asked for Solid', async () => {
    const context = project({ '@polymorph/solid-ui': '^1.0.0' })
    const answer = await emitScreen(context, {
      spec: SPEC,
      path: 'src/Probe.tsx',
      framework: 'solid',
    })
    expect(answer).toMatchObject({ ok: true, outcome: 'written', notes: [], language: 'tsx' })
    const code = readFileSync(resolve(context.project, 'src/Probe.tsx'), 'utf8')
    // Formatted by the project's Prettier config, which this one does not have.
    expect(code).toMatch(/from ['"]@polymorph\/solid-ui['"]/)
    expect(code).toContain('onClick={props.onSave}')
  })

  it('says when the project does not depend on the framework’s vocabulary', async () => {
    const answer = await emitScreen(project(), {
      spec: SPEC,
      path: 'Probe.tsx',
      framework: 'solid',
    })
    expect(answer.notes?.[0]).toContain('@polymorph/solid-ui is not a dependency')
  })

  it.each(FRAMEWORKS)(
    'refuses a member with no %s shell, and writes nothing',
    async (framework) => {
      const context = project()
      const path = framework === 'svelte' ? 'Probe.svelte' : 'Probe.tsx'
      const answer = await emitScreen(context, { spec: BADGE, path, framework })
      expect(answer.ok).toBe(false)
      expect(answer.faults[0]?.message).toBe(
        `\`Badge\` is absent in ${framework} — no ${framework} shell yet`,
      )
      expect(readdirSync(context.project)).toEqual(['package.json'])
    },
  )

  it('wants the extension the framework writes', async () => {
    const context = project()
    await expect(
      emitScreen(context, { spec: SPEC, path: 'Probe.tsx', framework: 'svelte' }),
    ).rejects.toThrow(/Svelte screen is a \.svelte file/)
    await expect(
      emitScreen(context, { spec: SPEC, path: 'Probe.svelte', framework: 'solid' }),
    ).rejects.toThrow(RefusedWriteError)
    await expect(
      emitScreen(context, { spec: SPEC, path: 'Probe.svelte', framework: 'solid' }),
    ).rejects.toThrow(/Solid screen is a \.tsx file/)
  })
})

describe.each(FRAMEWORKS)('installing %s members', (framework) => {
  const installing = (manifest?: object): ToolContext & { project: string } => {
    const context = { ...project(), registry }
    if (manifest !== undefined) {
      writeFileSync(resolve(context.project, 'polymorph.json'), JSON.stringify(manifest))
    }
    return context
  }
  const extension = framework === 'svelte' ? '.svelte' : '.tsx'

  it('plans and writes the member when asked for the framework', () => {
    const context = installing()
    const plan = getInstallPlan(context, { items: ['tabs'], framework })
    expect(plan.framework).toBe(framework)
    expect(plan.files.map((file) => file.to)).toEqual(
      expect.arrayContaining([
        `src/polymorph/overlays/Tabs${extension}`,
        `src/polymorph/overlays/TabsContent${extension}`,
      ]),
    )
    const answer = install(context, { items: ['tabs'], framework })
    expect(answer.written).toContain(`src/polymorph/overlays/TabsContent${extension}`)
    expect(Object.hasOwn(answer.devPackages, 'svelte-eslint-parser')).toBe(framework === 'svelte')
  })

  it('stays in the framework the manifest records, and refuses another', () => {
    const recorded = installing({
      version: registry.version,
      dir: 'src/polymorph',
      components: [],
      systems: [],
      palettes: [],
      files: {},
      framework,
    })
    expect(getInstallPlan(recorded, { items: ['button'] }).framework).toBe(framework)
    expect(() => getInstallPlan(recorded, { items: ['button'], framework: 'vue' })).toThrow(
      FrameworkMismatchError,
    )
  })
})

describe('the wiring', () => {
  it('accepts svelte and solid wherever `framework` is declared', async () => {
    const [near, far] = InMemoryTransport.createLinkedPair()
    const server = createServer({ registry, root: ROOT, project: project().project })
    const client = new Client({ name: 'frameworks', version: '0' })
    await Promise.all([server.connect(far), client.connect(near)])
    const { tools } = await client.listTools()
    const taking = tools.filter((tool) =>
      Object.hasOwn(tool.inputSchema.properties ?? {}, 'framework'),
    )
    expect(taking).toHaveLength(8)
    for (const tool of taking) {
      const schema = (tool.inputSchema.properties as Record<string, { enum?: string[] }>)[
        'framework'
      ]
      expect(schema?.enum, tool.name).toEqual(expect.arrayContaining(['svelte', 'solid']))
    }
    const card = await client.callTool({
      name: 'get_system_card',
      arguments: { framework: 'svelte' },
    })
    expect(JSON.stringify(card.content)).toContain('@polymorph/svelte-ui')
    await client.close()
  })
})
