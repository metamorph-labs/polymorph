import { CHROMA_BUDGETS } from '@polymorph/theme'

import { AGENT_SHAPE } from './agent'
import { BEHAVIOUR_SHAPE } from './behaviour'
import { FRAMEWORKS, MAPPED_FRAMEWORKS, PUBLISHED_FRAMEWORK_ENTRY } from './frameworks'
import { PLATFORM_ENTRY, PLATFORMS } from './platforms'
import { arr, bool, nullable, num, obj, rec, str, type Shape } from './shape'

/**
 * The registry document, described once.
 *
 * The fronts are written against this file. The CLI's installer resolves
 * `dependencies` to know what to vendor. The MCP server answers
 * `get_component` from `components` and `get_theme_axes` from `theme`, and the
 * docs site renders both. "One canonical registry, three thin fronts" holds
 * only if the fronts have nothing to add, so anything a front would otherwise
 * compute belongs here.
 *
 * Source text is deliberately *not* here. The registry says where a
 * component's source, stylesheet and fixture live, but does not include them.
 * A catalogue that inlined every file would be a copy of the repo that is
 * harder to keep current, and the installer already has the repo.
 */

export const SCHEMA_ID = 'polymorph-registry/1'

/**
 * A member's entry on every platform, keyed by platform. Every key is
 * required: the platform law gives every member an entry on every platform, so
 * a reader never has to guess what a missing key means.
 */
const PLATFORM_ENTRIES = obj(
  Object.fromEntries(PLATFORMS.map((platform) => [platform, PLATFORM_ENTRY])),
  {
    description:
      'How the member renders on each platform (`design/platforms/*.json`): `native`, `adapted` ' +
      'with `as`, or `absent` with a `reason` and a `substitute`.',
  },
)

/**
 * A member's entry in every web framework, keyed by framework. Every key is
 * required, as on the platform map: React is always native, and a framework's
 * file gives every member an entry. A member native in a framework other than
 * React also carries its `shell`, what an install of it copies there.
 */
const FRAMEWORK_ENTRIES = obj(
  Object.fromEntries(FRAMEWORKS.map((framework) => [framework, PUBLISHED_FRAMEWORK_ENTRY])),
  {
    description:
      'Whether each web framework’s vocabulary ships the member (`design/frameworks/*.json`): ' +
      '`native`, or `absent` with a `reason`. React is the vocabulary itself, so always native. ' +
      'A member native in another framework has a `shell`: the files and packages an install ' +
      'of it takes there.',
  },
)

const PROP = obj(
  {
    name: str({ description: 'The prop as a call site writes it.' }),
    type: str({ description: 'The type, as TypeScript prints it — unions spelled out.' }),
    optional: bool(),
    doc: str({ description: 'The prop’s own doc comment, flattened to one line.' }),
  },
  { optional: ['doc'] },
)

