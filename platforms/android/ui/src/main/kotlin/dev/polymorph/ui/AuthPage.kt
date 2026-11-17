// AuthPage (`design/archetypes/auth-page.md`): sign-in, sign-up and reset, the
// one screen family outside AppShell. A centred column on the theme's wash
// (`bg.wash`, which is `bg.app` without a gradient seed; the page texture has
// no native rendering), filling the screen and scrolling when the keyboard or
// larger text needs the room: the brand, the Card, and the footer's links
// below it, `space.6` apart, no wider than four of the largest space step and
// one `space.6` (`PMRecipe.authPageMeasure`), inset `space.5` from the screen's
// edge.
//
// The Card holds the heading, start-aligned on the fields' edge (the title in
// `text.2xl`, the page's one top-level heading, with `backAction` beside it;
// the description in `text.md` secondary), the app's fields and actions, and
// `cardFooter`, the centred `text.sm` line that offers the other account
// action, `space.6` apart. The archetype adds `space.3` inside Card's own
// inset, because an auth card stands alone. The footer's links are a centred,
// wrapping row in `text.sm` secondary.
//
// `layout: illustrated` is the public account composition: the brand as a
// masthead in `text.lg` at the top, and the form in a frame (a `border.subtle`
// hairline at twice `radius.lg`) with its heading centred, and the app's
// decorative `illustration` beside it when the form column, the gap and the
// illustration fit at their widths (`PMRecipe.authIllustratedColumn`,
// `authIllustratedGap`, `authIllustrationWidth`). On a phone they do not, so
// the form takes the width without its frame or the illustration, as the
// web's does below 680px.
//
// The load status (`design/native/screen-contract.md`): `loading` is the web's
// `pending`: the page-transitions ribbon runs along the top and the fields stay
// as they are. `failed` puts a danger Alert above the fields, inside the Card,
// with `onRetry` when it is set; the fields keep what the person typed,
// because the Card's content is drawn at one place in every state. `empty` is
// `ready`. A new `transitionKey` fades the column in again, keeping its
// fields (`PMPageArrival`).
//
// Not drawn: the web stretches a `submit` Button to the Card's width, and
// Button draws at its own width, with no way for the Card to ask for more;
// the illustrated layout's taller fields, its larger title and its staggered
// field entrances reach into the app's fields, which a composable cannot.

package dev.polymorph.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.isTraversalGroup
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

object PMAuthPage : PMAuthPageRendering {
    @Composable
    override fun Render(props: PMAuthPageProps) {
        val theme = PM.theme
        val space = theme.defaultDensity.spacing
        val status = props.loadStatus
        val pending = status == PMLoadStatus.Loading
        val layout = props.layout ?: PMAuthPageLayout.Centered
        val wash = theme.gradients.bgWash.resolve(PM.dark)
        val attributes = buildMap {
            put("status", status.kind)
            put("layout", layout.value)
            if (pending) put("pending", "true")
        }

        BoxWithConstraints(
            Modifier
                .pmMember("AuthPage", attributes)
                .semantics { isTraversalGroup = true }
                .fillMaxSize()
                .background(theme.colors.bgApp.color)
                .then(if (wash.solid) Modifier else Modifier.background(wash.brush)),
        ) {
            val screen = maxHeight
            val wide = maxWidth
            Column(
                Modifier
                    .fillMaxSize()
                    // The scroll region ends at the keyboard, so a focused
                    // field scrolls into view above it in an app drawn edge to
                    // edge, which the keyboard does not resize.
                    .imePadding()
                    .verticalScroll(rememberScrollState()),
            ) {
                when (layout) {
                    PMAuthPageLayout.Centered -> Box(
                        Modifier
                            .fillMaxWidth()
                            .heightIn(min = screen)
                            .padding(space.s5),
                        contentAlignment = Alignment.Center,
                    ) { Centered(props, status) }
                    PMAuthPageLayout.Illustrated -> Illustrated(props, status, wide)
                }
            }
            if (pending) PMPageRibbon(Modifier.align(Alignment.TopStart))
        }
    }

