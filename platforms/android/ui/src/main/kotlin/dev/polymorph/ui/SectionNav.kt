// SectionNav (`design/components/section-nav.md`): the links between the
// sibling pages of one section, with the page the reader is on marked. It is
// not Tabs: an item is a link to a page, not a panel of this one.
//
// A row of items `space.1` apart that wraps onto further lines, so every item
// is on screen at any width and none is behind a scroll. An item is its label
// in `text.sm`, `text.secondary`, on one line that ends in an ellipsis when it
// is wider than the row, `space.3` across inside a pill of `radius.md` at
// least the small control height tall. Under the pointer an item other than
// the current one is `text.primary` on `bg.subtle`, over the control duration;
// a press ripples from the touch point in `bg.subtle` and scales it as a
// pressed control. The current item is `selection.text` on `selection.bg`, the
// selection the AppShell rail gives its current item, and keeps it under the
// pointer. Keyboard focus draws the focus ring around the pill. Each item
// reserves the hit target in the layout (`pmHitTarget`), so the lines of a
// wrapped row are the hit target tall and the touch areas of neighbouring
// lines do not overlap. Right to left, the row mirrors.
//
// An item is one node whose text is a link run, which TalkBack announces as a
// link. A press follows its `href`: to `onNavigate` when there is one
// (`link.md` §Routing), and otherwise through the composition's
// `LocalUriHandler`, so the app decides where it goes; an `href` the handler
// cannot open does nothing. The current item stays a link, the way back to
// its page.
//
// `current` names the item whose page the reader is on, compared as the page
// it names: its path, without an origin, a query, a hash or a trailing slash,
// with an exact `href` first, an `href` that is only a hash or a query as
// written, and an item written with an origin only for a `current` with the
// same one (`currentIndex`). At most one item is current, the first that
// matches. Its node is selected, the web's `aria-current`, and the root's
// identifier carries its `href` as `current`.
//
// The row is one node named by `label`, the web's navigation landmark, which
// TalkBack reads as a collection of its pages. Nothing moves between items:
// navigation does not animate.

package dev.polymorph.ui

import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.interaction.collectIsHoveredAsState
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.semantics.CollectionInfo
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.collectionInfo
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.isTraversalGroup
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.text
import androidx.compose.ui.text.LinkAnnotation
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withLink
import androidx.compose.ui.unit.dp

object PMSectionNav : PMSectionNavRendering {
    @Composable
    override fun Render(props: PMSectionNavProps) {
        val theme = PM.theme
        val space = theme.defaultDensity.spacing
        val at = currentIndex(props.items, props.current)
        val attributes = at?.let { mapOf("current" to props.items[it].href) } ?: emptyMap()

        FlowRow(
            Modifier
                .pmMember("SectionNav", attributes)
                .semantics {
                    contentDescription = props.label
                    collectionInfo = CollectionInfo(rowCount = props.items.size, columnCount = 1)
                    isTraversalGroup = true
                }
                .fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(space.s1),
            verticalArrangement = Arrangement.spacedBy(space.s1),
            itemVerticalAlignment = Alignment.CenterVertically,
        ) {
            props.items.forEachIndexed { index, item -> Item(item, index == at, props.onNavigate) }
        }
    }

    /** One item: the link to its page, in its pill. */
    @Composable
    private fun Item(item: PMSectionNavItem, current: Boolean, route: ((String) -> Unit)?) {
        val theme = PM.theme
        val density = theme.defaultDensity
        val colors = theme.colors
        val motion = theme.defaultMotion
        val uri = LocalUriHandler.current
        val interaction = remember { MutableInteractionSource() }
        val hovered by interaction.collectIsHoveredAsState()
        val pressed by interaction.collectIsPressedAsState()
        val focused by interaction.collectIsFocusedAsState()
        val active = !current && hovered
        val spec = motion.easing.standard.tween<Color>(motion.duration.control)
        val fill by animateColorAsState(
            when {
                current -> colors.selectionBg.color
                active -> colors.bgSubtle.color
                else -> Color.Transparent
            },
            spec,
            label = "fill",
        )
        val text by animateColorAsState(
            when {
                current -> colors.selectionText.color
                active -> colors.textPrimary.color
                else -> colors.textSecondary.color
            },
            spec,
            label = "text",
        )
        val shape = theme.rounded(theme.radius.md)
        val open = { if (route != null) route(item.href) else uri.pmOpen(item.href) }
        val run = buildAnnotatedString {
            withLink(LinkAnnotation.Clickable(item.href) { open() }) { append(item.label) }
        }

        Box(
            Modifier
                // The click first, so the node keeps its action under the cleared semantics.
                .clickable(interactionSource = interaction, indication = null) { open() }
                .clearAndSetSemantics {
                    this.text = run
                    onClick {
                        open()
                        true
                    }
                    if (current) selected = true
                }
                .pmHitTarget()
                .pmPressFeedback(pressed)
                // Outside the clip, so the ring draws beyond the pill's edge.
                .pmFocusRing(focused, theme.radius.md.dp)
                .clip(shape)
                .background(fill)
                .heightIn(min = density.controlHeight.sm.dp),
            contentAlignment = Alignment.Center,
        ) {
            if (!current) PMPressLayer(interaction, colors.bgSubtle.color, Modifier.matchParentSize())
            Text(
                text = item.label,
                style = theme.text.sm.textStyle,
                color = text,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(horizontal = density.spacing.s3),
            )
        }
    }

