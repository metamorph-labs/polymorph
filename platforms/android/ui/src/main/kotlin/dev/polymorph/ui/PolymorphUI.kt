// The foundation every PolymorphUI member is built on. Written by hand;
// `src/generated/kotlin` is written by `pnpm native:contracts` at the repository
// root and never edited by hand.
//
// A member is one file, `<Member>.kt`, declaring `PM<Member>`, an object that
// implements the generated `PM<Member>Rendering` (it draws from the generated
// `PM<Member>Props`), and `<Member>States`, its states fixture. The laws in
// `packages/native/src/kotlin-laws.test.ts` hold every member file to that
// shape, to theme tokens for every value, to no literal user-facing text, and
// to a short list of imports. This file is exempt from the token and literal
// laws: it is where the platform meets the tokens and where Material 3 is
// given the pairing. The drawing parts several members share are in the
// foundation's further files, `PolymorphUI<Topic>.kt`, which every law but
// conformance holds.

package dev.polymorph.ui

import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.Easing
import androidx.compose.animation.core.FiniteAnimationSpec
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.indication
import androidx.compose.foundation.interaction.InteractionSource
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.ripple.RippleAlpha
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.LocalMinimumInteractiveComponentSize
import androidx.compose.material3.LocalRippleConfiguration
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RippleConfiguration
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.material3.ripple
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.draw.dropShadow
import androidx.compose.ui.draw.innerShadow
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.LinearGradientShader
import androidx.compose.ui.graphics.Shader
import androidx.compose.ui.graphics.ShaderBrush
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.shadow.Shadow
import androidx.compose.ui.graphics.vector.rememberVectorPainter
import androidx.compose.ui.layout.layout
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.SemanticsPropertyKey
import androidx.compose.ui.semantics.SemanticsPropertyReceiver
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.testTag
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.LineHeightStyle
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.DpOffset
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import dev.polymorph.tokens.PMControlHeights
import dev.polymorph.tokens.PMDensity
import dev.polymorph.tokens.PMDisplayStyle
import dev.polymorph.tokens.PMDynamicColor
import dev.polymorph.tokens.PMEasing
import dev.polymorph.tokens.PMFont
import dev.polymorph.tokens.PMGradient
import dev.polymorph.tokens.PMRgba
import dev.polymorph.tokens.PMShadow
import dev.polymorph.tokens.PMSpring
import dev.polymorph.tokens.PMTextStyle
import dev.polymorph.tokens.PMTheme
import dev.polymorph.tokens.PMThemes
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.sin

/* Content ------------------------------------------------------------------ */

/** A renderable child: what the web types as `ReactNode` or an element. */
typealias PMContent = @Composable () -> Unit

/**
 * A value given, which may itself be null: the second level of an optional
 * prop whose type admits `null`, Swift's `T??`. A Select's `value` is absent
 * (`null`: the Select holds its own choice) or given (`PMSome(null)`: the app
 * holds it, and nothing is chosen).
 */
data class PMSome<out T>(val value: T)

/* Data --------------------------------------------------------------------- */

/**
 * Any JSON value: what the web types as `unknown` where a member shows data it
 * does not interpret (JsonTree's `data`, ToolCall's `input`). An object keeps
 * its members in the order given, as a parsed JSON object keeps its keys.
 * `PMJSONValue.of` converts the values a JSON parser gives in Kotlin (maps,
 * lists, strings, numbers, booleans and null).
 */
sealed interface PMJSONValue {
    data object Null : PMJSONValue
    data class Bool(val value: Boolean) : PMJSONValue
    data class Number(val value: Double) : PMJSONValue
    data class Text(val value: String) : PMJSONValue
    data class Array(val items: List<PMJSONValue>) : PMJSONValue
    data class Object(val members: List<PMJSONMember>) : PMJSONValue

    companion object {
        /**
         * `value` as JSON: a map is an object, its keys as strings; a list or
         * an array is an array; anything that is not JSON is its string form,
         * as the web's JsonTree shows a value JSON cannot hold.
         */
        fun of(value: Any?): PMJSONValue = when (value) {
            null -> Null
            is PMJSONValue -> value
            is Boolean -> Bool(value)
            is kotlin.Number -> Number(value.toDouble())
            is String -> Text(value)
            is Map<*, *> -> Object(value.map { (key, item) -> PMJSONMember(key.toString(), of(item)) })
            is Iterable<*> -> Array(value.map { of(it) })
            is kotlin.Array<*> -> Array(value.map { of(it) })
            else -> Text(value.toString())
        }
    }
}

/** One member of a JSON object: its key and its value. */
data class PMJSONMember(val key: String, val value: PMJSONValue)

/**
 * A file a person chose: the web's `File`, as much of it as a member reads.
 * `uri` is where the app reads it from (a content URI on Android); `size` is
 * in bytes; `type` is the media type, such as `application/pdf`, and empty
 * when it is unknown, as a browser leaves a dropped file's `type`.
 */
data class PMFile(val uri: String, val name: String, val size: Double, val type: String = "")

/* Sizes -------------------------------------------------------------------- */

/** The size scale every sized control shares, `ControlSize` on the web. */
enum class PMControlSize(val value: String) {
    Sm("sm"),
    Md("md"),
    Lg("lg"),
}

/** The density's control height for a size, in dp. */
operator fun PMControlHeights.get(size: PMControlSize): Dp = when (size) {
    PMControlSize.Sm -> sm.dp
    PMControlSize.Md -> md.dp
    PMControlSize.Lg -> lg.dp
}

/** A density's space scale in dp, by step: `space.s4`, as the Swift package names it. */
@Immutable
class PMSpace(private val steps: List<Float>) {
    operator fun get(step: PMSpaceStep): Dp = steps[step.value].dp
    val s0: Dp get() = steps[0].dp
    val s1: Dp get() = steps[1].dp
    val s2: Dp get() = steps[2].dp
    val s3: Dp get() = steps[3].dp
    val s4: Dp get() = steps[4].dp
    val s5: Dp get() = steps[5].dp
    val s6: Dp get() = steps[6].dp
    val s7: Dp get() = steps[7].dp
    val s8: Dp get() = steps[8].dp
    val s9: Dp get() = steps[9].dp
    val s10: Dp get() = steps[10].dp
}

