/**
 * `@polymorph/theme`: the theme engine.
 *
 * Takes axes and seeds and returns a resolved, law-checked token set. Only the
 * runtime module (`./runtime`) touches the DOM.
 */

export {
  AXIS_NAMES,
  AXIS_VALUES,
  axisDivergence,
  axesSchema,
  colorStrategySchema,
  COLOR_STRATEGIES,
  CONTRAST_TEMPERAMENTS,
  contrastTemperamentSchema,
  DENSITIES,
  densitySchema,
  DEPTHS,
  depthSchema,
  GEOMETRIES,
  geometrySchema,
  MOTION_TEMPERAMENTS,
  motionTemperamentSchema,
  hasTexture,
  ORNAMENTS,
  ornamentSchema,
  TEXTURED_ORNAMENTS,
  TYPE_PERSONALITIES,
  typePersonalitySchema,
} from './axes'
export type {
  Axes,
  AxisName,
  ColorStrategy,
  ContrastTemperament,
  Density,
  Depth,
  Geometry,
  MotionTemperament,
  Ornament,
  TexturedOrnament,
  TypePersonality,
} from './axes'

export {
  CHROMA_BUDGET_PEAK,
  CHROMA_BUDGETS,
  chromaBudgetSchema,
  FALLBACK_CLASSES,
  FONT_ROLES,
  fontFamiliesSchema,
  fontPackage,
  fontSpecSchema,
  hasGradient,
  hueSchema,
  MAX_NEUTRAL_TINT,
  modePinsSchema,
  neutralHueOf,
  neutralTintSchema,
  PIN_ROLES,
  pinnedColor,
  pinsSchema,
  seedsSchema,
} from './seeds'
export type {
  ChromaBudget,
  FallbackClass,
  FontFamilies,
  FontRole,
  FontSpec,
  ModePins,
  PinRole,
  Pins,
  Seeds,
} from './seeds'

export {
  ACCENT_ROLES,
  ACCENT_SOLID_ROLES,
  BACKGROUND_ROLES,
  BORDER_ROLES,
  CHART_DIVERGING_ARM_STEPS,
  CHART_DIVERGING_SIDES,
  CHART_ROLES,
  CHART_SEQ_STEPS,
  CHART_SLOTS,
  chartDivergingRole,
  chartSeqRole,
  chartSlotRole,
  COLOR_ROLE_GROUPS,
  COLOR_ROLES,
  GRADIENT_BASE,
  GRADIENT_ROLES,
  isColorRole,
  SELECTION_ROLES,
  STATUS_ROLES,
  STATUS_TONES,
  STATUS_VARIANTS,
  statusRole,
  TEXT_BEARING_BACKGROUNDS,
  TEXT_ROLES,
} from './roles'
export type {
  AccentRole,
  BackgroundRole,
  BorderRole,
  ChartDivergingArmStep,
  ChartDivergingSide,
  ChartRole,
  ChartRoleValues,
  ChartSeqStep,
  ChartSlot,
  ColorRole,
  ColorRoleGroup,
  ColorRoleValues,
  GradientRole,
  GradientRoleValues,
  GradientStop,
  GradientValue,
  SelectionRole,
  StatusRole,
  StatusTone,
  StatusVariant,
  TextBearingBackground,
  TextRole,
} from './roles'

export {
  DISPLAY_STEPS,
  DURATION_ROLES,
  EASING_ROLES,
  FIELD_FOCUS_STYLES,
  FOCUS_PLACES,
  GLOW_STEPS,
  ICON_SIZES,
  INSET_ASSIGNMENT_CLASSES,
  NUMERIC_ALIGNS,
  RADIUS_ASSIGNMENT_CLASSES,
  RADIUS_STEPS,
  SHADOW_ASSIGNMENT_CLASSES,
  SHADOW_STEPS,
  SPACE_STEPS,
  SPRING_ROLES,
  springSchema,
  TEXT_STEPS,
  typeStyleSchema,
  UNFILLED_HOVERS,
} from './tokens'
export type {
  CubicBezier,
  DensityScopedTokens,
  DisplayStep,
  DisplayStyle,
  DurationRole,
  EasingRole,
  FieldFocusStyle,
  FocusPlace,
  GlowStep,
  IconSize,
  InsetAssignmentClass,
  MotionTokens,
  NonColorTokens,
  NumericAlign,
  NumericVariant,
  RadiusAssignmentClass,
  RadiusStep,
  Rgb,
  ShadowAssignmentClass,
  ShadowLayerValue,
  ShadowStep,
  SpaceStep,
  Spring,
  SpringRole,
  TextStep,
  TextureSpec,
  TypeStyle,
  UnfilledHover,
} from './tokens'

export {
  BODY_TEXT_MIN_SIZE_PX,
  DELINEATION_MIN_DELTA_L,
  FOCUS_MIN_DELTA_L,
  FOCUS_MIN_RATIO,
  gradientPairingId,
  isDelineation,
  isExemptFromContrast,
  isFocus,
  LAWFUL_GRADIENT_PAIRINGS,
  LAWFUL_PAIRINGS,
  LC_FLOORS,
  minSizeForWeight,
  PAIRING_EXEMPTIONS,
  pairingId,
  pairingMeasure,
  pairingsInvolving,
} from './pairings'
export type { GradientPairing, Pairing, PairingExemption } from './pairings'

