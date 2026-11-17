/**
 * The numbers the recipes write that the native members read: a page's or a
 * part's measure as a multiple of `space.10` (or a part of it), a breakpoint
 * in rems, a height as a fraction of the window, an opacity, and a length in
 * pixels. A recipe is the authority for each, so `pnpm native:contracts` reads
 * them from the recipe's CSS and writes them into both platforms' contracts
 * (`Recipes.kt` and `Recipes.swift`, `PMRecipe`), and a member multiplies the
 * theme's step by the generated number rather than a copy of it. A recipe that
 * changes one of them makes the generated file stale, which the freshness law
 * reports. A few numbers are written in a web member's source rather than its
 * recipe (ConversationPage's split), or in the chart engine (a marker's
 * radius); those entries name the source's directory as their `root` and are
 * read the same way.
 *
 * Each entry names its recipe and a pattern whose first group is the number.
 * The pattern is matched against the recipe with its comments removed, and it
 * must match at least once; when it matches more than once, every match must
 * give the same number, as a breakpoint the recipe writes in several rules
 * does. An entry with several recipes reads the same number from each. A
 * group that matched nothing reads 1: `calc(var(--pm-space-10) + …)` holds one
 * `space.10`, which the recipe writes without a multiplier.
 */

/** What a number is, which decides how a platform writes it. */
export type RecipeUnit =
  /** A multiple of `space.10`: an integer the member multiplies the step by. */
  | 'space10'
  /** A breakpoint in rems, which is geometry and not theme: a rem is 16 points. */
  | 'rem'
  /** A percentage of the window, written as a fraction: `66vh` is 0.66. */
  | 'percent'
  /** A multiple of another token, which `of` names (`space.6`, `radius.lg`): an integer the member multiplies it by. */
  | 'multiple'
  /** A part of another token, which `of` names (`space.10`): an integer the member divides it by. */
  | 'divisor'
  /** A plain number, as the recipe writes it: an opacity or a share from 0 to 1, or a scale (`scale(1.12)`). */
  | 'fraction'
  /** A length in CSS pixels, a dp or a point each: a fact about content, such as a pane's floor, not a theme value. */
  | 'px'

export interface RecipeNumber {
  /** The constant's name in the generated object. */
  name: string
  /** The recipes it is read from, relative to `root`. */
  recipes: readonly string[]
  /**
   * The directory `recipes` are in, relative to the repository's root:
   * `RECIPES` unless the number is a web member's source's
   * (`packages/react-ui/src`) or the chart engine's (`packages/engine/src`).
   */
  root?: string
  /** The pattern whose first group is the number. */
  pattern: RegExp
  unit: RecipeUnit
  /** The token a `multiple` multiplies, or a `divisor` divides, as a member reads it: `space.6`. */
  of?: string
  /** What the number is, for its doc comment. */
  doc: string
}

/** Where the recipes are, relative to the repository's root. */
export const RECIPES = 'packages/recipes/src'

const spaceTen = String.raw`calc\(var\(--pm-space-10\) \* (\d+)\)`

/** ConversationPage's source, where the web writes its split and breakpoint. */
const conversationPage = {
  root: 'packages/react-ui/src',
  recipes: ['archetypes/ConversationPage.tsx'],
}

/** MasterDetailPage's source, where the web writes its split and breakpoint. */
const masterDetailPage = {
  root: 'packages/react-ui/src',
  recipes: ['archetypes/MasterDetailPage.tsx'],
}

