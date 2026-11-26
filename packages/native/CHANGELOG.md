# @polymorph/native

## 1.0.18

### Patch Changes

- b40ece2: **The SwiftUI and Compose focus ring follows the web's placements.** `pmFocusRing` draws the ring
  in `border.focusSolid`, which now meets 3:1 on every background and wash, at the new
  `focus.offset`, minus the width, so it covers the part's border instead of surrounding it. An
  invalid field and OTPInput's caret cell on a wrong code draw it inside the danger border. Compose
  also places it by the part's shape, as the web does: inside a solid fill with a gap, in the
  fill's label colour (the solid Button, a selected day, the current SectionNav and
  TableOfContents item); and around a part that cannot hold the line, `spacing.s1` out in the
  focus colour: a control too small for it (Checkbox, Radio, Switch, Slider's thumb, Carousel's
  dots) and a part whose box is its text (a link, a tab, a disclosure's trigger, a step, a sort
  header). A system whose
  `overrides.focus.offset` is 0 or more draws every ring outside, in the focus colour. Compose's
  date field takes `border.focusSolid` on its focused border.
- 41606c8: **A system file chooses which side of its column a numeric column's figures sit on.**
  `overrides.numeric.align` takes `end`, the default, or `start`:

  ```json
  { "overrides": { "numeric": { "align": "start" } } }
  ```

  It applies to every `numeric` header, body cell and total in Table, and to DataTable's `numeric`
  columns, in every web framework and the elements, and in the SwiftUI and Compose Table and
  DataTable. A Markdown table's column whose delimiter ends in `:` is drawn as a `numeric` column,
  so it follows the choice too. Tabular figures stay in both. A system that does not set it renders
  as before.

  A new token carries it in every pairing: `--pm-numeric-align` (`end` or `start`), which
  `table.module.css` sets as a numeric cell's `text-align`, and `numeric.align` in the token
  document's `invariant` section (`NUMERIC_ALIGNS`, `NumericAlign`). The recipe reads the token,
  so a stylesheet emitted by an older engine draws numeric cells at the start: install the engine
  and the recipes at the same version, as every release asks. On native platforms SwiftUI reads
  `theme.numeric.align` (`PMNumericAlign`, `.end` or `.start`; `PMNumeric`'s initialiser defaults it
  to `.end`), and the Kotlin and Dart token packages add `numericAlign` (`"end"` or `"start"`) to
  `PMTheme`, beside `numeric`.

- 1308b1b: An iOS app can add the Swift package by the repository's URL, at a release tag, instead of
  through a checkout or a git submodule:
  `.package(url: "https://github.com/metamorph-labs/polymorph", from: "1.0.18")`, with the products
  `PolymorphTokens` and `PolymorphUI` from the package `polymorph`. A dependency by path on
  `platforms/ios` still works and offers the same libraries.

  The Android builds (`dev.polymorph:tokens`, `dev.polymorph:ui`) and the Dart package
  (`polymorph_tokens`) now declare the release's version instead of `1.0.0`.

- Updated dependencies [b40ece2]
- Updated dependencies [786c025]
- Updated dependencies [5b73195]
- Updated dependencies [41606c8]
- Updated dependencies [2186c5c]
- Updated dependencies [49eed56]
- Updated dependencies [ddbd1d4]
  - @polymorph/theme@1.0.18
  - @polymorph/registry@1.0.18

## 1.0.17

### Patch Changes

- 740bebf: Accordion and Collapsible take `keepMounted`, an optional prop with the name Tabs uses. In React a
  closed region's content then stays in the document, `hidden`, so a page's server markup carries it
  and state inside the region survives a close: an FAQ's answers are in the HTML a crawler reads
  without running a script. The region is hidden once its close animation ends. Without the prop
  React leaves closed content out, as before. The Vue, Svelte, Solid, Angular and elements members
  already keep a closed region's content in the document, `hidden`, so they accept the prop and it
  changes nothing there. The SwiftUI and Compose contracts gain the field, and neither rendering
  draws it: SwiftUI lays a closed region's content out at no height in every case, and Compose
  leaves it out.
- e761a13: Image takes two optional props that steer the browser's fetch, for a public page whose first
  picture decides how fast it loads:

  ```tsx
  <Image
    src="/harbour-800.jpg"
    srcSet="/harbour-400.jpg 400w, /harbour-800.jpg 800w, /harbour-1600.jpg 1600w"
    alt="A harbour at dusk"
    width={800}
    height={500}
    loading="eager"
    fetchPriority="high"
  />
  ```

  - `srcSet` is the element's `srcset`, passed unchanged. The browser requests the file that suits
    the screen, so a phone does not download a desktop's file. `src` stays required.
  - The element's `sizes` is not a prop, because the red rules refuse a length in application
    code. The member writes it for a set that gives widths, from the frame's box: `width` pixels
    and never more than the viewport's width for a frame with `width` and `height`, wider by the
    crop for a picture that covers a frame of a narrower ratio, and the element's own laid-out
    width first (`auto`) for a lazy picture drawn as wide as its frame. A set that gives widths
    needs a box, from `width` and `height` or from `aspectRatio`: without one the set is ignored,
    with a development warning, because it would stretch the frame to its container.
  - `fetchPriority` is the element's `fetchpriority`: `high` for the one picture that is the largest
    content of the first view, with `loading="eager"`.
  - A change of `srcSet` is a new request, as a change of `src` is: the frame returns to loading,
    and a failure is forgotten.

  An element takes them as `src-set` and `fetch-priority`. Without the props the markup is what it
  was. On iOS and Android neither is honoured: the view requests the `src`.