/** The density's space scale, by step. */
val PMDensity.spacing: PMSpace get() = PMSpace(space)

/* Theme -------------------------------------------------------------------- */

/**
 * The pairing every member reads its tokens from. An app provides it at its
 * root (`ProvidePMTheme`, or `CompositionLocalProvider(LocalPMTheme provides
 * theme)`); unprovided, it is the web's default pairing, `PMThemes.default`.
 */
val LocalPMTheme = staticCompositionLocalOf { PMThemes.default }

/**
 * Whether members draw the pairing's dark values. Unprovided, they follow the
 * system's mode (`isSystemInDarkTheme`), as a SwiftUI colour follows the
 * environment's scheme.
 */
val LocalPMDark = compositionLocalOf<Boolean?> { null }

/** What a member reads from the composition: the pairing and the mode. */
object PM {
    val theme: PMTheme
        @Composable @ReadOnlyComposable get() = LocalPMTheme.current

    val dark: Boolean
        @Composable get() = LocalPMDark.current ?: isSystemInDarkTheme()
}

/**
 * Renders `content` under `theme`, in `dark` mode or the system's, with
 * Material 3 given the pairing (`PMMaterialTheme`), so an app's own Material
 * components match the members around them.
 */
@Composable
fun ProvidePMTheme(theme: PMTheme, dark: Boolean? = null, content: @Composable () -> Unit) {
    CompositionLocalProvider(LocalPMTheme provides theme, LocalPMDark provides dark) {
        PMMaterialTheme(content)
    }
}

/* Colour ------------------------------------------------------------------- */

/** The colour as Compose draws it. */
val PMRgba.color: Color get() = Color(argb)

/** The colour in the mode members draw in. */
val PMDynamicColor.color: Color
    @Composable get() = resolve(PM.dark).color

/* Type --------------------------------------------------------------------- */

/**
 * The font family an app bundles for a family name the pairing names, or null
 * when it bundles none. A pairing names its families (`theme.fonts`) and does
 * not carry the files; until an app provides them, each type step falls back
 * to the system font of its slot's fallback design.
 */
val LocalPMFontFamilies = staticCompositionLocalOf<(PMFont) -> FontFamily?> { { null } }

private fun fallback(font: PMFont): FontFamily = when (font.fallback) {
    "serif" -> FontFamily.Serif
    "mono" -> FontFamily.Monospace
    else -> FontFamily.SansSerif
}

private fun PMTheme.font(slot: String): PMFont = when (slot) {
    "display" -> fonts.display
    "mono" -> fonts.mono
    else -> fonts.body
}

/**
 * The CSS line box: the line height's extra space split evenly above and
 * below the glyphs, and none trimmed, so a step stands as tall as on the web.
 */
private val webLineHeight = LineHeightStyle(LineHeightStyle.Alignment.Center, LineHeightStyle.Trim.None)

private fun textStyle(
    theme: PMTheme,
    families: (PMFont) -> FontFamily?,
    size: Float,
    lineHeight: Float,
    weight: Int,
    tracking: Float,
    slot: String,
    italic: Boolean,
): TextStyle {
    val font = theme.font(slot)
    return TextStyle(
        fontSize = size.sp,
        lineHeight = lineHeight.em,
        letterSpacing = tracking.em,
        fontWeight = FontWeight(weight),
        fontStyle = if (italic || font.style == "italic") FontStyle.Italic else FontStyle.Normal,
        fontFamily = families(font) ?: fallback(font),
        lineHeightStyle = webLineHeight,
    )
}

/** A type step of `theme` as a Compose text style, its family the app's or the fallback's. */
fun PMTextStyle.toTextStyle(theme: PMTheme, families: (PMFont) -> FontFamily? = { null }): TextStyle =
    textStyle(theme, families, size, lineHeight, weight, tracking, slot, italic = false)

/** A display step of `theme` as a Compose text style. */
fun PMDisplayStyle.toTextStyle(theme: PMTheme, families: (PMFont) -> FontFamily? = { null }): TextStyle =
    textStyle(theme, families, size, lineHeight, weight, tracking, slot, italic = style == "italic")

/** The step as members draw it: in the pairing's fonts as the app provides them. */
val PMTextStyle.textStyle: TextStyle
    @Composable @ReadOnlyComposable get() = toTextStyle(LocalPMTheme.current, LocalPMFontFamilies.current)

/** The display step as members draw it. */
val PMDisplayStyle.textStyle: TextStyle
    @Composable @ReadOnlyComposable get() = toTextStyle(LocalPMTheme.current, LocalPMFontFamilies.current)

/** The step's line box in dp: its size times its line height. */
val PMTextStyle.lineBox: Float get() = size * lineHeight

/**
 * The inset that centres a part `inner` dp tall in a space `outer` dp tall:
 * half the difference, never negative. Geometry, so the halving is no design
 * value: a box on a label's first line, a row in a control's height.
 */
fun centringInset(outer: Float, inner: Float): Dp = (kotlin.math.max(0f, outer - inner) / 2).dp

/** This step with another step's weight: the scale owns both, so a weight that marks a level is one it decided. */
fun PMTextStyle.weighted(like: PMTextStyle): PMTextStyle = copy(weight = like.weight)

/**
 * This step set in the pairing's mono face: its size, line height, weight and
 * tracking kept, as the recipes set code (`--pm-font-mono` at a text step).
 */
fun PMTextStyle.mono(theme: PMTheme): PMTextStyle = copy(family = theme.fonts.mono.family, slot = "mono")

/**
 * Tabular figures, in the pairing's own font, while `on`: the numeral
 * features the system sets (`theme.numeric`), so a column of numbers lines up.
 */
fun TextStyle.tabular(theme: PMTheme, on: Boolean = true): TextStyle =
    if (on && theme.numeric.isNotEmpty()) copy(fontFeatureSettings = theme.numeric.joinToString(", ") { "\"$it\"" }) else this

/* Gradients ---------------------------------------------------------------- */

/**
 * The gradient as the stylesheet draws it across a box: the CSS angle (0
 * points up, 90 right), the line through the centre long enough that the
 * corners take the end colours, and the stops where the pairing puts them.
 */
