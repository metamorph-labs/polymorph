import { gallerySlug } from '@polymorph/react-ui'
import { describe, expect, it } from 'vitest'

import { GALLERIES } from './galleries'

/**
 * The states-fixture contract, checked for every component that ships one.
 *
 * This checks the registry, not the states: that fixtures exist, are named, and
 * have unique routes. Other laws cover the states: `laws.test.tsx` renders
 * every entry and asserts what it promises, and `selectors.test.ts` reads the
 * shipped CSS for what a prop cannot reach. Keeping them apart means the
 * completeness law does not also have to catch slug typos.
 *
 * **Why the two arrays below are written out and not derived.** Both could be
 * computed from `GALLERIES` in one line, but then each would assert that a list
 * equals itself, which is always true, even for a list a rebase shortened. They
 * are an independent check: a hand-written statement of what the vocabulary
 * delivers and of each fixture's route, so an accidental addition, removal or
 * reorder in `galleries.ts` fails. The slug array does the same for
 * `gallerySlug`: if it were derived, a change to the kebab rule would silently
 * change every route it pins.
 *
 * A hand-maintained list can be forgotten, so it is not left to memory:
 * `wiring.test.ts` fails when a member is missing from either array, and
 * `pnpm new:member` appends to both. Those two read the `@wiring` anchors
 * below, so keep the anchors attached to their arrays.
 */

