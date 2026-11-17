// AuthPage (`design/archetypes/auth-page.md`): sign-in, sign-up and reset, the
// one screen family outside AppShell. A centred column on the theme's wash,
// filling the screen and scrolling when the keyboard or larger text needs the
// room: the brand, the Card, and the footer's links below it.
//
// The Card holds the heading, start-aligned on the fields' edge (the title in
// `text.2xl`, the page's one top-level heading, with `backAction` beside it;
// the description in `text.md` secondary), the app's fields and actions at
// `space.6`, and `cardFooter`, the centred `text.sm` line that offers the
// other account action. The archetype adds `space.3` inside Card's own inset,
// because an auth card stands alone. The column is no wider than four of the
// largest space step and one `space.6`, inset `space.5` from the screen's
// edge. The background is `bg.wash`, which is `bg.app` without a gradient
// seed; the page texture has no native rendering.
//
// `layout: .illustrated` is the public account composition: the brand as a
// masthead in `text.lg` at the top, and the form in a frame (a `border.subtle`
// hairline at twice `radius.lg`) with its heading centred, and the app's
// decorative `illustration` beside it when both fit at their widths
// (`ViewThatFits`). On a phone neither fits, so the form takes the width
// without its frame, as the web's does below 680px.
//
// The load status (`design/native/screen-contract.md`): `loading` is the web's
// `pending`: the page-transitions ribbon runs along the top and the fields stay
// as they are. `failed` puts a danger Alert above the fields, inside the Card,
// with `onRetry` when it is set; the fields keep what the person typed,
// because the Card's content is drawn at one place in every state. `empty` is
// `ready`. A new `transitionKey` fades the column in again, keeping its fields.
//
// Not drawn: the web stretches a `submit` Button to the Card's width, and
// Button draws at its own width, with no way for the Card to ask for more;
// the illustrated layout's taller fields and its staggered field entrances
// reach into the app's fields, which a SwiftUI view cannot.

import PolymorphTokens
import SwiftUI

public struct PMAuthPage: PMAuthPageRendering {
  @Environment(\.pmTheme) private var theme
  @Environment(\.pmPageScrolls) private var scrolls
  private let props: PMAuthPageProps

  public init(props: PMAuthPageProps) {
    self.props = props
  }

  public var body: some View {
    let status = props.loadStatus
    let layout = props.layout ?? .centered
    var attributes = ["status": status.kind, "layout": layout.rawValue]
    if status == .loading { attributes["pending"] = "true" }

    return Group {
      if scrolls {
        GeometryReader { proxy in
          ScrollView {
            page(layout).frame(maxWidth: .infinity, minHeight: proxy.size.height)
          }
        }
      } else {
        page(layout).frame(maxWidth: .infinity)
      }
    }
    .background { theme.gradients.bgWash.linear.ignoresSafeArea() }
    .overlay(alignment: .top) {
      if status == .loading {
        PMPageRibbon()
      }
    }
    .accessibilityElement(children: .contain)
    .pmMember("AuthPage", attributes)
  }

  @ViewBuilder
  private func page(_ layout: PMAuthPageLayout) -> some View {
    PMPageArrival(transitionKey: props.transitionKey) {
      switch layout {
      case .centered: centered
      case .illustrated: illustrated
      }
    }
  }

  // MARK: The centred card

  private var centered: some View {
    let space = theme.defaultDensity.space
    return VStack(spacing: space.s6) {
      if let brand = props.brand {
        brand.frame(maxWidth: .infinity)
      }
      PMCard(props: PMCardProps(children: AnyView(card(illustrated: false))))
      footer
    }
    .frame(maxWidth: column)
    .padding(space.s5)
    .frame(maxWidth: .infinity, maxHeight: .infinity)
  }

  // MARK: The illustrated layout

