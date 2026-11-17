// QRCode (`design/components/qr-code.md`): a string drawn as a QR Code symbol
// for a camera to read, such as an authenticator's `otpauth://` URI, a pairing
// link or a ticket. It is drawn on the device from `value`, so a secret never
// reaches an image server. Not an image (an app shows a symbol rendered
// elsewhere itself), not a chart, not a scanner.
//
// The matrix is CoreImage's QR generator, the platform's own encoder: the
// `value`'s UTF-8 bytes at the `errorCorrection` level (`M` by default), in
// the smallest version that holds them. CoreImage chooses the encoding mode
// and the mask itself, so a symbol may differ module for module from the
// web's, which encodes in byte mode; both read back as the same string. The
// member reads the generator's output as a matrix of modules and draws them
// itself, so the symbol is crisp at every size: each module is a whole number
// of device pixels and edges are not anti-aliased, the web's `crispEdges`,
// because a blurred module edge is the one rendering choice that can make a
// scan fail.
//
// The symbol is square: `space-10` + `space-8`, twice `space-10`, or twice
// `space-10` + `space-9` (`sm`, `md`, `lg`), so a roomier density gets a larger
// symbol, and no wider than the width it is offered, because a clipped finder
// pattern does not scan. The paper is `bg.surface` and the ink `text.primary`,
// both resolved in the pairing's light mode whatever the screen's (the web's
// `data-mode="light"`): scanners read dark modules on a light field, and in
// dark mode the symbol is a light card on a dark page. The quiet zone is four
// modules on every side, painted as paper, part of the symbol (ISO/IEC 18004
// §6.4.10). The corners are `radius.sm`. Nothing moves.
//
// One image element named by `label`, what the symbol is for, never its
// contents. An empty `value`, or one longer than the largest symbol holds,
// draws nothing: a truncated symbol scans as a different string.

import CoreImage
import CoreImage.CIFilterBuiltins
import PolymorphTokens
import SwiftUI

public struct PMQRCode: PMQRCodeRendering {
  @Environment(\.pmTheme) private var theme
  @Environment(\.displayScale) private var displayScale
  private let props: PMQRCodeProps

  public init(props: PMQRCodeProps) {
    self.props = props
  }

  public var body: some View {
    let size = props.size ?? .md
    let level = props.errorCorrection ?? .m
    if !props.value.isEmpty, let matrix = QRCodeMatrix.of(props.value, level) {
      let colors = theme.colors
      let paper = colors.bgSurface.resolved(in: .light).color
      let ink = colors.textPrimary.resolved(in: .light).color
      let pixel = 1 / max(1, displayScale)
      Canvas { context, box in
        let side = min(box.width, box.height)
        let extent = CGFloat(matrix.count + QRCodeMatrix.quietZone * 2)
        // A module is a whole number of device pixels, so every edge lands on
        // one; the paper takes up what the rounding leaves, around the symbol.
        let whole = (side / extent / pixel).rounded(.down) * pixel
        let module = whole > 0 ? whole : side / extent
        let inset = ((side - module * extent) / 2 / pixel).rounded(.down) * pixel
        let origin = inset + module * CGFloat(QRCodeMatrix.quietZone)
        context.fill(Path(CGRect(origin: .zero, size: box)), with: .color(paper))
        var marks = Path()
        for run in matrix.runs {
          marks.addRect(
            CGRect(
              x: origin + CGFloat(run.column) * module, y: origin + CGFloat(run.row) * module,
              width: CGFloat(run.length) * module, height: module))
        }
        context.fill(marks, with: .color(ink), style: FillStyle(antialiased: false))
      }
      .frame(maxWidth: side(size), maxHeight: side(size))
      .aspectRatio(1, contentMode: .fit)
      .clipShape(RoundedRectangle(cornerRadius: theme.radius.sm))
      .accessibilityElement(children: .ignore)
      .accessibilityLabel(Text(props.label))
      .accessibilityAddTraits(.isImage)
      .pmMember("QRCode", ["size": size.rawValue, "mode": "light"])
    }
  }

  /// The symbol's side, quiet zone included, from the space scale: the
  /// recipe's `PMRecipe.qrSize…` `space-10` steps, and one `space-8` more at
  /// `sm` and one `space-9` more at `lg`.
  private func side(_ size: PMControlSize) -> CGFloat {
    let space = theme.defaultDensity.space
    return switch size {
    case .sm: space.s10 * PMRecipe.qrSizeSm + space.s8
    case .md: space.s10 * PMRecipe.qrSizeMd
    case .lg: space.s10 * PMRecipe.qrSizeLg + space.s9
    }
  }
}