const COMPONENT = obj(
  {
    name: str({ description: 'The exported identifier.' }),
    tier: str({
      description: 'Which layer of the vocabulary it belongs to — its source directory.',
      enum: ['icon', 'layout', 'controls', 'overlays', 'structure', 'charts', 'ai', 'archetypes'],
    }),
    origin: str({
      description:
        'Which side of the packaging boundary it sits on: `installed` ships in ' +
        '`@polymorph/react` and is upgraded by semver, `vendored` is copied into the ' +
        'consumer’s repository and owned by them.',
      enum: ['installed', 'vendored'],
    }),
    platforms: PLATFORM_ENTRIES,
    frameworks: FRAMEWORK_ENTRIES,
    purpose: str({ description: 'One sentence, from the component’s own doc comment.' }),
    spec: nullable(str({ description: 'The design spec this was built from.' })),
    anatomy: nullable(
      str({ description: 'The spec’s anatomy block — the element tree, verbatim.' }),
    ),
    files: obj({
      source: str(),
      styles: nullable(str()),
      states: nullable(
        str({ description: 'The states fixture. The installer vendors it with the component.' }),
      ),
    }),
    props: arr(PROP),
    parts: arr(
      obj({
        name: str({ description: 'The property of the export that holds it: `Row` of `Table`.' }),
        props: arr(PROP),
      }),
      {
        description:
          'Every compound part the export carries (`Table.Row`, `AppShell.NavItem`), read from ' +
          'its type, with the props each takes. `props` also lists a part’s props under its name ' +
          '(`Row.selected`) where the spec’s table names the part.',
      },
    ),
    exports: arr(
      obj({
        name: str({ description: 'The exported identifier.' }),
        kind: str({
          description:
            '`component` for a capitalised name, which React renders; `function` for one a call ' +
            'site calls.',
          enum: ['component', 'function'],
        }),
        props: arr(PROP, {
          description: 'A component’s props, or the options a function takes first.',
        }),
        members: arr(
          str({ description: 'A function it carries, by name: `success` of `toast.success`.' }),
        ),
      }),
      {
        description:
          'The member’s other callable exports, declared in the files beside its own that are ' +
          'named for it and declare no other member: Toast’s `ToastHost`, `ToastNotice`, ' +
          '`ToastViewportTarget` and `toast`. Empty for a member that is one component.',
      },
    ),
    grid: nullable(
      rec(arr(str()), {
        description:
          'The lawful variant × tone cells, when the component has a grid. A pair absent from ' +
          'this table is a type error at the call site, not a runtime warning.',
      }),
    ),
    states: arr(
      str({ description: 'States fixture entry names — every state the spec enumerates.' }),
    ),
    requiredSelectors: arr(
      str({
        description:
          'Pseudo-class and attribute states the stylesheet must style — the ones no prop can ' +
          'reach, which is the whole of what this field means. It is not a census of the ' +
          'surface; `dataAttributes` is.',
      }),
    ),
    tokens: arr(
      str({
        description:
          "Every --pm-* custom property the component's own stylesheet reads — the " +
          'component half of the token × component matrix. Own file only: tokens reached ' +
          'through composed convention classes belong to the convention.',
      }),
    ),
    dataAttributes: arr(
      obj(
        {
          name: str({ description: 'The attribute, as CSS and a test would select it.' }),
          values: arr(str(), {
            description:
              'The values the styling pins, where it pins any. Absent for an attribute matched ' +
              'on presence alone.',
          }),
        },
        { optional: ['values'] },
      ),
      {
        description:
          'The `data-*` attributes the component’s styling keys on, derived from its stylesheet ' +
          'and the classes that stylesheet composes. For a composed table — layout’s ' +
          'padding lookup on a Card — this is what the CSS honours, which is a superset of what ' +
          '`props` can reach.',
      },
    ),
    behaviour: BEHAVIOUR_SHAPE,
    agent: AGENT_SHAPE,
    dependencies: obj({
      components: arr(str({ description: 'Other vocabulary members, transitively closed.' })),
      packages: arr(str({ description: 'External runtime dependencies, transitively closed.' })),
      files: arr(
        str({
          description:
            'Every repo-relative file that must travel with this component — the closure an ' +
            'install copies. Larger than `components`: a stylesheet composes convention files ' +
            'that belong to no component. Empty when `origin` is `installed`.',
        }),
      ),
    }),
  },
  { optional: [] },
)

const AXIS = obj({
  name: str(),
  values: arr(str()),
  exposed: bool({
    description: 'Whether the emitter publishes this axis as a flag a recipe may branch on.',
  }),
})

const FONT = obj({
  roles: arr(str({ enum: ['body', 'display', 'mono'] })),
  family: str(),
  package: str({
    description:
      'The npm package that serves the family. Apps load fonts and the library never ' +
      'bundles them — so an installer that did not carry this would produce a ' +
      'theme that paints in its fallback stack, which is a broken install.',
  }),
})

/** One family of `TokenValues`: custom property -> the value it declares. */
const TOKEN_FAMILY = (description: string) => rec(str(), { description })

/**
 * The rules' `values` option, in full. Every family is present, because the
 * registry resolves every system; the rules' own type leaves them optional for
 * a config written by hand.
 */
const TOKEN_VALUES = obj(
  {
    color: TOKEN_FAMILY('Colour roles. Chart series are not roles and are left out.'),
    space: TOKEN_FAMILY('`--pm-space-N`.'),
    radius: TOKEN_FAMILY('`--pm-radius-*` steps.'),
    text: TOKEN_FAMILY('`--pm-text-*-size` and `--pm-display-*-size`.'),
    size: TOKEN_FAMILY('Control heights and icon sizes.'),
    duration: TOKEN_FAMILY('`--pm-motion-duration-*`.'),
  },
  {
    description:
      'What each token is worth when the system wears its default palette: its default mode, ' +
      'and the density and motion temperament its axes choose, as the sheet declares them ' +
      'before any scope attribute applies. The `TokenValues` the red rules take as `values`, so ' +
      'a report names the nearest token to a raw colour, length or duration. `polymorph init` ' +
      'writes it into the lint configs of the app it creates.',
  },
)

/**
 * The structural half of a pairing: the eight axes, the three font slots
 * and the presentation defaults. It pins a `defaultPalette` and nothing else.
 * Every palette is lawful on every system, so a pairing outside this table is
 * not chosen by default but is still allowed.
 */
const SYSTEM = obj(
  {
    name: str(),
    axes: rec(str()),
    fonts: arr(FONT),
    defaultPalette: str({
      description: 'The palette this system is painted with unless someone says otherwise.',
    }),
    defaultMode: str(),
    kind: str(),
    file: str({
      description: 'The system JSON. A theme install is this file plus the palette it names.',
    }),
    spec: nullable(str()),
    tokenValues: TOKEN_VALUES,
  },
  { optional: [] },
)