    /** The centred card: the brand, the Card, the footer. */
    @Composable
    private fun Centered(props: PMAuthPageProps, status: PMLoadStatus) {
        val theme = PM.theme
        val space = theme.defaultDensity.spacing
        Column(
            Modifier.widthIn(max = space.s10 * PMRecipe.authPageMeasure + space.s6).fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(space.s6),
        ) {
            props.brand?.let { brand -> Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) { brand() } }
            PMCard { Box(Modifier.padding(space.s3)) { Form(props, status, centred = false, gap = space.s6) } }
            Footer(props.footer)
        }
    }

    /**
     * The public account composition: the masthead, then the framed form with
     * the illustration beside it when both fit, else the form alone at the
     * width without its frame.
     */
    @Composable
    private fun Illustrated(props: PMAuthPageProps, status: PMLoadStatus, width: Dp) {
        val theme = PM.theme
        val space = theme.defaultDensity.spacing
        val column = space.s6 * PMRecipe.authIllustratedColumn
        val gap = space.s6 * PMRecipe.authIllustratedGap - space.s2
        val art = space.s6 * PMRecipe.authIllustrationWidth
        val beside = props.illustration != null && width >= column + gap + art + PMGeometry.bothEdges(space.s6)
        val framed = width >= column + PMGeometry.bothEdges(space.s6)
        props.brand?.let { brand ->
            Box(Modifier.padding(space.s6 + space.s2)) {
                CompositionLocalProvider(
                    LocalTextStyle provides theme.text.lg.textStyle,
                    LocalContentColor provides theme.colors.textPrimary.color,
                ) { brand() }
            }
        }
        Row(
            Modifier.fillMaxWidth().padding(space.s6),
            horizontalArrangement = Arrangement.spacedBy(gap, Alignment.CenterHorizontally),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            val shape = theme.rounded(theme.radius.lg * PMRecipe.authFrameRadius)
            Column(
                Modifier
                    .widthIn(max = column)
                    .then(if (beside || !framed) Modifier.weight(1f, fill = false) else Modifier)
                    .then(
                        if (framed) {
                            Modifier
                                .border(PMGeometry.hairline, theme.colors.borderSubtle.color, shape)
                                .padding(space.s6 + space.s5 + space.s1)
                        } else {
                            Modifier.padding(vertical = space.s6)
                        },
                    ),
                verticalArrangement = Arrangement.spacedBy(space.s6),
            ) {
                Form(props, status, centred = true, gap = space.s6 + space.s2)
                Footer(props.footer)
            }
            if (beside) Box(Modifier.width(art)) { props.illustration() }
        }
    }

    /**
     * The heading, the failure when the load failed, the app's fields and
     * actions, and the card's footer line, drawn at one place in every state so
     * the fields keep what was typed.
     */
    @Composable
    private fun Form(props: PMAuthPageProps, status: PMLoadStatus, centred: Boolean, gap: Dp) {
        val theme = PM.theme
        val space = theme.defaultDensity.spacing
        val align = if (centred) TextAlign.Center else TextAlign.Start
        Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(gap)) {
            Column(verticalArrangement = Arrangement.spacedBy(space.s3)) {
                Row(horizontalArrangement = Arrangement.spacedBy(space.s2), verticalAlignment = Alignment.CenterVertically) {
                    props.backAction?.invoke()
                    Text(
                        text = props.title,
                        style = theme.text.text2xl.textStyle,
                        color = theme.colors.textPrimary.color,
                        textAlign = align,
                        modifier = Modifier.weight(1f).semantics { heading() },
                    )
                }
                props.description?.let { description ->
                    CompositionLocalProvider(
                        LocalTextStyle provides theme.text.md.textStyle.copy(textAlign = align),
                        LocalContentColor provides theme.colors.textSecondary.color,
                    ) { Box(Modifier.fillMaxWidth()) { description() } }
                }
            }
            if (status is PMLoadStatus.Failed) PMPageFailure(status.message, props.onRetry)
            // A status page whose heading says everything has no children, and
            // then the card holds no empty column for the gap to open around.
            props.children?.let { children ->
                PMPageArrival(props.transitionKey) {
                    Column(verticalArrangement = Arrangement.spacedBy(space.s6)) { children() }
                }
            }
            props.cardFooter?.let { line ->
                CompositionLocalProvider(
                    LocalTextStyle provides theme.text.sm.textStyle.copy(textAlign = TextAlign.Center),
                    LocalContentColor provides theme.colors.textSecondary.color,
                ) { Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) { line() } }
            }
        }
    }

    /** The page-level links under the card: centred, wrapping, `text.sm` secondary. */
    @Composable
    private fun Footer(footer: PMContent?) {
        footer ?: return
        val theme = PM.theme
        CompositionLocalProvider(
            LocalTextStyle provides theme.text.sm.textStyle,
            LocalContentColor provides theme.colors.textSecondary.color,
        ) {
            Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                PMInline(gap = PMSpaceStep.S3, justify = PMInlineJustify.Center, wrap = true) { footer() }
            }
        }
    }
}