- 529dfa9: The SwiftUI and Compose contracts of Pagination and CursorPagination carry the web's new optional
  addresses, `getPageHref`, `previousHref` and `nextHref`, each defaulting to `nil` or `null`, so a
  screen that builds the props as before still compiles. No native rendering draws them: a native
  pager's controls are the platform's buttons, and each calls its handler.
- Updated dependencies [a749193]
  - @polymorph/registry@1.0.17
  - @polymorph/theme@1.0.17

## 1.0.16

### Patch Changes

- e2a6f57: **AppShell's menu button on iOS takes a touch anywhere on its platter.** On a compact width class
  the SwiftUI AppShell drew the button that opens the rail as a view of its own in the navigation
  bar. The bar hosts such a view 36 points high, and a touch on the bar's 44-point platter above or
  below it reached nothing. The button is now the bar's own: its label is a title and the `menu`
  icon, so the bar draws the icon at its own size, names the button "Open navigation" and takes a
  touch over the whole platter, as it does for a bar button in any SwiftUI app. On iOS 26 the
  platter is 44 points wide, where it was 56. Nothing changes in an app's code.
- 2c97c3b: **On iOS, the box that takes a text field's tap is at least 44 points on each axis.** Three
  SwiftUI members drew a text field in a box shorter than the hit target, and now lay the box out at
  the hit target:

  - OTPInput's cells sit centred in a box 44 points tall, 4 points taller than the large control
    height the cells keep. Its hidden field keeps the default text size, so at an accessibility text
    size it no longer reaches past the cells and takes the taps of what lies above and below them.
  - PromptInput's field is at least 44 points tall, its first line at the top, as on Android. An
    empty composer is taller than one line and its padding, and a field of two lines or more keeps
    its height.
  - A Textarea of one row is 44 points tall. A Textarea of two rows or more keeps its height.

  Every text-entry member takes the tap in its box through one foundation modifier, which publishes
  the box for the simulator audit, so the audit holds a text field to the box a person taps rather
  than to the editable line UIKit publishes. Nothing changes in an app's code.

- Updated dependencies [2f0ddd2]
- Updated dependencies [eadf74f]
- Updated dependencies [860e60b]
  - @polymorph/theme@1.0.16
  - @polymorph/registry@1.0.16

## 1.0.15

### Patch Changes

- 57db696: **An `Alert` with nothing to say draws nothing.** An Alert given no title and no content drew an
  empty tinted panel with its tone's glyph. It now renders nothing: no root, no panel and no glyph,
  in every web framework, as an element, in SwiftUI and in Compose. A screen can therefore draw an
  Alert always and bind its `title` to a message that is empty while there is none, as an
  `ErrorSummary` with no errors already renders nothing.

  - A title counts when it is not absent and not empty. An empty title with content draws the
    content alone, where before it drew an empty title line above it.
  - Content counts in React when `children` is a value React draws: not `undefined`, `null`, a
    boolean or `''`. In Vue, Svelte, Solid, Angular and the elements it counts when the default
    slot has content. In SwiftUI and Compose it counts when `children` is not `nil` or `null`.
  - `action`, `secondaryAction` and `onDismiss` are not content: an Alert with only those renders
    nothing too.
  - `children` is optional: `AlertProps.children` in every web framework, and `PMAlertProps.children`
    in the Swift and Kotlin contracts, which now default to `nil` and `null`. A title with no
    content draws the title alone, with no gap under it.
  - An Alert that draws nothing is not listed for an agent. Once its title or content arrives it is
    drawn with its role on its root from that first render, so it is announced as an Alert mounted
    in response to an event is, and it is listed.

  An Alert with content, and a title that is absent or not empty, draws as before.
  - @polymorph/registry@1.0.15
  - @polymorph/theme@1.0.15

## 1.0.14

### Patch Changes

- Updated dependencies [9b60a94]
  - @polymorph/registry@1.0.14
  - @polymorph/theme@1.0.14

## 1.0.13

### Patch Changes

