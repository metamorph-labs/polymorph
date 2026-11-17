import type { Rule } from 'eslint'

import { matchesAny } from '../glob'
import { either, fit, memberSpan, ZONE, type MemberCall } from './advice'
import type { ImportDeclarationNode } from './fix'
import { fileDeclaresBespoke, hostsBanned, packageOf, thirdPartySpan } from './jsx'
import { isBareSpecifier } from './specifier'
import { reporterFor } from './vue'

/**
 * Chart scale maths stays inside the chart engine.
 *
 * The vocabulary does its own rendering and borrows only the scale maths
 * (`docs/charts.md`). The borrowed code is three small packages of pure
 * arithmetic (`d3-scale`, `d3-shape`, `d3-array`), and it stays cheap only while
 * nothing outside the engine uses it. A member that imported `scaleLinear`
 * directly would make layout decisions in a chart library's terms, and an
 * application that imported `recharts` would bypass the vocabulary entirely.
 *
 * The rule therefore has two scopes, like the motion rule. Applied to
 * application code, it stops a screen drawing its own charts. Applied to the
 * vocabulary with `allowIn: CHART_ENGINE`, it confines the borrowed packages to
 * one directory, so they stay replaceable.
 *
 * The banned list is intentionally wider than what is installed. `recharts`,
 * `visx`, `victory`, `nivo`, `chart.js`, `echarts` and `plotly` are the usual
 * alternatives when a chart lacks a feature.
 * `design/components/README-substrates.md` rejects each of them and records why,
 * so using one should fail lint instead of waiting for code review.
 *
 * **What it says.** The report names the chart member for the library's own
 * call where the name says what it draws: recharts' `BarChart`, nivo's
 * `ResponsiveLine`, chart.js's `type: 'doughnut'`. A call no member draws is a
 * zone, rung 4, and a scale is the chart engine's.
 */

/**
 * A library's chart call -> the member that draws it. The names are the ones
 * recharts, nivo, visx, victory, react-chartjs-2 and d3-shape export.
 * `fix-api.test.ts` checks each member against `design/components/`.
 */
const SERIES = { data: '{…}', series: '{…}' }

export const CHART_MEMBERS: [RegExp, MemberCall][] = [
  [
    /^(Responsive)?(Bar|BarChart|HorizontalBar|VictoryBar|BarStack|BarGroup|column)$/i,
    { member: 'BarChart', attributes: SERIES },
  ],
  [
    /^(Responsive)?(Line|LineChart|VictoryLine|LinePath)$/i,
    { member: 'LineChart', attributes: SERIES },
  ],
  [
    /^(Responsive)?(Area|AreaChart|VictoryArea|AreaClosed|AreaStack|Stack)$/i,
    { member: 'AreaChart', attributes: SERIES },
  ],
  [
    /^(Responsive)?(Pie|PieChart|Doughnut|Donut|VictoryPie|Arc)$/i,
    { member: 'DonutChart', attributes: { segments: '{…}' } },
  ],
  [
    /^(Responsive)?(Scatter|ScatterChart|ScatterPlot|VictoryScatter|Bubble)$/i,
    { member: 'ScatterChart', attributes: SERIES },
  ],
  [
    /^(Responsive)?(Radar|RadarChart|PolarArea)$/i,
    { member: 'RadarChart', attributes: { ...SERIES, axes: '{…}' } },
  ],
  [
    /^(Responsive)?(HeatMap|HeatmapRect|HeatMapCanvas)$/i,
    { member: 'Heatmap', attributes: { data: '{…}' } },
  ],
  [/^(Histogram|Bin)$/i, { member: 'Histogram', attributes: { data: '{…}' } }],
  [/^(Sparklines?|SparkLine)$/i, { member: 'Sparkline', attributes: { data: '{…}' } }],
]

/** What a chart call is in the vocabulary, or `undefined`. */
export function chartMember(call: string): MemberCall | undefined {
  return CHART_MEMBERS.find(([pattern]) => pattern.test(call))?.[1]
}

interface AstNode {
  type: string
  [key: string]: unknown
}