/** The colour half. It belongs to no system, which is why it carries no fonts. */
const PALETTE = obj(
  {
    name: str(),
    accentHue: num({ description: 'OKLCH hue angle, degrees.' }),
    gradientHue: num({
      description:
        'The partner hue for gradient roles. Absent is the common case, and not a degraded ' +
        'one: without it every gradient role resolves to its own solid.',
    }),
    neutralHue: num(),
    neutralTint: num(),
    /*
     * Read from the engine, not copied. A copy here would be the one place in
     * the repo that misses a new value. `none`, the ink budget, is the example:
     * a lawful palette file parses, resolves and emits, and then fails the
     * registry's own schema check. A published enum that does not track the
     * enum it describes is a second source of truth that cannot detect its own
     * drift.
     */
    chromaBudget: str({ enum: [...CHROMA_BUDGETS] }),
    moreContrast: str({
      description:
        'The palette whose colours this one gives way to under the more-contrast query. An ' +
        'install of this palette installs it too.',
    }),
    file: str({ description: 'The palette JSON — the whole of a palette install.' }),
  },
  { optional: ['gradientHue', 'neutralHue', 'moreContrast'] },
)

const THEME = obj({
  axes: arr(AXIS),
  colorRoles: rec(arr(str()), {
    description: 'Role names by family — the whole colour catalogue.',
  }),
  scales: rec(arr(str()), {
    description: 'Every non-colour scale: space, type, radius, shadow, icon, motion.',
  }),
  standardDensity: obj(
    {
      space: rec(str(), { description: 'Space step -> px at standard density.' }),
      controlHeight: rec(str(), { description: '`sm` / `md` / `lg`, same density.' }),
    },
    {
      description:
        'The two scales whose magnitudes are a system fact rather than a pairing’s — published ' +
        'because a step name says which rung and nothing about how far apart the rungs are. ' +
        'Compact and comfortable rescale both, snapped to a 2px grid.',
    },
  ),
  customProperties: arr(
    str({ description: 'Every `--pm-*` custom property a theme emits, as a recipe may cite it.' }),
  ),
  systems: arr(SYSTEM),
  palettes: arr(PALETTE),
  renamed: obj(
    {
      systems: rec(str(), { description: 'Old system name -> the system it is now.' }),
      palettes: rec(str(), { description: 'Old palette name -> the palette it is now.' }),
    },
    {
      description:
        'The systems and palettes the catalogue shipped under another name, each the same ' +
        'document renamed. `polymorph update` moves an install that recorded an old name to ' +
        'the current one.',
    },
  ),
  prepaint: str({
    description:
      'Inline in `<head>` before any stylesheet: resolves the persisted system, palette, mode, ' +
      'density and temperament before first paint. Built from the same constants that write them.',
  }),
})

const ICONS = obj({
  sizes: arr(str()),
  roles: arr(
    obj({
      name: str({ description: 'A meaning, never a glyph name.' }),
      group: str(),
    }),
  ),
})

const LADDER_RUNG = obj({
  rung: num({ integer: true }),
  name: str(),
  summary: str(),
  declaredAs: nullable(
    str({ description: 'What `pnpm inventory` looks for, when the rung has a marker.' }),
  ),
})

const EXCEPTION_PRIMITIVE = obj({
  name: str(),
  rung: num({ integer: true }),
  platforms: PLATFORM_ENTRIES,
  frameworks: FRAMEWORK_ENTRIES,
  purpose: str(),
  props: arr(PROP),
  files: obj({
    source: str(),
    styles: nullable(str()),
  }),
  dependencies: obj({
    packages: arr(str({ description: 'External runtime dependencies, transitively closed.' })),
    files: arr(
      str({
        description:
          'Every repo-relative file that must travel with this primitive — the closure an ' +
          'install copies, so `polymorph add bespoke` lands the rung the travelled rules point at.',
      }),
    ),
  }),
})

const LAW = obj({
  name: str(),
  applies: str({
    description: 'Application code, or the vocabulary itself — the two have different authors.',
    enum: ['application', 'vocabulary'],
  }),
  language: str({
    description: '`code` runs under ESLint, `css` under Stylelint.',
    enum: ['code', 'css'],
  }),
  stage: nullable(
    num({
      integer: true,
      description:
        'What an application rule needs before it can apply: 1 applies from the first line of ' +
        'application code (style decisions), 2 needs the vocabulary and the exception ladder in ' +
        'place (reach). `null` for a rule with no stage — the vocabulary rules, and the CSS ' +
        'rules, which apply wherever their stylesheets are.',
    }),
  ),
  climb: arr(
    num({
      integer: true,
      description:
        'A rung of the exception ladder that answers this violation, highest first. A rule that ' +
        'only says no is a rule an agent works around; this is the route to yes. Empty is a ' +
        'declaration, not a gap — the ladder governs application code.',
    }),
  ),
  summary: str(),
})

