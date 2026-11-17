import { noExternalDataviz } from './no-external-dataviz'
import { APP_FILE, jsxRuleTester } from './rule-tester'

const ENGINE = 'packages/engine/src/charts/scales.ts'
const allowEngine = [{ allowIn: ['packages/engine/src/charts/**'] }]

jsxRuleTester().run('no-external-dataviz', noExternalDataviz, {
  valid: [
    { filename: APP_FILE, code: `import { BarChart } from '@polymorph/react-ui'` },
    // A package that only starts with the same letters is not banned. `d3po` is
    // a real package and is not `d3`. The family is `d3` or `d3-`.
    { filename: APP_FILE, code: `import x from 'd3po'` },
    { filename: APP_FILE, code: `import x from 'echartsy'` },
    // The engine is the only place the borrowed packages may be imported.
    {
      filename: ENGINE,
      code: `import { scaleLinear } from 'd3-scale'`,
      options: allowEngine,
    },
    {
      filename: ENGINE,
      code: `import { line, curveMonotoneX } from 'd3-shape'`,
      options: allowEngine,
    },
    {
      filename: APP_FILE,
      code: `import { scaleLinear } from 'd3-scale'
             export const A = () => <Bespoke reason="one-off dataviz">{scaleLinear}</Bespoke>`,
    },
  ],

  invalid: [
    {
      filename: APP_FILE,
      code: `import { LineChart } from 'recharts'`,
      errors: [{ messageId: 'datavizImport' }],
    },
    // The scale maths is banned outside the engine, even inside the vocabulary.
    // A member that imports a scale is deciding layout in d3's terms.
    {
      filename: 'packages/react-ui/src/charts/BarChart.tsx',
      code: `import { scaleBand } from 'd3-scale'`,
      options: allowEngine,
      errors: [{ messageId: 'datavizImport' }],
    },
    // The frame is not the engine either, although it is in the same tree.
    {
      filename: 'packages/react-ui/src/charts/frame/ChartAxis.tsx',
      code: `import { max } from 'd3-array'`,
      options: allowEngine,
      errors: [{ messageId: 'datavizImport' }],
    },
    {
      filename: APP_FILE,
      code: `const d = await import('echarts')`,
      errors: [{ messageId: 'datavizImport' }],
    },
    // The whole `d3-*` family is banned, not only the three approved packages.
    // Allowing `d3-sankey` would let in the next chart form someone wants.
    {
      filename: 'packages/react-ui/src/charts/BarChart.tsx',
      code: `import { sankey } from 'd3-sankey'`,
      options: allowEngine,
      errors: [{ messageId: 'datavizImport' }],
    },
    {
      filename: APP_FILE,
      code: `import { select } from 'd3-selection'`,
      errors: [{ messageId: 'datavizImport' }],
    },
    // The scoped families publish a package per chart form, and a list of them
    // would go out of date, so the family prefix is banned.
    {
      filename: APP_FILE,
      code: `import { Bar } from '@visx/shape'`,
      errors: [{ messageId: 'datavizImport' }],
    },
    {
      filename: APP_FILE,
      code: `import { ResponsiveBar } from '@nivo/bar'`,
      errors: [{ messageId: 'datavizImport' }],
    },
    // Re-exporting the scale maths leaks it just as importing does, and it is the
    // leak that would make the library impossible to replace.
    // The report names the answer: the chart member, or the zone.
    {
      filename: 'packages/react-ui/src/index.ts',
      code: `export * from 'd3-scale'`,
      errors: [
        {
          message:
            'Unexpected re-export of `d3-scale`. Drop it: a chart no member draws goes in a ' +
            '`<Bespoke reason="…">` zone (rung 4). A re-export leaks the library as an import does.',
        },
      ],
    },
    {
      filename: 'packages/engine/src/charts/index.ts',
      code: `export { scaleLinear } from 'd3-scale'`,
      options: allowEngine,
      errors: [
        {
          message:
            "Unexpected re-export of `d3-scale`. Scales are the chart engine's: a chart member " +
            'scales its own `data={…}` (rung 1). A re-export leaks the library as an import does.',
        },
      ],
    },
    {
      filename: APP_FILE,
      code: `export { BarChart } from 'recharts'`,
      errors: [
        {
          message:
            'Unexpected re-export of `recharts`. `BarChart` is `<BarChart data={…} series={…}>` ' +
            '(rung 1). A re-export leaks the library as an import does.',
        },
      ],
    },
    // Mentioning `<Bespoke>` in a comment does not declare a zone.
    {
      filename: APP_FILE,
      code: `// <Bespoke> is the escape hatch, but a comment declares nothing.
import { scaleLinear } from 'd3-scale'`,
      errors: [{ messageId: 'datavizImport' }],
    },
  ],
})

/**
 * What the report names: the chart member for the library's own call, where
 * the call's name says what it draws, and the zone otherwise.
 */
jsxRuleTester().run('no-external-dataviz — what the report names', noExternalDataviz, {
  valid: [],
  invalid: [
    {
      filename: APP_FILE,
      code: `import { BarChart, Bar, XAxis } from 'recharts'`,
      errors: [
        {
          message:
            'Unexpected charting import `recharts`. `BarChart` is `<BarChart data={…} series={…}>` ' +
            '(rung 1). A chart no member draws goes in a `<Bespoke reason="…">` zone (rung 4).',
        },
      ],
    },
    {
      filename: APP_FILE,
      code: `import { ResponsivePie } from '@nivo/pie'`,
      errors: [
        {
          message:
            'Unexpected charting import `@nivo/pie`. `ResponsivePie` is `<DonutChart segments={…}>` ' +
            '(rung 1). A chart no member draws goes in a `<Bespoke reason="…">` zone (rung 4).',
        },
      ],
    },
    // A config object names the chart by its `type`.
    {
      filename: APP_FILE,
      code: `import { Chart } from 'chart.js'
new Chart(canvas, { type: 'line', data })`,
      errors: [
        {
          message:
            'Unexpected charting import `chart.js`. `line` is `<LineChart data={…} series={…}>` ' +
            '(rung 1). A chart no member draws goes in a `<Bespoke reason="…">` zone (rung 4).',
        },
      ],
    },
    {
      filename: APP_FILE,
      code: `import { scaleLinear } from 'd3-scale'`,
      errors: [
        {
          message:
            "Unexpected charting import `d3-scale`. Scales are the chart engine's: a chart member " +
            'scales its own `data={…}` (rung 1). A chart no member draws goes in a ' +
            '`<Bespoke reason="…">` zone (rung 4).',
        },
      ],
    },
    {
      filename: APP_FILE,
      code: `import { sankey } from 'd3-sankey'`,
      errors: [
        {
          message:
            'Unexpected charting import `d3-sankey`. No chart member draws what this import does, ' +
            'so the chart goes in a `<Bespoke reason="…">` zone (rung 4).',
        },
      ],
    },
    // A library that draws the chart itself is another library's component.
    {
      filename: APP_FILE,
      code: `import * as echarts from 'echarts/core'`,
      errors: [
        {
          message:
            'Unexpected charting import `echarts/core`. No chart member draws what this import ' +
            'does: host the chart in `<ThirdParty library="echarts" reason="…">` (rung 4).',
        },
      ],
    },
  ],
})
