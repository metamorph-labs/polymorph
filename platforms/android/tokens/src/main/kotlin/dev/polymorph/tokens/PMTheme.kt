// The types every generated theme in this package is built from. Written by
// hand, not generated: `pnpm emit:native` writes values (src/generated/), and
// the Kotlin emitter's test checks that every class here declares exactly the
// properties the emitter writes, in order.
//
// Plain Kotlin with no Android or Compose import, so `kotlinc` alone compiles
// it and it is safe in a multiplatform common source set. A Compose renderer
// maps each value in one line: `Color(rgba.argb)`, `radius.md.dp`,
// `text.md.size.sp`, `tracking.em`.
//
// Names: a token path becomes a camel-cased property below its family
// (`accent.bgHover` → `colors.accentBgHover`, `shell.topbar.bg` →
// `shell.topbarBg`). A name that would start with a digit takes its family in
// front (`chart.1` → `chart.chart1`, `text.2xl` → `text.text2xl`), and the
// spring role `default` is `base`, as in the Dart and Swift packages.

package dev.polymorph.tokens

import kotlin.math.roundToInt

/** A resolved pairing: one system with one palette, every value final. */
data class PMTheme(
    val pairing: PMPairing,
    val fonts: PMFonts,
    /** OpenType feature tags every numeral should set (`tnum`, `zero`). */
    val numeric: List<String>,
    /** The side of its column a numeric column's figures sit on: `end` or `start` (`numeric.align`). */
    val numericAlign: String,
    val floor: PMFloor,
    val text: PMTextScale,
    val display: PMDisplayScale,
    val radius: PMRadius,
    val shadows: PMShadows,
    val material: PMMaterial,
    val focus: PMFocus,
    val icon: PMIcons,
    val z: PMZ,
    /** All three densities, whichever the system selects (`pairing.axes.density`). */
    val density: PMDensities,
    /** All four temperaments, whichever the system selects (`pairing.axes.motionTemperament`). */
    val motion: PMMotions,
    val colors: PMColors,
    val chart: PMChartColors,
    val gradients: PMGradients,
    val glow: PMGlows,
    val shell: PMShell,
    /** Member exceptions the system declares: a class token re-pointed for one member. */
    val exceptions: List<PMException>,
    /** Token paths this platform cannot draw. They have no property here. */
    val unsupported: List<String>,
) {
    /** The density the system's axes select. */
    val defaultDensity: PMDensity
        get() = when (pairing.axes.density) {
            "compact" -> density.compact
            "comfortable" -> density.comfortable
            else -> density.standard
        }

    /** The temperament the system's axes select. */
    val defaultMotion: PMMotion
        get() = when (pairing.axes.motionTemperament) {
            "none" -> motion.none
            "subtle" -> motion.subtle
            "expressive" -> motion.expressive
            else -> motion.standard
        }

    /**
     * The mode the pairing draws in unless the reader chooses one, as the web
     * applies it on a first visit: true for dark, false for light, and null
     * for `system`, which follows the device. An app passes it as
     * `ProvidePMTheme(theme, dark = theme.preferredDark)`; the Swift
     * package's counterpart is `preferredColorScheme`.
     */
    val preferredDark: Boolean?
        get() = when (pairing.defaultMode) {
            "dark" -> true
            "light" -> false
            else -> null
        }
}

/* Colour ------------------------------------------------------------------ */

/** An sRGB colour: channels 0–255 and alpha 0–1, exactly the value the stylesheet ships. */
data class PMRgba(val r: Int, val g: Int, val b: Int, val a: Float) {
    /** `0xAARRGGBB`, the packed form Compose's `Color(Long)` takes. */
    val argb: Long
        get() = ((a * 255f).roundToInt().toLong() shl 24) or
            (r.toLong() shl 16) or (g.toLong() shl 8) or b.toLong()

    /** `#rrggbb`, without alpha. */
    val hex: String
        get() = "#" + listOf(r, g, b).joinToString("") { it.toString(16).padStart(2, '0') }
}

/** A role's value in each mode. */
data class PMDynamicColor(val light: PMRgba, val dark: PMRgba) {
    fun resolve(isDark: Boolean): PMRgba = if (isDark) dark else light

    /**
     * The other mode's value. On the web, `[data-tone="inverse"]` borrows the
     * opposite mode for every colour and chart role that differs, which is this
     * swap, and leaves gradients, glows, shell surfaces and the glass surface
     * at the outer scope's value. So an inverse-tone region swaps its colour
     * and chart roles only; the token document's `inverse` table lists them.
     */
    val inverse: PMDynamicColor
        get() = PMDynamicColor(light = dark, dark = light)
}

