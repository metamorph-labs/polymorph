# Flutter and Dart: the tokens only

Polymorph has no Flutter members. The Dart package polymorph_tokens holds each catalogue pairing
as a `const PMTheme` of plain Dart values, with no dependencies, Flutter included. A Flutter app
reads the same decisions the native members read, and builds its own widgets from them: the
colours in light and dark, the type steps, spacing, radii, shadows and motion. Nothing in polymorph
checks those widgets. The members, the screen contract and the red rules do not reach Flutter, so
the widgets keep the rule by hand: every colour, length, font and duration comes from the pairing.

## Add the package

The package lives in a directory of the repository, so a Flutter app depends on it by git at the
release tag:

```yaml
dependencies:
  polymorph_tokens:
    git:
      url: https://github.com/metamorph-labs/polymorph.git
      path: platforms/dart
      ref: v1.0.18
```

An app that holds a checkout of polymorph, or a git submodule of it, depends on it by path
instead: `path: ../polymorph/platforms/dart`.

## Read a pairing

```dart
import 'package:polymorph_tokens/polymorph_tokens.dart';

const theme = PMThemes.plain_neutral;
final density = theme.defaultDensity; // the density the system's axes select
final accent = theme.colors.accentBg.resolve(isDark: false); // a PMRgba
final gutter = density.space[4];
final body = theme.text.md; // size, lineHeight, tracking, weight
final duration = theme.defaultMotion.duration.control; // milliseconds
```

`PMThemes.named(system, palette)` finds a pairing by name, and `PMThemes.catalogue` lists them.
A colour role resolves for a mode with `resolve(isDark:)`, so the app passes the platform's
brightness.

## Map a value to Flutter

| Value | In Flutter |
| --- | --- |
| A colour, `PMRgba` | `Color(rgba.argb)` |
| A length: `space[4]`, `radius.control`, `controlHeight.md` | The `double` itself, in logical pixels |
| A type step's `lineHeight` | `TextStyle.height` |
| A type step's `tracking`, in em | `letterSpacing: tracking * size` |
| A duration, in milliseconds | `Duration(milliseconds: …)` |
| `PMEasing` | `Cubic(x1, y1, x2, y2)` |
| `PMSpring` | `SpringDescription(mass: s.mass, stiffness: s.stiffness, damping: s.damping)` |

The hit target, `density.hitTarget`, is 48 at every density, Flutter's minimum interactive size. A
widget shorter than it keeps its drawn height and extends its tap area to it, as Material's
`MaterialTapTargetSize.padded` does. The pairing names its font families and does not carry the
files, so the app bundles the fonts it uses.
