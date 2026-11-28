import { buildRegistry, type Registry } from '@polymorph/registry'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { readKotlinSources, readKotlinTree, KOTLIN_TOKEN_SOURCES } from './disk'
import { undrawnViolations } from './drawn'
import {
  isKotlinFoundation,
  KOTLIN_FOUNDATION,
  KOTLIN_GENERATED,
  KOTLIN_PLATFORM,
  KOTLIN_SOURCES,
} from './kotlin'
import {
  conformanceViolations,
  containmentViolations,
  KOTLIN_MEMBER_IMPORTS,
  literalStringViolations,
  memberOfKotlinFile,
  shadowViolations,
  tokenViolations,
  type KotlinFile,
} from './kotlin-laws'
import { KOTLIN_PENDING } from './kotlin-pending'
import { LITERAL_ALIASES, NAMED_ONLY, renderedMembers, SHAPE_ALIASES, UNIONS } from './mapping'
import { branches, isKeyword, parseType, type TsType } from './typescript-type'
import { UNDRAWN, type UndrawnProps } from './undrawn'

/**
 * The laws over the Compose members in `platforms/android/ui/src/main/kotlin`,
 * the generated sources left out. They read files only: the rendering harness
 * (`platforms/android/gradlew -p platforms/android :ui:jvmTest`) is the gate's
 * later step (`docs/verification.md`, "The Android gate").
 *
 * The pending list is pinned here. It holds every member the Android platform
 * map marks native or adapted that has no rendering. `pnpm new:member` adds a
 * new member to it and raises this number; implementing a member means
 * removing it from `kotlin-pending.ts` and lowering this number in the same
 * change.
 */
const KOTLIN_PENDING_COUNT = 0

const ROOT = resolve(import.meta.dirname, '../../..')
const registry = buildRegistry(ROOT)
const members = renderedMembers(registry, KOTLIN_PLATFORM)

const files: KotlinFile[] = Object.entries(readKotlinSources(ROOT)).map(([path, source]) => ({
  path,
  source,
}))
/** Every file the token and literal laws read: all but the foundation, where the platform meets the tokens. */
const drawingFiles = files.filter((file) => file.path !== KOTLIN_FOUNDATION)
/** The member files: all but the foundation and its further files, `PolymorphUI<Topic>.kt`. */
const memberFiles = files.filter((file) => !isKotlinFoundation(file.path))

/**
 * What a foundation part draws with on purpose that a law refuses, each with
 * its reason. An exception names its file and the text the law quotes, and
 * excuses that text in that file alone; one that excuses nothing fails, so the
 * list cannot outlive the code it names.
 */
const KOTLIN_LAW_EXCEPTIONS: readonly { file: string; quoted: string; reason: string }[] = [
  {
    file: 'PolymorphUIImages.kt',
    quoted: 'Color.White',
    reason:
      "the white end of ColorInput's saturation plane: a constant of the colour model a value is drawn in, not a theme decision",
  },
  {
    file: 'PolymorphUIImages.kt',
    quoted: 'Color.Black',
    reason:
      "the black end of ColorInput's brightness plane: a constant of the colour model, not a theme decision",
  },
  {
    file: 'PolymorphUIImages.kt',
    quoted: 'Image(',
    reason:
      'the image gateway: `PMRemoteImage` is the one place a picture from a URL is drawn, as `PMIconView` is for an icon',
  },
]

const excused = (fault: string) =>
  KOTLIN_LAW_EXCEPTIONS.some(
    (exception) =>
      fault.startsWith(`${exception.file}:`) && fault.includes(`\`${exception.quoted}\``),
  )

const tokenFaults = drawingFiles.flatMap((file) => tokenViolations(file))
const containmentFaults = files.flatMap((file) =>
  containmentViolations(file, {
    foundation: file.path === KOTLIN_FOUNDATION,
    imports: KOTLIN_MEMBER_IMPORTS[memberOfKotlinFile(file.path)],
  }),
)

describe(`the Compose members (${KOTLIN_SOURCES})`, () => {
  it('finds the foundation and at least one member, so a pass is not vacuous', () => {
    expect(files.map((file) => file.path)).toContain(KOTLIN_FOUNDATION)
    expect(memberFiles.length).toBeGreaterThan(0)
  })

  it('token-only: every value in a member and a foundation part comes from the theme', () => {
    expect(tokenFaults.filter((fault) => !excused(fault))).toEqual([])
  })

  it('excuses only what its exceptions name, and each exception still excuses something', () => {
    const faults = [...tokenFaults, ...containmentFaults]
    for (const exception of KOTLIN_LAW_EXCEPTIONS) {
      expect(
        faults.some(
          (fault) =>
            fault.startsWith(`${exception.file}:`) && fault.includes(`\`${exception.quoted}\``),
        ),
        `${exception.file}: ${exception.quoted} excuses nothing — remove it from KOTLIN_LAW_EXCEPTIONS`,
      ).toBe(true)
    }
    expect(excused('Badge.kt:3: `Color.White` is a named colour')).toBe(false)
  })

  it('no literal strings: text a person reads comes from props', () => {
    expect(drawingFiles.flatMap((file) => literalStringViolations(file))).toEqual([])
  })

  it('containment: Compose, Kotlin and the tokens; Material 3 through the bridge; icons through PMIconView', () => {
    expect(containmentFaults.filter((fault) => !excused(fault))).toEqual([])
  })

  it('conformance: every native or adapted member has a conforming file or is pending', () => {
    expect(
      conformanceViolations({
        files: memberFiles,
        members: members.map((member) => member.name),
        pending: KOTLIN_PENDING,
      }),
    ).toEqual([])
  })

  it('no shadowing: no member-module name is a token-module name', () => {
    const tokens = Object.entries(readKotlinTree(ROOT, KOTLIN_TOKEN_SOURCES)).map(
      ([path, source]) => ({ path: `tokens/${path}`, source }),
    )
    expect(tokens.length).toBeGreaterThan(0)
    expect(shadowViolations(files, tokens)).toEqual([])
  })

  it(`the pending list has its pinned length: ${KOTLIN_PENDING_COUNT} members to go`, () => {
    expect(
      KOTLIN_PENDING.length,
      'implemented a member? remove it from kotlin-pending.ts and lower KOTLIN_PENDING_COUNT here',
    ).toBe(KOTLIN_PENDING_COUNT)
  })

  it('drawn props: a rendering reads every field of its contract, or undrawn.ts says why not', () => {
    expect(
      undrawnViolations({
        language: 'kotlin',
        platform: 'android',
        contract: readFileSync(resolve(ROOT, `${KOTLIN_GENERATED}/Contracts.kt`), 'utf8'),
        files,
        isFoundation: isKotlinFoundation,
        memberOf: memberOfKotlinFile,
        members: members.map((member) => member.name),
        declared: UNDRAWN,
      }),
    ).toEqual([])
  })
})