/** Every colour role (`bg.app` → `bgApp`). */
data class PMColors(
    val bgApp: PMDynamicColor,
    val bgSubtle: PMDynamicColor,
    val bgSurface: PMDynamicColor,
    val bgRaised: PMDynamicColor,
    val bgOverlay: PMDynamicColor,
    val bgScrim: PMDynamicColor,
    val bgInverse: PMDynamicColor,
    val accentBg: PMDynamicColor,
    val accentBgHover: PMDynamicColor,
    val accentBgActive: PMDynamicColor,
    val accentSubtle: PMDynamicColor,
    val accentSubtleHover: PMDynamicColor,
    val accentSubtleActive: PMDynamicColor,
    val accentText: PMDynamicColor,
    val accentUnderline: PMDynamicColor,
    val accentContrast: PMDynamicColor,
    val accentGlow: PMDynamicColor,
    val textPrimary: PMDynamicColor,
    val textSecondary: PMDynamicColor,
    val textMuted: PMDynamicColor,
    val textDisabled: PMDynamicColor,
    val textInverse: PMDynamicColor,
    val borderSubtle: PMDynamicColor,
    val borderDefault: PMDynamicColor,
    val borderStrong: PMDynamicColor,
    val borderField: PMDynamicColor,
    val borderFocus: PMDynamicColor,
    val borderFocusSolid: PMDynamicColor,
    val dangerSolid: PMDynamicColor,
    val dangerSolidHover: PMDynamicColor,
    val dangerSolidActive: PMDynamicColor,
    val dangerSubtle: PMDynamicColor,
    val dangerSubtleHover: PMDynamicColor,
    val dangerSubtleActive: PMDynamicColor,
    val dangerText: PMDynamicColor,
    val dangerBorder: PMDynamicColor,
    val dangerContrast: PMDynamicColor,
    val dangerGlow: PMDynamicColor,
    val warningSolid: PMDynamicColor,
    val warningSolidHover: PMDynamicColor,
    val warningSolidActive: PMDynamicColor,
    val warningSubtle: PMDynamicColor,
    val warningSubtleHover: PMDynamicColor,
    val warningSubtleActive: PMDynamicColor,
    val warningText: PMDynamicColor,
    val warningBorder: PMDynamicColor,
    val warningContrast: PMDynamicColor,
    val warningGlow: PMDynamicColor,
    val successSolid: PMDynamicColor,
    val successSolidHover: PMDynamicColor,
    val successSolidActive: PMDynamicColor,
    val successSubtle: PMDynamicColor,
    val successSubtleHover: PMDynamicColor,
    val successSubtleActive: PMDynamicColor,
    val successText: PMDynamicColor,
    val successBorder: PMDynamicColor,
    val successContrast: PMDynamicColor,
    val successGlow: PMDynamicColor,
    val infoSolid: PMDynamicColor,
    val infoSolidHover: PMDynamicColor,
    val infoSolidActive: PMDynamicColor,
    val infoSubtle: PMDynamicColor,
    val infoSubtleHover: PMDynamicColor,
    val infoSubtleActive: PMDynamicColor,
    val infoText: PMDynamicColor,
    val infoBorder: PMDynamicColor,
    val infoContrast: PMDynamicColor,
    val infoGlow: PMDynamicColor,
    val selectionBg: PMDynamicColor,
    val selectionBgHover: PMDynamicColor,
    val selectionText: PMDynamicColor,
    val selectionBorder: PMDynamicColor,
    val selectionSurface: PMDynamicColor,
    val selectionSurfaceHover: PMDynamicColor,
)

/** The chart roles below `chart.` (`chart.1` → `chart1`, `chart.seq.1` → `seq1`). */
data class PMChartColors(
    val chart1: PMDynamicColor,
    val chart2: PMDynamicColor,
    val chart3: PMDynamicColor,
    val chart4: PMDynamicColor,
    val chart5: PMDynamicColor,
    val chart6: PMDynamicColor,
    val chart7: PMDynamicColor,
    val chart8: PMDynamicColor,
    val other: PMDynamicColor,
    val seq1: PMDynamicColor,
    val seq2: PMDynamicColor,
    val seq3: PMDynamicColor,
    val seq4: PMDynamicColor,
    val seq5: PMDynamicColor,
    val seq6: PMDynamicColor,
    val seq7: PMDynamicColor,
    val neg1: PMDynamicColor,
    val neg2: PMDynamicColor,
    val neg3: PMDynamicColor,
    val mid: PMDynamicColor,
    val pos1: PMDynamicColor,
    val pos2: PMDynamicColor,
    val pos3: PMDynamicColor,
    val grid: PMDynamicColor,
    val axis: PMDynamicColor,
)