export { MODE_PREFERENCES, MODES, THEME_KINDS, modePreferenceSchema, modeSchema } from './theme'
export type { Mode, ModePreference, ResolvedTheme, Theme, ThemeKind } from './theme'

export {
  componentExceptionSchema,
  composeTheme,
  pairId,
  paletteNameSchema,
  paletteSchema,
  parsePalette,
  parseSystem,
  systemDocumentSchema,
  systemNameSchema,
  systemOverridesSchema,
  systemSchema,
  TYPE_BASE_RANGE_PX,
  TYPE_STEP_FLOOR_PX,
} from './systems'
export type { ComponentException, Palette, System, SystemOverrides } from './systems'

export {
  axisFlagName,
  cssVar,
  cssVarName,
  DATA_ATTRS,
  EXPOSED_AXES,
  MEMBER_ATTR,
  PM_PREFIX,
} from './css-vars'
export type { ExposedAxis } from './css-vars'

export * from './color'

export {
  CONTROL_HEIGHT_PX,
  DENSITY_MULTIPLIER,
  deriveFontStacks,
  deriveNonColorTokens,
  deriveTexture,
  deriveTextureSpec,
  DISPLAY_RATIO_FLOOR,
  EXIT_RATIO,
  focusPx,
  fontFallbackClass,
  GEOMETRY_RADII,
  GLASS_SURFACE_MIX,
  HEADING_WEIGHT_RANGE,
  INSET_ASSIGNMENT_DEFAULT,
  MOTION_SCALE,
  RADIUS_ASSIGNMENT_DEFAULT,
  SHADOW_ASSIGNMENT_DEFAULT,
  SPACE_LADDER_PX,
  TEMPERAMENT_FOCUS_WIDTH,
  TEXTURE_MAX_DELTA_L,
  TYPE_BASE_PX,
  TYPE_ENTRY_FLOOR_PX,
  TYPE_RATIO,
  typeSizePx,
} from './derive'

export {
  ADMISSION_EXEMPTIONS,
  admitTheme,
  auditResolvedTheme,
  paletteJsonSchema,
  systemJsonSchema,
} from './admit'
export type {
  AdmissionFault,
  AdmissionInput,
  Admission,
  AdmittedFont,
  LawfulAdmission,
  RefusedAdmission,
} from './admit'

export { auditCoherence, coherenceMessage } from './coherence'
export type { CoherenceViolation } from './coherence'

export { moreContrastOf, resolveTheme } from './resolve-theme'

export { emitThemeCSS, emitThemesCSS, MORE_CONTRAST_QUERY } from './emit'
export type { EmitThemeOptions } from './emit'

export {
  emitTokenDocument,
  emitTokenDocumentJSON,
  TOKEN_DOCUMENT_FORMAT,
  TOKEN_DOCUMENT_SCHEMA,
  tokenDocumentJsonSchema,
} from './emit-tokens'
export type {
  DensityTokens,
  DocumentException,
  InvariantTokens,
  InverseTokens,
  ModeTokens,
  MotionTokenSet,
  RaisedToken,
  TokenColor,
  TokenDensityRef,
  TokenDocument,
  TokenDocumentOptions,
  TokenEm,
  TokenFamilyRef,
  TokenFont,
  TokenGradient,
  TokenNumeric,
  TokenPx,
  TokenRefColor,
  TokenRefPx,
  TokenRefShadow,
  TokenRem,
  TokenShadow,
  TokenShadowLayer,
  TokenSpring,
  TokenTexture,
} from './emit-tokens'

export { PLATFORM_FLOORS, PLATFORMS } from './platforms'
export type { Platform, PlatformFloor } from './platforms'

export {
  emitSwift,
  emitSwiftFiles,
  SWIFT_CATALOGUE_FILE,
  SWIFT_GENERATOR,
  swiftFileName,
  swiftMember,
  swiftThemeName,
} from './emit-swift'
export type { SwiftOptions } from './emit-swift'

export {
  appendThemeCSS,
  getMode,
  getModePreference,
  getPalette,
  getSystem,
  hasPairingCSS,
  hydrateTheme,
  installThemeCSS,
  PREPAINT_SCRIPT,
  readMode,
  SERVER_MODE,
  setDensityDefault,
  setMode,
  setMotionTemperament,
  setPalette,
  setSystem,
  STORAGE_KEYS,
  systemPrefersDark,
  teardownTheme,
  watchMode,
} from './runtime'
export type { InstalledCatalogue, ModeReading } from './runtime'

export {
  EXAMPLE_PALETTES,
  EXAMPLE_SYSTEMS,
  EXAMPLE_THEMES,
  exampleInkPalette,
  exampleInkTheme,
  exampleJadePalette,
  exampleQuietSystem,
  exampleQuietTheme,
  exampleStarkSystem,
  exampleStarkTheme,
  exampleVioletPalette,
} from './examples'

export { emitKotlin, emitKotlinFiles, KOTLIN_PACKAGE } from './emit-kotlin'
export { emitDart, emitDartFiles } from './emit-dart'
export { nativeName, nativePairingNames } from './native-model'
export type { NativePairingNames } from './native-model'