val PMGradient.brush: Brush
    get() = object : ShaderBrush() {
        override fun createShader(size: Size): Shader {
            val radians = angle * PI.toFloat() / 180f
            val dx = sin(radians)
            val dy = -cos(radians)
            val half = (abs(size.width * dx) + abs(size.height * dy)) / 2f
            val centre = Offset(size.width / 2f, size.height / 2f)
            return LinearGradientShader(
                from = Offset(centre.x - dx * half, centre.y - dy * half),
                to = Offset(centre.x + dx * half, centre.y + dy * half),
                colors = stops.map { it.color.color },
                colorStops = stops.map { it.at },
            )
        }
    }

/* Shape and depth ---------------------------------------------------------- */

/** A corner radius from the theme as a shape. */
fun PMTheme.rounded(radius: Float): RoundedCornerShape = RoundedCornerShape(radius.dp)

/**
 * A shadow's outer layers, as the stylesheet's `box-shadow` draws them: each
 * layer's offset, blur and spread, in its colour, the first layer on top. The
 * inset layers are `pmInsetShadow`'s, which sits above the fill.
 */
fun Modifier.pmShadow(shadow: PMShadow, shape: Shape): Modifier =
    shadow.layers.filter { !it.inset }.asReversed().fold(this) { modifier, layer ->
        modifier.dropShadow(
            shape,
            Shadow(
                radius = layer.blur.dp,
                color = layer.color.color,
                spread = layer.spread.dp,
                offset = DpOffset(layer.x.dp, layer.y.dp),
            ),
        )
    }

/**
 * A shadow's inset layers, inside `shape` and above the fill under it: the lit
 * fill's top light, which every pairing writes with no blur and no spread.
 */
fun Modifier.pmInsetShadow(shadow: PMShadow, shape: Shape): Modifier =
    shadow.layers.filter { it.inset }.asReversed().fold(this) { modifier, layer ->
        modifier.innerShadow(
            shape,
            Shadow(
                radius = layer.blur.dp,
                color = layer.color.color,
                spread = layer.spread.dp,
                offset = DpOffset(layer.x.dp, layer.y.dp),
            ),
        )
    }

/** Lengths that are geometry rather than design decisions, so no theme holds them. */
object PMGeometry {
    /**
     * The narrowest window Material calls medium rather than compact: below
     * it the window is a phone's, where a DataTable is a list and an AppShell's
     * rail is a drawer. A window class, not a theme value.
     */
    val compactWidth: Dp = 600.dp

    /**
     * The recipes' `1px` border: one dp at every display density, as every
     * border here is.
     */
    val hairline: Dp = 1.dp

    /**
     * The recipes' `text-underline-offset: 2px` (`link.md`): the gap between a
     * line's baseline and a link's underline, which a member draws itself
     * because Compose's underline takes the font's position and the text's
     * colour.
     */
    val underlineOffset: Dp = 2.dp

    /**
     * The recipes' `sideOffset={2}` (`select.md`, `menu.md`): the gap between
     * an anchored list and its trigger, the anchored-surface constant.
     */
    val anchorOffset: Dp = 2.dp

    /**
     * Popover's `sideOffset: 4` (`popover.md`): a little further from its
     * trigger than a list, because it is a surface with content of its own.
     */
    val popoverOffset: Dp = 4.dp

    /**
     * A rem in dp (`platforms/android/README.md`, "Names and units"): the unit
     * the specs write breakpoints in. A breakpoint is geometry, not theme: one
     * that moved with density would change a layout for a person who only
     * asked for denser controls.
     */
    val rem: Dp = 16.dp

    /**
     * The recipes' `2px` between a line and the smaller line under it
     * (Stepper's description, Timeline's time). The recipes write it as a
     * length, not a space step, so it is the same at every density.
     */
    val subline: Dp = 2.dp

    /**
     * The recipes' `2px` stroke of prose (`streaming-text.md`, `markdown.md`,
     * `reasoning-disclosure.md`): the caret's width and the quote rule's. A
     * stroke, not a measure, so the same in every pairing.
     */
    val proseStroke: Dp = 2.dp

    /** The caret's corner radius: the recipe's `1px`. */
    val caretRadius: Dp = 1.dp

    /**
     * `length` taken on both edges of an axis, as the recipes write
     * `calc(100vw - var(--pm-space-7) * 2)`: a margin or an inset at the start
     * and the end, or the top and the bottom. The two is the edges an axis
     * has, not a design value, so a member doubles an inset here, and the
     * token law refuses a token multiplied by a number anywhere else.
     */
    fun bothEdges(length: Dp): Dp = length * 2
}

/**
 * A hairline rule in `color`: the recipes' `1px` border. Horizontal, it takes
 * the width it is offered; vertical, the height. It is decorative, so it
 * exposes nothing to accessibility.
 */
@Composable
fun PMRule(color: PMDynamicColor, modifier: Modifier = Modifier, vertical: Boolean = false) {
    val fill = color.color
    Box(
        modifier
            .then(if (vertical) Modifier.width(PMGeometry.hairline) else Modifier.fillMaxWidth().height(PMGeometry.hairline))
            .background(fill),
    )
}

/* Motion ------------------------------------------------------------------- */

/** The easing as Compose's cubic Bézier. */
val PMEasing.easing: Easing get() = CubicBezierEasing(x1, y1, x2, y2)

/** A tween of `durationMillis` on this easing, the temperament's control transition. */
fun <T> PMEasing.tween(durationMillis: Int): FiniteAnimationSpec<T> = tween(durationMillis, easing = easing)

/** The spring as Compose's, which assumes a unit mass. */
fun <T> PMSpring.spec(): FiniteAnimationSpec<T> = spring(dampingRatio = dampingRatio, stiffness = stiffness / mass)

/* Identity ----------------------------------------------------------------- */

/**
 * A member's name on its root, as the web's `data-member`: `member:<Name>`
 * followed by the attributes the rendering exposes as ` key=value`, sorted by
 * key, as the web's `data-*` attributes. A value's spaces and percent signs are
 * percent-encoded (`%20`, `%25`), because some values are the app's own (a
 * tab's `value`, a row's id) and a space would split the pair. It is the Swift
 * identifier's format, encoding included, so one tool reads both.
 */
@Immutable
class PMMember(val name: String, val attributes: Map<String, String> = emptyMap()) {
    /** `member:Badge tone=neutral variant=soft`. */
    val identifier: String
        get() = (listOf("member:$name") + attributes.toSortedMap().map { (key, value) -> "$key=${encode(value)}" })
            .joinToString(" ")