- 73837b5: `MasterDetailPage` is a new page archetype: a list of items of one kind beside the detail of the
  selected one, for an inbox, a notifications page, an audit log or a file browser. It takes
  `title`, `description` and `actions` as PageHeader does, the `list` (a List, Table or Tree with its
  FilterBar and pagination, the selected item marked `current`) named by `listLabel`, the selected
  item's `detail`, an `emptyState` for the detail pane while nothing is selected, and `backLabel`
  and `onBack` for the way back on a phone. It fills AppShell's content region, as ConversationPage
  does, and the list and the detail scroll on their own. At or above a 48rem page the two sit side
  by side in a SplitPane; below it the page draws the list, or the detail under the way back, and
  `onBack` is where the application clears its selection. Focus moves only when the element that
  held it is no longer drawn. A page that draws the selected item under a table can move to it.

  The engine and every foundation export `masterDetailFocus`, `masterDetailHolds` and
  `MASTER_DETAIL_PART`, the focus rule every renderer's MasterDetailPage shares. The SwiftUI and
  Compose contracts gain `PMMasterDetailPageProps` and its rendering protocol, and both platforms
  draw the page: two panes from a 48rem page, and below it the list, or the detail under the way
  back. On iOS the way back is the page's own button and no system gesture. The elements vocabulary
  has it as `<poly-master-detail-page>`.

- 30617d7: Every member a phone platform map marks native or adapted is now drawn there, so both pending
  lists (`packages/native/src/pending.ts`, `kotlin-pending.ts`) are empty. New in SwiftUI and in
  Compose: `Banner`, `List`, `SectionNav`, `Tree`, `TreeSelect`, `Highlight`, `Diff`, `LogView`,
  `MonthInput`, `DurationInput`, `PhoneInput`, `Meter`, `Rating`, `Countdown`, `InlineEdit`, `Plan`,
  `TableOfContents`, `CommentThread`, `Tour`, `Lightbox`, `AudioPlayer`, `RecordButton`,
  `SearchPage` and `MasterDetailPage`. New in SwiftUI only: `FunnelChart` and `Treemap`. New in
  Compose only: `ImageEditor` and `ModeSwitch`. Each member's spec says where its native rendering
  differs from the web's.

  What an app provides on Android, as it provides the image loader:

  - `LocalPMAudioEngine` is the player `AudioPlayer` plays through. Without one the player draws its
    failed state.
  - `LocalPMImageEncoder` encodes what `ImageEditor` saves. Without one, Save hands nothing over.
  - `LocalPMDurationWords` are the unit words `DurationInput` and `AudioPlayer` write a length with.
    Without them the words are the English defaults `duration-input.md` names.

  `Tour` is adapted on both platforms: each step is a sheet that points at no part of the screen,
  because a native view carries no target's name. `Lightbox` swipes between its pictures and zooms
  with a pinch, as each platform's viewer does. `MasterDetailPage` on iOS returns to its list through
  the page's own back button. A `List` row's press covers its trailing mark, as each platform's rows
  do.

  The Compose module declares `org.jetbrains.compose.ui:ui-backhandler`, which `MasterDetailPage`
  reads the system Back through. The rating role's Android glyph in `design/icons.json` is
  `star_border`, and `PMIconView` draws a role's filled glyph when a member asks for it.

- bcbaa92: Progress's ring draws its groove in `border.default` instead of `bg.subtle`, on the web, in
  SwiftUI and in Compose. The contrast law holds `border.default` at least a hairline's lightness
  from every surface in every pairing, so the groove shows where the whole is on a page, a card or
  an overlay in both modes. In a dark mode the old groove was within ΔL 0.03 of the page and all
  but disappeared. The bar's track is unchanged: a 4px band as wide as its container still shows
  on `bg.subtle`, as Meter's track and Slider's rail do. No prop changes.
- 2da1598: `SearchPage` is a new page archetype in every web vocabulary: the page whose subject is a query,
  with the field, the filters under it, and what the query found. It takes `title`,
  `description` and `actions` as PageHeader does, the `search` slot for the field, `searchLabel`
  to name its search landmark, `filters`, `empty` with the required `emptyState`, `pending`, and
  the results as `children`. A page that searches as the reader types passes no `onSubmit`. A page
  that submits passes `onSubmit`, and the landmark is then a real form: Enter in the field calls
  it once and the browser does not navigate.

  The results flow down the page with no panel, one group under each Heading. While `pending` the
  results region is `aria-busy` and keeps the last results; while `empty` it holds the EmptyState
  drawn from `emptyState`. The swap moves no focus and plays no motion. The page's measure is nine
  of `--pm-space-10`, between FormPage's and ListPage's.

  `one-opener` knows SearchPage, so a module that renders one and also composes a PageHeader and a
  Hero is told to keep the archetype's title.

  The elements vocabulary has it as `<poly-search-page>`.

  On iOS and Android `SearchPage` is native, drawn in SwiftUI and Compose: the header, the field
  with its filters under it, and the results, with `loadStatus` and `onRetry` as every native page
  takes them.

- Updated dependencies [d84171d]
- Updated dependencies [56e7665]
  - @polymorph/registry@1.0.13
  - @polymorph/theme@1.0.13

## 1.0.12

### Patch Changes

