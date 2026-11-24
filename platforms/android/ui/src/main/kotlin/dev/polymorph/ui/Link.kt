// Link (`design/components/link.md`): navigation as text, or in Button's
// costume. The text variants are Compose's link text, an annotated string
// whose run is a `LinkAnnotation.Url`: TalkBack announces it as a link and
// lists it among the screen's links, a keyboard reaches it, and a press opens
// `href` through `LocalUriHandler`, so an app routes its own paths by
// providing a handler, and the platform opens the rest. Given `onNavigate`, a
// link that is not `external` calls it with `href` in place of opening it, as
// the web member stops the browser and calls the app's router (`link.md`
// §Routing); the link keeps its role and its look. What the router throws
// reaches the app, while an `href` the handler cannot open does nothing.
//
// `inline` is accent text in the type of the text around it
// (`LocalTextStyle`), underlined at rest in the softened `accent.underline`, a
// hairline `PMGeometry.underlineOffset` under the baseline; `standalone` is
// `text.sm` accent text with no underline at rest. Under the pointer, while
// pressed and while focused, both draw Compose's underline in the full text
// colour, the web's hover; the line is the font's own, so the web's thicker
// hover line is its colour alone. Keyboard focus also draws the focus ring
// around the text. `external` adds the `open-external` glyph after the text,
// inside the link, and keeps the link on one line, as the web's flex row
// does; every link leaves the app for the browser unless the app routes it,
// so there is no new tab to open.
//
// `button` wears Button's recipe by reference: `PMButton` in the
// `buttonVariant` × `tone` cell, at `size`, with `open-external` in its
// trailing slot. Its tones are Button's lawful grid: a filled variant with
// `neutral`, which the grid excludes, wears `accent`, as on iOS. Android has
// no link role for a control, so the costume is announced as the button it
// looks like. An inline link is one composable, so it cannot flow inside a
// wrapped paragraph; prose with links is Markdown's.

package dev.polymorph.ui

import androidx.compose.foundation.hoverable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsHoveredAsState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.text.InlineTextContent
import androidx.compose.foundation.text.appendInlineContent
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.platform.UriHandler
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.text
import androidx.compose.ui.text.LinkAnnotation
import androidx.compose.ui.text.Placeholder
import androidx.compose.ui.text.PlaceholderVerticalAlign
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.withLink
import androidx.compose.ui.unit.dp

object PMLink : PMLinkRendering {
    @Composable
    override fun Render(props: PMLinkProps) {
        val variant = props.variant ?: PMLinkVariant.Inline
        val external = props.external ?: false
        // An external link leaves the app, as it opens a new tab on the web.
        PMRoutes(if (external) null else props.onNavigate) {
            if (variant == PMLinkVariant.Button) {
                Costume(props, external)
            } else {
                LinkText(props.children, props.href, standalone = variant == PMLinkVariant.Standalone, external = external)
            }
        }
    }

    /** The costume's cell: `buttonVariant` (`soft` unless chosen) × `tone`, within Button's lawful grid. */
    private fun appearance(props: PMLinkProps): PMButtonAppearance {
        val variant = PMButtonVariant.entries.first { it.value == (props.buttonVariant ?: PMLinkButtonVariant.Soft).value }
        val tone = PMButtonTone.entries.first { it.value == (props.tone ?: PMLinkTone.Accent).value }
        return PMButtonAppearance.of(variant, tone) ?: PMButtonAppearance.of(variant, PMButtonTone.Accent) ?: PMButtonAppearance.SoftAccent
    }

    @Composable
    private fun Costume(props: PMLinkProps, external: Boolean) {
        val appearance = appearance(props)
        val size = props.size ?: PMControlSize.Md
        val uri = LocalUriHandler.current
        // The costume's attributes are Button's, as the web's are.
        val attributes = buildMap {
            put("variant", appearance.variant.value)
            put("tone", appearance.tone.value)
            put("size", size.value)
            if (external) put("external", "true")
        }
        Box(Modifier.pmMember("Link", attributes)) {
            PMButton(
                label = props.children,
                onClick = { uri.pmOpen(props.href) },
                size = size,
                trailingIcon = if (external) PMIconRole.OpenExternal else null,
                appearance = appearance,
            )
        }
    }