    override fun equals(other: Any?): Boolean =
        other is PMMember && other.name == name && other.attributes == attributes

    override fun hashCode(): Int = 31 * name.hashCode() + attributes.hashCode()

    override fun toString(): String = identifier

    companion object {
        /** The member and attributes an identifier carries, or null when it is not a member's. */
        fun parse(identifier: String): PMMember? {
            val words = identifier.split(" ").filter { it.isNotEmpty() }
            val first = words.firstOrNull() ?: return null
            if (!first.startsWith("member:")) return null
            val attributes = mutableMapOf<String, String>()
            for (word in words.drop(1)) {
                val equals = word.indexOf('=')
                if (equals == -1) return null
                attributes[word.substring(0, equals)] = decode(word.substring(equals + 1))
            }
            return PMMember(first.removePrefix("member:"), attributes)
        }

        /** A value with its percent signs and spaces encoded, the percent signs first, so `parse` reads back exactly what was written. */
        fun encode(value: String): String = value.replace(PERCENT, ENCODED_PERCENT).replace(SPACE, ENCODED_SPACE)

        /** A value as written before `encode`: its two escapes read back in one pass, so `%2520` is `%20`. */
        private fun decode(value: String): String =
            ESCAPES.replace(value) { if (it.value == ENCODED_PERCENT) PERCENT else SPACE }

        private const val PERCENT = "%"
        private const val SPACE = " "
        private const val ENCODED_PERCENT = "%25"
        private const val ENCODED_SPACE = "%20"
        private val ESCAPES = Regex("%25|%20")
    }
}

/**
 * The semantics key a member's root carries. The rendering harness reads it
 * from the semantics tree; on a device the same identifier is the root's test
 * tag, which UI Automator reads as its resource id when the app sets
 * `testTagsAsResourceId`.
 */
val PMMemberKey = SemanticsPropertyKey<PMMember>("PMMember")

/** The member this node is the root of. */
var SemanticsPropertyReceiver.pmMember by PMMemberKey

/** Marks the node as the root of the member `name`, exposing `attributes`. */
fun Modifier.pmMember(name: String, attributes: Map<String, String> = emptyMap()): Modifier {
    val member = PMMember(name, attributes)
    return semantics {
        pmMember = member
        testTag = member.identifier
    }
}

/* Announcements ------------------------------------------------------------ */

/**
 * A polite live region that draws nothing: TalkBack reads `text` each time it
 * changes, as it reads the web's visually hidden `aria-live="polite"` region,
 * and null says nothing. A member says through it what it does not show as
 * text: a copy's outcome, a list's count, a file's upload, a value removed.
 * It takes no room in its parent's layout and is one pixel square inside,
 * because Android leaves a node with no size out of the accessibility tree,
 * and a region outside the tree is never read. A parent that spaces its
 * children still puts its gap beside it, so a member draws it in a box, or
 * in a column without spacing. What a member shows as text and also
 * announces (a selection's count) is a live region of its own instead.
 */
@Composable
fun PMAnnouncement(text: String?, modifier: Modifier = Modifier) {
    Box(
        modifier
            .layout { measurable, _ ->
                val pixel = measurable.measure(Constraints.fixed(1, 1))
                layout(0, 0) { pixel.placeRelative(0, 0) }
            }
            .semantics {
                liveRegion = LiveRegionMode.Polite
                text?.let { contentDescription = it }
            },
    )
}

/* States ------------------------------------------------------------------- */

/**
 * One state a member promises: its name, its rendering, and what the
 * rendering exposes. `expect` maps an attribute the root's member identifier
 * carries (`variant`, `tone`) to its value. Four keys mean something else:
 *
 * - `label` and `value` are what an assistive client reads on the root: its
 *   content description or text, and its state description.
 * - `hidden` set to `"true"` marks a decorative state (a plain Separator, an
 *   unlabelled Skeleton): the root hides itself from accessibility and nothing
 *   under it is read.
 * - `contains` lists members, comma-separated (`"Alert,Input"`), each of which
 *   must be the member of some node inside the root: a page archetype's state
 *   draws the affordance the screen contract names.
 */
class PMStateEntry(
    val name: String,
    val expect: Map<String, String> = emptyMap(),
    val render: PMContent,
) {
    /** The members `expect` says the rendering holds. */
    val contains: List<String>
        get() = expect["contains"]?.split(",")?.map { it.trim() }?.filter { it.isNotEmpty() } ?: emptyList()

    /** Whether the state is decorative and exposes nothing. */
    val hidden: Boolean get() = expect["hidden"] == "true"
}

/**
 * A member's states fixture: every state it promises. The rendering harness
 * (`src/test/kotlin`) renders each entry under two pairings and checks that its
 * root carries the member's identifier and what `expect` says.
 */
interface PMStates {
    /** The member's name, as the registry spells it. */
    val member: String
    val entries: List<PMStateEntry>
}

/** Every states fixture the member files declare. `Fixtures.kt` lists them (`PMFixtures.all`). */
object PMFixtures

/** Every member with a rendering. `Members.kt` lists them (`PMRenderings.names`). */
object PMRenderings

/* The catalogue ------------------------------------------------------------ */

/** How a member renders on Android, from the platform map (`design/platforms/android.json`). */
enum class PMPlatformStatus {
    /** In its own form, from the platform's own primitives. */
    Native,

    /** Rendered another way; `rendersAs` says how. */
    Adapted,

    /** Not rendered; `substitute` names what to use instead. */
    Absent,
}

data class PMCatalogueEntry(
    val name: String,
    val status: PMPlatformStatus,
    val rendersAs: String? = null,
    val substitute: String? = null,
)

/** The vocabulary on Android. `Catalogue.kt` lists the members (`PMCatalogue.members`). */
object PMCatalogue

/** A prop whose TypeScript type the contract mapping cannot express yet. */
data class PMUnsupportedProp(
    val member: String,
    val prop: String,
    val typescript: String,
    val reason: String,
)

/** The contracts' gaps. `Unsupported.kt` lists them (`PMUnsupported.props`). */
object PMUnsupported

/* Load status -------------------------------------------------------------- */