- 766b5fd: `FunnelChart` is a new chart member in every web vocabulary: the count that survives each stage
  of an ordered process, such as a signup, a checkout or a ticket from opened to resolved. It
  takes `label` and `stages`, where a `FunnelStage` is `{ key, label, value }`, and the tier's
  `format`, `size`, `locale`, `tooltip`, `onSelect`, `loading` and `messages`.

  Each stage is one horizontal bar from the inline start, its length its value against the
  largest stage, with its label in a column before it and its value and share of the first stage
  after it. Between two bars it writes the share of the stage above that reached the stage below:
  "62% continued". Stages are drawn as given. A stage larger than the one before it dev-warns and
  is not clamped or reordered. A first stage of zero has no shares, and a stage of zero has no
  step after it. The tooltip, the live region and the table twin (stage, value, share,
  continued) state every number the plot has no room for. It is one series, so it has one colour
  and no legend.

  `funnelChartModel`, `funnelChartReadout` and `funnelChartSelection` are new exports of
  `@polymorph/engine/charts`, and of every foundation, which re-exports it, with the types
  `FunnelStage`, `FunnelChartInput`, `FunnelChartModel`, `FunnelPlot`, `FunnelBar` and
  `FunnelText`.

  `ChartMessages` has four new keys, with English defaults in `DEFAULT_CHART_MESSAGES`:
  `funnelSummary`, `stageColumn`, `continuedColumn` and `continued`. A host that spreads the
  defaults is unaffected. A host that writes its own whole catalog adds the four keys, because the
  catalog takes all keys or none.

  On iOS, `PMChartMessages` takes the same four, and `PMSpecDefault.chartMessages` gives their
  English. `FunnelChart` is native on iOS and its SwiftUI rendering is not written yet: it is in
  the pending list, and its contract is generated. Android marks it absent, with `Table`, as it
  does every chart member.

- 59658db: `Treemap` is a new chart member in every web vocabulary: parts of a whole as rectangles that
  tile the plot, each with an area proportional to its value, such as storage by kind or tickets
  by team and channel. It takes `label` and `items`, where a `TreemapItem` is
  `{ key, label, value, children? }`, and the tier's `format`, `size`, `locale`, `tooltip`,
  `onSelect`, `loading` and `messages`.

  The layout is squarified, largest first from the inline start, and the same items and size
  always give the same tiles. An item with `children` is a group, drawn as the sum of its
  children; two levels are drawn, and deeper items are summed into the second with a dev
  warning. With groups, each group takes a chart slot and its items its colour, with a legend of
  the groups and a wider gap between them; with one level every tile is one colour. An item with
  no positive value takes no area: the twin lists it and the summary counts it. A tile shows its
  label and value on a plate of the surface colour, and only where both fit; the tooltip, the
  live region and the twin name every item.

  `squarify`, `treemapModel`, `treemapReadout` and `treemapSelection` are new exports of
  `@polymorph/engine/charts`, and of every foundation, which re-exports it, with the types
  `TreemapItem`, `TreemapInput`, `TreemapModel`, `TreemapPlot`, `TreemapTile`, `TreemapPlate`,
  `TreemapLeaf` and `TreemapRect`.

  `ChartMessages` has three new keys, with English defaults in `DEFAULT_CHART_MESSAGES`:
  `treemapSummary`, `groupColumn` and `itemColumn`. A host that spreads the defaults is
  unaffected. A host that writes its own whole catalog adds the three keys.

  On iOS, `PMChartMessages` takes the same three, and `PMSpecDefault.chartMessages` gives their
  English. `Treemap` is adapted on iOS, drawn with SwiftUI shapes because Swift Charts has no mark
  that tiles a box by area; its rendering is not written yet, so it is in the pending list, and
  its contract is generated. Android marks it absent, with `Table`, as it does every chart member.
  - @polymorph/registry@1.0.12
  - @polymorph/theme@1.0.12

## 1.0.10

### Patch Changes

- @polymorph/registry@1.0.10
- @polymorph/theme@1.0.10

## 1.0.9

### Patch Changes

- 8a68a0d: **On iOS**, a horizontal `PMTabs` row wider than the width it is given now scrolls sideways inside the strip instead of running past it. The scroll view brings the active tab into view when the strip appears and when the value changes, at once the first time and over the surface duration after that, unless the motion temperament is `none` or Reduce Motion is on. The baseline rule still spans the container and the indicator moves with its tab. A row that fits draws no scroll view, and a vertical strip is unchanged. There is no new prop.
  - @polymorph/registry@1.0.9
  - @polymorph/theme@1.0.9

## 1.0.8

### Patch Changes