/** Degrees, CSS convention: 0 points up, 90 right. A `solid` gradient has two equal stops. */
data class PMGradient(val solid: Boolean, val angle: Float, val stops: List<PMGradientStop>) {
    val from: PMRgba get() = stops.first().color
    val to: PMRgba get() = stops.last().color
}

/** `at` runs 0–1 along the gradient line. */
data class PMGradientStop(val color: PMRgba, val at: Float)

data class PMDynamicGradient(val light: PMGradient, val dark: PMGradient) {
    fun resolve(isDark: Boolean): PMGradient = if (isDark) dark else light
}

data class PMGradients(val accentGradient: PMDynamicGradient, val bgWash: PMDynamicGradient)

/** The shell's region surfaces, resolved from the roles they reference. */
data class PMShell(
    val topbarBg: PMDynamicColor,
    val railBg: PMDynamicColor,
    val topbarBorder: PMDynamicColor,
    val railBorder: PMDynamicColor,
)

/* Type -------------------------------------------------------------------- */

/**
 * A type step. `size` is in sp (the stylesheet's rem × 16); `lineHeight` is a
 * multiplier of it; `tracking` is in em; `slot` names the font in `fonts`.
 */
data class PMTextStyle(
    val size: Float,
    val lineHeight: Float,
    val weight: Int,
    val tracking: Float,
    val family: String,
    val slot: String,
)

/** A display step: a text step with the optical size it requests and its style. */
data class PMDisplayStyle(
    val size: Float,
    val lineHeight: Float,
    val weight: Int,
    val tracking: Float,
    val family: String,
    val slot: String,
    val opsz: Float,
    /** `normal` or `italic`. */
    val style: String,
)

data class PMTextScale(
    val xs: PMTextStyle,
    val sm: PMTextStyle,
    val md: PMTextStyle,
    val lg: PMTextStyle,
    val xl: PMTextStyle,
    val text2xl: PMTextStyle,
    val text3xl: PMTextStyle,
)

data class PMDisplayScale(val sm: PMDisplayStyle, val md: PMDisplayStyle, val lg: PMDisplayStyle)

/**
 * A font slot. `family` has no Fontsource ` Variable` suffix; `variable` says
 * whether the system seeds the variable build. `weights` is every weight a
 * step sets in this slot; `opsz` every optical size a display step requests
 * (empty for the other slots). `fallback` is `sans`, `serif` or `mono`.
 */
data class PMFont(
    val family: String,
    val variable: Boolean,
    val fallback: String,
    val style: String,
    val weights: List<Int>,
    val opsz: List<Float>,
)

/**
 * The font slots. `heading` is the face of the heading steps, `text.lg` to
 * `text.3xl`; in a system that states no heading slot it is the body slot,
 * which is also its default here.
 */
data class PMFonts(val body: PMFont, val display: PMFont, val mono: PMFont, val heading: PMFont = body)

/* Shape and depth --------------------------------------------------------- */

/** Radii in dp: the five steps, then the three classes members read. */
data class PMRadius(
    val none: Float,
    val sm: Float,
    val md: Float,
    val lg: Float,
    val pill: Float,
    val control: Float,
    val detail: Float,
    val surface: Float,
)

/** One `box-shadow` layer, in dp. */
data class PMShadowLayer(
    val x: Float,
    val y: Float,
    val blur: Float,
    val spread: Float,
    val color: PMRgba,
    val inset: Boolean,
)

/** A shadow as its layers, drawn first to last. No layers is no shadow. */
data class PMShadow(val layers: List<PMShadowLayer>)

data class PMDynamicShadow(val light: PMShadow, val dark: PMShadow) {
    fun resolve(isDark: Boolean): PMShadow = if (isDark) dark else light
}

/** The three classes members read, the three steps, and the top highlight. */
data class PMShadows(
    val seat: PMShadow,
    val resting: PMShadow,
    val transient: PMShadow,
    val control: PMShadow,
    val raised: PMShadow,
    val overlay: PMShadow,
    val insetTop: PMShadow,
)

/** Halos take their colour from a role, so each resolves per mode. */
data class PMGlows(val focus: PMDynamicShadow, val hover: PMDynamicShadow)

/** The glass pane: backdrop blur in dp, saturation as a multiplier, and its fill. */
data class PMMaterial(val blur: Float, val saturate: Float, val surface: PMDynamicColor)

/**
 * The focus mark's width and offset, in dp. Its colour is
 * `colors.borderFocusSolid`. A negative offset lies inside the part's edge,
 * the derived default at minus the width; 0 or more lies outside it.
 */
data class PMFocus(val width: Float, val offset: Float)

/**
 * An icon size in dp and its stroke width. It is `PMIconScale`, not `PMIcon`,
 * because `PMIcon` is the vocabulary member Icon in `dev.polymorph.ui`, and an
 * app imports both packages.
 */
data class PMIconScale(val size: Float, val stroke: Float)