/**
 * What a page archetype draws in its body: the data is loading, it is ready,
 * there is none, or loading it failed (`design/native/screen-contract.md`,
 * "The four load states"). Every archetype but `AppShell` takes it as
 * `loadStatus`, a prop the native contract adds, and switches on it
 * exhaustively, so no screen can ship without all four.
 */
sealed interface PMLoadStatus {
    data object Loading : PMLoadStatus
    data object Ready : PMLoadStatus
    data object Empty : PMLoadStatus
    data class Failed(val message: String) : PMLoadStatus
}

/** The state's name: `loading`, `ready`, `empty` or `failed`. */
val PMLoadStatus.kind: String
    get() = when (this) {
        PMLoadStatus.Loading -> "loading"
        PMLoadStatus.Ready -> "ready"
        PMLoadStatus.Empty -> "empty"
        is PMLoadStatus.Failed -> "failed"
    }

/* Icons -------------------------------------------------------------------- */

/**
 * The icon gateway: a role drawn as its Material Symbols glyph (`symbolName`,
 * generated from each role's `android` in `design/icons.json`; `Icons.kt` holds
 * the vectors), in a square at the theme's icon size for `size`, in the
 * content colour around it. An icon is decorative, because the text beside it
 * carries the meaning, so it exposes nothing to accessibility. Members draw
 * icons only through this composable; the laws refuse an icon or an image
 * drawn any other way.
 *
 * Material's glyphs are drawn on a 24-unit grid that keeps 2 units clear on
 * every side, as the web's are, so the vector fills the box and draws as large
 * as the web's glyph.
 *
 * `filled` draws the role's filled glyph (`filledVector`), where the icon
 * library has one: Rating's star, filled up to the score over the outline. A
 * role without one draws its outline.
 */
@Composable
fun PMIconView(
    role: PMIconRole,
    size: PMControlSize = PMControlSize.Md,
    modifier: Modifier = Modifier,
    tint: Color = LocalContentColor.current,
    filled: Boolean = false,
) {
    val icons = PM.theme.icon
    val box = when (size) {
        PMControlSize.Sm -> icons.sm.size
        PMControlSize.Md -> icons.md.size
        PMControlSize.Lg -> icons.lg.size
    }.dp
    Image(
        painter = rememberVectorPainter((if (filled) role.filledVector else null) ?: role.vector),
        contentDescription = null,
        modifier = modifier.size(box),
        colorFilter = ColorFilter.tint(tint),
    )
}

/* Clipboard ---------------------------------------------------------------- */

/**
 * What puts plain text on the system clipboard, as the web's
 * `navigator.clipboard.writeText` does for a copy control (CodeBlock's,
 * CopyButton). Compose's suspending `Clipboard` takes a `ClipEntry`, which only
 * a platform's own code can build from text, and this module is one source set
 * for the JVM and Android targets, so the copy goes through the text clipboard
 * manager both targets implement.
 */
@Composable
fun rememberPMCopy(): (String) -> Unit {
    @Suppress("DEPRECATION")
    val clipboard = LocalClipboardManager.current
    return remember(clipboard) { { text -> clipboard.setText(AnnotatedString(text)) } }
}

/* Hit target --------------------------------------------------------------- */

/**
 * The hit area of a pressable part: at least the density's `hitTarget` (48dp
 * on Android) on each axis it reserves, both by default, with the drawn part
 * at `alignment` inside it (centred by default), as Material's
 * `minimumInteractiveComponentSize` reserves its 48dp, at the theme's size.
 * The area is part of the layout, so it is the part's own. Compose also
 * extends a small pressable's touch bounds to 48dp without changing the
 * layout, but Android publishes a node's touch area less what a later sibling
 * covers and what lies outside the window, so that extension is cut wherever
 * a neighbour or an edge is near.
 *
 * Apply the pressable and its semantics before it, so the area is the node's,
 * and the drawing modifiers after it, so the part draws at its own size. A
 * part inside a container that reserves the hit target on one axis and
 * centres the part on it (an embedded button inside a field's own hit area)
 * reserves only the other axis: Compose's extension on the first axis then
 * stays inside the container's area.
 */
@Composable
fun Modifier.pmHitTarget(
    horizontal: Boolean = true,
    vertical: Boolean = true,
    alignment: Alignment = Alignment.Center,
): Modifier {
    val target = PM.theme.defaultDensity.hitTarget.dp
    return layout { measurable, constraints ->
        val placeable = measurable.measure(constraints)
        val least = target.roundToPx()
        val width = if (horizontal) maxOf(placeable.width, least.coerceAtMost(constraints.maxWidth)) else placeable.width
        val height = if (vertical) maxOf(placeable.height, least.coerceAtMost(constraints.maxHeight)) else placeable.height
        layout(width, height) {
            placeable.place(alignment.align(IntSize(placeable.width, placeable.height), IntSize(width, height), layoutDirection))
        }
    }
}

/* Focus ring --------------------------------------------------------------- */

/**
 * The focus mark (`design/components/README.md`, "Focus ring"): an outline of
 * `focus.width` in `border.focusSolid`, at `focus.offset` from the part's own
 * shape. The derived offset is minus the width, so the line lies inside the
 * part's edge and covers its border; a system's offset of 0 or more draws it
 * outside. The part's shape chooses one of the web's three placements:
 *
 * - inside the edge, the default, for a part with padding around its content;
 *   a part whose border carries state (an invalid field, a selected day)
 *   passes `stateBorder`, and the line moves in past that hairline;
 * - inside a fill with a gap: a part with a solid fill passes `onFill`, the
 *   colour the label laws hold on that fill, and the line takes it and moves
 *   in by one more width, so the fill shows on both sides of it;
 * - around with a gap: a part that cannot hold the line inside it passes
 *   `around`, and the line lies `spacing.s1` outside it in the focus colour, in
 *   every state. That is a control too small for the line, and a part whose
 *   box is its text, where a line inside would cross the first and last
 *   letters and a line on the edge would touch them.
 *
 * The fill and the state border apply only while the mark lies inside the
 * edge; outside it the line is the focus colour at the system's offset.
 * The outline is the accessibility surface; the web's decorative glow is not
 * drawn. A part that takes keyboard or text focus draws it while focused, the
 * web's `:focus-visible`: Button, Checkbox's box, Switch's track, Card's link,
 * Input and Select's field, and DataTable's rows and sort headers. Put it
 * outside any clip of the part, so a mark a system draws outside the edge is
 * not cut.
 */
