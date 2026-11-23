# Polymorph for Android

A Gradle build with two library modules, for Android apps and other JVM programs, and an example
app (`examples/relay`):

- **`tokens`**: the house pairings' tokens as Kotlin values. Each pairing is one `PMTheme`: every
  colour role (light and dark), the type steps, radii, shadows, the three densities, the four
  motion temperaments, and the pairing's metadata. The values come from the same theme engine as
  the web stylesheet, so an Android screen and a web screen on the same pairing make the same
  decisions.
- **`ui`**: the vocabulary's members drawn with Compose Multiplatform, built on `tokens`. Each
  member keeps its web name with a `PM` prefix (`PMBadge`), takes its spec's props (generated as
  `PMBadgeProps`, and as the arguments of the composable `PMBadge(…)`), and reads every value from
  the theme.

## The tokens

The module is plain Kotlin on the JVM plugin. It imports nothing from Android or Compose, so it
builds without an Android SDK and also compiles in a multiplatform common source set. Each value
is a number, a string or a small data class, and mapping one to Compose is one line:

```kotlin
import dev.polymorph.tokens.PMThemes

val theme = PMThemes.plain_neutral
val density = theme.defaultDensity // the density the system's axes select
val dark = isSystemInDarkTheme()

Box(
    Modifier
        // The hit area, not the drawn height: at least 48dp whatever the density.
        .minimumInteractiveComponentSize()
        .heightIn(min = density.controlHeight.md.dp)
        .background(Color(theme.colors.accentBg.resolve(dark).argb), RoundedCornerShape(theme.radius.control.dp))
        .padding(horizontal = density.space[4].dp),
) {
    BasicText(
        "Save",
        style = TextStyle(
            color = Color(theme.colors.accentContrast.resolve(dark).argb),
            fontSize = theme.text.md.size.sp,
            lineHeight = theme.text.md.lineHeight.em,
            letterSpacing = theme.text.md.tracking.em,
            fontWeight = FontWeight(theme.text.md.weight),
        ),
    )
}
```

| Value | In Compose |
| --- | --- |
| `PMRgba` | `Color(rgba.argb)` |
| a length (`radius.md`, `space[4]`, `controlHeight.md`) | `.dp` |
| `PMTextStyle.size` | `.sp` |
| `lineHeight`, `tracking` | `.em` (a multiplier of the size, and em) |
| `weight` | `FontWeight(weight)` |
| a duration (milliseconds) | `tween(durationMillis = …)` |
| `PMEasing` | `CubicBezierEasing(x1, y1, x2, y2)` |
| `PMSpring` | `spring(dampingRatio = s.dampingRatio, stiffness = s.stiffness / s.mass)` (Compose's spring has a unit mass) |

`PMThemes.default` is the web's default pairing (`design/defaults.json`'s system with its default
palette), the one the members render under until an app provides another.

## Adding it to an app

The modules live in a subdirectory of this repository, so an app reaches them through a checkout
of the repository or a git submodule of it. The simplest is to include this build whole, with
`includeBuild("../polymorph/platforms/android")` in `settings.gradle.kts`, and depend on
`dev.polymorph:tokens` and `dev.polymorph:ui`. The build is written for Gradle 9.5.0, which its
wrapper (`gradlew`) pins, the Android Gradle plugin 9.2.1 and Kotlin 2.3.21, which its root
`build.gradle.kts` declares. An included build runs on the including app's Gradle, so the app
builds with Gradle 9.5.0 or a later 9.x release that the plugin 9.2.1 accepts. The app's Android
modules compile against API 37 (`compileSdk = 37`), because the Compose 1.12 libraries the member
module brings declare that requirement in their AAR metadata, and the app's build fails its
metadata check below it. The app's build also gives its daemons their heap: the included build's
`gradle.properties` does not reach the Gradle daemon or the Kotlin daemon the app's build starts,
and the member module's Android compile runs out of memory at Gradle's default, so the app's own
`gradle.properties` sets `org.gradle.jvmargs=-Xmx4g` and `kotlin.daemon.jvmargs=-Xmx4g`.

The token module can also be included alone, as a Gradle module of the app's build:

