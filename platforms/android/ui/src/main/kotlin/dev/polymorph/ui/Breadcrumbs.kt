// Breadcrumbs (`design/components/breadcrumbs.md`): the trail from the root to
// the current page. One row in `text.sm`, `space.2` apart, that never wraps,
// because a trail on two lines reads as two locations: a crumb is clipped at
// twice `space.10` with an ellipsis, and a row narrower than its crumbs
// shortens the crumbs between the first and the current page. A shortened
// crumb's touch area is the hit target wide, centred on it, over the
// separators either side of it, which are not controls; the first crumb has
// no separator before it, at the row's start, so it keeps its own width, at
// least the hit target (`pmHitTarget`). Past `maxItems` (4) the trail
// collapses to the first crumb, the overflow and the last two, so both ends of
// the path stay visible; a trail that would hide nothing is drawn whole.
//
// A crumb is Link's grammar in `text.secondary` (`PMTextLink`), `text.primary`
// and underlined under the pointer and while pressed. A press on a crumb runs
// the item's `onSelect`, for an app that routes its own navigation, and then
// follows its `href`: to the trail's `onNavigate` when there is one
// (`link.md` §Routing), and otherwise through the composition's
// `LocalUriHandler`, so the app decides where it goes. The web runs
// `onSelect` beside the click the same way. A crumb with neither is text in
// the crumb's colour, because it is still part of the path. The last crumb is
// the current page: `text.primary` text, never a link to itself, and
// selected, the web's `aria-current`.
//
// The overflow is Menu, behind Button `ghost`/`neutral`/`sm` icon-only
// `overflow`, named by `overflowLabel`: a sheet of the hidden crumbs on a
// phone and a dropdown on a tablet, as Menu is everywhere. Its commands are
// the hidden crumbs in order; choosing one calls its `onSelect`, or
// `onNavigate` with its `href`, or opens its `href`. `defaultOpen` opens it on
// its own, as Menu's does.
//
// No motion: navigation does not animate. The separators are the `next` glyph
// at `sm` in `text.muted`, decorative. The trail is named by `label`.

package dev.polymorph.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.platform.UriHandler
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.isTraversalGroup
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow

object PMBreadcrumbs : PMBreadcrumbsRendering {
    /** `maxItems`' default (`breadcrumbs.md`). */
    private const val MAX_ITEMS = 4.0

    /** The crumbs kept beside the overflow: the first, and the last two. */
    private const val KEPT = 3
    private const val TAIL = 2

    /** One place in the drawn trail: a crumb, or the overflow. */
    private sealed interface Rung {
        class Crumb(val item: PMBreadcrumbItem) : Rung
        data object Overflow : Rung
    }

    @Composable
    override fun Render(props: PMBreadcrumbsProps) {
        val theme = PM.theme
        val space = theme.defaultDensity.spacing
        val strings = PMSpecDefault.strings
        val uri = LocalUriHandler.current
        val route = props.onNavigate
        val items = props.items
        val collapses = items.size > (props.maxItems ?: MAX_ITEMS) && items.size > KEPT
        val hidden = if (collapses) items.drop(1).dropLast(TAIL) else emptyList()
        val row: List<Rung> = if (collapses) {
            listOf(Rung.Crumb(items.first()), Rung.Overflow) + items.takeLast(TAIL).map { Rung.Crumb(it) }
        } else {
            items.map { Rung.Crumb(it) }
        }
        val measure = space.s10 * PMRecipe.crumbMeasure

        Row(
            Modifier
                .pmMember("Breadcrumbs", if (collapses) mapOf("collapsed" to "true") else emptyMap())
                .semantics {
                    contentDescription = props.label ?: strings.breadcrumb
                    isTraversalGroup = true
                }
                .fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(space.s2),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            row.forEachIndexed { index, rung ->
                val last = index == row.lastIndex
                when {
                    rung is Rung.Overflow -> PMMenu(
                        defaultOpen = props.defaultOpen,
                        items = hidden.map { item -> PMMenuEntry.Item(PMMenuItemEntry(label = item.label, onSelect = { select(item, uri, route) })) },
                        trigger = {
                            PMButton(
                                icon = PMIconRole.Overflow,
                                iconOnly = true,
                                label = props.overflowLabel ?: strings.showPath,
                                size = PMControlSize.Sm,
                                appearance = PMButtonAppearance.GhostNeutral,
                            )
                        },
                    )
                    rung is Rung.Crumb && last -> Text(
                        text = rung.item.label,
                        style = theme.text.sm.textStyle,
                        color = theme.colors.textPrimary.color,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.widthIn(max = measure).semantics { selected = true },
                    )
                    // The crumbs before the current page give up their width
                    // first, except the first, which keeps its own.
                    rung is Rung.Crumb -> Crumb(rung.item, uri, route, if (index == 0) Modifier else Modifier.weight(1f, fill = false))
                }
                if (!last) PMIconView(PMIconRole.Next, PMControlSize.Sm, tint = theme.colors.textMuted.color)
            }
        }
    }