@Composable
fun Modifier.pmFocusRing(
    visible: Boolean,
    cornerRadius: Dp,
    onFill: Color? = null,
    stateBorder: Boolean = false,
    around: Boolean = false,
): Modifier {
    val theme = PM.theme
    val offsetDp = theme.focus.offset.dp
    val inside = theme.focus.offset < 0f
    val fill = onFill.takeIf { inside && !around }
    val color = fill ?: theme.colors.borderFocusSolid.color
    val width = theme.focus.width.dp
    val offset = when {
        around -> maxOf(theme.defaultDensity.spacing.s1, offsetDp)
        !inside -> offsetDp
        else -> offsetDp - (if (fill != null) width else 0.dp) - (if (stateBorder) PMGeometry.hairline else 0.dp)
    }
    // The stroke is centred on its path, so the path lies half the width out
    // from the offset.
    val outset = offset + width / 2
    return if (!visible) this else drawWithContent {
        drawContent()
        val grow = outset.toPx()
        val radius = (cornerRadius + outset).coerceAtLeast(0.dp).toPx()
        drawRoundRect(
            color = color,
            topLeft = Offset(-grow, -grow),
            size = Size(size.width + grow * 2, size.height + grow * 2),
            cornerRadius = CornerRadius(radius, radius),
            style = Stroke(width.toPx()),
        )
    }
}

/* Press feedback ----------------------------------------------------------- */

/**
 * The `press-feedback` micro-pattern (`design/motion/motion.md`, "Press
 * feedback"): down, the temperament's `pressScale` over half the control
 * duration on the standard easing; up, the `snappy` spring back. The `none`
 * temperament's scale is 1, so it leaves the colour states to carry the press.
 */
@Composable
fun Modifier.pmPressFeedback(pressed: Boolean): Modifier {
    val motion = PM.theme.defaultMotion
    val scale by animateFloatAsState(
        targetValue = if (pressed) motion.pressScale else 1f,
        animationSpec = if (pressed) motion.easing.standard.tween(motion.duration.control / 2) else motion.spring.snappy.spec(),
        label = "press",
    )
    return graphicsLayer {
        scaleX = scale
        scaleY = scale
    }
}

/**
 * A press drawn as Android draws one: a ripple from the touch point, in
 * `color` at its full strength, so the wave is the recipe's active fill. It
 * draws only the press: hover and focus are the recipe's own colours. Put it
 * under the part's content, in a layer the size of the part and clipped to its
 * shape, so the label stays above the wave.
 */
@Composable
fun PMPressLayer(interactionSource: InteractionSource, color: Color, modifier: Modifier = Modifier) {
    CompositionLocalProvider(LocalRippleConfiguration provides RippleConfiguration(color, pressOnly)) {
        Box(modifier.indication(interactionSource, ripple()))
    }
}

/** The ripple's strength in each interaction: the press at full strength, nothing else. */
private val pressOnly = RippleAlpha(draggedAlpha = 0f, focusedAlpha = 0f, hoveredAlpha = 0f, pressedAlpha = 1f)

/* Spec defaults ------------------------------------------------------------ */

// `PMStrings`, every default a spec names for text a member speaks (the clear
// button's name, a dialog's close, a page's retry, DataTable's messages), is
// generated into `Strings.kt` from `packages/native/src/strings.ts`, which
// holds each to the spec that names it. A member uses one only when its prop is
// absent, and an app translates them through `LocalPMStrings`. The literal law
// refuses a string a person reads in a member, so every default a member speaks
// is one a spec names.

/** The defaults members speak; an app provides its translations here. */
val LocalPMStrings = staticCompositionLocalOf { PMStrings() }

/** The defaults a spec names, as members read them. */
object PMSpecDefault {
    val strings: PMStrings
        @Composable @ReadOnlyComposable get() = LocalPMStrings.current

    /** Toast's `durationMs` (`toast.md`): how long a toast stays, in milliseconds. */
    const val toastDurationMs: Double = 5000.0

    /**
     * How long a copy control shows its confirmation, in milliseconds
     * (`code-block.md`, `copy-button.md`): long enough to be seen after the
     * eye returns from the press, short enough never to look stuck.
     */
    const val copyFeedbackMs: Long = 2000

    /** ColorInput's `defaultValue` (`color-input.md`): a mid grey. */
    const val colorValue: String = "#888888"

    /**
     * Badge's `max` (`badge.md`): the largest count drawn as it is, so a count
     * keeps to two places.
     */
    const val badgeMax: Double = 99.0

    /** ImageEditor's `exportSize` (`image-editor.md`): the exported image's longest edge, in pixels. */
    const val imageEditorExportSize: Double = 512.0

    /** ImageEditor's `maxZoom` (`image-editor.md`): the most it zooms, as a multiple of cover. */
    const val imageEditorMaxZoom: Double = 4.0

    /**
     * ImageEditor's `messages` (`image-editor.md`): the web member's English,
     * which an app replaces by passing `messages`, the member's one way to
     * localise its words, as the SwiftUI member's defaults are.
     */
    val imageEditorMessages = PMImageEditorMessages(
        title = "Add an image",
        hint = "Drop, paste, or browse",
        browse = "Browse files",
        rotate = "Rotate 90 degrees",
        flip = "Flip horizontally",
        reset = "Reset framing",
        zoom = "Zoom",
        cancel = "Cancel",
        confirm = "Save",
        alt = "Image being framed",
        stage = "Image position. Arrow keys pan, plus and minus zoom.",
        loadError = "That image couldn't be read. Choose another file.",
    )
}

/* Triggers and forms ------------------------------------------------------- */

/**
 * What an overlay's trigger does besides its own action: open the overlay.
 * The web clones the trigger element to add an `onClick`; a composable cannot
 * be cloned, so Dialog sets this around its `trigger`, and Button runs it
 * after its own `onClick`.
 */
val LocalPMTriggerAction = compositionLocalOf<(() -> Unit)?> { null }

/**
 * What a `submit` Button does besides its own action: submit the form it is
 * in. On the web the actions row is inside the `<form>`; FormPage sets this
 * around its `actions`, and Button runs it after its own `onClick` when its
 * `type` is `submit`.
 */