/** Every `type: 'bar'` in the file: how chart.js, echarts and plotly name a chart. */
function chartTypes(root: AstNode, keys: Record<string, string[]>): string[] {
  const found: string[] = []
  const pending: AstNode[] = [root]
  while (pending.length > 0) {
    const node = pending.pop() as AstNode
    if (node.type === 'Property') {
      const key = node['key'] as { name?: string; value?: unknown }
      const value = node['value'] as { type: string; value?: unknown }
      if (
        (key.name ?? key.value) === 'type' &&
        value.type === 'Literal' &&
        typeof value.value === 'string'
      ) {
        found.push(value.value)
      }
    }
    for (const key of keys[node.type] ?? []) {
      const child = node[key]
      for (const item of Array.isArray(child) ? child : [child]) {
        if (item && typeof (item as AstNode).type === 'string') pending.push(item as AstNode)
      }
    }
  }
  return found
}

interface Options {
  /** Exact names or `name/` prefixes that are chart engines or scale maths. */
  packages?: string[]
  /** Globs of files allowed to import them: the chart engine. */
  allowIn?: string[]
}

const DEFAULT_PACKAGES = [
  // The rejected renderers. None is installed, but each is one `pnpm add` away.
  'recharts',
  'visx',
  '@visx/visx',
  'victory',
  'victory-native',
  'nivo',
  '@nivo/core',
  'chart.js',
  'react-chartjs-2',
  'echarts',
  'echarts-for-react',
  'plotly.js',
  'react-plotly.js',
  'apexcharts',
  'react-apexcharts',
  'highcharts',
  'britecharts',
  // The Vue wrappers of the same renderers. `@unovis/vue` is in a family below.
  'vue-chartjs',
  'vue-echarts',
  'vue3-apexcharts',
  'highcharts-vue',
  // The Svelte and Solid renderers and wrappers.
  'layerchart',
  'svelte-chartjs',
  'svelte-apexcharts',
  'svelte-frappe-charts',
  '@carbon/charts-svelte',
  'solid-chartjs',
  'solid-apexcharts',
  // The Angular wrappers. `@unovis/angular` is in a family below.
  'ng2-charts',
  'ngx-echarts',
  '@swimlane/ngx-charts',
  'ng-apexcharts',
  'highcharts-angular',
  'angular-highcharts',
  'ag-charts-angular',
]

/**
 * The package families, matched by prefix instead of listed.
 *
 * `d3` publishes about thirty small packages and three of them are approved.
 * Banning `d3-scale` by name but allowing `d3-sankey` would let in the next
 * chart form someone wants. The scoped families have the same problem: `@visx/*`
 * and `@nivo/*` each publish a package per chart type, and `@unovis/*` one per
 * framework, and a list of those goes out of date quickly.
 *
 * The three borrowed packages are included on purpose. Approval only confines
 * them: `allowIn` lets the engine import them, and everywhere else they are
 * banned like anything on the rejected list.
 */
const BANNED_FAMILIES = /^(d3(-|$)|@(visx|nivo|antv|amcharts|unovis)\/)/

/**
 * The packages that hand out maths and drawing primitives, not a chart: what
 * imports one draws its own `<svg>`, which is a zone's work. Every other
 * banned package draws the chart itself, so it is hosted as another library's
 * component.
 */
const DRAWN_BY_HAND = /^(d3(-|$)|visx$|@visx\/)/