```kotlin
// settings.gradle.kts
include(":polymorph-tokens")
project(":polymorph-tokens").projectDir = file("../polymorph/platforms/android/tokens")

// app/build.gradle.kts
dependencies { implementation(project(":polymorph-tokens")) }
```

It applies `kotlin("jvm")` without a version, so it builds with the app's Kotlin plugin; the
app's root `build.gradle.kts` declares it (`kotlin("jvm") version "…" apply false`) beside the
Android plugins.

With `ui`, an app provides one pairing at its root and composes members, which read it from the
composition:

```kotlin
import dev.polymorph.tokens.PMThemes
import dev.polymorph.ui.PMBadge
import dev.polymorph.ui.PMIconRole
import dev.polymorph.ui.ProvidePMTheme

@Composable
fun TicketStatus(status: String) {
    PMBadge(children = status, icon = PMIconRole.Time)
}

// At the app's root, in the pairing's own mode: terminal/petrol is dark.
val theme = PMThemes.terminal_petrol
ProvidePMTheme(theme, dark = theme.preferredDark) { TicketStatus(waiting) }
```

`ProvidePMTheme` provides `LocalPMTheme` and Material 3's bridge (`PMMaterialTheme`), so the app's
own Material components match the members. It follows the system's mode unless `dark` is given;
`theme.preferredDark` is the pairing's own mode (`pairing.defaultMode`), which the web applies
where nothing sets one, and null for a pairing that follows the device. The bridge also sets the
content colour (`LocalContentColor`) to `text.primary`, in which Spinner, Icon and Material's text
draw when nothing names their colour. `CompositionLocalProvider(LocalPMTheme provides theme)` alone
serves the members, which draw their Material parts inside the bridge themselves, but leaves the
content colour Material's default, black, so an app that provides the theme this way also provides
`LocalContentColor`. A composable under neither renders under `PMThemes.default`, in the system's
mode (`LocalPMDark` sets it). The
pairing names its font families and does not carry the files: an app that bundles them provides
`LocalPMFontFamilies`; until it does, each type step falls back to the system font of its slot's
fallback design. The defaults a spec names (a dialog's "Close", a page's "Try again") are
`PMStrings`, in English, generated from `packages/native/src/strings.ts`; an app provides its
translations through `LocalPMStrings`. FileUpload and PromptInput's attach button open the
platform's document picker, which belongs to an activity, so an app that uses them provides
`LocalPMFilePicker` (a `PMFilePicker`, which the app builds on
`ActivityResultContracts.OpenMultipleDocuments`), which also reads the files of a drop; without it,
PromptInput draws no attach button. A link opens through Compose's `LocalUriHandler`, which an app
replaces to route its own paths, or a Link's, a trail's or a Card's `onNavigate` takes in place of
opening it; a press on an `href` no handler opens does nothing, and what the app's router throws
reaches the app. Compose has no image loader, so an app that shows pictures from URLs (Image's and
Avatar's `src`, Markdown's images) provides `LocalPMImageLoader`, a painter for a URL from its own loader
(Coil's `rememberAsyncImagePainter`, for one); without it each member draws its fallback. RelativeTime's
phrases are English from `PMStrings` until an app provides `LocalPMRelativeTimeWords` (on Android,
`android.icu.text.RelativeDateTimeFormatter` gives the locale's). Its absolute form is the same
words' `absolute()`, which an app writes with the platform's date formatter in the reader's zone;
without it the member writes the date and an instant's 24-hour time in UTC, said as UTC
(`PMStrings.relativeUtc`), because the member module reaches no time zone.

Today is the app's to say. Calendar's today ring, the date pickers' first month and RelativeTime's
phrases measure from `LocalPMToday`, which, unprovided, is the date in UTC, a day off for part of
every day outside UTC. An app provides the person's date, read through `java.util.Calendar`
because `java.time` needs API 26:

```kotlin
val now = Calendar.getInstance() // java.util.Calendar, in the device's time zone
val today = PMCalendarDate(
    year = now.get(Calendar.YEAR).toDouble(),
    month = (now.get(Calendar.MONTH) + 1).toDouble(),
    day = now.get(Calendar.DAY_OF_MONTH).toDouble(),
)
CompositionLocalProvider(LocalPMToday provides today) { App() }
```

## What is in it

| Path | |
| --- | --- |
| `tokens/src/main/kotlin/…/PMTheme.kt` | The types, written by hand: `PMTheme` and the classes it is built from, plus `resolve(isDark)` and `inverse` on a dynamic colour, `argb` and `hex` on a colour, and `defaultDensity` and `defaultMotion` on a theme. |
| `tokens/src/generated/kotlin/…/` | One file per pairing and `Catalogue.kt` (`PMThemes.plain_neutral`, `PMThemes.catalogue`, `PMThemes.default`, `PMThemes.named(system, palette)`). Generated by `pnpm emit:native`; never edit them. |
| `tokens/src/test/kotlin/…/PMThemesTest.kt` | Every pairing in the catalogue: the hit target at least 48dp and control heights the density's at every density, the defaults the axes select, the colour packing. |
| `ui/src/main/kotlin/…/PolymorphUI.kt` | The foundation, written by hand: `PMContent`, `PMSome`, `PMControlSize`, `LocalPMTheme`, `LocalPMDark` and `PM`, the colour, type, shadow and gradient readers, `Modifier.pmMember` and `PMMemberKey` (a member's identity, the web's `data-member`), `PMAnnouncement` (a polite live region that draws nothing), `PMStateEntry` and `PMStates` (a states fixture), the catalogue types, `PMLoadStatus`, `PMIconView` (the one way a member draws an icon), `PMGeometry` (the lengths that are geometry: the hairline, a rem, the anchored-surface offsets, and `bothEdges`, an inset taken on both edges of an axis), the hit target, focus ring, press feedback and press ripple, `LocalPMStrings` and `PMSpecDefault`, the field and form composition locals, `LocalPMTertiary` (the buttons a container makes tertiary), `PMJSONValue` and `PMFile` (the types the contracts give the web's `unknown` and `File`), `rememberPMCopy` (the clipboard write), and the Material bridge, `PMMaterialTheme`. The token and literal laws leave it out: it is where the platform meets the tokens. |
| `ui/src/main/kotlin/…/PolymorphUI<Topic>.kt` | The foundation's further files: drawing parts several members share. `Controls` (the spinning glyph, the turning chevron, the field box, a row-labelled control's label, a sortable header's glyph), `Layout` (the spacing and the flex column, flex row and grid layouts), `Overlays` (an overlay's trigger and surface, and its body, the panel's one scroll region, which a ScrollArea or a ChatThread inside shares, `LocalPMOverlayScroll`), `Pages` (the page column, panel, failed Alert and Skeleton rows, a page's main and side regions, and the page-transitions convention's pending ribbon and arrival), `Fixtures` (what the states fixtures share), `Buttons` (Button's recipe as a frame its presets wear: CopyButton, ProviderButton, AvatarButton, SplitButton's halves), `Presentation` (the bottom sheet and the anchored panel the overlays present in, and the window width that chooses between them), `Menus` (Menu's rows and panel, which Menu, ContextMenu and SplitButton draw), `Disclosure` (Accordion's and Collapsible's trigger and region), `Fields` (what the text-entry members read from their props and FormField, a field's name on a node inside the editable one (`pmFieldName`) and its error, the embedded button every field's adornment is, a value's chip and the flow its chips wrap in, TagInput's and MultiSelect's, a field's error row, FormField's and InlineEdit's, and whether a field selects its text on focus), `Choices` (the choice groups' parts, Progress's bar, which Meter draws too, an option list's rows, which Select, Combobox and MultiSelect draw, and Rating's model), `Dates` (the calendar arithmetic, a month as `YYYY-MM` text, the locale's date words, the date fields' parts and Countdown's time), `Durations` (DurationInput's arithmetic, the engine's, and the words an app provides for a count, `LocalPMDurationWords`, with their English), `Phones` (PhoneInput's model, the engine's, over the calling codes `Phones.kt` holds, and the country list the platform's locale names and its collator orders), `Files` (the file picker an app provides, the drop target, the file gate and the size format), `Images` (`PMRemoteImage` and `LocalPMImageLoader`, the one way a member draws a picture from a URL; `pmDrawFramed` and `pmFramedImage`, a picture placed by ImageEditor's frame on the stage and in its export, and `LocalPMImageEncoder`, the encoder an app provides that writes the export as a file; `PMHexColor`, a colour that is a value, ColorInput's; and `PMBrandMark`, a provider's mark in its own colours), `Structure` (the round mark of a step or an event, Link's grammar for a run of text, and a trail's or a list's text link), `Tools` (JsonTree's and ToolCall's washed row, and a disclosure's semantics), `Prose` (the parts set in a paragraph as inline content: StreamingText's caret, Citation's mark with the room it keeps for its touch area, a link's glyph; the quote rule; and the list Markdown and RichTextContent draw, `PMProseList`), `Highlight` (Highlight's runs, the engine's `highlightRuns`), `Diff` (Diff's line diff and runs, the engine's `diffLines` and `diffRuns`, and the glyphs the member draws), `Chat` (what a thread hands its turns, a turn's arrival and announcement, and a sentence with its glyph), `Markdown` (the Markdown parser, the web's in Kotlin), `RichText` (RichTextContent's reader of a stored document, the web's in Kotlin, as far as drawing needs it: its blocks, marks, entities and annotations). Every law but conformance holds them. |
| `ui/src/main/kotlin/…/<Member>.kt` | One member, written by hand: `object PM<Member> : PM<Member>Rendering` and `object <Member>States : PMStates`, its states fixture. `Badge.kt` is the template. A native or adapted member without a file here is listed in `packages/native/src/kotlin-pending.ts`. A member reads every field of its contract, or `packages/native/src/undrawn.ts` names the field under `android` with the reason. |
| `ui/src/generated/kotlin/…/` | Written by `pnpm native:contracts` from the registry; never edit it. `Contracts.kt` holds `PMIconRole` and, for every member the Android platform map marks native or adapted, `PM<Member>Props`, its enums and `PM<Member>Rendering`; `Members.kt` the composable for every member with a file and for each of its compound parts (`PMSettingsRowGroup`), and the members' names (`PMRenderings.names`); `Icons.kt` the vector of each icon role; `Strings.kt` the defaults the specs name (`PMStrings`, from `packages/native/src/strings.ts`); `Recipes.kt` the numbers the recipes write that the members read (`PMRecipe`: measures, breakpoints, a sheet's height, an opacity, ConversationPage's split, from `packages/native/src/recipes.ts`); `Brands.kt` each provider's mark, from the engine's `BRAND_DRAWINGS`; `Phones.kt` PhoneInput's calling codes, from the engine's table (`packages/native/src/phones.ts`); `Catalogue.kt`, `Unsupported.kt` and `Fixtures.kt` the statuses, the props the mapping cannot express, and the fixtures. |
| `examples/relay/` | Relay's inbox as an app writes it: the screen the Compose screen emitter wrote from `Screens/inbox.json` (`pnpm emit:examples`), the app's `Ticket` and store, a test that renders the screen in its four load states through the harness, PNGs in `.snapshots/Examples/Relay/`, and one that holds the store's load status and retry (`InboxStoreTest`). [docs/native.md](../../docs/native.md), "Emitting a screen to Compose", describes it. |
| `ui/src/test/kotlin/…/` | The harness, on the JVM target: `RenderingTest` renders every fixture entry with `ImageComposeScene` under the default pairing in light mode, a dark-mode pairing, and the default pairing right to left (`Harness.rightToLeft`), PNGs in `.snapshots/` (gitignored); `RightToLeftTest` holds what the right-to-left pass must draw where a member places its parts itself (TimeInput's clock, ColorInput's picker, a turned chevron, a link's underline under right-to-left words); `BehaviourTest` drives members through Compose's test host (a press, a key, a drag, the clock), `PageBehaviourTest` holds MasterDetailPage's way back and where it moves focus, and `MemberLogicTest` checks their pure logic; `IdentityTest` reads each root's identity and promises from the semantics tree (a sheet's `presentation` from the sheet's own window), checks that everything a person can act on is named, that every text field is named on a node inside it rather than by its own content description, that every node with a control's role has its click action and its selected or toggle state, and that every Button, Checkbox and Switch has its role and its disabled state; `ContractTest` checks the catalogue, the lawful grid, every icon role's vector, and that the renderings and the fixtures name the same members; `QRCodeEncoderTest` holds QRCode's encoder to the web's golden symbols; `MarkdownSyntaxTest` holds the Markdown parser to the web parser's tests (`packages/engine/src/markdown/parse.test.ts`), and `RichTextReaderTest` the rich-text reader to the web reader's (`packages/engine/rich-text.test.ts`, `rich-text-text.test.ts`, `rich-text-href.test.ts`). `-Ppm.members=Menu,Popover` renders those members alone, and a name no fixture carries stops the run. |
| `ui/src/commonTest/kotlin/…/SemanticsAudit.kt` | The rules a fixture entry's semantics tree is held to, which `IdentityTest` applies on the JVM target and the accessibility audit on the Android target: identity, the `expect` promises, a name on everything a person can act on, and each control's action and state. |
| `ui/src/androidHostTest/kotlin/…/AccessibilityAuditTest.kt` | The accessibility audit, on the Android target under Robolectric: every fixture entry composed by Android's Compose runtime, held to `SemanticsAudit` and to the Accessibility Test Framework's error-level rules over the nodes Android publishes, walked as the provider lists them, so the node Compose adds for a merged node's description is read and a hidden child says nothing (a 48dp touch target and something to say on everything a person acts on, no two such nodes with the same bounds, no content description on a node a person types into). `theAuditHearsWhatTalkBackHears` holds the audit to those readings. `scripts/android-audit.mjs` runs it in `pnpm gate:android`. |
| `ui/src/androidHostTest/kotlin/…/AppShellBackTest.kt` | Back closes AppShell's drawer on a phone and leaves the screen, through the activity's `OnBackPressedDispatcher`: a behaviour of the Android target the JVM harness cannot reach, because Compose for desktop has no Back. |
| `ui/src/androidHostTest/kotlin/…/MasterDetailPageBackTest.kt` | Back on a phone, while MasterDetailPage draws the detail alone, calls `onBack` once and leaves the screen; with the list drawn, Back is the activity's. Compose for desktop has no Back. |
| `ui/src/androidHostTest/kotlin/…/PageKeyboardTest.kt` | A page archetype's column scrolls further by the keyboard's height when the keyboard's insets reach the window, so a form's lower fields and actions scroll into view above it in an app drawn edge to edge. Compose for desktop has no keyboard insets. |
| `ui/src/androidHostTest/kotlin/…/MultiSelectKeyboardTest.kt` | Done with nothing typed in MultiSelect's search field hides the keyboard, read from the list window's insets controller: the field is in the list's own window, whose keyboard controller Compose for desktop's test host cannot replace. |

### The member module's targets

`ui` is a Compose Multiplatform module (`kotlin("multiplatform")`, the Compose compiler and
Compose Multiplatform's plugin) with two targets built from one source set, `src/main/kotlin` with
`src/generated/kotlin`:

- `jvm`, Compose for desktop. It compiles and renders without an Android SDK, so the harness runs
  on any machine with a JDK.
- `android`, an Android library (the Android Gradle plugin's `com.android.kotlin.multiplatform.library`,
  `compileSdk` 37, which the Compose 1.12 libraries require, and `minSdk` 24). Its tasks need an
  Android SDK with the API 37 platform (`ANDROID_HOME`, `ANDROID_SDK_ROOT`, or `sdk.dir` in
  `local.properties`, which git ignores). Without one the target is declared and configured, and
  only its tasks fail. Its host test, `src/androidHostTest/kotlin`, is the accessibility audit,
  which runs on the JVM under Robolectric.

The Material 3 library is Compose Multiplatform's last stable release of it, because the later
ones are alphas, and the icons are the outlined set of Compose's Material icons, in which each
role's Material Symbols name is a vector. Every compiler warning is an error, so a deprecated
name, such as a glyph Compose has moved to its auto-mirrored set, fails the build.

## Names and units

- Lengths are dp: a CSS px is a dp. A type size is the step's rem × 16, in sp; line height is a
  multiplier and tracking is in em, as on the web.
- Durations, ambient periods and stagger are whole milliseconds. Easings are cubic Bézier control
  points; springs are stiffness, damping, mass and their damping ratio.
- A property is its token path below its family, camel-cased: `accent.bgHover` is
  `colors.accentBgHover`, `shell.topbar.bg` is `shell.topbarBg`. A name that would start with a
  digit takes its family in front: `chart.1` is `chart.chart1`, `text.2xl` is `text.text2xl`.
  The space ladder is a list: `space.4` is `space[4]`.
- The spring role `default` is `spring.base`, the name the Dart and Swift packages give it.
- A pairing is `system_palette`, each half camel-cased: `PMThemes.plain_neutral`, and
  `acmeCorp_deepSea` for `acme-corp/deep-sea`.
- The hit target is 48dp at every density, the Android touch-target minimum. It is a touch area,
  not a height: control heights are the density's, as on the web, so compact and comfortable
  still differ on a phone. A component shorter than `hitTarget` extends its touch area with
  `Modifier.minimumInteractiveComponentSize()` and keeps its drawn height. `PMTheme.floor` holds
  both floors (`controlHeight` 24, `hitTarget` 48), and `floor.raised` lists the hit target
  raised at each density.

## What is not here

- The page texture (`texture.page`): no native toolkit draws the stylesheet's SVG noise tile. It
  is listed in `PMTheme.unsupported`.
- An inverse-tone table. On the web, `[data-tone="inverse"]` borrows the other mode's value for
  every colour and chart role, which is `colors.x.inverse` and `chart.x.inverse`, a swap of light
  and dark. Gradients, glows, shell surfaces and the glass surface keep the outer scope's value
  there, so an inverse-tone region swaps its colour and chart roles and nothing else; the token
  document's `inverse` table lists them.
- References arrive resolved. `radius.control` is the radius it names; only a member exception
  keeps the path it points at (`PMException.ref`).
- A run-time theme. Unlike `PMTheme(tokenDocument:)` on iOS, the Kotlin package holds the
  catalogue pairings only and reads no token document.
- A Compose view for the members `packages/native/src/kotlin-pending.ts` lists. A screen spec
  that uses one is a fault until it is drawn.
- An audit on a device or an emulator. The accessibility audit composes the members with
  Android's Compose runtime under Robolectric, on the JVM, and the harness's checks run on the JVM
  target; Google's Accessibility Test Framework does not run, because Compose's bridge to it
  declines to run under Robolectric.

## Working on it

From the repository root, `pnpm emit:native --target kotlin` rewrites `tokens/src/generated/`
and `pnpm emit:native --check` reports any file that is out of date. The suite checks both: the
freshness law (`packages/theme/src/native.test.ts`) fails when a generated file differs from what
the engine emits, and `packages/theme/src/emit-kotlin.test.ts` compiles the module's sources with
`kotlinc` when it is on `PATH`, and checks that `PMTheme.kt` declares every property the emitter
writes.

`pnpm native:contracts` rewrites `ui/src/generated/`, and `pnpm gate:android` checks the member
module: the contracts are current, the emitted example is fresh, the laws over the Kotlin
sources hold, both modules' JVM builds and tests pass, the example builds and renders, and, where
an Android SDK is installed, the Android library builds and the accessibility audit finds no more
defects than `scripts/native-audits/thresholds.json` allows
([docs/verification.md](../../docs/verification.md), "The Android gate", which also has the steps
for adding a member). From this directory, `./gradlew :tokens:build :ui:jvmTest` builds and tests
the JVM side (the wrapper fetches Gradle, and Gradle the plugins and libraries, once), the PNGs
land in `.snapshots/<Member>/`, and `./gradlew :ui:testAndroidHostTest -Ppm.members=TimeInput`
audits one member on the Android target.

A machine needs a JDK, 17 or later, for every task, and for the Android library and the audit the
Android SDK command-line tools with `platform-tools`, `build-tools` and `platforms;android-37.0`
installed and their licences accepted (`sdkmanager --licenses`). `gradle.properties` gives Gradle
and the Kotlin compiler a 4 GB heap, which the Android target's compile needs.

[docs/theming.md](../../docs/theming.md) describes the token document the values are read from,
and [docs/native.md](../../docs/native.md) the native screen contract the members serve.