export const RECIPE_NUMBERS: readonly RecipeNumber[] = [
  {
    name: 'dialogWidthSm',
    recipes: ['overlays/dialog.module.css'],
    pattern: new RegExp(
      String.raw`\.panel\[data-size='sm'\] \{[^}]*?inline-size: min\(${spaceTen}`,
    ),
    unit: 'space10',
    doc: "A small Dialog's width.",
  },
  {
    name: 'dialogWidthMd',
    recipes: ['overlays/dialog.module.css'],
    pattern: new RegExp(String.raw`\.panel \{[^}]*?inline-size: min\(${spaceTen}`),
    unit: 'space10',
    doc: "A Dialog's width at its default size.",
  },
  {
    name: 'dialogWidthLg',
    recipes: ['overlays/dialog.module.css'],
    pattern: new RegExp(
      String.raw`\.panel\[data-size='lg'\] \{[^}]*?inline-size: min\(${spaceTen}`,
    ),
    unit: 'space10',
    doc: "A large Dialog's width.",
  },
  {
    name: 'dialogBelow',
    recipes: ['overlays/dialog.module.css'],
    pattern: /@media \(width < (\d+)rem\)/,
    unit: 'rem',
    doc: 'The window width below which a Dialog fills the window, or is a bottom sheet when its presentation is `sheet`.',
  },
  {
    name: 'sheetHeight',
    recipes: ['overlays/sheet.module.css'],
    pattern: /\.panel\[data-presentation='sheet'\] \{[^}]*?max-block-size: (\d+)vh/,
    unit: 'percent',
    doc: "A bottom sheet's greatest height, as a fraction of the window's.",
  },
  {
    name: 'toastWidth',
    recipes: ['overlays/toast.module.css'],
    pattern: new RegExp(String.raw`\.viewport \{[^}]*?(?<![-\w])inline-size: ${spaceTen}`),
    unit: 'space10',
    doc: "A Toast's width, from the window width `toastBelow` up.",
  },
  {
    name: 'toastBelow',
    recipes: ['overlays/toast.module.css'],
    pattern: /@media \(width < (\d+)rem\)/,
    unit: 'rem',
    doc: 'The window width below which a Toast spans the window, the phone register.',
  },
  {
    name: 'listPageMeasure',
    recipes: ['archetypes/list-page.module.css'],
    pattern: new RegExp(String.raw`--pm-page-max-width: ${spaceTen}`),
    unit: 'space10',
    doc: "ListPage's measure, the web's `--pm-page-max-width`.",
  },
  {
    name: 'formPageMeasure',
    recipes: ['archetypes/form-page.module.css'],
    pattern: new RegExp(String.raw`--pm-page-max-width: ${spaceTen}`),
    unit: 'space10',
    doc: "FormPage's measure, the web's `--pm-page-max-width`.",
  },
  {
    name: 'settingsPageMeasure',
    recipes: ['archetypes/settings-page.module.css'],
    pattern: new RegExp(String.raw`--pm-page-max-width: ${spaceTen}`),
    unit: 'space10',
    doc: "SettingsPage's measure, the web's `--pm-page-max-width`.",
  },
  {
    name: 'searchPageMeasure',
    recipes: ['archetypes/search-page.module.css'],
    pattern: new RegExp(String.raw`--pm-page-max-width: ${spaceTen}`),
    unit: 'space10',
    doc: "SearchPage's measure, the web's `--pm-page-max-width`.",
  },
  {
    name: 'pageNarrowBelow',
    recipes: [
      'archetypes/list-page.module.css',
      'archetypes/form-page.module.css',
      'archetypes/settings-page.module.css',
      'archetypes/search-page.module.css',
      'archetypes/master-detail-page.module.css',
      'archetypes/app-shell.module.css',
    ],
    pattern: /@container \(width < (\d+)rem\)/,
    unit: 'rem',
    doc: "The width below which a page column, and AppShell's reading column, steps its insets down one space step.",
  },
  {
    name: 'appShellDrawerBelow',
    recipes: ['archetypes/app-shell.module.css'],
    pattern: /@media \(width (?:<|>=) (\d+)rem\)/,
    unit: 'rem',
    doc: "The window width below which AppShell's rail is a drawer.",
  },
  {
    name: 'appShellReadingMeasure',
    recipes: ['archetypes/app-shell.module.css'],
    pattern: new RegExp(String.raw`\.page \{[^}]*?max-inline-size: ${spaceTen}`),
    unit: 'space10',
    doc: "The measure of AppShell's reading column, `contentLayout: page`.",
  },
  {
    name: 'appShellRailWidth',
    recipes: ['archetypes/app-shell.module.css'],
    pattern:
      /--pm-shell-sidebar-width: calc\(var\(--pm-space-10\) \* (\d+) \+ var\(--pm-space-7\)\)/,
    unit: 'space10',
    doc: "AppShell's rail, with one `space.7` more: the web's `--pm-shell-sidebar-width`.",
  },
  {
    name: 'appShellRailCollapsedWidth',
    recipes: ['archetypes/app-shell.module.css'],
    pattern:
      /--pm-shell-sidebar-width-collapsed: calc\(var\(--pm-space-7\)(?: \* (\d+))? \+ var\(--pm-space-5\)\)/,
    unit: 'multiple',
    of: 'space.7',
    doc: "AppShell's collapsed rail, with one `space.5` more: the web's `--pm-shell-sidebar-width-collapsed`.",
  },
  {
    name: 'emptyStateMeasure',
    recipes: ['structure/empty-state.module.css'],
    pattern: new RegExp(String.raw`max-inline-size: ${spaceTen}`),
    unit: 'space10',
    doc: "The measure of EmptyState's description.",
  },
  {
    name: 'pageHeaderMeasure',
    recipes: ['structure/page-header.module.css'],
    pattern: new RegExp(String.raw`max-inline-size: ${spaceTen}`),
    unit: 'space10',
    doc: "The measure of PageHeader's description.",
  },
  {
    name: 'heroNarrowBelow',
    recipes: ['structure/hero.module.css'],
    pattern: /@container \(width < (\d+)rem\)/,
    unit: 'rem',
    doc: "The width below which a Hero's title takes the `display.md` step.",
  },
  {
    name: 'crumbMeasure',
    recipes: ['structure/breadcrumbs.module.css'],
    pattern: new RegExp(String.raw`\.crumb \{[^}]*?max-inline-size: ${spaceTen}`),
    unit: 'space10',
    doc: "The widest a Breadcrumbs crumb's label is drawn before it ends in an ellipsis.",
  },
  {
    name: 'settingsRowMeasure',
    recipes: ['structure/settings-row.module.css'],
    pattern: new RegExp(String.raw`\.description \{[^}]*?max-inline-size: ${spaceTen}`),
    unit: 'space10',
    doc: "The measure of a SettingsRow's description.",
  },
  {
    name: 'filterBarNarrowBelow',
    recipes: ['structure/filter-bar.module.css'],
    pattern: /@container \(width < (\d+)rem\)/,
    unit: 'rem',
    doc: "The width below which each of a FilterBar's clusters takes a line of its own.",
  },
  {
    name: 'chatThreadMeasure',
    recipes: ['ai/chat-thread.module.css'],
    pattern: new RegExp(String.raw`\.list \{[^}]*?max-inline-size: ${spaceTen}`),
    unit: 'space10',
    doc: "The measure of ChatThread's column of turns.",
  },
  {
    name: 'chatBubbleMeasure',
    recipes: ['ai/chat-message.module.css'],
    pattern: new RegExp(String.raw`\.content \{[^}]*?max-inline-size: ${spaceTen}`),
    unit: 'space10',
    doc: "The widest the reader's bubble in a ChatMessage is drawn.",
  },
  {
    name: 'artifactHeadingBasis',
    recipes: ['ai/artifact-pane.module.css'],
    pattern: new RegExp(String.raw`\.heading \{[^}]*?flex: 1 1 ${spaceTen}`),
    unit: 'space10',
    doc: "The width an ArtifactPane's heading grows from, before its controls wrap under it.",
  },
  {
    name: 'bannerMessageBasis',
    recipes: ['structure/banner.module.css'],
    pattern: new RegExp(String.raw`\.text \{[^}]*?flex: 1 1 ${spaceTen}`),
    unit: 'space10',
    doc: "The width a Banner's message grows from, before its action wraps under it.",
  },
  {
    name: 'detailPageMeasure',
    recipes: ['archetypes/detail-page.module.css'],
    pattern: new RegExp(String.raw`--pm-page-max-width: ${spaceTen}`),
    unit: 'space10',
    doc: "DetailPage's measure, the web's `--pm-page-max-width`.",
  },
  {
    name: 'detailAsideWidth',
    recipes: ['archetypes/detail-page.module.css'],
    pattern: new RegExp(String.raw`--pm-page-aside-width: ${spaceTen}`),
    unit: 'space10',
    doc: "DetailPage's aside width, the web's `--pm-page-aside-width`.",
  },
  {
    name: 'dashboardMeasure',
    recipes: ['archetypes/dashboard.module.css'],
    pattern: new RegExp(String.raw`--pm-page-max-width: ${spaceTen}`),
    unit: 'space10',
    doc: "Dashboard's measure, the web's `--pm-page-max-width`.",
  },
  {
    name: 'regionsStackBelow',
    recipes: ['archetypes/detail-page.module.css', 'archetypes/dashboard.module.css'],
    pattern: /@container \(width < (\d+)rem\) \{\s*\.body\[/,
    unit: 'rem',
    doc: "The width below which a page's two body regions (DetailPage's main column and aside, Dashboard's primary and secondary) stack.",
  },
  {
    name: 'conversationPageMeasure',
    recipes: ['archetypes/conversation-page.module.css'],
    pattern: new RegExp(String.raw`--pm-page-max-width: ${spaceTen}`),
    unit: 'space10',
    doc: "ConversationPage's measure, the web's `--pm-page-max-width`.",
  },
  {
    name: 'conversationComposerMeasure',
    recipes: ['archetypes/conversation-page.module.css'],
    pattern: new RegExp(String.raw`\.composer \{[^}]*?max-inline-size: ${spaceTen}`),
    unit: 'space10',
    doc: "The measure of ConversationPage's composer, the thread's column.",
  },
  {
    name: 'authPageMeasure',
    recipes: ['archetypes/auth-page.module.css'],
    pattern: new RegExp(
      String.raw`--pm-page-max-width: calc\(var\(--pm-space-10\) \* (\d+) \+ var\(--pm-space-6\)\)`,
    ),
    unit: 'space10',
    doc: "AuthPage's card column, with one `space.6` more: the web's `--pm-page-max-width`.",
  },
  {
    name: 'authIllustratedColumn',
    recipes: ['archetypes/auth-page.module.css'],
    pattern: /\.illustrated \{[^}]*?--pm-page-max-width: calc\(var\(--pm-space-6\) \* (\d+)\)/,
    unit: 'multiple',
    of: 'space.6',
    doc: "The form column of AuthPage's illustrated layout.",
  },
  {
    name: 'authIllustrationWidth',
    recipes: ['archetypes/auth-page.module.css'],
    pattern: /\.illustration \{[^}]*?flex: 0 1 calc\(var\(--pm-space-6\) \* (\d+)\)/,
    unit: 'multiple',
    of: 'space.6',
    doc: "The width AuthPage's illustration takes beside the form.",
  },
  {
    name: 'authIllustratedGap',
    recipes: ['archetypes/auth-page.module.css'],
    pattern:
      /\.illustrated \.column \{[^}]*?gap: calc\(var\(--pm-space-6\) \* (\d+) - var\(--pm-space-2\)\)/,
    unit: 'multiple',
    of: 'space.6',
    doc: "The gap between AuthPage's illustration and its form, one `space.2` less.",
  },
  {
    name: 'authFrameRadius',
    recipes: ['archetypes/auth-page.module.css'],
    pattern: /\.frame \{[^}]*?border-radius: calc\(var\(--pm-radius-lg\) \* (\d+)\)/,
    unit: 'multiple',
    of: 'radius.lg',
    doc: "The corner of the frame round AuthPage's illustrated form.",
  },
  {
    name: 'gridMiddleFrom',
    recipes: ['layout/layout.module.css'],
    pattern: /@container \((\d+)rem <= width < \d+rem\)/,
    unit: 'rem',
    doc: 'The width from which a Grid lays out half its columns, rounded up.',
  },
  {
    name: 'gridWideFrom',
    recipes: ['layout/layout.module.css'],
    pattern: /@container \(\d+rem <= width < (\d+)rem\)/,
    unit: 'rem',
    doc: 'The width from which a Grid lays out all its columns.',
  },
  {
    name: 'drawerWidthSm',
    recipes: ['overlays/drawer.module.css'],
    pattern: new RegExp(
      String.raw`\.panel\[data-side='start'\]\[data-size='sm'\] \{[^}]*?inline-size: ${spaceTen}`,
    ),
    unit: 'space10',
    doc: "A small start or end Drawer's width.",
  },
  {
    name: 'drawerWidthMd',
    recipes: ['overlays/drawer.module.css'],
    pattern: new RegExp(
      String.raw`\.panel\[data-side='start'\]\[data-size='md'\] \{[^}]*?inline-size: ${spaceTen}`,
    ),
    unit: 'space10',
    doc: "A start or end Drawer's width at its default size.",
  },
  {
    name: 'drawerWidthLg',
    recipes: ['overlays/drawer.module.css'],
    pattern: new RegExp(
      String.raw`\.panel\[data-side='start'\]\[data-size='lg'\] \{[^}]*?inline-size: ${spaceTen}`,
    ),
    unit: 'space10',
    doc: "A large start or end Drawer's width.",
  },
  {
    name: 'drawerHeightSm',
    recipes: ['overlays/drawer.module.css'],
    pattern: /\.panel\[data-side='bottom'\]\[data-size='sm'\] \{[^}]*?max-block-size: (\d+)vh/,
    unit: 'percent',
    doc: "A small bottom Drawer's greatest height, as a fraction of the window's.",
  },
  {
    name: 'drawerHeightMd',
    recipes: ['overlays/drawer.module.css'],
    pattern: /\.panel\[data-side='bottom'\]\[data-size='md'\] \{[^}]*?max-block-size: (\d+)vh/,
    unit: 'percent',
    doc: "A bottom Drawer's greatest height at its default size, as a fraction of the window's.",
  },
  {
    name: 'drawerHeightLg',
    recipes: ['overlays/drawer.module.css'],
    pattern: /\.panel\[data-side='bottom'\]\[data-size='lg'\] \{[^}]*?max-block-size: (\d+)vh/,
    unit: 'percent',
    doc: "A large bottom Drawer's greatest height, as a fraction of the window's.",
  },
  {
    name: 'popoverWidth',
    recipes: ['overlays/popover.module.css'],
    pattern: new RegExp(String.raw`\.panel \{[^}]*?max-inline-size: ${spaceTen}`),
    unit: 'space10',
    doc: "The widest an anchored Popover's panel is drawn.",
  },
  {
    name: 'menuMinWidth',
    recipes: ['overlays/menu.module.css'],
    pattern: new RegExp(String.raw`\.content \{[^}]*?min-inline-size: ${spaceTen}`),
    unit: 'space10',
    doc: "The narrowest an anchored Menu's panel is drawn.",
  },
  {
    name: 'treeSelectPanelWidth',
    recipes: ['controls/tree-select.module.css'],
    pattern: new RegExp(
      String.raw`\.content \{[^}]*?max\(var\(--radix-popover-trigger-width\), ${spaceTen}\)`,
    ),
    unit: 'space10',
    doc: "The widest TreeSelect's anchored panel is drawn while its trigger is narrower.",
  },
  {
    name: 'chipLabelMeasure',
    recipes: ['controls/tag-input.module.css', 'controls/multi-select.module.css'],
    pattern: new RegExp(String.raw`\.label \{[^}]*?max-inline-size: ${spaceTen}`),
    unit: 'space10',
    doc: "The widest a value chip's label is drawn before it ends in an ellipsis, TagInput's and MultiSelect's.",
  },
  {
    name: 'entryMinWidth',
    recipes: ['controls/tag-input.module.css', 'controls/multi-select.module.css'],
    pattern: /\.input \{[^}]*?min-inline-size: calc\(var\(--pm-space-10\) \/ (\d+)\)/,
    unit: 'divisor',
    of: 'space.10',
    doc: "The narrowest the text entry after a field's chips is, before it wraps to a line of its own.",
  },
  {
    name: 'colorPickerWidth',
    recipes: ['controls/color-input.module.css'],
    pattern: new RegExp(String.raw`\.picker \{[^}]*?(?<![-\w])inline-size: ${spaceTen}`),
    unit: 'space10',
    doc: "The width of ColorInput's picker column.",
  },
  {
    name: 'phoneCountryWidth',
    recipes: ['controls/phone-input.module.css'],
    pattern: new RegExp(String.raw`\.country \{[^}]*?flex: 0 1 ${spaceTen}`),
    unit: 'space10',
    doc: "The width PhoneInput's country starts at, before it gives up the row's shortfall.",
  },
  {
    name: 'phoneNumberEms',
    recipes: ['controls/phone-input.module.css'],
    pattern: /\.number \{[^}]*?flex: 1 0 calc\(var\(--pm-text-entry-size\) \* (\d+) \+/,
    unit: 'multiple',
    of: 'text-entry-size',
    doc:
      "The narrowest PhoneInput's number is, its frame's padding aside: room for a national " +
      "number's digits. The web multiplies its text-entry size; a native field, which has no " +
      'zoom floor, multiplies its own type size.',
  },
  {
    name: 'qrSizeSm',
    recipes: ['structure/qr-code.module.css'],
    pattern:
      /\.symbol\[data-size='sm'\] \{[^}]*?inline-size: calc\(var\(--pm-space-10\)(?: \* (\d+))? \+ var\(--pm-space-8\)\)/,
    unit: 'space10',
    doc: "A small QRCode's side, with one `space.8` more.",
  },
  {
    name: 'qrSizeMd',
    recipes: ['structure/qr-code.module.css'],
    pattern: new RegExp(String.raw`\.symbol\[data-size='md'\] \{[^}]*?inline-size: ${spaceTen}`),
    unit: 'space10',
    doc: "A QRCode's side at its default size.",
  },
  {
    name: 'qrSizeLg',
    recipes: ['structure/qr-code.module.css'],
    pattern:
      /\.symbol\[data-size='lg'\] \{[^}]*?inline-size: calc\(var\(--pm-space-10\) \* (\d+) \+ var\(--pm-space-9\)\)/,
    unit: 'space10',
    doc: "A large QRCode's side, with one `space.9` more.",
  },
  {
    name: 'brandMarkDisabledOpacity',
    recipes: ['controls/provider-button.module.css'],
    pattern: /\.button\[data-disabled\] \.mark \{[^}]*?opacity: (\d*\.?\d+);/,
    unit: 'fraction',
    doc: "A disabled ProviderButton's brand mark's opacity, beside its grey label.",
  },
  {
    name: 'avatarButtonFaceDisabledOpacity',
    recipes: ['controls/avatar-button.module.css'],
    pattern: /\.button\[data-disabled\] \.face \{[^}]*?opacity: (\d*\.?\d+);/,
    unit: 'fraction',
    doc: "A disabled AvatarButton's face's opacity, inside its disabled cell.",
  },
  {
    name: 'buttonCountStart',
    recipes: ['controls/button.module.css'],
    pattern:
      /\.button\[data-icon-only\] > \.count \{[^}]*?inset-inline-start: calc\(100% \/ (\d+)\)/,
    unit: 'divisor',
    of: 'controlHeight',
    doc: "Where an icon-only Button's count starts, from the button's leading edge: its inline centre, a part of the square's side, which is the control height. The count grows toward the trailing edge.",
  },
  {
    name: 'buttonCountDisabledOpacity',
    recipes: ['controls/button.module.css'],
    pattern: /\.button\[data-disabled\] > \.count \{[^}]*?opacity: (\d*\.?\d+);/,
    unit: 'fraction',
    doc: "A disabled Button's count's opacity, beside its grey label.",
  },
  {
    name: 'conversationOneColumnBelow',
    ...conversationPage,
    pattern: /const ONE_COLUMN_BELOW_REM = (\d+)/,
    unit: 'rem',
    doc: "The page width below which ConversationPage is one column and its aside opens from the header, the web's `ONE_COLUMN_BELOW_REM`.",
  },
  {
    name: 'conversationThreadShare',
    ...conversationPage,
    pattern: /defaultRatio=\{(\d*\.\d+)\}/,
    unit: 'fraction',
    doc: "The thread's share of ConversationPage's split, its SplitPane's `defaultRatio`.",
  },
  {
    name: 'conversationThreadMin',
    ...conversationPage,
    pattern: /const THREAD_MIN_PX = (\d+)/,
    unit: 'px',
    doc: "The narrowest ConversationPage's thread pane is, the web's `THREAD_MIN_PX`.",
  },
  {
    name: 'conversationAsideMin',
    ...conversationPage,
    pattern: /const ASIDE_MIN_PX = (\d+)/,
    unit: 'px',
    doc: "The narrowest ConversationPage's aside pane is, the web's `ASIDE_MIN_PX`.",
  },
  {
    name: 'masterDetailPageMeasure',
    recipes: ['archetypes/master-detail-page.module.css'],
    pattern: new RegExp(String.raw`--pm-page-max-width: ${spaceTen}`),
    unit: 'space10',
    doc: "MasterDetailPage's measure, the web's `--pm-page-max-width`.",
  },
  {
    name: 'masterDetailOnePaneBelow',
    ...masterDetailPage,
    pattern: /const ONE_PANE_BELOW_REM = (\d+)/,
    unit: 'rem',
    doc: "The page width below which MasterDetailPage draws one pane, the web's `ONE_PANE_BELOW_REM`.",
  },
  {
    name: 'masterDetailListShare',
    ...masterDetailPage,
    pattern: /const LIST_RATIO = (\d*\.\d+)/,
    unit: 'fraction',
    doc: "The list's share of MasterDetailPage's split, its SplitPane's `defaultRatio`.",
  },
  {
    name: 'masterDetailListMin',
    ...masterDetailPage,
    pattern: /const LIST_MIN_PX = (\d+)/,
    unit: 'px',
    doc: "The narrowest MasterDetailPage's list pane is, the web's `LIST_MIN_PX`.",
  },
  {
    name: 'masterDetailDetailMin',
    ...masterDetailPage,
    pattern: /const DETAIL_MIN_PX = (\d+)/,
    unit: 'px',
    doc: "The narrowest MasterDetailPage's detail pane is, the web's `DETAIL_MIN_PX`.",
  },
  {
    name: 'chartHeightSm',
    recipes: ['charts/frame/chart-frame.module.css'],
    pattern:
      /--pm-chart-height-sm: calc\(var\(--pm-space-10\)(?: \* (\d+))? \+ var\(--pm-space-8\)\)/,
    unit: 'space10',
    doc: "A small chart's plot height, with one `space.8` more.",
  },
  {
    name: 'chartHeightMd',
    recipes: ['charts/frame/chart-frame.module.css'],
    pattern:
      /--pm-chart-height-md: calc\(var\(--pm-space-10\)(?: \* (\d+))? \+ var\(--pm-space-7\)\)/,
    unit: 'space10',
    doc: "A chart's plot height at its default size, with one `space.7` more.",
  },
  {
    name: 'chartHeightLg',
    recipes: ['charts/frame/chart-frame.module.css'],
    pattern:
      /--pm-chart-height-lg: calc\(var\(--pm-space-10\)(?: \* (\d+))? \+ var\(--pm-space-8\)\)/,
    unit: 'space10',
    doc: "A large chart's plot height, with one `space.8` more.",
  },
  {
    name: 'chartStroke',
    recipes: [
      'charts/line-chart.module.css',
      'charts/area-chart.module.css',
      'charts/radar-chart.module.css',
      'charts/sparkline.module.css',
    ],
    pattern: /\.(?:line|edge|stroke) \{[^}]*?stroke-width: (\d+);/,
    unit: 'px',
    doc: "A chart's line, a band's edge and a polygon's stroke.",
  },
  {
    name: 'chartHairline',
    recipes: [
      'charts/line-chart.module.css',
      'charts/area-chart.module.css',
      'charts/bar-chart.module.css',
      'charts/scatter-chart.module.css',
      'charts/radar-chart.module.css',
    ],
    pattern: /\.grid path \{[^}]*?stroke-width: (\d+);/,
    unit: 'px',
    doc: "A chart's hairline: a gridline, the zero rule, an annotation.",
  },
  {
    name: 'chartRing',
    recipes: [
      'charts/line-chart.module.css',
      'charts/radar-chart.module.css',
      'charts/scatter-chart.module.css',
    ],
    pattern: /\.(?:marker|vertex|dot) \{[^}]*?stroke-width: (\d+);/,
    unit: 'px',
    doc: 'The surface ring around a marker, a vertex and a dot.',
  },
  {
    name: 'chartRingActive',
    recipes: ['charts/line-chart.module.css', 'charts/radar-chart.module.css'],
    pattern: /\.(?:marker|vertex)\[data-active\] \{[^}]*?stroke-width: (\d+);/,
    unit: 'px',
    doc: 'The surface ring around the marker or vertex being read.',
  },
  {
    name: 'chartDash',
    recipes: ['charts/frame/chart-annotations.module.css'],
    pattern: /\.rule \{[^}]*?stroke-dasharray: (\d+) \1;/,
    unit: 'px',
    doc: "A reference line's dash, and the gap after it, which is as long.",
  },
  {
    name: 'chartWash',
    recipes: [
      'charts/line-chart.module.css',
      'charts/area-chart.module.css',
      'charts/radar-chart.module.css',
    ],
    pattern: /\.(?:wash|band) \{[^}]*?opacity: (\d*\.?\d+);/,
    unit: 'fraction',
    doc: "The opacity of a wash under a line, a band or a polygon, in the series' paint.",
  },
  {
    name: 'chartBandWash',
    recipes: ['charts/frame/chart-annotations.module.css'],
    pattern: /\.span \{[^}]*?opacity: (\d*\.?\d+);/,
    unit: 'fraction',
    doc: "The opacity of an annotation band's wash in `chart.other`, below the marks' wash.",
  },
  {
    name: 'chartLift',
    recipes: [
      'charts/bar-chart.module.css',
      'charts/histogram.module.css',
      'charts/scatter-chart.module.css',
      'charts/radar-chart.module.css',
      'charts/donut-chart.module.css',
    ],
    pattern: /\.marks\[data-reading\][^{]*\{[^}]*?opacity: (\d*\.?\d+);/,
    unit: 'fraction',
    doc: 'The opacity the other marks ease to while one is read.',
  },
  {
    name: 'chartRefetch',
    recipes: ['charts/frame/chart-frame.module.css'],
    pattern: /\.frame\[data-state='loading'\] \.region \{[^}]*?opacity: (\d*\.?\d+);/,
    unit: 'fraction',
    doc: "The opacity of a chart's previous frame while it refetches.",
  },
  {
    name: 'chartMarker',
    root: 'packages/engine/src',
    recipes: ['charts/cartesian.ts'],
    pattern: /export const MARKER_RADIUS = (\d+)/,
    unit: 'px',
    doc: "A marker's radius, the engine's `MARKER_RADIUS`.",
  },
  {
    name: 'chartEndDot',
    root: 'packages/engine/src',
    recipes: ['charts/sparkline.ts'],
    pattern: /const END_DOT_RADIUS = (\d+)/,
    unit: 'px',
    doc: "The radius of Sparkline's dot on the current value, the engine's `END_DOT_RADIUS`.",
  },
  {
    name: 'chartBarEnd',
    root: 'packages/engine/src',
    recipes: ['charts/geometry.ts'],
    pattern: /export const BAR_END_RADIUS = (\d+)/,
    unit: 'px',
    doc: "The rounding of a bar's data end, the engine's `BAR_END_RADIUS`.",
  },
  {
    name: 'chartHitMinimum',
    root: 'packages/engine/src',
    recipes: ['charts/geometry.ts'],
    pattern: /export const HIT_TARGET_MIN = (\d+)/,
    unit: 'px',
    doc: "The least hit area of a mark, the engine's `HIT_TARGET_MIN`.",
  },
  {
    name: 'chartGap',
    root: 'packages/engine/src',
    recipes: [
      'charts/bar-chart.ts',
      'charts/grid.ts',
      'charts/donut-chart.ts',
      'charts/treemap.ts',
    ],
    pattern: /const (?:MARK|CELL|RING)_GAP_PX = (\d+)/,
    unit: 'px',
    doc: "The surface gap between touching marks: bars, a heatmap's cells, a donut's segments and a treemap's tiles, the engine's `MARK_GAP_PX`, `CELL_GAP_PX` and `RING_GAP_PX`.",
  },
  {
    name: 'chartBandPadding',
    root: 'packages/engine/src',
    recipes: ['charts/scales.ts'],
    pattern: /const BAND_PADDING_INNER = (\d*\.?\d+)/,
    unit: 'fraction',
    doc: "The share of a band a bar group leaves empty, the engine's `BAND_PADDING_INNER`.",
  },
  {
    name: 'chartTextAdvance',
    root: 'packages/engine/src',
    recipes: ['charts/geometry.ts'],
    pattern: /return text\.length \* fontSizePx \* (\d*\.?\d+)/,
    unit: 'fraction',
    doc: "A character's estimated width, in ems of its type size, the engine's `estimateTextWidth`.",
  },
  {
    name: 'chartTextEstimate',
    root: 'packages/engine/src',
    recipes: ['charts/cartesian.ts'],
    pattern: /export const ESTIMATED_AXIS_TEXT_PX = (\d+)/,
    unit: 'px',
    doc: "The type size the engine estimates a chart's words at, `ESTIMATED_AXIS_TEXT_PX`.",
  },
  {
    name: 'chartLineEstimate',
    root: 'packages/engine/src',
    recipes: ['charts/funnel-chart.ts', 'charts/treemap.ts'],
    pattern: /const LINE_PX = ESTIMATED_AXIS_TEXT_PX \* (\d*\.?\d+)/,
    unit: 'fraction',
    doc: "The line the engine estimates a chart's words take, as a multiple of `chartTextEstimate`: FunnelChart's and Treemap's `LINE_PX`.",
  },
  {
    name: 'funnelMinBar',
    root: 'packages/engine/src',
    recipes: ['charts/funnel-chart.ts'],
    pattern: /const MIN_BAR_PX = (\d+)/,
    unit: 'px',
    doc: "The thinnest FunnelChart bar that still reads as a bar, the engine's `MIN_BAR_PX`.",
  },
  {
    name: 'funnelRowSpacing',
    root: 'packages/engine/src',
    recipes: ['charts/funnel-chart.ts'],
    pattern: /const ROW_SPACING = (\d*\.?\d+)/,
    unit: 'fraction',
    doc: "The share of a FunnelChart row its bar leaves empty when no step rate is drawn, the engine's `ROW_SPACING`.",
  },
  {
    name: 'funnelTextGap',
    root: 'packages/engine/src',
    recipes: ['charts/funnel-chart.ts'],
    pattern: /const TEXT_GAP_PX = (\d+)/,
    unit: 'px',
    doc: "The space between FunnelChart's label column and its bars, and between a bar's end and its value, the engine's `TEXT_GAP_PX`.",
  },
  {
    name: 'funnelLabelShare',
    root: 'packages/engine/src',
    recipes: ['charts/funnel-chart.ts'],
    pattern: /const LABEL_SHARE = (\d*\.?\d+)/,
    unit: 'fraction',
    doc: "The most of the plot's width FunnelChart's label column takes, the engine's `LABEL_SHARE`.",
  },
  {
    name: 'funnelMinRun',
    root: 'packages/engine/src',
    recipes: ['charts/funnel-chart.ts'],
    pattern: /const MIN_BAR_RUN_PX = (\d+)/,
    unit: 'px',
    doc: "The narrowest run FunnelChart's bars keep beside their values, the engine's `MIN_BAR_RUN_PX`.",
  },
  {
    name: 'treemapGroupGap',
    root: 'packages/engine/src',
    recipes: ['charts/treemap.ts'],
    pattern: /const GROUP_GAP_PX = (\d+)/,
    unit: 'px',
    doc: "The surface gap between two groups of a Treemap, the engine's `GROUP_GAP_PX`.",
  },
  {
    name: 'treemapMinPaint',
    root: 'packages/engine/src',
    recipes: ['charts/treemap.ts'],
    pattern: /const MIN_PAINT_PX = (\d+)/,
    unit: 'px',
    doc: "The least a Treemap tile is painted across, the engine's `MIN_PAINT_PX`.",
  },
  {
    name: 'treemapPlateInset',
    root: 'packages/engine/src',
    recipes: ['charts/treemap.ts'],
    pattern: /const PLATE_INSET_PX = (\d+)/,
    unit: 'px',
    doc: "A Treemap label plate's distance from its tile's top and inline-start edges, the engine's `PLATE_INSET_PX`.",
  },
  {
    name: 'treemapPlatePadding',
    recipes: ['charts/treemap.module.css'],
    pattern: /\.plate \{[^}]*?padding: (\d+)px var\(--pm-space-1\);/,
    unit: 'px',
    doc: "A Treemap label plate's padding above and below its two lines.",
  },
  {
    name: 'treemapReadoutMargin',
    root: 'packages/engine/src',
    recipes: ['charts/treemap.ts'],
    pattern: /const READOUT_MARGIN_PX = (\d+)/,
    unit: 'px',
    doc: "How close to the plot's top and bottom a Treemap's readout is centred, the engine's `READOUT_MARGIN_PX`.",
  },
  {
    name: 'authNarrowIllustrationWidth',
    recipes: ['archetypes/auth-page.module.css'],
    pattern: /\.illustration \{[^}]*?flex-basis: calc\(var\(--pm-space-6\) \* (\d+)\)/,
    unit: 'multiple',
    of: 'space.6',
    doc: "The width AuthPage's illustration takes beside the form in a narrower window.",
  },
  {
    name: 'authNarrowGap',
    recipes: ['archetypes/auth-page.module.css'],
    pattern:
      /\.illustrated \.column \{[^}]*?gap: calc\(var\(--pm-space-6\) \* (\d+) \+ var\(--pm-space-3\)\)/,
    unit: 'multiple',
    of: 'space.6',
    doc: "The gap between AuthPage's illustration and its form in a narrower window, one `space.3` more.",
  },
  {
    name: 'sliderGrabScale',
    recipes: ['controls/slider.module.css'],
    pattern: /\.thumb\[data-state='dragging'\] \{[^}]*?transform: scale\((\d*\.?\d+)\)/,
    unit: 'fraction',
    doc: "The scale a Slider's thumb grows to while it is dragged.",
  },
  {
    name: 'stepperPopFrom',
    recipes: ['structure/stepper.module.css'],
    pattern: /@keyframes pm-stepper-pop \{\s*from \{[^}]*?transform: scale\((\d*\.?\d+)\)/,
    unit: 'fraction',
    doc: "The scale a Stepper's check pops in from when its step is completed.",
  },
  {
    name: 'splitPaneStep',
    root: 'packages/react-ui/src',
    recipes: ['layout/SplitPane.tsx'],
    pattern: /const STEP = (\d*\.?\d+)/,
    unit: 'fraction',
    doc: "How far an arrow key moves a SplitPane's divider, as a share of the split, the web's `STEP`.",
  },
  {
    name: 'splitPanePageStep',
    root: 'packages/react-ui/src',
    recipes: ['layout/SplitPane.tsx'],
    pattern: /const PAGE_STEP = (\d*\.?\d+)/,
    unit: 'fraction',
    doc: "How far Page Up and Page Down move a SplitPane's divider, as a share of the split, the web's `PAGE_STEP`.",
  },
  {
    name: 'imageEditorZoomStep',
    root: 'packages/react-ui/src',
    recipes: ['controls/ImageEditor.tsx'],
    pattern: /const ZOOM_SLIDER_STEP = (\d+)/,
    unit: 'percent',
    doc: "The step of ImageEditor's zoom, as a fraction of the zoom that covers the frame, the web's `ZOOM_SLIDER_STEP`.",
  },
  {
    name: 'imageEditorPanStep',
    root: 'packages/react-ui/src',
    recipes: ['controls/ImageEditor.tsx'],
    pattern: /const PAN_STEP = (\d+)/,
    unit: 'px',
    doc: "How far an arrow key pans ImageEditor's picture, the web's `PAN_STEP`.",
  },
  {
    name: 'imageEditorPanStepLarge',
    root: 'packages/react-ui/src',
    recipes: ['controls/ImageEditor.tsx'],
    pattern: /const PAN_STEP_LARGE = (\d+)/,
    unit: 'px',
    doc: "How far an arrow key with Shift pans ImageEditor's picture, the web's `PAN_STEP_LARGE`.",
  },
  {
    name: 'imageEditorGridOpacity',
    recipes: ['controls/image-editor.module.css'],
    pattern: /\.grid \{[^}]*?opacity: (\d*\.?\d+);/,
    unit: 'fraction',
    doc: "The opacity of ImageEditor's rule-of-thirds lines, drawn while the picture is panned.",
  },
]

/**
 * Where a number is read from, for its doc comment: each recipe in backticks,
 * relative to the recipes, or from the repository's root when the number names
 * another `root`.
 */
export function recipeSources(number: RecipeNumber): string {
  return number.recipes
    .map((recipe) => `\`${number.root === undefined ? recipe : `${number.root}/${recipe}`}\``)
    .join(', ')
}

/** A recipe's text without its comments, so a pattern sees declarations only. */
const withoutComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')

/** Each number's value, read from `recipes` (a path under its number's `root` → the file's text). */
export function readRecipeNumbers(
  recipes: Readonly<Record<string, string>>,
  numbers: readonly RecipeNumber[] = RECIPE_NUMBERS,
): { number: RecipeNumber; value: number }[] {
  const twice = numbers.find(
    (number, index) => numbers.findIndex((other) => other.name === number.name) !== index,
  )
  if (twice !== undefined) {
    throw new Error(`native contracts: RECIPE_NUMBERS names ${twice.name} twice`)
  }
  return numbers.map((number) => {
    const found = number.recipes.flatMap((recipe) => {
      const css = recipes[recipe]
      const where = `${number.root ?? RECIPES}/${recipe}`
      if (css === undefined) {
        throw new Error(`native contracts: ${number.name} reads ${where}, which is not there`)
      }
      const global = new RegExp(number.pattern.source, `${number.pattern.flags.replace('g', '')}g`)
      const matches = [...withoutComments(css).matchAll(global)].map((match) =>
        match[1] === undefined ? 1 : Number(match[1]),
      )
      if (matches.length === 0) {
        throw new Error(
          `native contracts: ${number.name}: ${where} has nothing that matches ${number.pattern}`,
        )
      }
      return matches
    })
    const values = [...new Set(found)]
    if (values.length !== 1) {
      throw new Error(
        `native contracts: ${number.name} reads ${values.join(' and ')} from ${number.recipes.join(', ')}, ` +
          'which must agree',
      )
    }
    return { number, value: values[0] as number }
  })
}