describe('gallery registry', () => {
  it('ships a fixture for every component the vocabulary delivers', () => {
    // @wiring components — the membership list, in exact order. `wiring.test.ts`
    // checks it and `pnpm new:member` appends to it. It can be edited by hand,
    // but keep this comment attached to the array.
    expect(GALLERIES.map((states) => states.component)).toEqual([
      // infrastructure
      'Icon',
      'Stack',
      'Inline',
      'Grid',
      'SplitPane',
      // the text tier
      'Heading',
      'Text',
      'Code',
      'CodeBlock',
      'RichTextContent',
      'JsonTree',
      'Diff',
      'Highlight',
      // lines that arrive over time, beside the blocks that show one finished text
      'LogView',
      'QRCode',
      // the styling for regions that are allowed to scroll
      'ScrollArea',
      // inline text, not a widget: the timestamp sits with the text tier
      'RelativeTime',
      // the time left until a moment, beside the timestamp
      'Countdown',
      // controls
      'Button',
      // a Button preset, as SearchInput is an Input preset
      'CopyButton',
      // another Button preset, for a recording the application makes
      'RecordButton',
      'ProviderButton',
      'AvatarButton',
      // one command with variants behind a chevron
      'SplitButton',
      'Input',
      // the parsed-number field, beside the string field it differs from
      'NumberInput',
      'Select',
      // the control that filters its own list
      'Combobox',
      // multi-value selection from a closed list
      'MultiSelect',
      // one node of a hierarchy, picked in a field
      'TreeSelect',
      'SearchInput',
      // an Input preset for secrets, beside the search preset
      'PasswordInput',
      // one-time codes, which are not secrets, beside the field for secrets
      'OTPInput',
      'Textarea',
      'RichTextInput',
      // the multi-value fields
      'TagInput',
      'FileUpload',
      'Checkbox',
      'RadioGroup',
      // RadioGroup's counterpart for multiple choices
      'CheckboxGroup',
      'SegmentedControl',
      'ModeSwitch',
      'ChoiceCard',
      'Switch',
      // the range and the date family
      'Slider',
      'Rating',
      'DatePicker',
      'Calendar',
      // the range picker and the standalone time field, the last of the family
      'DateRangePicker',
      'MonthInput',
      'TimeInput',
      'DurationInput',
      'ColorInput',
      'PhoneInput',
      'FormField',
      'InlineEdit',
      'ImageEditor',
      // navigation as text
      'Link',
      // overlays
      'Dialog',
      'ConfirmDialog',
      // the modal that enters from an edge
      'Drawer',
      'Lightbox',
      // the palette
      'Command',
      'Popover',
      'Tour',
      'Menu',
      // Menu's command list on right-click or long-press
      'ContextMenu',
      // Menu's command lists along an application's row
      'Menubar',
      'Tabs',
      'Tooltip',
      // the preview between Tooltip and Popover
      'HoverCard',
      'Toast',
      // Toast's in-page counterpart
      'Alert',
      // Alert's danger tone with links to the fields in error
      'ErrorSummary',
      'Banner',
      // structure
      'Card',
      // the disclosure list
      'Accordion',
      // the lone disclosure, beside the list
      'Collapsible',
      'Badge',
      // the small primitives
      'Avatar',
      // a picture as content, beside the identity mark it is not
      'Image',
      // a recording played in place, beside the picture shown in place
      'AudioPlayer',
      'Separator',
      'Kbd',
      'Spinner',
      'Progress',
      // a measured value against a limit
      'Meter',
      // the other progress indicator, for an ordered flow
      'Stepper',
      // a sequence of past events
      'Timeline',
      // Timeline's counterpart for facts instead of events
      'DescriptionList',
      'Skeleton',
      'List',
      'Tree',
      'CommentThread',
      'Table',
      // the list assemblies
      'DataTable',
      'FilterBar',
      'Pagination',
      'CursorPagination',
      'Stat',
      'SettingsRow',
      // location in the page hierarchy, which is structure, not navigation chrome
      'Breadcrumbs',
      'SectionNav',
      'TableOfContents',
      'PageHeader',
      // the display tier: the page opening, and PageHeader's alternative
      'Hero',
      'Carousel',
      'EmptyState',
      // charts — content, then data, then pages
      'BarChart',
      'LineChart',
      'Sparkline',
      'AreaChart',
      'Heatmap',
      'DonutChart',
      'ScatterChart',
      'Histogram',
      'RadarChart',
      'FunnelChart',
      'Treemap',
      // archetypes
      // the conversation tier: streaming text, its rendering, the composer, the
      // message, the thread, what a message carries, and the side pane
      'StreamingText',
      'Markdown',
      'AttachmentChip',
      'PromptInput',
      'ChatMessage',
      'ChatThread',
      'Plan',
      'ToolCall',
      'ApprovalCard',
      'Citation',
      'SourceList',
      'ReasoningDisclosure',
      'ArtifactPane',
      'AppShell',
      'ListPage',
      'DetailPage',
      'FormPage',
      'SettingsPage',
      'Dashboard',
      'AuthPage',
      'MasterDetailPage',
      'SearchPage',
      'ConversationPage',
    ])
  })

  it('gives every fixture a unique route slug', () => {
    const slugs = GALLERIES.map((states) => gallerySlug(states.component))
    expect(new Set(slugs).size).toBe(slugs.length)
    // @wiring slugs — the same members as their routes, in the same order.
    // `wiring.test.ts` checks it against `gallerySlug`.
    expect(slugs).toEqual([
      'icon',
      'stack',
      'inline',
      'grid',
      'split-pane',
      'heading',
      'text',
      'code',
      'code-block',
      'rich-text-content',
      'json-tree',
      'diff',
      'highlight',
      'log-view',
      'qr-code',
      'scroll-area',
      'relative-time',
      'countdown',
      'button',
      'copy-button',
      'record-button',
      'provider-button',
      'avatar-button',
      'split-button',
      'input',
      'number-input',
      'select',
      'combobox',
      'multi-select',
      'tree-select',
      'search-input',
      'password-input',
      'otp-input',
      'textarea',
      'rich-text-input',
      'tag-input',
      'file-upload',
      'checkbox',
      'radio-group',
      'checkbox-group',
      'segmented-control',
      'mode-switch',
      'choice-card',
      'switch',
      'slider',
      'rating',
      'date-picker',
      'calendar',
      'date-range-picker',
      'month-input',
      'time-input',
      'duration-input',
      'color-input',
      'phone-input',
      'form-field',
      'inline-edit',
      'image-editor',
      'link',
      'dialog',
      'confirm-dialog',
      'drawer',
      'lightbox',
      'command',
      'popover',
      'tour',
      'menu',
      'context-menu',
      'menubar',
      'tabs',
      'tooltip',
      'hover-card',
      'toast',
      'alert',
      'error-summary',
      'banner',
      'card',
      'accordion',
      'collapsible',
      'badge',
      'avatar',
      'image',
      'audio-player',
      'separator',
      'kbd',
      'spinner',
      'progress',
      'meter',
      'stepper',
      'timeline',
      'description-list',
      'skeleton',
      'list',
      'tree',
      'comment-thread',
      'table',
      'data-table',
      'filter-bar',
      'pagination',
      'cursor-pagination',
      'stat',
      'settings-row',
      'breadcrumbs',
      'section-nav',
      'table-of-contents',
      'page-header',
      'hero',
      'carousel',
      'empty-state',
      'bar-chart',
      'line-chart',
      'sparkline',
      'area-chart',
      'heatmap',
      'donut-chart',
      'scatter-chart',
      'histogram',
      'radar-chart',
      'funnel-chart',
      'treemap',
      'streaming-text',
      'markdown',
      'attachment-chip',
      'prompt-input',
      'chat-message',
      'chat-thread',
      'plan',
      'tool-call',
      'approval-card',
      'citation',
      'source-list',
      'reasoning-disclosure',
      'artifact-pane',
      'app-shell',
      'list-page',
      'detail-page',
      'form-page',
      'settings-page',
      'dashboard',
      'auth-page',
      'master-detail-page',
      'search-page',
      'conversation-page',
    ])
  })

  it('slugs multi-word components the way the route expects', () => {
    expect(gallerySlug('FormField')).toBe('form-field')
    expect(gallerySlug('AppShell')).toBe('app-shell')
    expect(gallerySlug('Icon')).toBe('icon')
  })

  it('names every entry, and names them distinctly within a component', () => {
    for (const states of GALLERIES) {
      const names = states.entries.map((entry) => entry.name)
      expect(names.length, `${states.component} has no entries`).toBeGreaterThan(0)
      expect(new Set(names).size, `${states.component} has duplicate entry names`).toBe(
        names.length,
      )
      for (const name of names) expect(name.trim()).not.toBe('')
    }
  })
})