- 2bccb19: `AvatarButton` is a new member: a Button preset whose face is an Avatar. Use it wherever a
  person's or a workspace's mark is pressed to do something, most often as the `trigger` of an
  account `Menu` or `Popover`. It takes Avatar's `name` and `src`, a required `label` that names
  the action ("Account menu", not the person's name), and Button's `size`, `disabled`, `loading`,
  `pressed`, `current` and `onClick`. It keeps Button's ghost/neutral states, focus ring and
  minimum target, with a round box around the face, and an overlay's `aria-haspopup` and
  `aria-expanded` land on it as they do on a Button.

  It replaces the workaround of stacking an invisible `Button` over an `Avatar` inside a `Bespoke`
  zone. Replace that zone with `<AvatarButton name={…} src={…} label="Account menu" />` and delete
  the zone's declared exception. `Button` still takes no children, and `Avatar` is still not
  interactive.

  It ships in every renderer: the React, Vue, Svelte, Solid and Angular vocabularies from this
  release of each package and of `@polymorph/recipes`, and SwiftUI (`PMAvatarButton`) and Compose
  (`PMAvatarButton`) at this release's tag.

- 2bccb19: `Image` is a new member: a read-only picture, such as a photograph, a brand mark, artwork or a
  preview of a file. It replaces a bare `<img>` in application code, and the application CSS that
  sized it.

  ```tsx
  <Image src={logo} alt="Relay" width={90} height={32} loading="eager" />
  <Image src={artwork} alt="" crossOrigin="anonymous" referrerPolicy="no-referrer" />
  <Image src={preview} alt={description} width={widthPx} height={heightPx} />
  ```

  - `alt` is required. A non-empty `alt` names the picture, and an empty one declares it decorative
    and hides it from assistive technology.
  - `width` and `height` are the picture's size in pixels, as numbers. They hold its box before it
    loads, and the picture is never wider than its container, so `max-width: 100%` and
    `height: auto` go. `aspectRatio` holds a frame of a ratio instead, for a source whose size is
    unknown, and `fit` (`contain`, the default, or `cover`) says how the picture sits in a frame of
    another ratio. No prop takes a CSS length.
  - While the picture loads, the box shows the placeholder Skeleton draws. When it cannot load, the
    box shows a fallback of the member's own in place of the browser's broken-image glyph, and a
    meaningful picture keeps its `alt` as the fallback's name.
  - `loading` is `lazy` by default; pass `eager` for a picture in the first view. `crossOrigin` and
    `referrerPolicy` reach the element unchanged.

  It is not `Avatar`, which is a round identity mark with initials, not `ImageEditor`, which crops,
  and not `Icon`, which draws an icon role. It has no caption, zoom or gallery.

  In a module that imports the member, `Image` is the member, and the DOM's constructor of the same
  name is `window.Image`.

  Every web framework's vocabulary ships it, drawn by the new recipe
  `@polymorph/recipes/structure/image.module.css`. The SwiftUI member (`PMImage`) loads through
  `AsyncImage`, and the Compose member through the app's `LocalPMImageLoader`, as Avatar does; both
  ship at the release tag. On both, `loading`, `crossOrigin` and `referrerPolicy` are not honoured,
  and the placeholder is still. On Android a URL that fails stays in the loading state, because a
  Compose painter reports no failure.

- 820c836: Every package now carries the release's version, and the release tag is `v` and that version.
  Until this release each package kept its own number, so one release installed the engine at one
  version, the foundations at another and the tag named a third. From this release on, pin every
  `@polymorph/*` package you install at the same version, and check the native packages out at the
  tag of that version.

  This package's version jumps to the release's number. The jump carries no change of its own: the
  versions it skips were never published.

- Updated dependencies [820c836]
  - @polymorph/theme@1.0.8
  - @polymorph/registry@1.0.8

## 1.0.4

### Patch Changes

- Updated dependencies [22f607b]
  - @polymorph/theme@1.0.1
  - @polymorph/registry@1.0.4

## 1.0.3

### Patch Changes

- 1b900d8: Alert takes a second action, Card takes a title, and ConfirmDialog takes a typed confirmation. Every new prop is optional, so existing screens render as before.

  **Alert's `secondaryAction`** is a second `ghost` `sm` Button after `action`, for a review the reader answers in place: `action={<Button variant="soft" tone="accent" size="sm" label="Apply" />}` with `secondaryAction={<Button variant="ghost" tone="neutral" size="sm" label="Discard" />}`. The two sit in one row that wraps, and Tab reaches both before the dismiss button. Replace a hand-built "apply or discard" block beside an Alert with the two props. Two actions are the most an Alert takes; content that needs more is a Card.

  **Card's `title` and `headingLevel`** draw the card's heading before its content, in the section-heading recipe Dashboard.Panel uses, as an `<h2>` by default or an `<h3>` or `<h4>`. A titled Card with `as="section"` or `as="article"` is named by its title. Replace a `Dashboard.Panel` used outside a Dashboard with `<Card title="…">`, and remove any heading you put inside the card to name it.

  **ConfirmDialog's `confirmWith`** is the phrase a person types before the confirm enables, such as the name of the project being deleted. The dialog draws the field with its label (`confirmWithLabel`, default `Type {phrase} to confirm`) and its error (`confirmWithError`, default `The text does not match`). It compares the text with the spaces around it removed and letter case ignored, starts focus in the field, and empties the field each time it opens. Localized apps pass both strings. Replace a typed-phrase confirmation built inline with `confirmWith`. ConfirmDialog still has no body slot: content beyond the phrase belongs in a Dialog.

  **`@polymorph/recipes`**: Alert's `action` class is a wrapping row with a gap, which holds one action or two, and Card's recipe has a `title` class. `Dashboard.Panel` draws its title as Card's `title`, so `archetypes/dashboard.module.css` no longer has a `panelTitle` class; a vendored Dashboard takes the new `Dashboard.tsx` with the recipe.

  **In Vue, Svelte, Solid and Angular**, `secondaryAction` takes content as `action` does, and the other props are the same props.

  **On iOS and Android**, `PMAlertProps.secondaryAction`, `PMCardProps.title` and `headingLevel` (`PMCardHeadingLevel`), and `PMConfirmDialogProps.confirmWith`, `confirmWithLabel` and `confirmWithError` are new, with their defaults in `PMStrings` (`confirmWithLabel(phrase:)` and `confirmWithError`). On iOS a ConfirmDialog with `confirmWith` is a content-high sheet that holds the field, because the confirmation action sheet holds none. On iOS a text field inside a FormField keeps focus when its error appears or goes while the person types.

- 1b900d8: Input takes `exact`, for text that must be typed letter for letter, and ConfirmDialog's phrase field sets it.

  **`exact` on Input** means the text is typed exactly: nothing corrects it, capitalises it or checks its spelling. The inner `<input>` takes `autocorrect="off"`, `autocapitalize="off"` and `spellcheck="false"`, so a phone browser's keyboard leaves a phrase such as `acme-billing` as the person types it. Set it on a field whose text must match what the person meant to type, such as a slug or a name they repeat back; a field without it behaves as before. Vue, Svelte, Solid and Angular take the same prop.

  **ConfirmDialog's typed confirmation** sets `exact` on its phrase field in every web framework. A phone browser no longer corrects the phrase while the person types it, which left the confirm disabled with "The text does not match" under a phrase they typed correctly.

  **On iOS and Android**, `PMInputProps` gains `exact`. A SwiftUI Input with it is neither capitalised nor corrected, and a Compose Input asks the keyboard for no correction, as each platform already treats an email or URL field. ConfirmDialog's phrase field sets it.

- 1b900d8: CursorPagination has a "Load more" form, and RelativeTime writes the moment itself as well as the distance from now.

  **`CursorPagination mode="append"` is "Load more".** It draws one `outline` Button, "Load more", that calls `onNext`; the app adds the window it fetches below the ones on screen. While `pending` the Button is busy and ignores presses. When `hasNext` turns false after a press, the list has run out: the Button leaves and an end line says "No more to load" through a status region, so a screen reader hears it. The form remembers that it asked for a window and does not read `hasPrevious`, so pass your query library's flags as they are. A list with no next window that the reader has not paged renders nothing, as one window does in the default form. `position` is what is on screen in your words ("50 shown"). In a DataTable, set the pager's `pending` while the next rows load, not the table's `loading`, which replaces the rows with skeletons. A hand-built "Load more" can be replaced with `<CursorPagination mode="append" hasPrevious={false} hasNext={hasNextPage} pending={isFetchingNextPage} onNext={fetchNextPage} />`; a list started again under a new query takes a new pager (`key={query}`).

  In React the props are a union on `mode`: the default form still requires `onPrevious`, so every pager written before stays valid, and the append form takes none, because it has no previous direction. In Vue, Svelte, Solid and Angular `onPrevious` is an optional event, and the default form warns in development when `hasPrevious` has no `onPrevious`.

  `CursorPaginationMessages` takes two optional words, `more` and `end`; an app that localizes the pager passes them, and the append form warns in development when `messages` leaves them out. Every web framework's CursorPagination takes `mode`, and so do `PMCursorPagination` on iOS and Android.

  The Svelte foundation's `Held` takes `presses`, and the Angular foundation exports `pressOnce`: a states fixture entry presses a control once it is in the document, as the append form's "the list ran out" entry presses "Load more". An app has no use for either.

  `@polymorph/recipes`' `structure/cursor-pagination.module.css` lays `.pagination` out as a column (`display: inline-flex; flex-direction: column`), so the append form's end line takes a line of its own under the row; the default form's one row looks as it did. It adds `.end`, the end line, in the position's type and colour. A vendored CursorPagination takes both with the recipe.

  **`RelativeTime mode="absolute"` and `mode="both"`.** `absolute` writes the moment with `Intl.DateTimeFormat` in the member's `locale`: the medium date and the short time ("Aug 4, 2026, 2:05 PM"), or with `format="long"` the long date. An instant is written in the time zone of whatever renders the member: the reader's in a browser, the server's under server rendering or in a React server component. An app that renders on a server and must show the reader's zone renders the absolute forms in the browser, from a client component once it has mounted. A calendar date (`2026-08-04`) is the date alone, the same day everywhere. `both` writes the moment and the distance joined by `messages.both`, by default the moment, then the distance in parentheses ("Aug 4, 2026, 2:05 PM (2h ago)"); a localized app passes `messages={{ both: (moment, distance) => … }}` from its catalog, so its locale orders and punctuates the two. The default stays `relative`. Replace a hand-formatted timestamp in JSX with the member, which also writes the moment in `dateTime`.

  **`relativeTimePhrase` takes `mode` and `messages`.** `relativeTimePhrase(value, { locale, numeric, format, mode, messages })` from `@polymorph/engine`, which every foundation re-exports, returns the text RelativeTime renders for those props, or `null` for a value that is not a moment. Use it where a member takes app-formatted text, such as Timeline's `time`, so the words match RelativeTime's ([design/components/relative-time.md](../design/components/relative-time.md)).

  **On iOS and Android**, `PMRelativeTimeProps` gains `messages`, the same `both`. **On Android**, `PMRelativeTimeWords` gains `absolute(moment, long, locale)`, which an app implements to write the moment with the platform's formatter in the reader's zone. Without it the member writes Material 3's medium date and an instant's 24-hour time in UTC, said as UTC, because the member module reaches no time zone. The words are `PMStrings.relativeUtc`, a default only Android's `PMStrings` declares, so iOS's string catalog does not carry it; an app translates it through `LocalPMStrings`.

- 1b900d8: Link, `AppShell.NavItem`, Breadcrumbs and a linked Card take an optional `onNavigate(href)`, the seam for an app's own router (`design/components/link.md` §Routing).

  **To route without reloading the page**, pass your router's navigate function as `onNavigate` to every Link, NavItem, Breadcrumbs and Card with an `href`. A click that would navigate the current tab calls `onNavigate(href)` with the `href` you wrote. The member has already stopped the browser's navigation, so the handler only routes: `(href) => void navigate({ href })` with TanStack Router, `(href) => void navigate(href)` with React Router. A click with Meta, Control, Shift or Alt held, a click with another button, and a click on an `external` Link stay the browser's, so a reader can still open a link in a new tab. Breadcrumbs also routes a crumb chosen from its overflow menu, and a Card routes the click on its stretched link. Without `onNavigate`, every link behaves as before. `docs/consuming.md` has the TanStack Router and React Router forms, and `design/archetypes/app-shell.md` has the root route that renders AppShell once, with a page archetype for each route.

  **Link is now a client module.** Link and the routing helper it shares with NavItem, Breadcrumbs and Card are marked `'use client'`, because the seam is a click handler. Under React Server Components, a server component that renders a Link ships Link's code to the browser, where it shipped none before.

  **NavItem's `onSelect` is unchanged.** It still fires on every click of a row, including a click that opens a new tab. An app that routes through `onSelect` on rows with an `href` moves that call to `onNavigate`, which leaves those clicks to the browser.

  **AppShell closes its small-viewport drawer when `transitionKey` changes**, as the iOS and Android shells already do. Under a client-side router the shell stays mounted, so the drawer stayed open over the page the reader had chosen from it.

  **In Vue, Svelte, Solid and Angular** the prop is the framework's event, each with the `href`: `@navigate` in Vue, `onNavigate` in Svelte and Solid, and `(navigate)` in Angular.

  **On iOS and Android**, `PMLinkProps` and `PMBreadcrumbsProps` gain `onNavigate`. When it is set, a press on a Link that is not `external`, or on a crumb with an `href`, calls it in place of the environment's `openURL` or `LocalUriHandler`. `PMCardProps` gains `onNavigate` too, and a press on a linked native Card calls it in the same place.

- 1b900d8: A toast tells its owner when it leaves, its tone sets how long it stays, a success notice leaves on its own, and the registry publishes Toast as each framework ships it.

  **`onDismiss` on a toast.** `toast()` takes `onDismiss`, called once when the toast leaves for a reason other than its owner's: the reader dismissed it, its time ran out, `toast.dismiss` closed it, or newer toasts evicted it. Removing a toast and updating it in place do not call it. Every framework's `toast()` takes it, because every foundation's store is the engine's. A declared Toast in Vue, Svelte, Solid and Angular emits `dismiss` (`@dismiss`, `onDismiss`, `(dismiss)`), and `PMToast` on iOS and Android calls `onDismiss` when its card leaves by its close button, a swipe, the escape gesture or its time.

  **A toast takes its lifetime from its tone.** The store every web framework shares gives a toast whose call sets neither `retained` nor `durationMs` its tone's lifetime. A `danger` or `warning` toast is retained and pinned: it stays until it is dismissed or removed, and newer toasts do not evict it. A `success`, `info` or `neutral` toast leaves after `TOAST_DEFAULT_DURATION_MS` and may be evicted, as every toast did before. So `toast.danger(…)`, `toast.warning(…)` and `toast.promise`'s error face now stay until the reader dismisses them; a call that wants the old five seconds passes `durationMs: TOAST_DEFAULT_DURATION_MS`. A call that sets either option keeps what it sets. `ToastNotice` and a declared `Toast` in Vue, Svelte, Solid and Angular follow the same rule, so a `danger` or `warning` notice stays until it is resolved or dismissed, as every notice did before, and a `success`, `info` or `neutral` notice now leaves on its own. A screen that kept a success notice on screen with a button whose only job was to dismiss it can delete the button. `ToastNotice` also takes `onDismiss`, so a screen can clear the state that renders a notice once the notice has left; unmounting a notice does not call it. A notice that must stay whatever its tone takes `dismissible={false}`. `PMToast` on iOS and Android takes the same lifetime from its tone when its props set neither `retained` nor `durationMs`: a native danger or warning toast now stays until it is dismissed, and one that should leave passes `durationMs: 5000`.

  **A notice with nowhere to show warns in development.** A `ToastNotice` rendered while no `ToastHost` or `Toaster` is mounted logs a warning naming it, because nothing draws its toast. A declared `Toast` in Vue, Svelte, Solid and Angular logs the same warning when no `Toast.Viewport` is in the document once it has mounted. The usual cause is an error boundary whose fallback renders outside the viewport: mount `ToastHost`, or `Toast.Viewport`, outside the boundary.

  **The registry and the system card publish Toast's real API and every compound part.** Each component carries `parts`, every compound part its export carries with the part's props (`AppShell.NavItem`, `AppShell.NavGroup`, `AppShell.UserCard`, `Dashboard.Panel`, `Avatar.Group`, `Table.Head`, `Table.Body` and `Table.Foot` among them, which the card left out), and `exports`, the member's other callable exports (Toast's `toast`, `ToastHost`, `ToastNotice` and `ToastViewportTarget`; Tooltip's `TooltipProvider`; FormField's `ToastFormField`). The React card lists Toast as `toast()` with its options and shorthands beside the components a screen mounts, rather than as a `<Toast>` with props; another framework's card lists the parts its shell ships, `Toast.Viewport` included. Toast's purpose reads "Notifications that report the outcome of an action" in place of "The toast viewport". A card rendered for `ios` or `android` lists a member's props and the parts its native contract carries, and none of React's exports: SwiftUI's and Compose's Toast is a member whose props are the options.

  **The spec-staleness law reads every compound part.** `@polymorph/rules/spec-api` compares each part a member's export carries with its spec, reading the parts with `compoundParts`, the function the registry's `parts` come from, in place of the hand list `COMPOUND_PARTS`, which is removed. A part's props table goes in `## API` under a `Component` column, or under a heading with the part's name (`## AppShell.NavItem`).

