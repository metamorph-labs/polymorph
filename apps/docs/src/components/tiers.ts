import type { TIERS } from '../registry'

/**
 * What the site calls each tier, and the line under its heading on the
 * Components index. The registry names a tier with one lowercase word. These
 * are written for a visitor, so they are copy, kept beside the pages that show
 * them. `tiers.test.ts` holds the map to `TIERS`.
 */
export const TIER_COPY: Record<(typeof TIERS)[number], { title: string; lede: string }> = {
  controls: {
    title: 'Controls',
    lede: 'Buttons, fields and choices. Everything a form is made of.',
  },
  overlays: {
    title: 'Overlays',
    lede: 'Things that open over the page, like dialogs, menus, popovers and toasts.',
  },
  structure: {
    title: 'Structure',
    lede: 'Text, cards, tables, status and the links that help people find their way.',
  },
  layout: {
    title: 'Layout',
    lede: 'Stack things, line them up or lay them out in a grid, all without writing CSS.',
  },
  charts: {
    title: 'Charts',
    lede: 'Bars, lines, areas and more, drawn in your theme’s own colours and type.',
  },
  ai: {
    title: 'AI',
    lede: 'What a chat with a model needs: messages, the composer, tool calls and sources.',
  },
  archetypes: {
    title: 'Pages',
    lede: 'Whole screens, like a list, a detail view or a settings page, with the layout already worked out.',
  },
  icon: {
    title: 'Icons',
    lede: 'One set of icons, each named for what it means rather than what it looks like.',
  },
}
