// The types every generated theme in this package is built from. Written by
// hand, not generated: `pnpm emit:native` writes values (lib/src/generated/),
// and the Dart emitter's test checks that every class here declares exactly
// the fields the emitter writes, in order. The Kotlin package declares the
// same classes with the same names.
//
// Plain Dart with no Flutter import. A Flutter app maps each value in one
// line: `Color(rgba.argb)`, and every length is already a logical pixel.
//
// Names: a token path becomes a camel-cased field below its family
// (`accent.bgHover` → `colors.accentBgHover`, `shell.topbar.bg` →
// `shell.topbarBg`). A name that would start with a digit takes its family in
// front (`chart.1` → `chart.chart1`, `text.2xl` → `text.text2xl`), and the
// spring role `default`, a reserved word, is `base`, as in the Kotlin and
// Swift packages.

/// A resolved pairing: one system with one palette, every value final.
final class PMTheme {
  const PMTheme({
    required this.pairing,
    required this.fonts,
    required this.numeric,
    required this.numericAlign,
    required this.floor,
    required this.text,
    required this.display,
    required this.radius,
    required this.shadows,
    required this.material,
    required this.focus,
    required this.icon,
    required this.z,
    required this.density,
    required this.motion,
    required this.colors,
    required this.chart,
    required this.gradients,
    required this.glow,
    required this.shell,
    required this.exceptions,
    required this.unsupported,
  });

  final PMPairing pairing;
  final PMFonts fonts;

  /// OpenType feature tags every numeral should set (`tnum`, `zero`).
  final List<String> numeric;

  /// The side of its column a numeric column's figures sit on: `end` or
  /// `start` (`numeric.align`).
  final String numericAlign;
  final PMFloor floor;
  final PMTextScale text;
  final PMDisplayScale display;
  final PMRadius radius;
  final PMShadows shadows;
  final PMMaterial material;
  final PMFocus focus;
  final PMIcons icon;
  final PMZ z;

  /// All three densities, whichever the system selects (`pairing.axes.density`).
  final PMDensities density;

  /// All four temperaments, whichever the system selects
  /// (`pairing.axes.motionTemperament`).
  final PMMotions motion;
  final PMColors colors;
  final PMChartColors chart;
  final PMGradients gradients;
  final PMGlows glow;
  final PMShell shell;

  /// Member exceptions the system declares: a class token re-pointed for one
  /// member.
  final List<PMException> exceptions;

  /// Token paths this platform cannot draw. They have no field here.
  final List<String> unsupported;

  /// The density the system's axes select.
  PMDensity get defaultDensity => switch (pairing.axes.density) {
    'compact' => density.compact,
    'comfortable' => density.comfortable,
    _ => density.standard,
  };

  /// The temperament the system's axes select.
  PMMotion get defaultMotion => switch (pairing.axes.motionTemperament) {
    'none' => motion.none,
    'subtle' => motion.subtle,
    'expressive' => motion.expressive,
    _ => motion.standard,
  };
}

// Colour --------------------------------------------------------------------

/// An sRGB colour: channels 0–255 and alpha 0–1, exactly the value the
/// stylesheet ships.
final class PMRgba {
  const PMRgba(this.r, this.g, this.b, this.a);

  final int r;
  final int g;
  final int b;
  final double a;

  /// `0xAARRGGBB`, the packed form Flutter's `Color(int)` takes.
  int get argb => (a * 255).round() * 0x1000000 + (r << 16) + (g << 8) + b;

  /// `#rrggbb`, without alpha.
  String get hex =>
      '#${[r, g, b].map((channel) => channel.toRadixString(16).padLeft(2, '0')).join()}';

  @override
  bool operator ==(Object other) =>
      other is PMRgba && other.r == r && other.g == g && other.b == b && other.a == a;

  @override
  int get hashCode => Object.hash(r, g, b, a);

  @override
  String toString() => 'PMRgba($r, $g, $b, $a)';
}

/// A role's value in each mode.
final class PMDynamicColor {
  const PMDynamicColor({required this.light, required this.dark});

  final PMRgba light;
  final PMRgba dark;

  PMRgba resolve({required bool isDark}) => isDark ? dark : light;