    /** The origin an address is written with: an optional scheme, then `//` and the authority up to the path, the query or the hash. */
    private val ORIGIN = Regex("^(?:[a-z][a-z\\d+.-]*:)?//[^/?#]*", RegexOption.IGNORE_CASE)

    /** An address's origin in lower case, or null for one written without an origin. */
    internal fun originOf(href: String): String? = ORIGIN.find(href)?.value?.lowercase()

    /**
     * The page an address names: its path without an origin, a query, a hash
     * or a trailing slash. An address that is only a hash or a query is the
     * whole address, and an origin with nothing after it names the root.
     */
    internal fun pageOf(href: String): String {
        if (href.startsWith("#") || href.startsWith("?")) return href
        val origin = ORIGIN.find(href)?.value.orEmpty()
        val path = href.substring(origin.length).substringBefore('?').substringBefore('#')
        if (path.isEmpty()) return if (origin.isEmpty()) "" else "/"
        return if (path.length > 1) path.trimEnd('/') else path
    }

    /**
     * The index of the current item, or null: the first item whose `href` is
     * exactly `current`, and otherwise the first that names the same page, on
     * the same origin when the item names one.
     */
    internal fun currentIndex(items: List<PMSectionNavItem>, current: String?): Int? {
        if (current == null) return null
        val exact = items.indexOfFirst { it.href == current }
        if (exact != -1) return exact
        val page = pageOf(current)
        val origin = originOf(current)
        val found = items.indexOfFirst { item ->
            val own = originOf(item.href)
            pageOf(item.href) == page && (own == null || own == origin)
        }
        return found.takeIf { it != -1 }
    }
}

/**
 * SectionNav's states, from the spec's States table: the first page current,
 * a later page current, no page current, nine pages that wrap, and a long
 * label that ends in an ellipsis.
 */
object SectionNavStates : PMStates {
    override val member = "SectionNav"

    private const val label = "Identity sections"
    private val four = listOf(
        PMSectionNavItem("Users", "#users"),
        PMSectionNavItem("Groups", "#groups"),
        PMSectionNavItem("Roles", "#roles"),
        PMSectionNavItem("Sessions", "#sessions"),
    )
    private val nine = four + listOf(
        PMSectionNavItem("Service accounts", "#service-accounts"),
        PMSectionNavItem("Sign-in policies", "#sign-in-policies"),
        PMSectionNavItem("Identity providers", "#identity-providers"),
        PMSectionNavItem("Delegations", "#delegations"),
        PMSectionNavItem("Recovery", "#recovery"),
    )
    private val long = listOf(
        PMSectionNavItem("Users", "#users"),
        PMSectionNavItem("Delegated administration approvals awaiting a second reviewer in every region", "#approvals"),
    )

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry("the first page is current", expect = mapOf("label" to label, "current" to "#users")) {
                PMSectionNav(current = "#users", items = four, label = label)
            },
            PMStateEntry("a later page is current", expect = mapOf("current" to "#roles")) {
                PMSectionNav(current = "#roles", items = four, label = label)
            },
            PMStateEntry("no page is current — the reader is outside every item", expect = mapOf("current" to "")) {
                PMSectionNav(items = four, label = label)
            },
            PMStateEntry("many pages — the row wraps onto further lines", expect = mapOf("current" to "#delegations")) {
                PMSectionNav(current = "#delegations", items = nine, label = label)
            },
            PMStateEntry("a long label — clipped, so the row does not widen the page", expect = mapOf("current" to "#users")) {
                PMSectionNav(current = "#users", items = long, label = label)
            },
        )
}