  private var illustrated: some View {
    let space = theme.defaultDensity.space
    let form = space.s6 * PMRecipe.authIllustratedColumn
    let wide = (
      art: space.s6 * PMRecipe.authIllustrationWidth,
      gap: space.s6 * PMRecipe.authIllustratedGap - space.s2
    )
    let narrow = (
      art: space.s6 * PMRecipe.authNarrowIllustrationWidth,
      gap: space.s6 * PMRecipe.authNarrowGap + space.s3
    )
    return VStack(spacing: 0) {
      if let brand = props.brand {
        brand
          .pmTextStyle(theme.text.lg)
          .foregroundStyle(theme.colors.textPrimary.color)
          .padding(space.s6 + space.s2)
          .frame(maxWidth: .infinity, alignment: .leading)
      }
      ViewThatFits(in: .horizontal) {
        if let art = props.illustration {
          HStack(spacing: wide.gap) {
            artwork(art, width: wide.art)
            framed.frame(width: form)
          }
          HStack(spacing: narrow.gap) {
            artwork(art, width: narrow.art)
            framed.frame(width: column)
          }
        } else {
          framed.frame(width: form)
        }
        // The phone's form: the width, no frame.
        VStack(spacing: space.s6) {
          card(illustrated: true)
          footer
        }
        .padding(.vertical, space.s6)
      }
      .padding(space.s6)
      .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
  }

  /// The form in its frame, with the footer's links below.
  private var framed: some View {
    let space = theme.defaultDensity.space
    let shape = RoundedRectangle(cornerRadius: theme.radius.lg * PMRecipe.authFrameRadius)
    return VStack(spacing: space.s6) {
      card(illustrated: true)
        .padding(space.s6 + space.s5 + space.s1)
        .overlay { shape.strokeBorder(theme.colors.borderSubtle.color, lineWidth: 1) }
      footer
    }
  }

  /// The host's artwork at `width`, decorative.
  private func artwork(_ art: PMContent, width: CGFloat) -> some View {
    art
      .frame(width: width)
      .accessibilityHidden(true)
  }

  // MARK: The card's content

  /// The heading, the failure, the app's fields and actions, and the card's
  /// footer. Centred and roomier in the illustrated layout. The fields are at
  /// one place in the view tree in every state, so a failure never rebuilds
  /// them.
  private func card(illustrated: Bool) -> some View {
    let space = theme.defaultDensity.space
    return VStack(alignment: .leading, spacing: illustrated ? space.s6 + space.s2 : space.s6) {
      heading(centred: illustrated)
      if case .failed(let message) = props.loadStatus {
        PMPageFailure(message: message, onRetry: props.onRetry)
      }
      props.children
      if let cardFooter = props.cardFooter {
        cardFooter
          .pmTextStyle(theme.text.sm)
          .foregroundStyle(theme.colors.textSecondary.color)
          .multilineTextAlignment(.center)
          .frame(maxWidth: .infinity)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(illustrated ? 0 : space.s3)
  }

  private func heading(centred: Bool) -> some View {
    let space = theme.defaultDensity.space
    return VStack(alignment: centred ? .center : .leading, spacing: space.s3) {
      titleRow(centred: centred)
      if let description = props.description {
        description
          .pmTextStyle(theme.text.md)
          .foregroundStyle(theme.colors.textSecondary.color)
          .multilineTextAlignment(centred ? .center : .leading)
          .fixedSize(horizontal: false, vertical: true)
      }
    }
    .frame(maxWidth: .infinity, alignment: centred ? .center : .leading)
  }

  /// The title, with the back control before it. Centred, a space as wide as
  /// the control balances it on the other side, so the title stays centred.
  @ViewBuilder
  private func titleRow(centred: Bool) -> some View {
    let space = theme.defaultDensity.space
    let title = Text(props.title)
      .pmTextStyle(theme.text.text2xl)
      .foregroundStyle(theme.colors.textPrimary.color)
      .multilineTextAlignment(centred ? .center : .leading)
      .fixedSize(horizontal: false, vertical: true)
      .accessibilityAddTraits(.isHeader)
      .accessibilityHeading(.h1)
    if let back = props.backAction {
      if centred {
        let side = theme.defaultDensity.controlHeight.md
        HStack(alignment: .top, spacing: 0) {
          back.frame(width: side)
          title.frame(maxWidth: .infinity)
          Color.clear.frame(width: side, height: 0)
        }
      } else {
        HStack(alignment: .top, spacing: space.s2) {
          back
          title
        }
      }
    } else {
      title
    }
  }

  /// The centred card's column: `PMRecipe.authPageMeasure` of the largest
  /// space step and one `space.6`, the web's `--pm-page-max-width`.
  private var column: CGFloat {
    let space = theme.defaultDensity.space
    return space.s10 * PMRecipe.authPageMeasure + space.s6
  }

  /// The links below the card, centred and wrapping, in `text.sm` secondary.
  @ViewBuilder
  private var footer: some View {
    if let footer = props.footer {
      PMInline(props: PMInlineProps(children: footer, gap: .s3, justify: .center, wrap: true))
        .pmTextStyle(theme.text.sm)
        .foregroundStyle(theme.colors.textSecondary.color)
    }
  }
}

/// AuthPage's states: the spec's four compositions, the four load states the
/// screen contract names (loading is the web's pending, with the fields kept),
/// a back control, the illustrated layout on a phone and on an iPad, and two
/// statuses: one way on, and the heading alone. Each names what its body holds
/// (`contains`).
public struct AuthPageStates: PMStates {
  public let member = "AuthPage"

  public init() {}

  private static let product = "Relay"
  private static let title = "Welcome back"
  private static let invited = "Enter the address your team invited."
  private static let noAccount = "Don’t have an account?"
  private static let rejected = "That password does not match."
  private static let failure = "We could not reach the server. Your details are kept."

  private static func brand() -> PMContent {
    AnyView(PMBadge(props: PMBadgeProps(children: product, tone: .accent, variant: .solid)))
  }

  private static func signUp() -> PMContent {
    AnyView(
      PMInline(
        props: PMInlineProps(
          children: AnyView(
            Group {
              Text(noAccount)
              PMLink(props: PMLinkProps(children: "Sign up", href: "#signup"))
            }),
          gap: .s1, justify: .center, wrap: true)))
  }

  private static func description() -> PMContent {
    AnyView(Text(invited))
  }

  private static func fields(error: String? = nil) -> PMContent {
    AnyView(
      Group {
        PMFormField(
          props: PMFormFieldProps(
            children: AnyView(
              PMInput(
                props: PMInputProps(
                  autoComplete: "email", placeholder: "you@example.com", type: .email))),
            label: "Email"))
        PMFormField(
          props: PMFormFieldProps(
            children: AnyView(
              PMInput(props: PMInputProps(autoComplete: "current-password", type: .password))),
            error: error, label: "Password",
            labelEnd: AnyView(
              PMLink(
                props: PMLinkProps(
                  children: "Forgot your password?", href: "#reset", variant: .standalone)))))
        PMStack(
          props: PMStackProps(
            children: AnyView(
              Group {
                PMButton(props: PMButtonProps(label: "Sign in", type: .submit))
                PMButton(
                  props: PMButtonProps(
                    label: "Email me a sign-in link", appearance: .outlineNeutral))
              }),
            gap: .s3))
      })
  }

  private static func signIn(
    _ status: PMLoadStatus = .ready, error: String? = nil, footer: PMContent? = nil,
    back: Bool = false
  ) -> some View {
    PMAuthPage(
      props: PMAuthPageProps(
        loadStatus: status, onRetry: {},
        backAction: back
          ? AnyView(
            PMButton(
              props: PMButtonProps(
                icon: .back, iconOnly: true, label: "Back", size: .sm,
                appearance: .ghostNeutral)))
          : nil,
        brand: brand(), cardFooter: signUp(), children: fields(error: error),
        description: description(), footer: footer, title: title)
    )
    .pmFixtureScreenTop()
  }

  private static func illustrated() -> some View {
    PMAuthPage(
      props: PMAuthPageProps(
        loadStatus: .ready, brand: AnyView(Text(product)), cardFooter: signUp(),
        children: fields(), description: description(),
        illustration: AnyView(PMAuthSampleArt()), layout: .illustrated, title: title)
    )
    .pmFixtureScreenTop()
  }

  public var entries: [PMStateEntry] {
    [
      PMStateEntry(
        "sign in — the login block’s composition",
        expect: ["status": "ready", "layout": "centered", "contains": "FormField,Input,Link"]
      ) {
        Self.signIn()
      },
      PMStateEntry(
        "with a footer below the card — furniture, not the form’s own line",
        expect: ["status": "ready", "contains": "Link,Input"]
      ) {
        Self.signIn(
          footer: AnyView(
            Group {
              PMLink(props: PMLinkProps(children: "Use SSO", href: "#sso"))
              PMLink(props: PMLinkProps(children: "Support", href: "#help"))
            }))
      },
      PMStateEntry(
        "rejected — the error is the field’s, not a banner’s",
        expect: ["status": "ready", "contains": "FormField,Input"]
      ) {
        Self.signIn(error: Self.rejected)
      },
      PMStateEntry(
        "no brand — the card carries the whole moment",
        expect: ["status": "ready", "contains": "FormField,Input,Button"]
      ) {
        PMAuthPage(
          props: PMAuthPageProps(
            loadStatus: .ready,
            children: AnyView(
              Group {
                PMFormField(
                  props: PMFormFieldProps(
                    children: AnyView(
                      PMInput(props: PMInputProps(autoComplete: "email", type: .email))),
                    label: "Email"))
                PMButton(props: PMButtonProps(label: "Send the link", type: .submit))
              }),
            description: AnyView(Text(Self.emailed)), title: "Reset your password")
        )
      },
      PMStateEntry(
        "loading — pending, the fields stay",
        expect: ["status": "loading", "pending": "true", "contains": "FormField,Input"]
      ) {
        Self.signIn(.loading)
      },
      PMStateEntry("empty — as ready", expect: ["status": "empty", "contains": "FormField,Input"]) {
        Self.signIn(.empty)
      },
      PMStateEntry(
        "failed — the Alert above the fields, which keep their input",
        expect: ["status": "failed", "contains": "Alert,Input"]
      ) {
        Self.signIn(.failed(message: Self.failure))
      },
      PMStateEntry(
        "with a back control",
        expect: ["status": "ready", "contains": "Button[icon-only=true],Input"]
      ) {
        Self.signIn(back: true)
      },
      PMStateEntry(
        "illustrated on a phone — the form takes the width",
        expect: ["layout": "illustrated", "contains": "Input"]
      ) {
        Self.illustrated()
      },
      PMStateEntry(
        "illustrated on an iPad — the artwork beside the framed form",
        expect: ["layout": "illustrated", "contains": "Input"]
      ) {
        Self.illustrated().pmFixtureWidth(PMFixtureWindow.landscapeIPadPro)
      },
      PMStateEntry(
        "a status — nothing is at this address, and one way on",
        expect: ["status": "ready", "contains": "Link"]
      ) {
        PMAuthPage(
          props: PMAuthPageProps(
            loadStatus: .ready, brand: Self.brand(),
            children: AnyView(
              PMLink(
                props: PMLinkProps(
                  buttonVariant: .solid, children: "Go to overview", href: "#overview",
                  variant: .button))),
            description: AnyView(Text(Self.noPage)), title: "Page not found")
        )
        .pmFixtureScreenTop()
      },
      PMStateEntry(
        "a status — the heading alone, with nothing to do here",
        expect: ["status": "ready"]
      ) {
        PMAuthPage(
          props: PMAuthPageProps(
            loadStatus: .ready, description: AnyView(Text(Self.expired)),
            title: "This link has expired")
        )
        .pmFixtureScreenTop()
      },
    ]
  }

  private static let emailed = "We will email you a link."
  private static let noPage = "No Relay page exists at this address."
  private static let expired = "Open the newest invitation email and follow its link."
}

/// Sample artwork for the illustrated layout: a panel of the accent's subtle
/// fill, four wide by five tall.
private struct PMAuthSampleArt: View {
  @Environment(\.pmTheme) private var theme

  var body: some View {
    RoundedRectangle(cornerRadius: theme.radius.lg * PMRecipe.authFrameRadius)
      .fill(theme.colors.accentSubtle.color)
      .aspectRatio(4 / 5, contentMode: .fit)
  }
}