  /// The other mode's value. On the web, `[data-tone="inverse"]` borrows the
  /// opposite mode for every colour and chart role that differs, which is this
  /// swap, and leaves gradients, glows, shell surfaces and the glass surface at
  /// the outer scope's value. So an inverse-tone region swaps its colour and
  /// chart roles only; the token document's `inverse` table lists them.
  PMDynamicColor get inverse => PMDynamicColor(light: dark, dark: light);
}

/// Every colour role (`bg.app` → `bgApp`).
final class PMColors {
  const PMColors({
    required this.bgApp,
    required this.bgSubtle,
    required this.bgSurface,
    required this.bgRaised,
    required this.bgOverlay,
    required this.bgScrim,
    required this.bgInverse,
    required this.accentBg,
    required this.accentBgHover,
    required this.accentBgActive,
    required this.accentSubtle,
    required this.accentSubtleHover,
    required this.accentSubtleActive,
    required this.accentText,
    required this.accentUnderline,
    required this.accentContrast,
    required this.accentGlow,
    required this.textPrimary,
    required this.textSecondary,
    required this.textMuted,
    required this.textDisabled,
    required this.textInverse,
    required this.borderSubtle,
    required this.borderDefault,
    required this.borderStrong,
    required this.borderField,
    required this.borderFocus,
    required this.borderFocusSolid,
    required this.dangerSolid,
    required this.dangerSolidHover,
    required this.dangerSolidActive,
    required this.dangerSubtle,
    required this.dangerSubtleHover,
    required this.dangerSubtleActive,
    required this.dangerText,
    required this.dangerBorder,
    required this.dangerContrast,
    required this.dangerGlow,
    required this.warningSolid,
    required this.warningSolidHover,
    required this.warningSolidActive,
    required this.warningSubtle,
    required this.warningSubtleHover,
    required this.warningSubtleActive,
    required this.warningText,
    required this.warningBorder,
    required this.warningContrast,
    required this.warningGlow,
    required this.successSolid,
    required this.successSolidHover,
    required this.successSolidActive,
    required this.successSubtle,
    required this.successSubtleHover,
    required this.successSubtleActive,
    required this.successText,
    required this.successBorder,
    required this.successContrast,
    required this.successGlow,
    required this.infoSolid,
    required this.infoSolidHover,
    required this.infoSolidActive,
    required this.infoSubtle,
    required this.infoSubtleHover,
    required this.infoSubtleActive,
    required this.infoText,
    required this.infoBorder,
    required this.infoContrast,
    required this.infoGlow,
    required this.selectionBg,
    required this.selectionBgHover,
    required this.selectionText,
    required this.selectionBorder,
    required this.selectionSurface,
    required this.selectionSurfaceHover,
  });