- Updated dependencies [1b900d8]
- Updated dependencies [1b900d8]
- Updated dependencies [1b900d8]
  - @polymorph/registry@1.0.3

## 1.0.2

### Patch Changes

- c331723: Markdown's citation marks and AttachmentChip's remove control keep their 48dp touch areas on Android without changing what they draw.

  **A citation mark at a line's edge keeps its touch area.** A run of Markdown that holds Citation marks keeps room after the end of its lines, and a mark that begins a line (the run's first, or one after a hard break) stands that room in from the line's start. The window's edge and the table cell beside a mark no longer cut its touch area. The room is about 14dp under the default pairing, so a paragraph with marks wraps that much sooner, and a line that begins with a mark starts that far in. Two marks on neighbouring lines less than 48dp apart along the line still share part of their touch areas, because a line is shorter than the touch target (`design/components/markdown.md`).

  **A removable AttachmentChip is drawn at the recipe's height.** Its remove control reserved its 48dp touch area inside the chip's surface, which made the surface 52dp tall at the standard density. The control now keeps its drawn size, so the surface is the small control height and `space.1` above and below it, with or without the control. The control's touch area reaches past the surface into the room the chip keeps around it, so in PromptInput removable chips stand 8dp apart at the standard density (`design/components/attachment-chip.md`).