describe('the Kotlin laws detect faults', () => {
  /**
   * A law is trusted once it has been seen to fail. Each sample below breaks
   * one law the way a member written without the system would, and its lawful
   * twin passes.
   */
  const file = (source: string): KotlinFile => ({ path: 'Sample.kt', source })

  it('token-only refuses raw and named colours, literal lengths, type, motion, radii, alphas and shadows', () => {
    const faults = tokenViolations(
      file(`
        val a = Color(0xFF00AAFF)
        val b = Color(red = 0.2f, green = 0.3f, blue = 0.4f)
        val c = Color.Red
        val d = Modifier.padding(12.dp).size(width = 44.dp, height = theme.radius.control.dp)
        val e = TextStyle(fontSize = 13.sp, fontWeight = FontWeight.Bold, fontFamily = FontFamily.Serif)
        val f = tween<Float>(300)
        val g = spring<Float>(dampingRatio = 0.8f, stiffness = Spring.StiffnessMedium)
        val h = RoundedCornerShape(8)
        val i = Modifier.alpha(0.38f).shadow(theme.x.dp)
        val j = (space.s4 * 2).dp
        val k = "#ff00aa"
        LaunchedEffect(Unit) { delay(5000) }
      `),
    )
    expect(faults.join('\n')).toMatch(/Color\(0x…/)
    expect(faults.join('\n')).toMatch(/the length `12\.dp`/)
    expect(faults.join('\n')).toMatch(/the length `44\.dp`/)
    expect(faults.join('\n')).toMatch(/the number 2 in a length/)
    expect(faults.join('\n')).toMatch(/the number 8 in a shape/)
    expect(faults.join('\n')).toMatch(/the alpha 0\.38f/)
    expect(faults.join('\n')).toMatch(/`delay\(5000`/)
    expect(faults).toHaveLength(18)

    // A weight as a number, an alpha behind a condition, a circle, Compose's
    // own motion, and a number that becomes a length through a value.
    const more = tokenViolations(
      file(`
        val a = TextStyle(fontWeight = FontWeight(600))
        val b = Modifier.alpha(if (disabled) 0.38f else 1f)
        val c = Modifier.clip(CircleShape)
        val d = spring<Float>()
        AnimatedVisibility(visible = shown) { Badge() }
        AnimatedVisibility(visible = shown, enter = fadeIn(spec)) { Badge() }
        val e by animateColorAsState(target, label = "fill")
        private const val GAP = 12
        val f = Modifier.padding(GAP.dp)
      `),
    )
    expect(more.join('\n')).toMatch(/`FontWeight\(6` is a type decision/)
    expect(more.join('\n')).toMatch(/the alpha 0\.38f/)
    expect(more.join('\n')).toMatch(/`CircleShape` is a radius the theme did not decide/)
    expect(more.join('\n')).toMatch(/`spring<Float>\(\)` is motion the theme did not decide/)
    expect(more.join('\n')).toMatch(/`AnimatedVisibility` without `enter` and `exit`/)
    expect(more.join('\n')).toMatch(/`AnimatedVisibility` without `exit`/)
    expect(more.join('\n')).toMatch(/`animateColorAsState` without an animation spec/)
    expect(more.join('\n')).toMatch(/`GAP` holds 12 and becomes a length here/)
    expect(more).toHaveLength(8)

    expect(
      tokenViolations(
        file(`
          // A comment may name Color.Red, 0xFF and 12.dp.
          val shape = RoundedCornerShape(theme.radius.detail.dp)
          Row(Modifier.padding(horizontal = space.s3, vertical = 0.dp).alpha(1f)) {
            Text(props.label, style = theme.text.xs.textStyle, color = recipe.text.color)
          }
          val fill = recipe.fill?.color ?: Color.Transparent
          val spec = motion.easing.standard.tween<Float>(motion.duration.control)
          val row = (steps[4] + inset).dp
          val pill = Modifier.clip(theme.rounded(theme.radius.pill)).alpha(if (shown) 1f else 0f)
          AnimatedVisibility(visible = shown, enter = fadeIn(spec), exit = fadeOut(spec)) { Badge() }
          val fill by animateColorAsState(target, spec, label = "fill")
          private const val ROWS = 5
        `),
      ),
    ).toEqual([])
  })

  it('token-only refuses a token multiplied by a number outside a states fixture', () => {
    const faults = tokenViolations(
      file(`
        val rail = space.s10 * 2 + space.s7
        val ring = theme.radius.sm.dp * 3
        val inset = (space.s4 * 2).dp
        object RailStates : PMStates {
          override val entries get() = listOf(PMStateEntry("wide") { Box(Modifier.width(space.s10 * 4)) })
        }
        val gutter = 2 * space.s4
        val corner = theme.radius.md * 2
        val tall = 3 * theme.defaultDensity.controlHeight.sm.dp
        val reach = theme.defaultDensity.hitTarget * 1.5f
        val glyph = 2 * theme.icon.sm.size
        val line = theme.text.md.lineHeight * 2
      `),
    )
    const message =
      "multiplies a token by a number — read a recipe's multiple from `PMRecipe`, and double an inset on both edges with `PMGeometry.bothEdges`"
    expect(faults).toEqual([
      `Sample.kt:2: \`.s10 * 2\` ${message}`,
      `Sample.kt:3: \`radius.sm.dp * 3\` ${message}`,
      'Sample.kt:4: the number 2 in a length — a length comes from `theme`',
      `Sample.kt:8: \`2 * space.s4\` ${message}`,
      `Sample.kt:9: \`radius.md * 2\` ${message}`,
      `Sample.kt:10: \`3 * theme.defaultDensity.controlHeight.sm.dp\` ${message}`,
      `Sample.kt:11: \`hitTarget * 1.5f\` ${message}`,
      `Sample.kt:12: \`2 * theme.icon.sm.size\` ${message}`,
      `Sample.kt:13: \`text.md.lineHeight * 2\` ${message}`,
    ])
    expect(
      tokenViolations(
        file(`
          val rail = space.s10 * PMRecipe.appShellRailWidth + space.s7
          val margin = window.width - PMGeometry.bothEdges(space.s7)
          val thick = PMGeometry.hairline * 2
          val track = length - inset * 2
          val half = (theme.defaultDensity.hitTarget.dp - height) / 2
          val rows = 2 * PMRecipe.textareaRows
        `),
      ),
    ).toEqual([])
  })

  it('no literal strings refuses text a person reads written into the member', () => {
    const faults = literalStringViolations(
      file(`
        Text("Save")
        Text(text = "Saved", color = tone)
        BasicText("Cancel")
        Modifier.semantics { contentDescription = "Close"; stateDescription = "On" }
        Modifier.clickable(onClickLabel = "Open") {}
        Text("Items: \${props.count}")
        val a = AnnotatedString("Inbox")
      `),
    )
    expect(faults).toHaveLength(8)
    expect(faults.join('\n')).toMatch(/the literal "Close" in `contentDescription`/)

    // An action's label, a semantics error, a nested template string, and a
    // member's prop in drawing code.
    const more = literalStringViolations(
      file(`
        customActions = listOf(CustomAccessibilityAction(label = "Select") { true })
        Modifier.semantics { error("Required"); onClick(label = "Open") { true }; dismiss("Close") { true } }
        Text("\${"Inbox"}")
        Text(props.title ?: "Untitled")
        PMButton(label = "Save", onClick = save)
        val fill by animateColorAsState(target, spec, label = "fill")
      `),
    )
    expect(more.join('\n')).toMatch(/the literal "Select" in `CustomAccessibilityAction\(…\)`/)
    expect(more.join('\n')).toMatch(/the literal "Required" in `error\(…\)`/)
    expect(more.join('\n')).toMatch(/the literal "Open" in `onClick\(…\)`/)
    expect(more.join('\n')).toMatch(/the literal "Close" in `dismiss\(…\)`/)
    expect(more.join('\n')).toMatch(/the literal "Inbox" in `Text\(…\)`/)
    expect(more.join('\n')).toMatch(/the literal "Untitled" in `Text\(…\)`/)
    expect(more.join('\n')).toMatch(/the literal "Save" in `PMButton\(label = …\)`/)
    expect(more).toHaveLength(7)

    expect(
      literalStringViolations(
        file(`
          Text(props.label)
          Text("\${props.count}")
          Text("\${props.done} / \${props.total}")
          Text("·")
          Text(text = stringResource(Res.string.save))
          Modifier.semantics { contentDescription = props.children }
          PMBadge(children = props.status)
          Text(props.closeLabel ?: PMSpecDefault.strings.close)
          val fill by animateColorAsState(target, spec, label = "fill")
          object BadgeStates : PMStates {
            override val entries get() = listOf(PMStateEntry("soft") { PMBadge(children = "Active") })
          }
        `),
      ),
    ).toEqual([])
  })

  it('containment refuses foreign imports, Material outside the bridge and raw icons', () => {
    const source = `
      import android.graphics.Color
      import java.util.Date
      import androidx.compose.material.icons.Icons
      import androidx.compose.material3.Switch
      import androidx.compose.material3.Text
      val scheme = MaterialTheme.colorScheme.primary
      val glyph = Icon(Icons.Outlined.Add, null)
      @Composable fun Toggle() { Switch(checked = true, onCheckedChange = null) }
    `
    const faults = containmentViolations(file(source), { foundation: false })
    expect(faults.join('\n')).toMatch(/imports android\.graphics\.Color/)
    expect(faults.join('\n')).toMatch(/imports java\.util\.Date/)
    expect(faults.join('\n')).toMatch(
      /draws Material 3 \(androidx\.compose\.material3\.Switch\) outside the bridge/,
    )
    expect(faults.join('\n')).toMatch(/`MaterialTheme` builds or reads Material’s theme/)
    expect(faults).toHaveLength(7)
    expect(containmentViolations(file(source), { foundation: true })).toHaveLength(2)

    // A class KOTLIN_MEMBER_IMPORTS names is lawful in its file and nowhere else.
    const collating = (path: string): KotlinFile => ({
      path,
      source: 'import java.text.Collator\nimport java.util.Locale\n',
    })
    const admitted = {
      foundation: false,
      imports: KOTLIN_MEMBER_IMPORTS[memberOfKotlinFile('PolymorphUIPhones.kt')],
    }
    expect(containmentViolations(collating('Sample.kt'), { foundation: false })).toHaveLength(2)
    const phones = containmentViolations(collating('PolymorphUIPhones.kt'), admitted)
    expect(phones).toHaveLength(1)
    expect(phones.join('\n')).toMatch(/imports java\.util\.Locale/)

    expect(
      containmentViolations(
        file(`
          import androidx.compose.material3.Switch
          import androidx.compose.material3.Text
          import androidx.compose.runtime.Composable
          import dev.polymorph.tokens.PMColors
          import kotlinx.coroutines.delay
          @Composable fun Draw() { PMMaterialTheme { Toggle() } }
          @Composable private fun Toggle() { Switch(checked = true, onCheckedChange = null) }
          val glyph = PMIconView(PMIconRole.Time, PMControlSize.Sm)
        `),
        { foundation: false },
      ),
    ).toEqual([])
  })

  it('no shadowing refuses a member-module name that is a token-module name', () => {
    expect(
      shadowViolations(
        [
          file(
            'class PMRgba(val r: Int)\nsealed interface PMLoadStatus\n' +
              '@Composable fun PMMaterial(content: PMContent) {}\nfun PMTheme.rounded(radius: Float) = radius',
          ),
        ],
        [
          {
            path: 'PMTheme.kt',
            source:
              'data class PMRgba(val r: Int, val g: Int)\ndata class PMMaterial(val blur: Float)\nclass PMTheme',
          },
        ],
      ),
    ).toEqual([
      'Sample.kt:1: declares PMRgba, which the token module declares at PMTheme.kt:1 — an app importing both packages could not name either',
      'Sample.kt:3: declares PMMaterial, which the token module declares at PMTheme.kt:2 — an app importing both packages could not name either',
    ])
  })

  it('conformance refuses a file without its rendering or fixture, a stranger, and a stale pending list', () => {
    const lawful = `
      object PMBadge : PMBadgeRendering { }
      object BadgeStates : PMStates { override val member = "Badge" }
    `
    const faults = conformanceViolations({
      files: [
        { path: 'Badge.kt', source: '@Composable fun Badge() {}' },
        { path: 'Avatar.kt', source: lawful },
        { path: 'Gadget.kt', source: lawful },
      ],
      members: ['Avatar', 'Badge', 'Card'],
      pending: ['Avatar', 'Avatar', 'Ghost'],
    })
    expect(faults).toEqual([
      'Badge.kt: declares no `object PMBadge` implementing `PMBadgeRendering`',
      'Badge.kt: declares no `object BadgeStates` implementing `PMStates`',
      'Avatar.kt: declares no `object PMAvatar` implementing `PMAvatarRendering`',
      'Avatar.kt: declares no `object AvatarStates` implementing `PMStates`',
      'Gadget.kt: Gadget is not a member the Android platform map marks native or adapted — a file here is one member, named for it, or a foundation file, `PolymorphUI<Topic>.kt`',
      'kotlin-pending.ts: Avatar has a rendering — remove it from the list and lower the pinned count',
      'kotlin-pending.ts: Avatar is listed twice',
      'kotlin-pending.ts: Avatar has a rendering — remove it from the list and lower the pinned count',
      'kotlin-pending.ts: Ghost is not a member the Android platform map marks native or adapted',
      'Card renders on Android but has no member file and is not in kotlin-pending.ts',
    ])

    expect(
      conformanceViolations({
        files: [{ path: 'Badge.kt', source: lawful }],
        members: ['Badge', 'Card'],
        pending: ['Card'],
      }),
    ).toEqual([])
  })

  it('drawn props refuses a field no rendering reads, a prop handed to a member that drops it, and a stale entry', () => {
    const contract = [
      'data class PMBadgeProps(',
      '    val children: String,',
      '    val id: String? = null,',
      '    val messages: PMBadgeMessages? = null,',
      '    val onDismiss: PMUnsupportedBadgeOnDismiss? = null,',
      '    val onSelect: ((PMBadgeSelection) -> Unit)? = null,',
      '    val tone: PMBadgeTone? = null,',
      ')',
      'data class PMBadgeMessages(',
      '    val countLabel: String? = null,',
      '    val dismissLabel: String? = null,',
      ')',
      'data class PMBadgeSelection(',
      '    val value: String,',
      ')',
      'data class PMChipProps(',
      '    val id: String? = null,',
      '    val label: String,',
      ')',
    ].join('\n')
    // Badge reads `children` in `Render` and `onSelect` in a helper that takes
    // its props, names `tone` in a comment and in its fixture only, and builds
    // the selection it reports. Chip's expression body hands `label` to Badge's
    // `children`, which Badge reads, and `id` to Badge's `id`, which Badge
    // drops.
    const badge = `
      object PMBadge : PMBadgeRendering {
          @Composable
          override fun Render(props: PMBadgeProps) {
              // The tone would be props.tone.
              Text("\${props.children}", Modifier.semantics { contentDescription = props.messages?.dismissLabel ?: "" })
              Dismiss(props)
          }

          @Composable
          private fun Dismiss(props: PMBadgeProps) {
              props.onSelect?.invoke(PMBadgeSelection(value = "one"))
          }
      }

      object BadgeStates : PMStates {
          @Composable
          private fun Toned(props: PMBadgeProps) { Text("\${props.tone}") }
      }
    `
    const chip = `
      object PMChip : PMChipRendering {
          @Composable
          override fun Render(props: PMChipProps) =
              PMBadge(children = props.label, id = props.id)
      }
    `
    const check = (declared: readonly UndrawnProps[]) =>
      undrawnViolations({
        language: 'kotlin',
        platform: 'android',
        contract,
        files: [
          { path: 'Badge.kt', source: badge },
          { path: 'Chip.kt', source: chip },
        ],
        isFoundation: () => false,
        memberOf: memberOfKotlinFile,
        members: ['Badge', 'Chip', 'Ghost'],
        declared,
      })
    const undeclared = (name: string) =>
      `${name}: the contract carries it and the rendering on android never reads it — draw it, or declare it in undrawn.ts with the reason`

    expect(check([])).toEqual([
      undeclared('Badge.id'),
      undeclared('Badge.tone'),
      undeclared('Badge.BadgeMessages.countLabel'),
      undeclared('Chip.id'),
    ])
    expect(
      check([
        { props: ['id', 'tone'], reason: 'The web’s wiring.', android: ['Badge', 'Chip'] },
        { props: ['BadgeMessages.countLabel'], reason: 'No count is drawn.', android: ['Badge'] },
      ]),
    ).toEqual([])

    // An entry for the other platform declares nothing here.
    expect(
      check([{ props: ['id', 'tone'], reason: 'The web’s wiring.', ios: ['Badge'] }]),
    ).toHaveLength(4)

    expect(
      check([
        { props: ['id', 'children'], reason: ' ', android: ['Badge', 'Ghost'] },
        { props: ['tone', 'BadgeMessages.countLabel', 'label'], reason: 'r', android: ['Badge'] },
        { props: ['id'], reason: 'r', android: ['Chip', 'Badge'] },
        { props: ['tone'], reason: 'r', android: ['Chip'] },
      ]),
    ).toEqual([
      'undrawn.ts (id, children): the entry has no reason',
      'undrawn.ts (id, children): Badge.children is read by its rendering on android — remove it from the entry',
      'undrawn.ts (id, children): Ghost has no rendering on android',
      'undrawn.ts (tone, BadgeMessages.countLabel, label): no member the entry lists on android has `label`',
      'undrawn.ts (id): Badge.id is declared twice on android',
      'undrawn.ts (tone): Chip has none of the entry’s props on android',
      'undrawn.ts (tone): no member the entry lists on android has `tone`',
    ])
  })

  it('drawn props takes no prop written only into the identifier for a drawn one', () => {
    const contract = [
      'data class PMBadgeProps(',
      '    val children: String,',
      '    val count: Int? = null,',
      '    val mark: PMBadgeMark? = null,',
      '    val pinned: Boolean? = null,',
      '    val size: PMBadgeSize? = null,',
      '    val sticky: Boolean? = null,',
      '    val tone: PMBadgeTone? = null,',
      '    val wide: Boolean? = null,',
      ')',
      'data class PMBadgeMark(',
      '    val glyph: String,',
      '    val shade: String? = null,',
      ')',
    ].join('\n')
    // `children` and `mark.glyph` are drawn. `size` is written into the
    // identifier and also sets the text style, so it is drawn. The rest reach
    // the identifier only: `sticky` in the map the call names, `count` in the
    // mutable map it names, `wide` under an `if` that only writes to that
    // map, `pinned` in the function a foundation helper is handed, and `tone`
    // and `mark.shade` in the call's own arguments.
    const badge = `
      object PMBadge : PMBadgeRendering {
          @Composable
          override fun Render(props: PMBadgeProps) {
              val attributes = buildMap {
                  put("size", (props.size ?: PMBadgeSize.Md).value)
                  if (props.sticky == true) put("sticky", "true")
              }
              val marks = mutableMapOf("count" to (props.count ?: 0).toString())
              if (props.wide == true) marks["wide"] = "true"
              Text(
                  text = props.children + (props.mark?.glyph ?: ""),
                  style = if (props.size == PMBadgeSize.Sm) small else body,
                  modifier = Modifier
                      .pmMember("Badge", attributes)
                      .pmMember(
                          "Badge",
                          mapOf("tone" to (props.tone?.value ?: "neutral"), "shade" to (props.mark?.shade ?: "")),
                      )
                      .pmMember("Badge", marks)
                      .pmMember("Badge", pmInSheet(identity(props))),
              )
          }

          private fun identity(props: PMBadgeProps): Map<String, String> =
              if (props.pinned == true) mapOf("pinned" to "true") else emptyMap()
      }
    `
    const check = (declared: readonly UndrawnProps[]) =>
      undrawnViolations({
        language: 'kotlin',
        platform: 'android',
        contract,
        files: [{ path: 'Badge.kt', source: badge }],
        isFoundation: () => false,
        memberOf: memberOfKotlinFile,
        members: ['Badge'],
        declared,
      })
    const recorded = (name: string) =>
      `${name}: the rendering on android writes it into its identifier and draws nothing from it — draw it, or declare it in undrawn.ts with the reason`

    expect(check([])).toEqual([
      recorded('Badge.count'),
      recorded('Badge.pinned'),
      recorded('Badge.sticky'),
      recorded('Badge.tone'),
      recorded('Badge.wide'),
      recorded('Badge.BadgeMark.shade'),
    ])
    // An entry declares a prop the identifier records, and still not one that is drawn.
    const entry = (props: string[]): UndrawnProps => ({ props, reason: 'r', android: ['Badge'] })
    expect(
      check([entry(['count', 'pinned', 'sticky', 'tone', 'wide', 'BadgeMark.shade'])]),
    ).toEqual([])
    expect(
      check([entry(['count', 'pinned', 'sticky', 'tone', 'wide', 'BadgeMark.shade', 'size'])]),
    ).toEqual([
      'undrawn.ts (count, pinned, sticky, tone, wide, BadgeMark.shade, size): Badge.size is read by its rendering on android — remove it from the entry',
    ])
  })

  it('drawn props follows a local to the identifier, and to a drawing', () => {
    const contract = [
      'data class PMBadgeProps(',
      '    val children: String,',
      '    val pinned: Boolean? = null,',
      '    val sticky: Boolean? = null,',
      '    val wide: Boolean? = null,',
      ')',
    ].join('\n')
    // Each prop is read into a local. `pinned` goes on to the identifier only.
    // So does `sticky`: the `sticky =` of `PMBadgeEdge` is an argument's label,
    // not a use of the local. `wide` also sets the width, so it is drawn.
    const badge = `
      object PMBadge : PMBadgeRendering {
          @Composable
          override fun Render(props: PMBadgeProps) {
              val pinned = props.pinned ?: false
              val sticky = props.sticky ?: false
              val wide = props.wide ?: false
              val attributes = buildMap {
                  if (pinned) put("pinned", "true")
                  if (sticky) put("sticky", "true")
                  if (wide) put("wide", "true")
              }
              PMBadgeEdge(sticky = false) {
                  Text(props.children, if (wide) Modifier.fillMaxWidth() else Modifier)
              }
              Box(Modifier.pmMember("Badge", attributes))
          }
      }
    `
    const recorded = (name: string) =>
      `${name}: the rendering on android writes it into its identifier and draws nothing from it — draw it, or declare it in undrawn.ts with the reason`

    expect(
      undrawnViolations({
        language: 'kotlin',
        platform: 'android',
        contract,
        files: [{ path: 'Badge.kt', source: badge }],
        isFoundation: () => false,
        memberOf: memberOfKotlinFile,
        members: ['Badge'],
        declared: [],
      }),
    ).toEqual([recorded('Badge.pinned'), recorded('Badge.sticky')])
  })

  it('drawn props reads a shape’s field only from a value of that shape', () => {
    const contract = [
      'data class PMRangeFieldProps(',
      '    val items: List<PMRangeFieldItem>,',
      '    val messages: PMRangeFieldMessages? = null,',
      '    val value: PMRangeFieldRange? = null,',
      ')',
      'data class PMRangeFieldMessages(',
      '    val start: String? = null,',
      '    val end: String? = null,',
      '    val clear: String? = null,',
      '    val empty: String? = null,',
      ')',
      'data class PMRangeFieldRange(',
      '    val start: String,',
      '    val end: String,',
      ')',
      'data class PMRangeFieldItem(',
      '    val label: String,',
      '    val hint: String? = null,',
      ')',
    ].join('\n')
    // The member reads its range's `start` and `end`, which are not its
    // messages' `start` and `end`, and neither is the `end` of a foundation
    // class of its own. It reads `clear` through a local and each item's
    // `label` and `hint` through a lambda's parameter, and hands its messages
    // to a foundation function that reads `empty`.
    const member = `
      object PMRangeField : PMRangeFieldRendering {
          @Composable
          override fun Render(props: PMRangeFieldProps) {
              val messages = props.messages
              Text(props.value?.start ?: "")
              Text(props.value?.end ?: "")
              Text(messages?.clear ?: "")
              Text(pmEmptyWord(props.messages))
              props.items.forEach { item -> Text(item.label + (item.hint ?: "")) }
          }
      }
    `
    const foundation = `
      fun pmEmptyWord(messages: PMRangeFieldMessages?): String = messages?.empty ?: ""
      class PMLegendEdge(val end: String)
      fun pmEdge(edge: PMLegendEdge): String = edge.end
    `
    const check = (declared: readonly UndrawnProps[]) =>
      undrawnViolations({
        language: 'kotlin',
        platform: 'android',
        contract,
        files: [
          { path: 'RangeField.kt', source: member },
          { path: 'PolymorphUISample.kt', source: foundation },
        ],
        isFoundation: (path) => path.startsWith('PolymorphUI'),
        memberOf: memberOfKotlinFile,
        members: ['RangeField'],
        declared,
      })
    const undeclared = (name: string) =>
      `${name}: the contract carries it and the rendering on android never reads it — draw it, or declare it in undrawn.ts with the reason`

    expect(check([])).toEqual([
      undeclared('RangeField.RangeFieldMessages.start'),
      undeclared('RangeField.RangeFieldMessages.end'),
    ])
    const entry = (props: string[]): UndrawnProps => ({
      props,
      reason: 'r',
      android: ['RangeField'],
    })
    expect(check([entry(['RangeFieldMessages.start', 'RangeFieldMessages.end'])])).toEqual([])
    expect(
      check([
        entry(['RangeFieldMessages.start', 'RangeFieldMessages.end', 'RangeFieldMessages.empty']),
      ]),
    ).toEqual([
      'undrawn.ts (RangeFieldMessages.start, RangeFieldMessages.end, RangeFieldMessages.empty): RangeField.RangeFieldMessages.empty is read by its rendering on android — remove it from the entry',
    ])
  })
})

/**
 * Events keep their web names and payloads (`design/native/screen-contract.md`,
 * "Members' events"), on Android as on iOS (`laws.test.ts`). Every prop the
 * registry types as a function, on every member the Android platform map
 * renders, is a property of the same name in the generated `PM<Member>Props`
 * (`PM<Member><Part>Props` for a part's prop), and its function type is the one
 * the contract's type table gives in Kotlin: `string` is `String`, `number`
 * `Double`, `boolean` `Boolean`, `T[]` `List<T>`, `T | null` `T?`, a
 * vocabulary type `PM` + its name, a member's type parameter itself, `void`
 * (or a promise of it) as a result `Unit`, a result that is an element a
 * composable slot of the parameters, and a DOM event parameter left out.
 * `ReadonlySet<T>` is `Set<T>`, `Blob` is `ByteArray`, a `ReactNode` is
 * `PMContent`, `[A, B]` is `Pair<A, B>`, a name in `SHAPE_ALIASES` is its
 * shape's, and functions a
 * member's mode chooses between, alike but for a parameter whose branches are
 * a union `UNIONS` names, are one function of that union (`mapping.ts`,
 * `Pass.alike`), as the generator documents.
 *
 * A member listed in `kotlin-pending.ts` has no rendering yet, and its contract
 * may still hold an event it cannot express (`PMUnsupported…`); a member with a
 * rendering may not.
 */
const KOTLIN_CONTRACT = `${KOTLIN_GENERATED}/Contracts.kt`

/** Every props class in the generated Kotlin contract: class → property → its Kotlin type. */
function kotlinContractFields(source: string): Map<string, Map<string, string>> {
  const classes = new Map<string, Map<string, string>>()
  let current: Map<string, string> | null = null
  for (const line of source.split('\n')) {
    const open = /^data class (PM\w+Props)(?:<[^>]*>)?\($/.exec(line)
    if (open !== null) {
      current = new Map()
      classes.set(open[1] as string, current)
    } else if (line === ')') {
      current = null
    } else {
      const field = /^ {4}val `?(\w+)`?: (.+?)(?: = null)?,$/.exec(line)
      if (field !== null && current !== null) current.set(field[1] as string, field[2] as string)
    }
  }
  return classes
}

const DOM_EVENT_TYPES = new Set([
  'Event',
  'MouseEvent',
  'KeyboardEvent',
  'ChangeEvent',
  'FormEvent',
  'FocusEvent',
  'PointerEvent',
])
const CONTENT = new Set(['ReactNode', 'ReactElement', 'JSX.Element'])

const solidOf = (type: TsType) =>
  branches(type).filter((part) => !isKeyword(part, 'undefined') && !isKeyword(part, 'null'))

/** A function type alone, or with `null` or `undefined`: an event prop. */
/**
 * One of React's handler aliases, `ReactEventHandler<T>` and its kin: a
 * function of one DOM event, named rather than written out.
 */
const isHandlerAlias = (part: TsType) =>
  part.kind === 'reference' && /^(?:React\.)?[A-Z]\w*EventHandler$/.test(part.name)

const isEvent = (type: TsType) => {
  const solid = solidOf(type)
  return solid.length > 0 && solid.every((part) => part.kind === 'function' || isHandlerAlias(part))
}

/** `aria-label` → `ariaLabel`, as the contract names a property. */
const camel = (name: string) =>
  name.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase())

/** A Kotlin type made nullable: a function type is parenthesised first. */
const nullable = (type: string) =>
  type.includes('->') && !type.endsWith('?') ? `(${type})?` : `${type}?`

/**
 * A type by the contract's Kotlin type table, or `null` when the table does not
 * map it (a union of unlike types, a literal, an object type).
 */
function byKotlinTable(
  type: TsType,
  parameters: ReadonlySet<string>,
  position: 'value' | 'result' = 'value',
): string | null {
  const solid = solidOf(type)
  if (position === 'result' && solid.length > 0) {
    const settles = solid.every(
      (part) =>
        isKeyword(part, 'void') ||
        (part.kind === 'reference' &&
          part.name === 'Promise' &&
          part.args.length === 1 &&
          isKeyword(part.args[0] as TsType, 'void')),
    )
    if (settles) return 'Unit'
  }
  if (type.kind === 'union') {
    if (
      solid.length === 2 &&
      solid.every((part) => part.kind === 'literal' && typeof part.value === 'boolean')
    )
      return solid.length < type.types.length ? 'Boolean?' : 'Boolean'
    const alias = literalAliasOf(solid)
    if (alias !== null) return solid.length < type.types.length ? nullable(alias) : alias
    const inner =
      solid.length === 1
        ? byKotlinTable(solid[0] as TsType, parameters, position)
        : alikeByKotlinTable(solid, parameters, position)
    if (inner === null) return null
    return solid.length < type.types.length ? nullable(inner) : inner
  }
  switch (type.kind) {
    case 'keyword':
      return { string: 'String', number: 'Double', boolean: 'Boolean' }[type.name] ?? null
    case 'array': {
      const element = byKotlinTable(type.element, parameters)
      return element === null ? null : `List<${element}>`
    }
    case 'tuple': {
      const elements = type.elements.map((element) => byKotlinTable(element, parameters))
      if (elements.includes(null)) return null
      if (elements.length === 2) return `Pair<${elements.join(', ')}>`
      if (elements.length === 3) return `Triple<${elements.join(', ')}>`
      return null
    }
    case 'reference': {
      if (CONTENT.has(type.name.replace(/^React\./, ''))) return 'PMContent'
      if (parameters.has(type.name) && type.args.length === 0) return type.name
      if (type.name === 'Blob' && type.args.length === 0) return 'ByteArray'
      const args = type.args.map((arg) => byKotlinTable(arg, parameters))
      if (args.includes(null)) return null
      if (['ReadonlySet', 'Set'].includes(type.name)) return `Set<${args.join(', ')}>`
      const name = `PM${(SHAPE_ALIASES[type.name] ?? type.name).replace(/\./g, '')}`
      return args.length === 0 ? name : `${name}<${args.join(', ')}>`
    }
    case 'function': {
      const params = type.params
        .filter((param) => {
          const event = solidOf(param.type)
          return !(
            event.length > 0 &&
            event.every(
              (part) =>
                part.kind === 'reference' && DOM_EVENT_TYPES.has(part.name.replace(/^React\./, '')),
            )
          )
        })
        .map((param) => {
          const mapped = byKotlinTable(param.type, parameters)
          return mapped === null || !param.optional ? mapped : nullable(mapped)
        })
      const result = byKotlinTable(type.returns, parameters, 'result')
      if (params.includes(null) || result === null) return null
      if (result === 'PMContent') return `@Composable (${params.join(', ')}) -> Unit`
      return `(${params.join(', ')}) -> ${result.includes('->') ? `(${result})` : result}`
    }
    default:
      return null
  }
}

/**
 * A literal union the web names (`LITERAL_ALIASES` in `mapping.ts`), recognised
 * by its values as the contracts recognise it: `PM<Name>`, the one enum every
 * use shares (ModeSwitch's `onChange` takes a `PMModePreference`). A union in
 * `NAMED_ONLY` is recognised by its name alone, so not here. `null` for any
 * other set of literals.
 */
function literalAliasOf(solid: readonly TsType[]): string | null {
  if (solid.length === 0 || !solid.every((part) => part.kind === 'literal')) return null
  const values = new Set(solid.map((part) => (part.kind === 'literal' ? part.value : undefined)))
  for (const [name, of] of Object.entries(LITERAL_ALIASES)) {
    if (NAMED_ONLY.has(name)) continue
    const known = of(registry)
    if (known.length === values.size && known.every((value) => values.has(value)))
      return `PM${name}`
  }
  return null
}

/**
 * Branches the table holds as one: the same type, or functions alike but for
 * parameters whose types the table maps to the cases of a union `UNIONS`
 * names, which take that union (`mapping.ts`, `Pass.alike`). `null` for any
 * other union.
 */
function alikeByKotlinTable(
  solid: readonly TsType[],
  parameters: ReadonlySet<string>,
  position: 'value' | 'result',
): string | null {
  const named = kotlinUnionOf(solid.map((part) => byKotlinTable(part, parameters)))
  if (named !== undefined) return named
  const mapped = solid.map((part) => byKotlinTable(part, parameters, position))
  if (mapped.includes(null)) return null
  if (new Set(mapped).size === 1) return mapped[0] as string
  const functions = mapped.map((text) => /^\((.*)\) -> (.+)$/.exec(text as string))
  if (functions.includes(null)) return null
  const lists = functions.map((match) => splitTopLevel(match?.[1] ?? ''))
  const results = new Set(functions.map((match) => match?.[2]))
  const arity = (lists[0] as string[]).length
  if (results.size !== 1 || lists.some((list) => list.length !== arity)) return null
  const params: string[] = []
  for (let index = 0; index < arity; index += 1) {
    const at = new Set(lists.map((list) => list[index] as string))
    if (at.size === 1) {
      params.push([...at][0] as string)
      continue
    }
    // A nullable parameter in every branch is the union, nullable.
    const bare = [...at].map((text) => text.replace(/\?$/, ''))
    const optional = [...at].every((text) => text.endsWith('?'))
    const union = kotlinUnionOf(optional ? bare : [...at])
    if (union === undefined) return null
    params.push(optional ? `${union}?` : union)
  }
  return `(${params.join(', ')}) -> ${[...results][0]}`
}

/**
 * The union in `UNIONS` whose cases map, by the table, to exactly `mapped`:
 * `PM` + its name, or `undefined`. A literal case (`false`) maps to itself.
 */
function kotlinUnionOf(mapped: readonly (string | null)[]): string | undefined {
  const wanted = new Set(mapped)
  if (wanted.has(null) || wanted.size < 2) return undefined
  const union = Object.entries(UNIONS).find(([, entry]) => {
    const cases = entry.cases.map((item) => {
      const type = parseType(item.type)
      return type.kind === 'literal' ? JSON.stringify(type.value) : byKotlinTable(type, new Set())
    })
    return cases.length === wanted.size && cases.every((text) => text !== null && wanted.has(text))
  })
  return union === undefined ? undefined : `PM${union[0]}`
}

/** A parameter list split at its top-level commas. */
function splitTopLevel(list: string): string[] {
  const parts: string[] = []
  let depth = 0
  let current = ''
  for (const char of list) {
    if ('([<'.includes(char)) depth += 1
    if (')]>'.includes(char)) depth -= 1
    if (char === ',' && depth === 0) {
      parts.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  if (current.trim() !== '') parts.push(current.trim())
  return parts
}

/** The names a member uses as a type argument and alone, which its Kotlin props are generic over. */
function typeParameters(types: TsType[]): Set<string> {
  const argument = new Set<string>()
  const alone = new Set<string>()
  const visit = (type: TsType, asArgument: boolean): void => {
    if (type.kind === 'reference') {
      ;(asArgument ? argument : alone).add(type.name)
      type.args.forEach((arg) => visit(arg, true))
    } else if (type.kind === 'array') visit(type.element, asArgument)
    else if (type.kind === 'union') type.types.forEach((part) => visit(part, asArgument))
    else if (type.kind === 'function') {
      type.params.forEach((param) => visit(param.type, asArgument))
      visit(type.returns, asArgument)
    }
  }
  types.forEach((type) => visit(type, false))
  return new Set([...argument].filter((name) => alone.has(name) && !CONTENT.has(name)))
}

/** Every event of every member the Android map renders whose contract property breaks the table. */
function kotlinEventViolations(
  source: Registry,
  contract: string,
  pending: readonly string[],
): string[] {
  const classes = kotlinContractFields(contract)
  const rendered = [...source.components, ...source.exceptions.primitives].filter(
    (member) => member.platforms.android.status !== 'absent',
  )
  const faults: string[] = []
  for (const member of rendered) {
    const parsed = member.props.flatMap((prop) => {
      try {
        return [{ prop, type: parseType(prop.type) }]
      } catch {
        return []
      }
    })
    const parameters = typeParameters(parsed.map(({ type }) => type))
    for (const { prop, type } of parsed) {
      if (!isEvent(type)) continue
      const dot = prop.name.lastIndexOf('.')
      const part = dot === -1 ? '' : prop.name.slice(0, dot).replace(/\./g, '')
      const field = camel(dot === -1 ? prop.name : prop.name.slice(dot + 1))
      const props = `PM${member.name}${part}Props`
      const written = classes.get(props)?.get(field)
      const where = `${member.name}.${prop.name}`
      if (written === undefined) {
        faults.push(`${where}: \`${props}\` has no property \`${field}\``)
        continue
      }
      const isNullable = branches(type).some((branch) => isKeyword(branch, 'null'))
      const omittable =
        prop.optional || branches(type).some((branch) => isKeyword(branch, 'undefined'))
      // A handler alias carries only a DOM event, which a native member has no
      // counterpart to, so the contract leaves it unsupported (`Unsupported.kt`).
      if (solidOf(type).every(isHandlerAlias)) {
        if (!written.startsWith('PMUnsupported')) {
          faults.push(
            `${where}: \`${written}\` in the contract, where a handler alias is unsupported`,
          )
        }
        continue
      }
      const function_ =
        solidOf(type).length === 1
          ? byKotlinTable(solidOf(type)[0] as TsType, parameters)
          : alikeByKotlinTable(solidOf(type), parameters, 'value')
      if (function_ === null || written.startsWith('PMUnsupported')) {
        if (pending.includes(member.name)) continue
        faults.push(`${where}: \`${written}\` in the contract, where the table maps no function`)
        continue
      }
      // One level of optionality is `(…)?`; a second wraps it in `PMSome`.
      const once = isNullable || omittable ? `(${function_})?` : function_
      const wanted = isNullable && omittable ? `PMSome<${once}>?` : once
      if (written !== wanted) {
        faults.push(`${where}: \`${written}\` in the contract, and the table gives \`${wanted}\``)
      }
    }
  }
  return faults
}

describe('events keep their web names and payloads, in Kotlin', () => {
  const contract = readFileSync(resolve(ROOT, KOTLIN_CONTRACT), 'utf8')

  it('every event is the contract property of its name, with the function type the table gives', () => {
    expect(kotlinEventViolations(registry, contract, KOTLIN_PENDING)).toEqual([])
  })

  it('reads every event the registry types, so a pass is not vacuous', () => {
    expect(kotlinContractFields(contract).size).toBeGreaterThan(90)
    expect(contract).toContain('    val onClick: (() -> Unit)? = null,\n')
  })

  it('refuses an event whose property is missing or of another type', () => {
    const probe = {
      components: [
        {
          name: 'Probe',
          platforms: { android: { status: 'native' } },
          props: [
            { name: 'onPick', type: '((value: string) => void) | undefined', optional: true },
            { name: 'onGone', type: '() => void', optional: false },
          ],
        },
      ],
      exceptions: { primitives: [] },
    } as unknown as Registry
    expect(
      kotlinEventViolations(
        probe,
        'data class PMProbeProps(\n    val onPick: ((Double) -> Unit)? = null,\n)',
        [],
      ),
    ).toEqual([
      'Probe.onPick: `((Double) -> Unit)?` in the contract, and the table gives `((String) -> Unit)?`',
      'Probe.onGone: `PMProbeProps` has no property `onGone`',
    ])
  })
})