  final PMDynamicColor bgApp;
  final PMDynamicColor bgSubtle;
  final PMDynamicColor bgSurface;
  final PMDynamicColor bgRaised;
  final PMDynamicColor bgOverlay;
  final PMDynamicColor bgScrim;
  final PMDynamicColor bgInverse;
  final PMDynamicColor accentBg;
  final PMDynamicColor accentBgHover;
  final PMDynamicColor accentBgActive;
  final PMDynamicColor accentSubtle;
  final PMDynamicColor accentSubtleHover;
  final PMDynamicColor accentSubtleActive;
  final PMDynamicColor accentText;
  final PMDynamicColor accentUnderline;
  final PMDynamicColor accentContrast;
  final PMDynamicColor accentGlow;
  final PMDynamicColor textPrimary;
  final PMDynamicColor textSecondary;
  final PMDynamicColor textMuted;
  final PMDynamicColor textDisabled;
  final PMDynamicColor textInverse;
  final PMDynamicColor borderSubtle;
  final PMDynamicColor borderDefault;
  final PMDynamicColor borderStrong;
  final PMDynamicColor borderField;
  final PMDynamicColor borderFocus;
  final PMDynamicColor borderFocusSolid;
  final PMDynamicColor dangerSolid;
  final PMDynamicColor dangerSolidHover;
  final PMDynamicColor dangerSolidActive;
  final PMDynamicColor dangerSubtle;
  final PMDynamicColor dangerSubtleHover;
  final PMDynamicColor dangerSubtleActive;
  final PMDynamicColor dangerText;
  final PMDynamicColor dangerBorder;
  final PMDynamicColor dangerContrast;
  final PMDynamicColor dangerGlow;
  final PMDynamicColor warningSolid;
  final PMDynamicColor warningSolidHover;
  final PMDynamicColor warningSolidActive;
  final PMDynamicColor warningSubtle;
  final PMDynamicColor warningSubtleHover;
  final PMDynamicColor warningSubtleActive;
  final PMDynamicColor warningText;
  final PMDynamicColor warningBorder;
  final PMDynamicColor warningContrast;
  final PMDynamicColor warningGlow;
  final PMDynamicColor successSolid;
  final PMDynamicColor successSolidHover;
  final PMDynamicColor successSolidActive;
  final PMDynamicColor successSubtle;
  final PMDynamicColor successSubtleHover;
  final PMDynamicColor successSubtleActive;
  final PMDynamicColor successText;
  final PMDynamicColor successBorder;
  final PMDynamicColor successContrast;
  final PMDynamicColor successGlow;
  final PMDynamicColor infoSolid;
  final PMDynamicColor infoSolidHover;
  final PMDynamicColor infoSolidActive;
  final PMDynamicColor infoSubtle;
  final PMDynamicColor infoSubtleHover;
  final PMDynamicColor infoSubtleActive;
  final PMDynamicColor infoText;
  final PMDynamicColor infoBorder;
  final PMDynamicColor infoContrast;
  final PMDynamicColor infoGlow;
  final PMDynamicColor selectionBg;
  final PMDynamicColor selectionBgHover;
  final PMDynamicColor selectionText;
  final PMDynamicColor selectionBorder;
  final PMDynamicColor selectionSurface;
  final PMDynamicColor selectionSurfaceHover;
}

/// The chart roles below `chart.` (`chart.1` → `chart1`, `chart.seq.1` → `seq1`).
final class PMChartColors {
  const PMChartColors({
    required this.chart1,
    required this.chart2,
    required this.chart3,
    required this.chart4,
    required this.chart5,
    required this.chart6,
    required this.chart7,
    required this.chart8,
    required this.other,
    required this.seq1,
    required this.seq2,
    required this.seq3,
    required this.seq4,
    required this.seq5,
    required this.seq6,
    required this.seq7,
    required this.neg1,
    required this.neg2,
    required this.neg3,
    required this.mid,
    required this.pos1,
    required this.pos2,
    required this.pos3,
    required this.grid,
    required this.axis,
  });

  final PMDynamicColor chart1;
  final PMDynamicColor chart2;
  final PMDynamicColor chart3;
  final PMDynamicColor chart4;
  final PMDynamicColor chart5;
  final PMDynamicColor chart6;
  final PMDynamicColor chart7;
  final PMDynamicColor chart8;
  final PMDynamicColor other;
  final PMDynamicColor seq1;
  final PMDynamicColor seq2;
  final PMDynamicColor seq3;
  final PMDynamicColor seq4;
  final PMDynamicColor seq5;
  final PMDynamicColor seq6;
  final PMDynamicColor seq7;
  final PMDynamicColor neg1;
  final PMDynamicColor neg2;
  final PMDynamicColor neg3;
  final PMDynamicColor mid;
  final PMDynamicColor pos1;
  final PMDynamicColor pos2;
  final PMDynamicColor pos3;
  final PMDynamicColor grid;
  final PMDynamicColor axis;
}

/// Degrees, CSS convention: 0 points up, 90 right. A [solid] gradient has two
/// equal stops.
final class PMGradient {
  const PMGradient({required this.solid, required this.angle, required this.stops});

  final bool solid;
  final double angle;
  final List<PMGradientStop> stops;

  PMRgba get from => stops.first.color;
  PMRgba get to => stops.last.color;
}

/// [at] runs 0–1 along the gradient line.
final class PMGradientStop {
  const PMGradientStop({required this.color, required this.at});

  final PMRgba color;
  final double at;
}

final class PMDynamicGradient {
  const PMDynamicGradient({required this.light, required this.dark});

  final PMGradient light;
  final PMGradient dark;

  PMGradient resolve({required bool isDark}) => isDark ? dark : light;
}

final class PMGradients {
  const PMGradients({required this.accentGradient, required this.bgWash});