- Updated dependencies [192c31c]
  - @polymorph/registry@1.0.2

## 1.0.1

### Patch Changes

- 700e130: The vocabulary renders natively on iOS and Android, from packages in `platforms/` that ship with the repository's release tag rather than to a registry (`.changeset/README.md`).

  - `platforms/ios`, one Swift package for iOS 17 and macOS 14: `PolymorphTokens`, every house pairing as a `PMTheme` (with `PMTheme(tokenDocument:)` for a tenant's theme that a server admits at run time), and `PolymorphUI`, the SwiftUI members. Every member the iOS platform map marks native or adapted has a rendering; Command, HoverCard and Tooltip are absent, each with its substitute.
  - `platforms/android`, one Gradle build: `:tokens` (`dev.polymorph.tokens`, plain Kotlin) and `:ui` (`dev.polymorph.ui`, the Compose members on Compose Multiplatform). The chart members, Command, HoverCard and Tooltip are absent on Android, each with its substitute, and ImageEditor has no Compose rendering. An app that includes the build compiles against API 37 and gives its own Gradle and Kotlin daemons a 4 GB heap (`platforms/android/README.md`).
  - `platforms/dart`: `polymorph_tokens`, the pairings as Dart values, with no Flutter dependency.

  A member keeps its web name with a `PM` prefix and takes its spec's props as one generated value. A screen spec whose `platform` is `ios` or `android` emits as SwiftUI or Compose (`pnpm emit`, the MCP tool `emit_screen`). An app depends on the packages through a checkout or a git submodule of this repository, pinned to the release tag (`docs/consuming.md`).

- Updated dependencies [700e130]
  - @polymorph/registry@1.0.1
