/**
 * The platforms a token document is written for, and the smallest control and
 * pressable target each one's guidance allows.
 *
 * Values are in the platform's density-independent unit: CSS px on the web,
 * points on iOS, dp on Android and logical pixels in Flutter. The token
 * document keeps one unit (the CSS reference pixel, equal to all three), so a
 * floor compares directly with a derived height.
 *
 * Two floors, because the guidance names two things:
 *
 * - `hitTarget` is the smallest area a pointer or a finger has to hit. Each
 *   platform's minimum is a hit area, not a visual size:
 *   - `web`: WCAG 2.2 success criterion 2.5.8, Target Size (Minimum), level
 *     AA: 24 × 24 CSS px.
 *   - `ios`: Apple's Human Interface Guidelines: a hit target of at least
 *     44 × 44 pt.
 *   - `android`: Material Design and the Android accessibility guidance: touch
 *     targets of at least 48 × 48 dp, at every density setting.
 *   - `dart`: Flutter's `kMinInteractiveDimension`, 48. A Flutter build runs
 *     on both phone platforms, and 48 meets both floors.
 * - `controlHeight` is the smallest height a control is drawn at: WCAG's 24 on
 *   every platform. A control's visual height is the density's decision, the
 *   same on every platform; a member smaller than the hit target extends its
 *   hit area to `hitTarget` (SwiftUI's `.contentShape` with a minimum frame,
 *   Compose's `minimumInteractiveComponentSize`), as a web member extends its
 *   own to at least `--pm-hit-target`. Raising heights to the hit target would draw
 *   every density at the same height on a phone.
 *
 * The derivation already holds every control to 24 at every density
 * (`systems.ts` checks an amended ladder), so the document raises no control
 * height on any platform, and raises the hit target on a native one.
 */

export const PLATFORMS = ['web', 'ios', 'android', 'dart'] as const
export type Platform = (typeof PLATFORMS)[number]

export interface PlatformFloor {
  controlHeight: number
  hitTarget: number
}

export const PLATFORM_FLOORS: Record<Platform, PlatformFloor> = {
  web: { controlHeight: 24, hitTarget: 24 },
  ios: { controlHeight: 24, hitTarget: 44 },
  android: { controlHeight: 24, hitTarget: 48 },
  dart: { controlHeight: 24, hitTarget: 48 },
}