  final PMDynamicGradient accentGradient;
  final PMDynamicGradient bgWash;
}

/// The shell's region surfaces, resolved from the roles they reference.
final class PMShell {
  const PMShell({
    required this.topbarBg,
    required this.railBg,
    required this.topbarBorder,
    required this.railBorder,
  });

  final PMDynamicColor topbarBg;
  final PMDynamicColor railBg;
  final PMDynamicColor topbarBorder;
  final PMDynamicColor railBorder;
}

// Type ----------------------------------------------------------------------

/// A type step. [size] is in logical pixels (the stylesheet's rem × 16);
/// [lineHeight] is a multiplier of it (Flutter's `TextStyle.height`);
/// [tracking] is in em; [slot] names the font in `fonts`.
final class PMTextStyle {
  const PMTextStyle({
    required this.size,
    required this.lineHeight,
    required this.weight,
    required this.tracking,
    required this.family,
    required this.slot,
  });

  final double size;
  final double lineHeight;
  final int weight;
  final double tracking;
  final String family;
  final String slot;
}

/// A display step: a text step with the optical size it requests and its
/// style (`normal` or `italic`).
final class PMDisplayStyle {
  const PMDisplayStyle({
    required this.size,
    required this.lineHeight,
    required this.weight,
    required this.tracking,
    required this.family,
    required this.slot,
    required this.opsz,
    required this.style,
  });

  final double size;
  final double lineHeight;
  final int weight;
  final double tracking;
  final String family;
  final String slot;
  final double opsz;
  final String style;
}

final class PMTextScale {
  const PMTextScale({
    required this.xs,
    required this.sm,
    required this.md,
    required this.lg,
    required this.xl,
    required this.text2xl,
    required this.text3xl,
  });

  final PMTextStyle xs;
  final PMTextStyle sm;
  final PMTextStyle md;
  final PMTextStyle lg;
  final PMTextStyle xl;
  final PMTextStyle text2xl;
  final PMTextStyle text3xl;
}

final class PMDisplayScale {
  const PMDisplayScale({required this.sm, required this.md, required this.lg});

  final PMDisplayStyle sm;
  final PMDisplayStyle md;
  final PMDisplayStyle lg;
}

/// A font slot. [family] has no Fontsource ` Variable` suffix; [variable]
/// says whether the system seeds the variable build. [weights] is every
/// weight a step sets in this slot; [opsz] every optical size a display step
/// requests (empty for the other slots). [fallback] is `sans`, `serif` or
/// `mono`.
final class PMFont {
  const PMFont({
    required this.family,
    required this.variable,
    required this.fallback,
    required this.style,
    required this.weights,
    required this.opsz,
  });

  final String family;
  final bool variable;
  final String fallback;
  final String style;
  final List<int> weights;
  final List<double> opsz;
}

/// The font slots. [heading] is the face of the heading steps, `text.lg` to
/// `text.3xl`; in a system that states no heading slot it is the body slot.
final class PMFonts {
  const PMFonts({
    required this.body,
    required this.display,
    required this.mono,
    required this.heading,
  });

  final PMFont body;
  final PMFont display;
  final PMFont mono;
  final PMFont heading;
}

// Shape and depth -----------------------------------------------------------

/// Radii in logical pixels: the five steps, then the three classes members
/// read.
final class PMRadius {
  const PMRadius({
    required this.none,
    required this.sm,
    required this.md,
    required this.lg,
    required this.pill,
    required this.control,
    required this.detail,
    required this.surface,
  });

  final double none;
  final double sm;
  final double md;
  final double lg;
  final double pill;
  final double control;
  final double detail;
  final double surface;
}

/// One `box-shadow` layer, in logical pixels.
final class PMShadowLayer {
  const PMShadowLayer({
    required this.x,
    required this.y,
    required this.blur,
    required this.spread,
    required this.color,
    required this.inset,
  });

  final double x;
  final double y;
  final double blur;
  final double spread;
  final PMRgba color;
  final bool inset;
}

/// A shadow as its layers, drawn first to last. No layers is no shadow.
final class PMShadow {
  const PMShadow({required this.layers});

  final List<PMShadowLayer> layers;
}