    /**
     * The text variants: the link run, the external glyph inside it, the
     * softened rest underline of an inline link, and the focus ring around it.
     */
    @Composable
    private fun LinkText(text: String, href: String, standalone: Boolean, external: Boolean) {
        val theme = PM.theme
        val colors = theme.colors
        val accent = colors.accentText.color
        val line = colors.accentUnderline.color
        val interaction = remember { MutableInteractionSource() }
        val hovered by interaction.collectIsHoveredAsState()
        var focused by remember { mutableStateOf(false) }
        var layout by remember { mutableStateOf<TextLayoutResult?>(null) }
        // Link's grammar with no rest underline: the inline link draws its own, softened, below.
        val link = LinkAnnotation.Url(href, pmLinkStyles(accent, accent, underlined = false))
        val annotated = buildAnnotatedString {
            withLink(link) {
                append(text)
                if (external) appendInlineContent(GLYPH)
            }
        }
        val spoken = buildAnnotatedString { withLink(link) { append(text) } }
        val uri = LocalUriHandler.current
        val glyph = theme.icon.sm.size
        val space = theme.defaultDensity.spacing
        val placeholder = with(LocalDensity.current) { (glyph.dp + space.s1).toSp() }
        val inline = mapOf(
            GLYPH to InlineTextContent(Placeholder(placeholder, placeholder, PlaceholderVerticalAlign.TextCenter)) {
                Box(Modifier.padding(start = space.s1).size(glyph.dp), contentAlignment = Alignment.Center) {
                    PMIconView(PMIconRole.OpenExternal, PMControlSize.Sm, tint = accent)
                }
            },
        )
        val attributes = buildMap {
            put("variant", if (standalone) "standalone" else "inline")
            if (external) put("external", "true")
        }
        val underline = PMGeometry.underlineOffset
        val hairline = PMGeometry.hairline
        Box(
            Modifier
                .pmMember("Link", attributes)
                // One element for accessibility, the text with its link span,
                // which TalkBack announces as a link and activates here; the
                // pointer and the keyboard reach the run itself.
                .clearAndSetSemantics {
                    this.text = spoken
                    onClick {
                        uri.pmOpen(href)
                        true
                    }
                }
                .pmHitTarget()
                .hoverable(interaction)
                // The link run takes focus; its parent hears it, and draws the
                // mark around the text box with a gap.
                .onFocusChanged { focused = it.hasFocus }
                .pmFocusRing(focused, theme.radius.sm.dp, around = true),
            contentAlignment = Alignment.CenterStart,
        ) {
            Text(
                text = annotated,
                style = if (standalone) theme.text.sm.textStyle else LocalTextStyle.current,
                color = accent,
                inlineContent = inline,
                maxLines = if (external) 1 else Int.MAX_VALUE,
                softWrap = !external,
                onTextLayout = { layout = it },
                modifier = Modifier.drawBehind {
                    // The rest underline: the inline link's alone, under the text and not the glyph.
                    val laid = layout
                    if (standalone || hovered || focused || laid == null) return@drawBehind
                    // The last line runs from where it starts to where the text
                    // ends, before the glyph: left to right in a left-to-right
                    // paragraph, right to left in a right-to-left one, so the
                    // line is drawn from the lesser of the two to the greater.
                    val end = laid.getHorizontalPosition(text.length, usePrimaryDirection = true)
                    val last = laid.getLineForOffset(text.length)
                    for (index in 0..last) {
                        val y = laid.getLineBaseline(index) + underline.toPx()
                        val begin = laid.getHorizontalPosition(laid.getLineStart(index), usePrimaryDirection = true)
                        val from = if (index == last) minOf(begin, end) else laid.getLineLeft(index)
                        val to = if (index == last) maxOf(begin, end) else laid.getLineRight(index)
                        drawLine(line, Offset(from, y), Offset(to, y), strokeWidth = hairline.toPx())
                    }
                },
            )
        }
    }