    /** A crumb before the current page: pressable for `onSelect` or an `href`, else text. */
    @Composable
    private fun Crumb(item: PMBreadcrumbItem, uri: UriHandler, route: ((String) -> Unit)?, modifier: Modifier) {
        val theme = PM.theme
        val measure = theme.defaultDensity.spacing.s10 * PMRecipe.crumbMeasure
        if (item.onSelect == null && item.href == null) {
            Text(
                text = item.label,
                style = theme.text.sm.textStyle,
                color = theme.colors.textSecondary.color,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = modifier.widthIn(max = measure),
            )
            return
        }
        PMTextLink(
            text = item.label,
            step = theme.text.sm,
            color = theme.colors.textSecondary,
            activeColor = theme.colors.textPrimary,
            underlined = false,
            onClick = { follow(item, uri, route) },
            modifier = modifier,
            maxWidth = measure,
            singleLine = true,
        )
    }

    /**
     * A crumb pressed: the item's `onSelect`, then its `href`, to the app's
     * router or opened by the app's URI handler. A handler that cannot open it
     * leaves the crumb doing nothing.
     */
    private fun follow(item: PMBreadcrumbItem, uri: UriHandler, route: ((String) -> Unit)?) {
        item.onSelect?.invoke()
        val href = item.href ?: return
        if (route != null) route(href) else runCatching { uri.openUri(href) }
    }

    /**
     * A hidden crumb chosen from the overflow menu: the item's own navigation
     * when it has one, otherwise the app's router with its `href`, otherwise
     * its `href`, opened by the app's URI handler. A menu item is a command,
     * so its `onSelect` takes the navigation's place, as on the web.
     */
    private fun select(item: PMBreadcrumbItem, uri: UriHandler, route: ((String) -> Unit)?) {
        val select = item.onSelect
        val href = item.href
        when {
            select != null -> select()
            href != null && route != null -> route(href)
            href != null -> runCatching { uri.openUri(href) }
        }
    }
}

/**
 * Breadcrumbs' states, from the spec's States table. The open overflow draws
 * Menu over a phone's canvas, as a bottom sheet of the hidden crumbs.
 */
object BreadcrumbsStates : PMStates {
    override val member = "Breadcrumbs"

    private const val name = "Breadcrumb"

    private val two = listOf(
        PMBreadcrumbItem("Tickets", href = "https://example.com/tickets"),
        PMBreadcrumbItem("Ticket #4182"),
    )
    private val four = listOf(
        PMBreadcrumbItem("Home", href = "https://example.com"),
        PMBreadcrumbItem("Workspaces", href = "https://example.com/workspaces"),
        PMBreadcrumbItem("Support", href = "https://example.com/support"),
        PMBreadcrumbItem("Ticket #4182"),
    )
    private val six = listOf(
        PMBreadcrumbItem("Home", href = "https://example.com"),
        PMBreadcrumbItem("Workspaces", href = "https://example.com/workspaces"),
        PMBreadcrumbItem("Northwind", href = "https://example.com/northwind"),
        PMBreadcrumbItem("Support", href = "https://example.com/support"),
        PMBreadcrumbItem("Escalations", href = "https://example.com/escalations"),
        PMBreadcrumbItem("Ticket #4182"),
    )
    private val long = listOf(
        PMBreadcrumbItem("Home", href = "https://example.com"),
        PMBreadcrumbItem("Refund not received for order 88-2401 placed in March", href = "https://example.com/thread"),
        PMBreadcrumbItem("Ticket #4182"),
    )

    /** A trail whose app routes its own navigation, and a section with no page. */
    private val routed = listOf(
        PMBreadcrumbItem("Home", onSelect = {}),
        PMBreadcrumbItem("Settings"),
        PMBreadcrumbItem("Billing"),
    )

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry("two levels", expect = mapOf("label" to name)) { PMBreadcrumbs(items = two) },
            PMStateEntry("four levels — no overflow yet") { PMBreadcrumbs(items = four) },
            PMStateEntry("collapsed — the first crumb, the overflow, and the last two", expect = mapOf("collapsed" to "true", "contains" to "Menu")) {
                PMBreadcrumbs(items = six)
            },
            PMStateEntry("overflow open — the hidden crumbs in the menu", expect = mapOf("collapsed" to "true")) {
                PMFixturePhone { PMBreadcrumbs(defaultOpen = true, items = six) }
            },
            PMStateEntry("collapsing disabled — the whole path, however long") {
                PMBreadcrumbs(items = six, maxItems = Double.POSITIVE_INFINITY)
            },
            PMStateEntry("long labels — clipped, so the trail stays one line") { PMBreadcrumbs(items = long) },
            PMStateEntry("routed by the app, and a section with no page of its own") { PMBreadcrumbs(items = routed) },
            PMStateEntry("localized", expect = mapOf("label" to "Fil d’Ariane")) {
                PMBreadcrumbs(items = six, label = "Fil d’Ariane", overflowLabel = "Afficher le chemin")
            },
        )
}