/**
 * AuthPage's states: the four load states over the sign-in form, the spec's
 * entries with the footer's links and without a brand, the illustrated
 * composition on a phone and on a tablet, and two statuses: one way on, and
 * the heading alone. Each names what its body holds (`contains`).
 */
object AuthPageStates : PMStates {
    override val member = "AuthPage"

    private const val title = "Sign in to Relay"
    private const val description = "Use the email you were invited with."
    private const val failure = "We could not reach the sign-in service."
    private const val signUp = "Don't have an account? Ask your admin."
    private const val notFound = "Page not found"
    private const val notFoundDetail = "No Relay page exists at this address."
    private const val expired = "This link has expired"
    private const val expiredDetail = "Open the newest invitation email and follow its link."

    @Composable
    private fun Fields() {
        PMFormField(label = "Email") { PMInput(placeholder = "you@example.com", type = PMInputType.Email) }
        PMFormField(label = "Password", labelEnd = { PMLink(children = "Forgot password?", href = "https://relay.test/reset") }) {
            PMPasswordInput(toggleLabel = "Show password")
        }
        Column(verticalArrangement = Arrangement.spacedBy(PM.theme.defaultDensity.spacing.s3)) {
            PMButton(label = "Sign in", type = PMButtonType.Submit)
            PMButton(label = "Sign in with a passkey", appearance = PMButtonAppearance.OutlineNeutral)
        }
    }

    @Composable
    private fun Brand() {
        PMBadge(children = "Relay", tone = PMBadgeTone.Accent, variant = PMBadgeVariant.Solid)
    }

    @Composable
    private fun Page(status: PMLoadStatus, brand: Boolean = true, footer: Boolean = false, layout: PMAuthPageLayout? = null) {
        PMFixturePhone {
            PMAuthPage(
                loadStatus = status,
                onRetry = {},
                brand = if (brand) ({ Brand() }) else null,
                cardFooter = { Text(signUp) },
                description = { Text(description) },
                footer = if (footer) ({
                    PMLink(children = "Privacy", href = "https://relay.test/privacy")
                    PMLink(children = "Support", href = "https://relay.test/support")
                }) else null,
                illustration = { PMCard { PMText(size = PMTextSize.Sm, tone = PMTextTone.Secondary) { Text(PMSamples.body) } } },
                layout = layout,
                title = title,
            ) { Fields() }
        }
    }

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry("ready — sign in", expect = mapOf("status" to "ready", "layout" to "centered", "contains" to "Card,FormField,Button")) {
                Page(PMLoadStatus.Ready)
            },
            PMStateEntry("loading — pending, the fields kept", expect = mapOf("status" to "loading", "pending" to "true", "contains" to "FormField")) {
                Page(PMLoadStatus.Loading)
            },
            PMStateEntry("empty — as ready", expect = mapOf("status" to "empty", "contains" to "FormField")) { Page(PMLoadStatus.Empty) },
            PMStateEntry("failed — the Alert above the fields", expect = mapOf("status" to "failed", "contains" to "Alert,FormField")) {
                Page(PMLoadStatus.Failed(failure))
            },
            PMStateEntry("with the footer's links", expect = mapOf("status" to "ready", "contains" to "Link")) {
                Page(PMLoadStatus.Ready, footer = true)
            },
            PMStateEntry("brand-less", expect = mapOf("status" to "ready")) { Page(PMLoadStatus.Ready, brand = false) },
            PMStateEntry("illustrated, on a phone — the form alone", expect = mapOf("layout" to "illustrated")) {
                Page(PMLoadStatus.Ready, layout = PMAuthPageLayout.Illustrated)
            },
            PMStateEntry("a status — one way on", expect = mapOf("status" to "ready", "contains" to "Card,Link")) {
                PMFixturePhone {
                    PMAuthPage(loadStatus = PMLoadStatus.Ready, brand = { Brand() }, description = { Text(notFoundDetail) }, title = notFound) {
                        PMLink(
                            children = "Go to overview",
                            href = "https://relay.test/overview",
                            variant = PMLinkVariant.Button,
                            buttonVariant = PMLinkButtonVariant.Solid,
                        )
                    }
                }
            },
            PMStateEntry("a status — the heading alone, with nothing to do here", expect = mapOf("status" to "ready", "contains" to "Card")) {
                PMFixturePhone {
                    PMAuthPage(loadStatus = PMLoadStatus.Ready, description = { Text(expiredDetail) }, title = expired)
                }
            },
        )
}