final class PMDynamicShadow {
  const PMDynamicShadow({required this.light, required this.dark});

  final PMShadow light;
  final PMShadow dark;

  PMShadow resolve({required bool isDark}) => isDark ? dark : light;
}

/// The three classes members read, the three steps, and the top highlight.
final class PMShadows {
  const PMShadows({
    required this.seat,
    required this.resting,
    required this.transient,
    required this.control,
    required this.raised,
    required this.overlay,
    required this.insetTop,
  });

  final PMShadow seat;
  final PMShadow resting;
  final PMShadow transient;
  final PMShadow control;
  final PMShadow raised;
  final PMShadow overlay;
  final PMShadow insetTop;
}

/// Halos take their colour from a role, so each resolves per mode.
final class PMGlows {
  const PMGlows({required this.focus, required this.hover});

  final PMDynamicShadow focus;
  final PMDynamicShadow hover;
}

/// The glass pane: backdrop blur in logical pixels, saturation as a
/// multiplier, and its fill.
final class PMMaterial {
  const PMMaterial({required this.blur, required this.saturate, required this.surface});

  final double blur;
  final double saturate;
  final PMDynamicColor surface;
}

/// The focus mark's width and offset, in logical pixels. Its colour is
/// `colors.borderFocusSolid`. A negative offset lies inside the part's edge,
/// the derived default at minus the width; 0 or more lies outside it.
final class PMFocus {
  const PMFocus({required this.width, required this.offset});

  final double width;
  final double offset;
}

/// An icon size in logical pixels and its stroke width.
final class PMIcon {
  const PMIcon({required this.size, required this.stroke});

  final double size;
  final double stroke;
}

final class PMIcons {
  const PMIcons({required this.sm, required this.md, required this.lg});

  final PMIcon sm;
  final PMIcon md;
  final PMIcon lg;
}

/// The stacking ladder.
final class PMZ {
  const PMZ({required this.raise, required this.shell, required this.overlay, required this.toast});

  final int raise;
  final int shell;
  final int overlay;
  final int toast;
}

// Density -------------------------------------------------------------------

/// One density, in logical pixels. `space[n]` is `space.n` (eleven steps).
/// Control heights are the density's, as on the web (at least 24); the hit
/// target is the platform's floor (`PMTheme.floor`), and a widget shorter than
/// it extends its hit area to it, keeping its drawn height.
final class PMDensity {
  const PMDensity({
    required this.space,
    required this.controlHeight,
    required this.hitTarget,
    required this.inset,
  });

  final List<double> space;
  final PMControlHeights controlHeight;
  final double hitTarget;
  final PMInsets inset;
}

final class PMControlHeights {
  const PMControlHeights({required this.sm, required this.md, required this.lg});

  final double sm;
  final double md;
  final double lg;
}

/// Container padding by class, resolved from the space step each names.
final class PMInsets {
  const PMInsets({required this.surface, required this.pane, required this.list});

  final double surface;
  final double pane;
  final double list;
}

final class PMDensities {
  const PMDensities({required this.compact, required this.standard, required this.comfortable});

  final PMDensity compact;
  final PMDensity standard;
  final PMDensity comfortable;
}

/// The platform's minimums (`controlHeight` 24, `hitTarget` 48) and each
/// derived value they raised.
final class PMFloor {
  const PMFloor({required this.controlHeight, required this.hitTarget, required this.raised});

  final double controlHeight;
  final double hitTarget;
  final List<PMRaised> raised;
}

/// A value the floor raised: at [density], [token] went from [from] to [to].
final class PMRaised {
  const PMRaised({
    required this.density,
    required this.token,
    required this.from,
    required this.to,
  });

  final String density;
  final String token;
  final double from;
  final double to;
}

// Motion --------------------------------------------------------------------

/// One temperament. Durations, ambient periods and stagger are milliseconds;
/// [pressScale] is the scale a pressed control shrinks to.
final class PMMotion {
  const PMMotion({
    required this.duration,
    required this.easing,
    required this.spring,
    required this.pressScale,
    required this.ambient,
    required this.stagger,
  });

  final PMDurations duration;
  final PMEasings easing;
  final PMSprings spring;
  final double pressScale;
  final PMAmbient ambient;
  final PMStagger stagger;
}

