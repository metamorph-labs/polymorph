import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import stylelintPlugins, { applicationRules, RULE_NAMES } from '@polymorph/rules/stylelint'
import { tokenValues } from '@polymorph/rules/stylelint/emitted'
import { admitTheme } from '@polymorph/theme'
import stylelint, { type Config } from 'stylelint'
import { describe, expect, it } from 'vitest'

import {
  eslintFragment,
  prepaintModule,
  stylelintFragment,
  themeModule,
  tokenValuesIn,
} from './emit'
import {
  addDependencies,
  importThemes,
  injectPrepaint,
  linkEslintConfig,
  linkStylelintConfig,
  PatchError,
} from './patch'

/**
 * The edits `polymorph add` makes to files the consumer already owns.
 *
 * Every edit is tested for two properties, because failing either one damages
 * the consumer's repository. **Idempotence**: a second install does not add a
 * second pre-paint script or a second spread line. **Loud failure**: a config
 * shape the patcher cannot handle throws with the edit to make, instead of
 * reporting a success that did not happen.
 */

const HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>App</title>
  </head>
  <body><div id="root"></div></body>
</html>
`

const SCRIPT = '(function(){try{var d=document.documentElement}catch(e){}})()'

describe('the pre-paint script', () => {
  it('goes first inside head, before anything that could paint', () => {
    const patched = injectPrepaint(HTML, SCRIPT)
    const head = patched.indexOf('<head>')
    expect(patched.indexOf(SCRIPT)).toBeGreaterThan(head)
    expect(patched.indexOf(SCRIPT)).toBeLessThan(patched.indexOf('<meta'))
    expect(patched.indexOf(SCRIPT)).toBeLessThan(patched.indexOf('<title'))
  })

  it('replaces an existing script instead of adding a second one', () => {
    const once = injectPrepaint(HTML, SCRIPT)
    expect(injectPrepaint(once, SCRIPT)).toBe(once)

    const changed = injectPrepaint(once, 'var x=2')
    expect(changed).toContain('var x=2')
    expect(changed).not.toContain(SCRIPT)
    expect(changed.match(/data-polymorph="prepaint"/g)).toHaveLength(1)
  })

  it('keeps a placement the consumer moved it to', () => {
    const moved = HTML.replace(
      '  </head>',
      `    <script data-polymorph="prepaint">${SCRIPT}</script>\n  </head>`,
    )
    const again = injectPrepaint(moved, SCRIPT)
    expect(again.indexOf('data-polymorph')).toBeGreaterThan(again.indexOf('<title'))
  })

  it('says what to paste when there is no head to put it in', () => {
    expect(() => injectPrepaint('<div>fragment</div>', SCRIPT)).toThrow(PatchError)
    expect(() => injectPrepaint('<div>fragment</div>', SCRIPT)).toThrow(
      'first element inside <head>',
    )
  })
})

describe('package.json', () => {
  const manifest = `{\n  "name": "app",\n  "dependencies": { "react": "^19.0.0" }\n}\n`

  it('adds what is missing and sorts the result', () => {
    const { text, added } = addDependencies(manifest, {
      '@polymorph/react': '^1.0.0',
      '@radix-ui/react-dialog': '^1.1.23',
    })
    expect(added).toEqual(['@polymorph/react', '@radix-ui/react-dialog'])
    expect(Object.keys((JSON.parse(text) as { dependencies: object }).dependencies)).toEqual([
      '@polymorph/react',
      '@radix-ui/react-dialog',
      'react',
    ])
    expect(text.endsWith('}\n')).toBe(true)
  })

  it('leaves a pin alone and reports the disagreement', () => {
    // The consumer may have pinned Radix on purpose. Widening the range silently
    // would override a decision that is not the installer's to make.
    const { text, added, conflicts } = addDependencies(manifest, { react: '^19.2.8' })
    expect(added).toEqual([])
    expect(conflicts).toEqual([{ name: 'react', theirs: '^19.0.0', ours: '^19.2.8' }])
    expect(text).toContain('"react": "^19.0.0"')
  })

  it('is idempotent', () => {
    const wanted = { '@polymorph/react': '^1.0.0' }
    const dev = { '@polymorph/rules': '^1.0.0' }
    const once = addDependencies(manifest, wanted, dev).text
    expect(addDependencies(once, wanted, dev).text).toBe(once)
  })

  it('writes a dev dependency to devDependencies', () => {
    // Only the lint configs load the rules, so they never reach the app's bundle.
    const { text, added } = addDependencies(manifest, {}, { '@polymorph/rules': '^1.0.0' })
    const written = JSON.parse(text) as {
      dependencies: Record<string, string>
      devDependencies: Record<string, string>
    }
    expect(added).toEqual(['@polymorph/rules'])
    expect(written.devDependencies).toEqual({ '@polymorph/rules': '^1.0.0' })
    expect(written.dependencies['@polymorph/rules']).toBeUndefined()
  })

  it('takes a name in either map as present, so nothing is listed twice', () => {
    // The consumer keeps the rules in `dependencies`, or the engine in
    // `devDependencies`. Either way the package is installed, and a second
    // entry in the other map would be two answers to one question.
    const theirs = JSON.stringify({
      dependencies: { '@polymorph/rules': '^1.0.0' },
      devDependencies: { '@polymorph/engine': '^1.0.0' },
    })
    const { text, added, conflicts } = addDependencies(
      theirs,
      { '@polymorph/engine': '^1.0.0' },
      { '@polymorph/rules': '^1.0.0' },
    )
    expect(added).toEqual([])
    expect(conflicts).toEqual([])
    expect(JSON.parse(text)).toEqual(JSON.parse(theirs))
  })

  it('adds no devDependencies map when there is nothing to put in it', () => {
    const { text } = addDependencies(manifest, { '@polymorph/react': '^1.0.0' })
    expect(JSON.parse(text)).not.toHaveProperty('devDependencies')
  })
})

describe('the ESLint config', () => {
  it('splices into a bare array', () => {
    const linked = linkEslintConfig("import js from 'x'\n\nexport default [\n  js,\n]\n")
    expect(linked).toContain("import polymorph from './polymorph.eslint.js'")
    expect(linked.indexOf('...polymorph,')).toBeLessThan(linked.indexOf('js,'))
  })

  it('splices into tseslint.config(…) and defineConfig([…])', () => {
    for (const shape of [
      'export default tseslint.config(\n  js,\n)',
      'export default defineConfig([\n  js,\n])',
    ]) {
      const linked = linkEslintConfig(`import tseslint from 'x'\n\n${shape}\n`)
      expect(linked, shape).toContain('...polymorph,')
      expect(linked.indexOf('...polymorph,'), shape).toBeLessThan(linked.indexOf('js,'))
    }
  })

  it('adds its import after an import written over several lines, not inside it', () => {
    const config =
      "import js, {\n  configs,\n  parser,\n} from 'x'\nimport 'y'\n\nexport default [\n  js,\n]\n"
    const linked = linkEslintConfig(config)
    expect(linked).toContain(
      "} from 'x'\nimport 'y'\nimport polymorph from './polymorph.eslint.js'\n\nexport default [",
    )
  })

  it('imports under another name where the config already binds `polymorph`', () => {
    // The config the consumer guide gives for the rules by hand.
    const config =
      "import polymorph, {\n  parser,\n  stageOneRules,\n} from '@polymorph/rules/eslint'\n\n" +
      'export default [\n  { plugins: { polymorph }, rules: stageOneRules },\n]\n'
    const linked = linkEslintConfig(config)
    expect(linked).toContain(
      "} from '@polymorph/rules/eslint'\nimport polymorphInstall from './polymorph.eslint.js'\n",
    )
    expect(linked).toContain('export default [\n  ...polymorphInstall,\n  { plugins: { polymorph }')
    expect(linked.match(/import polymorph\b/g)).toHaveLength(1)
    expect(linkEslintConfig(linked)).toBe(linked)
  })

  it('is idempotent', () => {
    const once = linkEslintConfig('export default [\n]\n')
    expect(linkEslintConfig(once)).toBe(once)
  })

  it('links a config whose comment names the generated file', () => {
    const config = '// The red rules come from polymorph.eslint.js.\nexport default [\n]\n'
    const linked = linkEslintConfig(config)
    expect(linked).toContain("import polymorph from './polymorph.eslint.js'")
    expect(linked).toContain('...polymorph,')
    expect(linkEslintConfig(linked)).toBe(linked)
  })

  it('refuses a shape it cannot read, with the two lines to paste', () => {
    expect(() => linkEslintConfig('module.exports = []\n')).toThrow(PatchError)
    expect(() => linkEslintConfig('module.exports = []\n')).toThrow('export default [')
  })
})

describe('the Stylelint config', () => {
  it('joins an existing extends list', () => {
    const linked = linkStylelintConfig(
      "export default {\n  extends: ['stylelint-config-standard'],\n}\n",
    )
    expect(linked).toContain("extends: ['./polymorph.stylelint.js', 'stylelint-config-standard']")
  })

  it('promotes a single extends to a list', () => {
    const linked = linkStylelintConfig(
      "export default {\n  extends: 'stylelint-config-standard',\n}\n",
    )
    expect(linked).toContain("extends: ['stylelint-config-standard', './polymorph.stylelint.js']")
  })

  it('adds one to a config that has none', () => {
    const linked = linkStylelintConfig('export default {\n  rules: {},\n}\n')
    expect(linked).toContain("extends: ['./polymorph.stylelint.js'],")
  })

  it('is idempotent', () => {
    const once = linkStylelintConfig('export default {\n}\n')
    expect(linkStylelintConfig(once)).toBe(once)
  })
})

describe('the application entry', () => {
  const entry =
    "import { createRoot } from 'react-dom/client'\n\ncreateRoot(document.body).render(null)\n"

  it('imports and calls installThemes, above the mount', () => {
    const patched = importThemes(entry, './polymorph/themes')
    expect(patched).toContain("import { installThemes } from './polymorph/themes'")
    expect(patched.indexOf('installThemes()')).toBeLessThan(patched.indexOf('createRoot(document'))
  })

  it('is idempotent', () => {
    const once = importThemes(entry, './polymorph/themes')
    expect(importThemes(once, './polymorph/themes')).toBe(once)
  })

  it('works on an entry with no imports at all', () => {
    const patched = importThemes('console.log(1)\n', './polymorph/themes')
    expect(patched).toContain('installThemes()')
    expect(patched.indexOf('import')).toBe(0)
  })

  it('names no framework, because an install in any of them patches its entry', () => {
    // A Vue, Svelte, Solid or Angular entry gets the same lines as a React one.
    const vue = "import { createApp } from 'vue'\n\ncreateApp(App).mount('#app')\n"
    const patched = importThemes(vue, './polymorph/themes')
    expect(patched).toContain(
      '// Themes before the app mounts, so the first frame is already themed.',
    )
    expect(patched).not.toContain('React')
    expect(themeModule([system('pastel', 'amethyst')], [palette('amethyst')])).not.toContain(
      'React',
    )
  })
})

/** A system and the palette it declares, as the plan hands them over. */
const system = (name: string, defaultPalette: string, family = 'X Variable') => ({
  name,
  file: { from: `design/systems/${name}.json`, to: `t/systems/${name}.json` },
  defaultPalette,
  fonts: [{ family, package: `@fontsource-variable/${family.split(' ')[0]?.toLowerCase()}` }],
})

const palette = (name: string) => ({
  name,
  file: { from: `design/palettes/${name}.json`, to: `t/palettes/${name}.json` },
})

describe('the generated files', () => {
  it('emits the fonts before the sheet that names the families', () => {
    const module_ = themeModule(
      [
        {
          name: 'pastel',
          file: {
            from: 'design/systems/pastel.json',
            to: 'src/polymorph/themes/systems/pastel.json',
          },
          defaultPalette: 'amethyst',
          fonts: [
            {
              family: 'Plus Jakarta Sans Variable',
              package: '@fontsource-variable/plus-jakarta-sans',
            },
          ],
        },
      ],
      [palette('amethyst')],
    )

    expect(module_.indexOf('@fontsource-variable/plus-jakarta-sans')).toBeLessThan(
      module_.indexOf("import './theme.css'"),
    )
    expect(module_).toContain("export const DEFAULT_SYSTEM = 'pastel'")
    // Compiled at install time, so the module the application runs derives nothing.
    expect(module_).toContain("from '@polymorph/engine/runtime'")
    expect(module_).not.toMatch(/resolveTheme|composeTheme|parseSystem|\.json'/)
  })

  it('emits one stylesheet covering every installed system, paired with its own palette', () => {
    // Switching between the eager pairings only changes an attribute, with
    // nothing to re-inject. Emitting one sheet per system would lose that.
    const module_ = themeModule(
      [system('pastel', 'amethyst'), system('journal', 'umber')],
      [palette('amethyst'), palette('umber')],
    )

    expect(module_.match(/import '\.\/theme\.css'/g)).toHaveLength(1)
    expect(module_).toContain('"systems":{"journal":"umber","pastel":"amethyst"}')
    // Each system with its own palette is in the main sheet, so no loader for it.
    expect(module_).not.toContain("'pastel/amethyst'")
    // One import for a family two systems share.
    expect(module_.match(/@fontsource-variable\/x/g)).toHaveLength(1)
  })

  it('gives a cross-pairing a loader through ensurePairing', () => {
    // A palette installed on its own is unreachable unless the module can load
    // its styles the first time it is selected.
    const module_ = themeModule(
      [system('pastel', 'amethyst')],
      [palette('amethyst'), palette('orchid')],
    )

    expect(module_).toContain('export function ensurePairing(system: string, palette: string)')
    // Not eager: orchid gets its own sheet, loaded the first time it is chosen.
    expect(module_).toContain("'pastel/orchid': () => import('./pairings/pastel--orchid')")
    // Hydration can check a stored choice, which needs both sets.
    expect(module_).toContain('"palettes":["amethyst","orchid"]')
    expect(module_).toContain('hydrateTheme(DEFAULT_SYSTEM, INSTALLED)')
  })

  it('hands hydration each system’s default mode, and `system` for one it is not given', () => {
    const module_ = themeModule(
      [system('pastel', 'amethyst'), system('journal', 'umber')],
      [palette('amethyst'), palette('umber')],
      null,
      { pastel: 'dark' },
    )
    expect(module_).toContain('"modes":{"journal":"system","pastel":"dark"}')
  })

  it('writes the pre-paint script as a module a server component can import', () => {
    const script = '(function(){var a=\'x\',b="y"})()'
    const module_ = prepaintModule(script)
    expect(module_).toContain(`export const PREPAINT_SCRIPT = ${JSON.stringify(script)}`)
    expect(module_).not.toMatch(/^import /m)
  })

  it('governs application code and the vendored tree differently', () => {
    const eslint = eslintFragment('src/polymorph')
    // Application code gets every rule. The vendored tree gets only the boundary
    // rule, because it is the vocabulary now, and a component that could not
    // write a colour would be useless.
    expect(eslint).toContain('...allRules')
    expect(eslint).toContain('ignores: [VENDORED]')
    expect(eslint).toContain("vendorable-imports`]: ['error', { root: 'src/polymorph' }]")

    const stylelint = stylelintFragment('src/polymorph')
    // Turned on for every stylesheet, then off for the vendored tree, because a
    // later override wins. Without the `null`, the motion law would forbid the
    // vocabulary's own transitions.
    expect(stylelint.indexOf("files: ['**/*.css']")).toBeLessThan(
      stylelint.indexOf("files: ['src/polymorph/**/*.css']"),
    )
    expect(stylelint).toContain('[RULE_NAMES.noMotionOutsideVocabulary]: null')
  })

  /**
   * The fragment's own text, evaluated with the plugin it imports and given to
   * Stylelint. A consumer's stylesheet that re-declares a token for one
   * palette, restyles a member and rescales the root goes red, and the same
   * text in the vendored tree, where the compiled theme declares every token
   * under pairing selectors, passes.
   */
  it('holds application CSS to the application half, and lifts it for the vendored theme', async () => {
    const text = stylelintFragment('src/polymorph', ['--pm-accent-bg', '--pm-text-sm-size'])
    const body = text
      .replace(/^import polymorph, \{ RULE_NAMES \} from '@polymorph\/rules\/stylelint'$/m, '')
      .replace('export default', 'return')
    const config = new Function('polymorph', 'RULE_NAMES', body)(
      stylelintPlugins,
      RULE_NAMES,
    ) as Config
    const css =
      ':root {\n  font-size: var(--pm-text-sm-size);\n}\n[data-palette="petrol"] {\n  --pm-accent-bg: #0b7a75;\n}\n' +
      '[data-member="button"] {\n  background: var(--pm-accent-bg);\n}\n'
    const reported = async (codeFilename: string) => {
      const result = await stylelint.lint({ code: css, codeFilename, config })
      return [...new Set((result.results[0]?.warnings ?? []).map((warning) => warning.rule))].sort()
    }

    expect(await reported('src/register.css')).toEqual(
      Object.keys(applicationRules)
        .filter((rule) => rule !== RULE_NAMES.noMotionOutsideVocabulary)
        .sort(),
    )
    expect(await reported('src/polymorph/themes/theme.css')).toEqual([])
    // Every rule of the application set is switched on, and lifted, by name.
    for (const rule of Object.keys(applicationRules)) {
      const key = Object.entries(RULE_NAMES).find(([, name]) => name === rule)?.[0]
      expect(text, rule).toContain(`[RULE_NAMES.${key}]: true`)
      expect(text, rule).toContain(`[RULE_NAMES.${key}]: null`)
    }
  })

  it('writes the full token list into the config, because nothing at lint time can compute it', () => {
    const stylelint = stylelintFragment('src/polymorph', [
      '--pm-accent-bg',
      '--pm-space-4',
      '--pm-border-default',
    ])

    // Sorted and inlined. At lint time the vendored theme data holds values, not
    // property names, and the module that maps one to the other is TypeScript,
    // which a natively loaded Stylelint config cannot import.
    expect(stylelint).toContain("'--pm-accent-bg', '--pm-border-default', '--pm-space-4',")
    expect(stylelint).toContain('[RULE_NAMES.noGhostTokens]: [true, { tokens: TOKENS }]')

    // Declared once, in the override that matches every stylesheet, because
    // Stylelint merges an override's rules over the rules already in force. Both
    // halves need it. The vendored tree is recipes that read tokens, and a
    // <Bespoke> zone is where a consumer writes their own CSS that reads tokens.
    expect(stylelint.split('noGhostTokens')).toHaveLength(2)
    expect(stylelint.indexOf('noGhostTokens')).toBeLessThan(
      stylelint.indexOf("files: ['src/polymorph/**/*.css']"),
    )

    // The fix for a stale list is stated in the file itself, where a reader sees
    // it, not in a release note.
    expect(stylelint).toContain('run\n * `polymorph update`')
  })

  it('wraps the token list instead of writing 198 lines of one name each', () => {
    const tokens = Array.from({ length: 40 }, (_, index) => `--pm-token-${index}`)
    const lines = stylelintFragment('src/polymorph', tokens)
      .split('\n')
      .filter((line) => line.includes('--pm-token-'))

    expect(lines.length).toBeGreaterThan(1)
    expect(lines.length).toBeLessThan(tokens.length)
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(96)
    // Every token appears, on whichever line it was wrapped to.
    for (const token of tokens) expect(lines.join('\n')).toContain(`'${token}'`)
  })

  it('gives the rules that report a raw value the theme’s values, in both halves', () => {
    const values = {
      color: { '--pm-accent-bg': '#0089ea', '--pm-text-quoted': "url('a\\b')" },
      space: { '--pm-space-4': '12px' },
    }
    const eslint = eslintFragment('src/polymorph', values)
    const stylelint = stylelintFragment('src/polymorph', [], values)

    // Without them a report names the token family. With them it names the
    // step: `12px` is `--pm-space-4` and `p={4}`.
    expect(eslint).toContain("[`${PLUGIN_NAME}/no-raw-styles`]: ['error', { values: VALUES }]")
    expect(eslint).toContain("[`${PLUGIN_NAME}/no-app-css`]: ['error', { values: VALUES }]")
    expect(stylelint).toContain('[RULE_NAMES.tokenValuesOnly]: [true, { values: VALUES }]')
    expect(stylelint.indexOf('tokenValuesOnly')).toBeGreaterThan(
      stylelint.indexOf("files: ['src/polymorph/**/*.css']"),
    )

    // Written as a literal that reads back as the same object, quotes and all,
    // because a natively loaded config has nothing to compute it from.
    for (const fragment of [eslint, stylelint]) {
      const literal = /const VALUES = (\{[\s\S]*?\n\})\n/.exec(fragment)?.[1]
      expect(new Function(`return ${literal}`)()).toEqual(values)
    }
    expect(eslint).toContain("    '--pm-space-4': '12px',")
  })

  it('writes empty values when there was no compiled theme to read', () => {
    // The rules still run. Their reports name the family instead of the step.
    expect(eslintFragment('src/polymorph')).toContain('const VALUES = {}\n')
    expect(stylelintFragment('src/polymorph')).toContain('const VALUES = {}\n')
    expect(tokenValuesIn('')).toEqual({})
  })

  it('reads a compiled sheet the way the rules read this repository’s', () => {
    // The rules build their values from this repository's reference pairing,
    // the first system with its own palette. The installer reads a consumer's
    // compiled sheet instead. Given the same pairing, both must name the same
    // tokens with the same values, or an installed rule names another step.
    const ROOT = resolve(import.meta.dirname, '../../..')
    const documents = (dir: string) =>
      readdirSync(resolve(ROOT, 'design', dir))
        .filter((file) => file.endsWith('.json'))
        .sort()
        .map((file) => JSON.parse(readFileSync(resolve(ROOT, 'design', dir, file), 'utf8')))
    const [system] = documents('systems')
    const palette = documents('palettes').find((entry) => entry.name === system.defaultPalette)

    const admission = admitTheme({ system, palette })
    expect(admission.lawful).toBe(true)
    const read = tokenValuesIn(admission.css ?? '')

    expect(read).toEqual(tokenValues(ROOT))
    expect(Object.keys(read.color ?? {}).length).toBeGreaterThan(40)
    expect(read.space?.['--pm-space-4']).toBe('12px')
    // A chart series is a colour, not a role an application paints with.
    expect(Object.keys(read.color ?? {}).some((name) => name.includes('chart'))).toBe(false)
  })
})