val LocalPMSubmitAction = compositionLocalOf<(() -> Unit)?> { null }

/**
 * Whether the controls under it accept input: SwiftUI's `isEnabled`. A page
 * archetype turns it off around a region it disables as a whole (FormPage's
 * actions row while loading); every pressable member ANDs it with its own
 * `disabled`.
 */
val LocalPMEnabled = compositionLocalOf { true }

/**
 * Whether the buttons under it are tertiary whatever their variant: the tone's
 * text colour with no fill, border, shadow or press wash, in every phase, and
 * the focus ring and hit area kept. Toast sets it around its card, because its
 * recipe makes every button inside a toast tertiary, the content's own
 * included, as the web's container rule outranks a button's variant.
 */
val LocalPMTertiary = compositionLocalOf { false }

/**
 * What FormField hands the control it governs, as the web injects `id`,
 * `aria-describedby`, `aria-required` and `invalid` into its child: the label
 * that names the control, the field's inline error, whether the field is
 * required, and whether it is invalid. A control FormField can govern reads it
 * from `LocalPMField`, takes the label as its name, and reports the error as
 * its accessibility error, which TalkBack reads with the control. Android has
 * no hint for a control, so the field's description stays a node of its own.
 *
 * `nameOnly` is SettingsRow's wiring, the web's `aria-labelledby` on its
 * control: the label names the control and the control draws nothing of it,
 * because the row draws it beside the control. A Switch or Checkbox then draws
 * no row label, and a Button is named by the label rather than its own text.
 */
@Immutable
data class PMFieldContext(
    val label: String,
    /** The error the control reports, or null while the field is valid or shows its error in a toast. */
    val error: String?,
    val required: Boolean,
    val invalid: Boolean,
    val nameOnly: Boolean = false,
)

/** The field the composable is the control of, or null outside a FormField. */
val LocalPMField = compositionLocalOf<PMFieldContext?> { null }

/**
 * What a governed control reports up to its FormField: whether it carries its
 * label in its own row (Checkbox, Switch), so the field draws no label above
 * it, and whether it is disabled, so the field dims its label and messages.
 * The web reads both from the child element; a composable cannot read into a
 * child, so the child reports them through `LocalPMFieldReport`.
 */
@Immutable
data class PMFieldControl(val rowLabelled: Boolean = false, val disabled: Boolean = false)

/** Where a governed control reports itself, or null outside a FormField. */
val LocalPMFieldReport = compositionLocalOf<((PMFieldControl) -> Unit)?> { null }

/* Control sizes ------------------------------------------------------------ */

/**
 * One row of the size table (`design/components/README.md`, "Size system"),
 * which every sized control follows: the density's height, the horizontal
 * padding, the type step, and the gap between an icon and the text. The icon
 * itself is `PMIconView` at the same size.
 */
class PMControlMetrics(size: PMControlSize, theme: PMTheme) {
    val height: Dp
    val padding: Dp
    val gap: Dp
    val text: PMTextStyle

    init {
        val density = theme.defaultDensity
        val space = density.spacing
        height = density.controlHeight[size]
        when (size) {
            PMControlSize.Sm -> { padding = space.s4; gap = space.s2; text = theme.text.xs }
            PMControlSize.Md -> { padding = space.s5; gap = space.s3; text = theme.text.sm }
            PMControlSize.Lg -> { padding = space.s6; gap = space.s3; text = theme.text.md }
        }
    }
}

/* The Material bridge ------------------------------------------------------ */

/**
 * Material 3 given the pairing: a `MaterialTheme` whose colour scheme, type
 * scale and shapes are the theme's, the hit target the theme's, so a Material
 * component drawn inside (a Switch, a Checkbox, a bottom sheet, a snackbar)
 * draws in the pairing's colours, type and radii rather than Material's
 * defaults. Every member that draws a Material component draws it inside this,
 * and nothing else builds a Material theme: the containment law holds both.
 * Material's components keep their own state-layer strengths; the members'
 * own presses draw the recipe's active fill (`PMPressLayer`).
 */
@Composable
fun PMMaterialTheme(content: @Composable () -> Unit) {
    val theme = PM.theme
    val dark = PM.dark
    val families = LocalPMFontFamilies.current
    val colorScheme = remember(theme, dark) { materialColors(theme, dark) }
    val typography = remember(theme, families) { materialTypography(theme, families) }
    val shapes = remember(theme) { materialShapes(theme) }
    MaterialTheme(colorScheme = colorScheme, shapes = shapes, typography = typography) {
        CompositionLocalProvider(
            LocalMinimumInteractiveComponentSize provides theme.defaultDensity.hitTarget.dp,
            LocalContentColor provides colorScheme.onSurface,
            content = content,
        )
    }
}

/**
 * Material's roles from the pairing's. Polymorph has one accent, so the
 * secondary roles are the accent's too, and the tertiary roles are info's.
 * The surface tint is the surface itself, so a tonal elevation does not shift
 * a surface's colour: elevation is the pairing's shadows.
 */
private fun materialColors(theme: PMTheme, dark: Boolean): ColorScheme {
    val c = theme.colors
    fun PMDynamicColor.at() = resolve(dark).color
    val build = if (dark) ::darkScheme else ::lightScheme
    return build(
        MaterialRoles(
            primary = c.accentBg.at(),
            onPrimary = c.accentContrast.at(),
            primaryContainer = c.accentSubtle.at(),
            onPrimaryContainer = c.accentText.at(),
            inversePrimary = c.accentBg.inverse.at(),
            tertiary = c.infoSolid.at(),
            onTertiary = c.infoContrast.at(),
            tertiaryContainer = c.infoSubtle.at(),
            onTertiaryContainer = c.infoText.at(),
            background = c.bgApp.at(),
            onBackground = c.textPrimary.at(),
            surface = c.bgSurface.at(),
            onSurface = c.textPrimary.at(),
            surfaceVariant = c.bgSubtle.at(),
            onSurfaceVariant = c.textSecondary.at(),
            inverseSurface = c.bgInverse.at(),
            inverseOnSurface = c.textInverse.at(),
            error = c.dangerSolid.at(),
            onError = c.dangerContrast.at(),
            errorContainer = c.dangerSubtle.at(),
            onErrorContainer = c.dangerText.at(),
            outline = c.borderDefault.at(),
            outlineVariant = c.borderSubtle.at(),
            scrim = c.bgScrim.at(),
            surfaceBright = c.bgRaised.at(),
            surfaceDim = c.bgSubtle.at(),
            surfaceContainerLowest = c.bgSurface.at(),
            surfaceContainerLow = c.bgRaised.at(),
            surfaceContainer = c.bgOverlay.at(),
            surfaceContainerHigh = c.bgOverlay.at(),
            surfaceContainerHighest = c.bgSubtle.at(),
        ),
    )
}