final class PMDurations {
  const PMDurations({
    required this.control,
    required this.controlExit,
    required this.surface,
    required this.surfaceExit,
    required this.overlay,
    required this.overlayExit,
  });

  final int control;
  final int controlExit;
  final int surface;
  final int surfaceExit;
  final int overlay;
  final int overlayExit;
}

/// A cubic Bézier's two control points, in the order Flutter's `Cubic` takes
/// them.
final class PMEasing {
  const PMEasing({required this.x1, required this.y1, required this.x2, required this.y2});

  final double x1;
  final double y1;
  final double x2;
  final double y2;
}

final class PMEasings {
  const PMEasings({
    required this.enter,
    required this.exit,
    required this.standard,
    required this.overshoot,
  });

  final PMEasing enter;
  final PMEasing exit;
  final PMEasing standard;
  final PMEasing overshoot;
}

/// A spring, as Flutter's `SpringDescription(mass:, stiffness:, damping:)`
/// takes it. [dampingRatio] is `damping / (2 * sqrt(stiffness * mass))`.
final class PMSpring {
  const PMSpring({
    required this.stiffness,
    required this.damping,
    required this.mass,
    required this.dampingRatio,
  });

  final double stiffness;
  final double damping;
  final double mass;
  final double dampingRatio;
}

/// The spring roles; `default` is [base].
final class PMSprings {
  const PMSprings({required this.base, required this.snappy, required this.gentle});

  final PMSpring base;
  final PMSpring snappy;
  final PMSpring gentle;
}

final class PMAmbient {
  const PMAmbient({required this.shimmer, required this.spin});

  final int shimmer;
  final int spin;
}

final class PMStagger {
  const PMStagger({required this.step, required this.max});

  final int step;
  final int max;
}

final class PMMotions {
  const PMMotions({
    required this.none,
    required this.subtle,
    required this.standard,
    required this.expressive,
  });

  final PMMotion none;
  final PMMotion subtle;
  final PMMotion standard;
  final PMMotion expressive;
}

// Pairing -------------------------------------------------------------------

/// Which system and palette, and the decisions that are not values. [name] is
/// `system/palette`; [kind] is `designed` or `tenant`; [defaultMode] is
/// `light`, `dark` or `system`; [chartCap] is the series cap for charts where
/// any two marks can be adjacent (scatter, small multiples, radar), the same
/// in both modes.
final class PMPairing {
  const PMPairing({
    required this.name,
    required this.system,
    required this.palette,
    required this.kind,
    required this.axes,
    required this.defaultMode,
    required this.chartCap,
  });

  final String name;
  final String system;
  final String palette;
  final String kind;
  final PMAxes axes;
  final String defaultMode;
  final int chartCap;
}

/// The system's eight axes, spelled as the system file spells them.
final class PMAxes {
  const PMAxes({
    required this.geometry,
    required this.depth,
    required this.density,
    required this.contrastTemperament,
    required this.typePersonality,
    required this.colorStrategy,
    required this.motionTemperament,
    required this.ornament,
  });

  final String geometry;
  final String depth;
  final String density;
  final String contrastTemperament;
  final String typePersonality;
  final String colorStrategy;
  final String motionTemperament;
  final String ornament;
}

// Exceptions ----------------------------------------------------------------

/// A member exception: [token] re-pointed at [ref] for the member named
/// [member].
sealed class PMException {
  const PMException({required this.member, required this.token, required this.ref});

  final String member;
  final String token;
  final String ref;
}

final class PMRadiusException extends PMException {
  const PMRadiusException({
    required super.member,
    required super.token,
    required super.ref,
    required this.radius,
  });

  final double radius;
}

final class PMShadowException extends PMException {
  const PMShadowException({
    required super.member,
    required super.token,
    required super.ref,
    required this.shadow,
  });

  final PMShadow shadow;
}

/// An inset names a space step, so it has a value at each density.
final class PMInsetException extends PMException {
  const PMInsetException({
    required super.member,
    required super.token,
    required super.ref,
    required this.inset,
  });

  final PMPerDensity inset;
}

final class PMPerDensity {
  const PMPerDensity({required this.compact, required this.standard, required this.comfortable});

  final double compact;
  final double standard;
  final double comfortable;
}