export const noExternalDataviz: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: { description: 'Chart physics is borrowed by the chart engine and by nothing else.' },
    schema: [
      {
        type: 'object',
        properties: {
          packages: { type: 'array', items: { type: 'string' } },
          allowIn: { type: 'array', items: { type: 'string' } },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      datavizImport: 'Unexpected charting import `{{source}}`. {{advice}}',
      datavizReexport: 'Unexpected re-export of `{{source}}`. {{advice}}',
    },
  },

  create(context) {
    const options = (context.options[0] ?? {}) as Options
    const packages = options.packages ?? DEFAULT_PACKAGES
    const allowed = matchesAny(context.filename, options.allowIn ?? [])
    // Import bans apply per file, so a file that declares a zone is exempt as a
    // whole. The zone is still declared and listed in the inventory.
    const bespoke = fileDeclaresBespoke(context)
    // In a `.vue` file a report's answer is written in template syntax.
    const report = reporterFor(context, noExternalDataviz.meta?.messages)

    /**
     * The members the import's calls are, read from its names and the file's
     * `type`s. A re-export is answered the same way, from the names it hands
     * out, and says why it is a leak.
     */
    function advice(node: Rule.Node, source: string, reexport: boolean): string {
      const head = reexport
        ? `Unexpected re-export of \`${source}\`.`
        : `Unexpected charting import \`${source}\`.`
      const leak = reexport ? 'A re-export leaks the library as an import does.' : ''
      const declaration = node as unknown as ImportDeclarationNode
      const names =
        node.type === 'ImportDeclaration' || node.type === 'ExportNamedDeclaration'
          ? (declaration.specifiers ?? []).map(
              (specifier) => specifier.imported?.name ?? specifier.local.name,
            )
          : []
      const calls = [
        ...names,
        ...chartTypes(context.sourceCode.ast as unknown as AstNode, context.sourceCode.visitorKeys),
      ]
      const members = [...new Set(calls.flatMap((call) => chartMember(call) ?? []))]
      if (members.length > 0) {
        const call = calls.find((name) => chartMember(name) === members[0]) as string
        return fit(head, [
          `\`${call}\` is ${either(members.slice(0, 2).map(memberSpan))} (rung 1).`,
          leak,
          `A chart no member draws goes in a ${ZONE} zone (rung 4).`,
        ])
      }
      if (names.some((name) => /^scale[A-Z]/.test(name))) {
        return fit(head, [
          "Scales are the chart engine's: a chart member scales its own `data={…}` (rung 1).",
          leak,
          `A chart no member draws goes in a ${ZONE} zone (rung 4).`,
        ])
      }
      return fit(head, [
        reexport
          ? `Drop it: a chart no member draws goes in a ${ZONE} zone (rung 4).`
          : DRAWN_BY_HAND.test(source)
            ? `No chart member draws what this import does, so the chart goes in a ${ZONE} zone (rung 4).`
            : 'No chart member draws what this import does: host the chart in ' +
              `${thirdPartySpan(packageOf(source))} (rung 4).`,
        leak,
      ])
    }

    function check(node: Rule.Node, source: string, messageId: string): void {
      if (!isBareSpecifier(source)) return
      // The entry the import is banned by: a listed name, or the package itself
      // for one of a family (`@nivo/sankey`).
      const banned =
        packages.find((name) => source === name || source.startsWith(`${name}/`)) ??
        (BANNED_FAMILIES.test(source) ? packageOf(source) : undefined)
      if (banned === undefined) return
      // A file that hosts the library in a `<ThirdParty>` boundary may import
      // it. The boundary names the banned entry itself, so one that names a
      // sibling in the same npm scope (`@nivo/core`) lifts nothing here.
      if (messageId === 'datavizImport' && hostsBanned(context, banned)) return
      report({
        node,
        messageId,
        data: { source, advice: advice(node, source, messageId === 'datavizReexport') },
      })
    }

    /**
     * Imports are allowed where `allowIn` says. **Re-exports are allowed
     * nowhere**, which is the one way this rule is stricter than the motion rule.
     *
     * The reason is the engine's structure. Nobody would re-export motion's
     * internals from a barrel file. The chart engine is four modules behind an
     * obvious `index.ts`, and one `export * from 'd3-scale'` there would expose
     * the scale maths to the frame, the members, and every app that vendors one.
     * The rule would still pass, because the engine is the file it allows. The
     * engine may therefore import the borrowed packages but not re-export them.
     * Only this repository's own functions leave the engine, which is the
     * condition of the approval.
     */
    function checkImport(node: Rule.Node, source: string): void {
      if (allowed || bespoke) return
      check(node, source, 'datavizImport')
    }

    function checkReexport(node: Rule.Node, source: string): void {
      if (bespoke) return
      check(node, source, 'datavizReexport')
    }

    return {
      ImportDeclaration(node) {
        checkImport(node, String(node.source.value))
      },
      ImportExpression(node) {
        if (node.source.type === 'Literal' && typeof node.source.value === 'string') {
          checkImport(node, node.source.value)
        }
      },
      ExportAllDeclaration(node) {
        if (node.source) checkReexport(node, String(node.source.value))
      },
      ExportNamedDeclaration(node) {
        if (node.source) checkReexport(node, String(node.source.value))
      },
    }
  },
}