    /** The external glyph's slot in the link run. */
    private const val GLYPH = "open-external"
}

/** Link's states, from the spec's States table. */
object LinkStates : PMStates {
    override val member = "Link"

    private const val status = "https://example.com/status"
    private const val after = " has the response bodies."

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry("inline — underlined, in the type around it", expect = mapOf("variant" to "inline")) {
                val theme = PM.theme
                CompositionLocalProvider(
                    LocalTextStyle provides theme.text.md.textStyle,
                    LocalContentColor provides theme.colors.textPrimary.color,
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        PMLink(children = "The delivery log", href = "https://example.com/deliveries")
                        Text(after)
                    }
                }
            },
            PMStateEntry(
                "standalone — a row, underlined under the pointer instead",
                expect = mapOf("variant" to "standalone", "label" to "Open the audit trail"),
            ) {
                PMLink(children = "Open the audit trail", href = "https://example.com/audit", variant = PMLinkVariant.Standalone)
            },
            PMStateEntry("external — the glyph after the text", expect = mapOf("external" to "true")) {
                PMLink(children = "Status page", external = true, href = status)
            },
            PMStateEntry("external and standalone", expect = mapOf("external" to "true", "variant" to "standalone")) {
                PMLink(children = "Webhook documentation", external = true, href = "https://example.com/docs", variant = PMLinkVariant.Standalone)
            },
            PMStateEntry(
                "the costume, default — soft, accent, md",
                expect = mapOf("variant" to "soft", "tone" to "accent", "size" to "md", "contains" to "Button"),
            ) {
                PMLink(children = "View billing", href = "https://example.com/billing", variant = PMLinkVariant.Button)
            },
            PMStateEntry("the costume as solid", expect = mapOf("variant" to "solid", "tone" to "accent")) {
                PMLink(buttonVariant = PMLinkButtonVariant.Solid, children = "Start setup", href = "https://example.com/setup", variant = PMLinkVariant.Button)
            },
            PMStateEntry("the costume as outline neutral", expect = mapOf("variant" to "outline", "tone" to "neutral")) {
                PMLink(
                    buttonVariant = PMLinkButtonVariant.Outline,
                    children = "Read the docs",
                    href = "https://example.com/docs",
                    tone = PMLinkTone.Neutral,
                    variant = PMLinkVariant.Button,
                )
            },
            PMStateEntry(
                "external in costume — the glyph in Button's trailing slot",
                expect = mapOf("external" to "true", "variant" to "outline"),
            ) {
                PMLink(buttonVariant = PMLinkButtonVariant.Outline, children = "Status page", external = true, href = status, variant = PMLinkVariant.Button)
            },
        )
}

/**
 * The routing seam (`link.md` §Routing): with `onNavigate`, a link inside
 * calls it with the `href` it would open, in place of the composition's
 * `LocalUriHandler`, so the app's router takes it; without, the link opens as
 * the handler says.
 */
@Composable
internal fun PMRoutes(onNavigate: ((String) -> Unit)?, content: @Composable () -> Unit) {
    if (onNavigate == null) {
        content()
        return
    }
    val router = remember(onNavigate) { PMRouter(onNavigate) }
    CompositionLocalProvider(LocalUriHandler provides router, content = content)
}

/** The app's router as the URI handler a link inside [PMRoutes] opens through. */
private class PMRouter(private val onNavigate: (String) -> Unit) : UriHandler {
    override fun openUri(uri: String) = onNavigate(uri)
}

/**
 * Opens [href] through this handler. The app's router ([PMRoutes]) is called
 * as it is, so what it throws reaches the app. Any other handler throws for an
 * `href` it cannot open, Android's for a relative path that no activity takes,
 * and a press must not end the app, so that is caught.
 */
internal fun UriHandler.pmOpen(href: String) {
    if (this is PMRouter) openUri(href) else runCatching { openUri(href) }
}