data class PMIcons(val sm: PMIconScale, val md: PMIconScale, val lg: PMIconScale)

/** The stacking ladder. */
data class PMZ(val raise: Int, val shell: Int, val overlay: Int, val toast: Int)

/* Density ----------------------------------------------------------------- */

/**
 * One density, in dp. `space[n]` is `space.n` (eleven steps). Control heights
 * are the density's, as on the web (at least 24); the hit target is the
 * platform's floor (`PMTheme.floor`), and a member shorter than it extends its
 * hit area to it with `Modifier.minimumInteractiveComponentSize()`, keeping its
 * drawn height.
 */
data class PMDensity(
    val space: List<Float>,
    val controlHeight: PMControlHeights,
    val hitTarget: Float,
    val inset: PMInsets,
)

data class PMControlHeights(val sm: Float, val md: Float, val lg: Float)

/** Container padding by class, resolved from the space step each names. */
data class PMInsets(val surface: Float, val pane: Float, val list: Float)

data class PMDensities(val compact: PMDensity, val standard: PMDensity, val comfortable: PMDensity)

/**
 * The platform's minimums (`controlHeight` 24, `hitTarget` 48) and each
 * derived value they raised.
 */
data class PMFloor(val controlHeight: Float, val hitTarget: Float, val raised: List<PMRaised>)

/** A value the floor raised: at `density`, `token` went from `from` to `to` dp. */
data class PMRaised(val density: String, val token: String, val from: Float, val to: Float)

/* Motion ------------------------------------------------------------------ */

/** One temperament. Durations, ambient periods and stagger are milliseconds. */
data class PMMotion(
    val duration: PMDurations,
    val easing: PMEasings,
    val spring: PMSprings,
    /** The scale a pressed control shrinks to. */
    val pressScale: Float,
    val ambient: PMAmbient,
    val stagger: PMStagger,
)

data class PMDurations(
    val control: Int,
    val controlExit: Int,
    val surface: Int,
    val surfaceExit: Int,
    val overlay: Int,
    val overlayExit: Int,
)

/** A cubic Bézier's two control points, in the order Compose's `CubicBezierEasing` takes them. */
data class PMEasing(val x1: Float, val y1: Float, val x2: Float, val y2: Float)

data class PMEasings(
    val enter: PMEasing,
    val exit: PMEasing,
    val standard: PMEasing,
    val overshoot: PMEasing,
)

/**
 * A spring. `dampingRatio` is `damping / (2 * sqrt(stiffness * mass))`.
 * Compose's `spring()` assumes a unit mass, so it takes `dampingRatio` and
 * `stiffness / mass`.
 */
data class PMSpring(
    val stiffness: Float,
    val damping: Float,
    val mass: Float,
    val dampingRatio: Float,
)

/** The spring roles; `default` is `base`. */
data class PMSprings(val base: PMSpring, val snappy: PMSpring, val gentle: PMSpring)

data class PMAmbient(val shimmer: Int, val spin: Int)

data class PMStagger(val step: Int, val max: Int)

data class PMMotions(
    val none: PMMotion,
    val subtle: PMMotion,
    val standard: PMMotion,
    val expressive: PMMotion,
)

/* Pairing ----------------------------------------------------------------- */

/** Which system and palette, and the decisions that are not values. */
data class PMPairing(
    /** `system/palette`. */
    val name: String,
    val system: String,
    val palette: String,
    /** `designed` or `tenant`. */
    val kind: String,
    val axes: PMAxes,
    /** `light`, `dark` or `system`. */
    val defaultMode: String,
    /**
     * The series cap for charts where any two marks can be adjacent (scatter,
     * small multiples, radar). The same in both modes.
     */
    val chartCap: Int,
)

/** The system's eight axes, spelled as the system file spells them. */
data class PMAxes(
    val geometry: String,
    val depth: String,
    val density: String,
    val contrastTemperament: String,
    val typePersonality: String,
    val colorStrategy: String,
    val motionTemperament: String,
    val ornament: String,
)

/* Exceptions -------------------------------------------------------------- */

/** A member exception: `token` re-pointed at `ref` for the member named `member`. */
sealed interface PMException {
    val member: String
    val token: String
    val ref: String
}

data class PMRadiusException(
    override val member: String,
    override val token: String,
    override val ref: String,
    val radius: Float,
) : PMException

data class PMShadowException(
    override val member: String,
    override val token: String,
    override val ref: String,
    val shadow: PMShadow,
) : PMException

/** An inset names a space step, so it has a value at each density. */
data class PMInsetException(
    override val member: String,
    override val token: String,
    override val ref: String,
    val inset: PMPerDensity,
) : PMException

data class PMPerDensity(val compact: Float, val standard: Float, val comfortable: Float)