/// A symbol's modules as CoreImage's generator lays them out, without the
/// margin the generator adds: `count` modules a side, the dark ones as
/// horizontal runs. A symbol is a pure function of its string and level, so
/// each is made once and kept.
private final class QRCodeMatrix {
  /// The quiet zone the standard requires, in modules on every side.
  static let quietZone = 4

  struct Run {
    let row: Int
    let column: Int
    let length: Int
  }

  let count: Int
  let runs: [Run]

  private init(count: Int, runs: [Run]) {
    self.count = count
    self.runs = runs
  }

  private static let made = NSCache<NSString, QRCodeMatrix>()
  private static let context = CIContext(options: [.useSoftwareRenderer: true])

  /// The matrix for `value` at `level`, or `nil` when no symbol holds it.
  static func of(_ value: String, _ level: PMQRCodeErrorCorrection) -> QRCodeMatrix? {
    let key = "\(level.rawValue)\n\(value)" as NSString
    if let kept = made.object(forKey: key) { return kept }
    guard let matrix = generate(value, level) else { return nil }
    made.setObject(matrix, forKey: key)
    return matrix
  }

  private static func generate(_ value: String, _ level: PMQRCodeErrorCorrection) -> QRCodeMatrix? {
    let generator = CIFilter.qrCodeGenerator()
    generator.message = Data(value.utf8)
    generator.correctionLevel = level.rawValue
    // No image past the largest version: the string does not fit a symbol.
    guard let image = generator.outputImage else { return nil }
    let extent = image.extent.integral
    let width = Int(extent.width)
    let height = Int(extent.height)
    guard width > 0, height > 0 else { return nil }
    // One byte a module: dark below the midpoint of the grey scale.
    var grey = [UInt8](repeating: 0, count: width * height)
    context.render(
      image, toBitmap: &grey, rowBytes: width, bounds: extent, format: .L8, colorSpace: nil)
    let dark = { (row: Int, column: Int) in grey[row * width + column] < UInt8.max / 2 }

    // The symbol is the dark modules' bounds: its three finder patterns reach
    // its first and last rows and columns, so the generator's margin falls away.
    var top = height
    var left = width
    var bottom = -1
    var right = -1
    for row in 0..<height {
      for column in 0..<width where dark(row, column) {
        top = min(top, row)
        bottom = max(bottom, row)
        left = min(left, column)
        right = max(right, column)
      }
    }
    guard bottom >= top, right >= left else { return nil }

    var runs: [Run] = []
    for row in top...bottom {
      var column = left
      while column <= right {
        guard dark(row, column) else {
          column += 1
          continue
        }
        let start = column
        while column <= right, dark(row, column) { column += 1 }
        runs.append(Run(row: row - top, column: start - left, length: column - start))
      }
    }
    return QRCodeMatrix(count: max(bottom - top, right - left) + 1, runs: runs)
  }
}

/// QRCode's states, from the spec's States table: an authenticator enrolment
/// at each size, and the same string at high correction, a denser symbol in
/// the same box. An empty value draws nothing, so it has no entry: the harness
/// holds every entry to drawing.
public struct QRCodeStates: PMStates {
  public let member = "QRCode"

  public init() {}

  /// RFC 6238's own example secret: a fixture, not a credential.
  private static let enrolment =
    "otpauth://totp/Relay:rowan@relay.test?secret=JBSWY3DPEHPK3PXP&issuer=Relay"
  private static let setup = "Authenticator setup code"

  public var entries: [PMStateEntry] {
    [
      PMStateEntry(
        "an authenticator enrolment",
        expect: ["size": "md", "mode": "light", "label": Self.setup]
      ) {
        PMQRCode(props: PMQRCodeProps(label: Self.setup, value: Self.enrolment))
      },
      PMStateEntry("small", expect: ["size": "sm", "label": "Ticket 4821"]) {
        PMQRCode(
          props: PMQRCodeProps(label: "Ticket 4821", size: .sm, value: "https://relay.test/t/4821"))
      },
      PMStateEntry("large", expect: ["size": "lg", "label": Self.setup]) {
        PMQRCode(props: PMQRCodeProps(label: Self.setup, size: .lg, value: Self.enrolment))
      },
      PMStateEntry(
        "high correction — the same string, a denser symbol", expect: ["size": "md"]
      ) {
        PMQRCode(
          props: PMQRCodeProps(errorCorrection: .h, label: Self.setup, value: Self.enrolment))
      },
    ]
  }
}