private class MaterialRoles(
    val primary: Color, val onPrimary: Color, val primaryContainer: Color, val onPrimaryContainer: Color,
    val inversePrimary: Color, val tertiary: Color, val onTertiary: Color, val tertiaryContainer: Color,
    val onTertiaryContainer: Color, val background: Color, val onBackground: Color, val surface: Color,
    val onSurface: Color, val surfaceVariant: Color, val onSurfaceVariant: Color, val inverseSurface: Color,
    val inverseOnSurface: Color, val error: Color, val onError: Color, val errorContainer: Color,
    val onErrorContainer: Color, val outline: Color, val outlineVariant: Color, val scrim: Color,
    val surfaceBright: Color, val surfaceDim: Color, val surfaceContainerLowest: Color,
    val surfaceContainerLow: Color, val surfaceContainer: Color, val surfaceContainerHigh: Color,
    val surfaceContainerHighest: Color,
)

private fun lightScheme(r: MaterialRoles) = lightColorScheme(
    primary = r.primary, onPrimary = r.onPrimary, primaryContainer = r.primaryContainer,
    onPrimaryContainer = r.onPrimaryContainer, inversePrimary = r.inversePrimary,
    secondary = r.primary, onSecondary = r.onPrimary, secondaryContainer = r.primaryContainer,
    onSecondaryContainer = r.onPrimaryContainer, tertiary = r.tertiary, onTertiary = r.onTertiary,
    tertiaryContainer = r.tertiaryContainer, onTertiaryContainer = r.onTertiaryContainer,
    background = r.background, onBackground = r.onBackground, surface = r.surface, onSurface = r.onSurface,
    surfaceVariant = r.surfaceVariant, onSurfaceVariant = r.onSurfaceVariant, surfaceTint = r.surface,
    inverseSurface = r.inverseSurface, inverseOnSurface = r.inverseOnSurface, error = r.error,
    onError = r.onError, errorContainer = r.errorContainer, onErrorContainer = r.onErrorContainer,
    outline = r.outline, outlineVariant = r.outlineVariant, scrim = r.scrim, surfaceBright = r.surfaceBright,
    surfaceContainer = r.surfaceContainer, surfaceContainerHigh = r.surfaceContainerHigh,
    surfaceContainerHighest = r.surfaceContainerHighest, surfaceContainerLow = r.surfaceContainerLow,
    surfaceContainerLowest = r.surfaceContainerLowest, surfaceDim = r.surfaceDim,
)

private fun darkScheme(r: MaterialRoles) = darkColorScheme(
    primary = r.primary, onPrimary = r.onPrimary, primaryContainer = r.primaryContainer,
    onPrimaryContainer = r.onPrimaryContainer, inversePrimary = r.inversePrimary,
    secondary = r.primary, onSecondary = r.onPrimary, secondaryContainer = r.primaryContainer,
    onSecondaryContainer = r.onPrimaryContainer, tertiary = r.tertiary, onTertiary = r.onTertiary,
    tertiaryContainer = r.tertiaryContainer, onTertiaryContainer = r.onTertiaryContainer,
    background = r.background, onBackground = r.onBackground, surface = r.surface, onSurface = r.onSurface,
    surfaceVariant = r.surfaceVariant, onSurfaceVariant = r.onSurfaceVariant, surfaceTint = r.surface,
    inverseSurface = r.inverseSurface, inverseOnSurface = r.inverseOnSurface, error = r.error,
    onError = r.onError, errorContainer = r.errorContainer, onErrorContainer = r.onErrorContainer,
    outline = r.outline, outlineVariant = r.outlineVariant, scrim = r.scrim, surfaceBright = r.surfaceBright,
    surfaceContainer = r.surfaceContainer, surfaceContainerHigh = r.surfaceContainerHigh,
    surfaceContainerHighest = r.surfaceContainerHighest, surfaceContainerLow = r.surfaceContainerLow,
    surfaceContainerLowest = r.surfaceContainerLowest, surfaceDim = r.surfaceDim,
)

/**
 * Material's fifteen styles from the pairing's steps, each at the step's own
 * weight: display from the display scale, headline from the three largest text
 * steps, title, body and label from the body steps.
 */
private fun materialTypography(theme: PMTheme, families: (PMFont) -> FontFamily?): Typography {
    val t = theme.text
    val d = theme.display
    fun PMTextStyle.style() = toTextStyle(theme, families)
    fun PMDisplayStyle.style() = toTextStyle(theme, families)
    return Typography(
        displayLarge = d.lg.style(),
        displayMedium = d.md.style(),
        displaySmall = d.sm.style(),
        headlineLarge = t.text3xl.style(),
        headlineMedium = t.text2xl.style(),
        headlineSmall = t.xl.style(),
        titleLarge = t.lg.style(),
        titleMedium = t.md.style(),
        titleSmall = t.sm.style(),
        bodyLarge = t.md.style(),
        bodyMedium = t.sm.style(),
        bodySmall = t.xs.style(),
        labelLarge = t.sm.style(),
        labelMedium = t.xs.style(),
        labelSmall = t.xs.style(),
    )
}

/**
 * Material's shape scale from the pairing's radii: a detail's radius for the
 * smallest parts, a control's for chips and fields, a surface's for cards,
 * sheets and dialogs.
 */
private fun materialShapes(theme: PMTheme): Shapes {
    val r = theme.radius
    return Shapes(
        extraSmall = RoundedCornerShape(r.detail.dp),
        small = RoundedCornerShape(r.control.dp),
        medium = RoundedCornerShape(r.surface.dp),
        large = RoundedCornerShape(r.surface.dp),
        extraLarge = RoundedCornerShape(r.surface.dp),
    )
}
