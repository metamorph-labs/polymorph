/**
 * The guides' catalogue: each guide with the group the index shows it in and
 * the line the index describes it with.
 *
 * The module imports nothing, so the build's own scripts read it as the
 * application does: `llms.ts` lists the guides in `/llms.txt` from it
 * (`vite.config.ts`). `guides.ts` exports everything here again, beside the
 * text pipeline.
 */

export type GuideGroupId = 'start' | 'design' | 'agents' | 'internals'

export interface GuideGroup {
  id: GuideGroupId
  title: string
  description: string
}

export interface Guide {
  /** The file's name without `.md`, which is also its path under `/guides`. */
  slug: string
  /** The guide's own `#` heading. `guides.test.ts` holds it to the file. */
  title: string
  group: GuideGroupId
  /** The index's line for the guide, written for a reader of the site. */
  description: string
}

/** The index's groups, in the order a newcomer reads them. */
export const GUIDE_GROUPS: readonly GuideGroup[] = [
  {
    id: 'start',
    title: 'Start here',
    description:
      'New to Polymorph? Begin with these and you’ll go from the big idea to a working app.',
  },
  {
    id: 'design',
    title: 'Designing with it',
    description:
      'How themes, layout, motion, charts and chat screens work, so your screens look right without any styling of your own.',
  },
  {
    id: 'agents',
    title: 'Agents and tools',
    description:
      'The tools that help you and your AI agents build, and the lint rules that keep every screen consistent.',
  },
  {
    id: 'internals',
    title: 'Under the hood',
    description:
      'How the repository is put together, generated and tested. Handy when you want to contribute.',
  },
]

/** Every guide, in reading order: by group, then by the order within it. */
export const GUIDES: readonly Guide[] = [
  {
    slug: 'concepts',
    title: 'Concepts',
    group: 'start',
    description: 'The idea behind Polymorph, plus the handful of words every other guide uses.',
  },
  {
    slug: 'consuming',
    title: 'Using polymorph from another repository',
    group: 'start',
    description:
      'Get Polymorph into your app, whether it’s React, Vue, Svelte, Solid, Angular, a plain HTML page, iOS or Android.',
  },
  {
    slug: 'frameworks',
    title: 'Frameworks',
    group: 'start',
    description:
      'Not on React? See how each prop reads in Vue, Svelte, Solid, Angular and custom elements, and which components you get.',
  },
  {
    slug: 'theming',
    title: 'Theming',
    group: 'design',
    description: 'How a theme is put together, and how to make your own.',
  },
  {
    slug: 'layout',
    title: 'Layout, responsiveness and performance',
    group: 'design',
    description:
      'How components fit the space they’re given, what changes on a phone, and the size budgets every build has to fit.',
  },
  {
    slug: 'motion',
    title: 'Motion',
    group: 'design',
    description:
      'How animation is taken care of for you, and why your app code never needs to animate anything.',
  },
  {
    slug: 'charts',
    title: 'Charts',
    group: 'design',
    description:
      'Draw your data with the chart components, in colours that stay readable in every theme.',
  },
  {
    slug: 'conversation',
    title: 'The conversation tier',
    group: 'design',
    description:
      'Build an AI chat screen from ready-made parts: the thread, its messages, the composer and the pane beside it.',
  },
  {
    slug: 'rich-text',
    title: 'Rich text',
    group: 'design',
    description:
      'Let people write formatted text, mention things and comment on words, and store it all as plain JSON you own.',
  },
  {
    slug: 'harnesses',
    title: 'Coding agents and their harnesses',
    group: 'agents',
    description:
      'Set up Claude Code, Codex, Cursor or any other coding agent to build with Polymorph, with one command or a plugin.',
  },
  {
    slug: 'agents',
    title: 'Agents',
    group: 'agents',
    description:
      'Let an AI agent read and use the components on a live page, and decide exactly what it’s allowed to do.',
  },
  {
    slug: 'run-time-screens',
    title: 'Run-time screens',
    group: 'agents',
    description:
      'Let an AI model build a screen right inside your product, drawn in your theme as its answer streams in, and hear back what people do with it.',
  },
  {
    slug: 'tooling',
    title: 'Tooling',
    group: 'agents',
    description:
      'Meet the CLI, the MCP server, the screen format, the workbench and this site, and what each one is for.',
  },
  {
    slug: 'rules',
    title: 'Rules',
    group: 'agents',
    description:
      'The lint rules that keep styling out of your app code, and the way out when you really do need an exception.',
  },
  {
    slug: 'listing',
    title: 'Listing the plugin and the server',
    group: 'agents',
    description:
      'Where the plugin and the MCP server are listed for agents to find, and what each listing needs.',
  },
  {
    slug: 'architecture',
    title: 'Architecture',
    group: 'internals',
    description:
      'Find your way around the repository, and follow a design decision from a JSON file to the screen.',
  },
  {
    slug: 'shells',
    title: 'Shells',
    group: 'internals',
    description:
      'How the Vue, Svelte, Solid and Angular components, and the custom elements, are generated from one shared description.',
  },
  {
    slug: 'native',
    title: 'Native rendering',
    group: 'internals',
    description:
      'How the same components are drawn with SwiftUI on iOS and Jetpack Compose on Android.',
  },
  {
    slug: 'conformance',
    title: 'Behaviour conformance',
    group: 'internals',
    description:
      'How each component’s written behaviour is checked against every framework that draws it.',
  },
  {
    slug: 'verification',
    title: 'Verification',
    group: 'internals',
    description:
      'Every check the repository runs, what each one proves, and how to run it yourself.',
  },
]

export function guideBySlug(slug: string): Guide | undefined {
  return GUIDES.find((guide) => guide.slug === slug)
}

export function guidesInGroup(group: GuideGroupId): Guide[] {
  return GUIDES.filter((guide) => guide.group === group)
}

export function groupOf(guide: Guide): GuideGroup {
  return GUIDE_GROUPS.find((group) => group.id === guide.group) as GuideGroup
}

export function guidePath(slug: string): string {
  return `/guides/${slug}`
}

/** Where the site serves the guide's markdown, for a reader that wants no page. */
export function guideMarkdownPath(slug: string): string {
  return `${guidePath(slug)}.md`
}

/** The guides before and after this one in reading order, across groups. */
export function neighbours(slug: string): { previous?: Guide; next?: Guide } {
  const at = GUIDES.findIndex((guide) => guide.slug === slug)
  if (at === -1) return {}
  const previous = GUIDES[at - 1]
  const next = GUIDES[at + 1]
  return {
    ...(previous === undefined ? {} : { previous }),
    ...(next === undefined ? {} : { next }),
  }
}