export const REGISTRY_SHAPE: Shape = obj({
  schema: str({
    enum: [SCHEMA_ID],
    description: 'Identifies the shape below. Bumped only by a breaking change.',
  }),
  version: str({
    description:
      '`@polymorph/react`’s version — the semver line an install is pinned to and `polymorph ' +
      'diff` reports against. Vendored source carries no version: it is the consumer’s code.',
  }),
  platforms: arr(
    str({
      enum: PLATFORMS,
      description:
        'A platform the vocabulary is mapped to. Every member’s `platforms` is keyed by these; ' +
        '`web` is the React vocabulary itself, where no member is absent.',
    }),
  ),
  frameworks: arr(
    str({
      enum: FRAMEWORKS,
      description:
        'A web framework the vocabulary ships in. Every member’s `frameworks` is keyed by these; ' +
        '`react` is the vocabulary itself, where every member is native.',
    }),
  ),
  components: arr(COMPONENT),
  vendor: obj({
    root: str({ description: 'The prefix install paths are rebased from.' }),
    recipes: obj({
      package: str({
        description:
          'The package members import their recipes from, as `<package>/<tier>/<file>.module.css`.',
      }),
      root: str({
        description:
          'The tree those specifiers name. A recipe is rebased from here to its member’s ' +
          'directory, and the member’s import becomes the relative path.',
      }),
    }),
    support: arr(
      str({ description: 'Files every vendored install needs and no component imports.' }),
    ),
    base: str({
      description:
        'The global base layer. Unreachable by a closure walk because it declares no class — the ' +
        'package root imports it for its side effect, and a vendored consumer has no package ' +
        'root. Without it the install runs on user-agent defaults: content-box, a body margin, ' +
        'and body text in the UA serif.',
    }),
    frameworks: obj(
      Object.fromEntries(
        MAPPED_FRAMEWORKS.map((framework) => [
          framework,
          obj(
            {
              root: str({
                description:
                  'The tree this framework’s members are vendored from, rebased as `root` is.',
              }),
              support: arr(
                str({
                  description: 'Files every install of its members needs and no member imports.',
                }),
              ),
              packages: rec(str(), {
                description:
                  'Package -> the range an install in this framework writes it at: the framework’s ' +
                  'foundation and vocabulary, and every package its members import. Read from the ' +
                  'foundation’s and the vocabulary’s manifests only, because the frameworks can ' +
                  'range one package differently: the Solid foundation pins `@zag-js/core` ' +
                  'exactly, so the Solid vocabulary pins every Zag machine to that version.',
              }),
              noBuild: obj(
                {
                  dir: str({
                    description:
                      'The directory, in this repository, of the files a page with no build ' +
                      'loads the elements from: `polymorph.js`, its chunks, `polymorph-all.js`, ' +
                      '`polymorph.css`, `prepaint.js` and `themes/<system>.css`. A build output, ' +
                      'absent until `build` runs.',
                  }),
                  build: str({ description: 'The command that builds `dir` in a checkout.' }),
                },
                {
                  description:
                    'The elements only: the files `polymorph init --framework elements` copies ' +
                    'into an app, because no public URL serves them.',
                },
              ),
            },
            { optional: ['noBuild'] },
          ),
        ]),
      ),
      {
        description:
          'Each web framework but React. A member’s own files there are in its ' +
          '`frameworks.<framework>.shell`.',
      },
    ),
  }),
  packages: rec(str(), {
    description:
      'Package -> the range a consumer installs it at: the installed packages ' +
      '(`@polymorph/engine`, `@polymorph/react`, `@polymorph/rules` and `@polymorph/react-ui`), ' +
      'what vendored React members and the ladder’s primitives import, and the systems’ ' +
      'webfonts. Another framework’s foundation, vocabulary and member imports are ranged in ' +
      '`vendor.frameworks.<framework>.packages`.',
  }),
  icons: ICONS,
  theme: THEME,
  exceptions: obj({
    ladder: arr(LADDER_RUNG),
    primitives: arr(EXCEPTION_PRIMITIVE, {
      description:
        'The components that *are* the ladder — what a screen spec reaches for at rungs 2 and 4. ' +
        'Not gallery members, so they are not in `components`; without them a spec validator ' +
        'would have to carry its own copy of their props, and without their file closure an ' +
        'install could describe the rung its rules point at but not land it.',
    }),
  }),
  laws: arr(LAW, {
    description:
      'The red rules, so a front can install them (the CLI) or explain a violation with them ' +
      '(the MCP server).',
  }),
})
