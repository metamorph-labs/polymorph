// DescriptionList (`design/components/description-list.md`): term and detail
// pairs that describe one entity, such as a ticket's metadata. Read-only, no
// surface of its own, in the order given. Vertical (the default) stacks each
// term over its detail, `space.1` apart and `space.4` between pairs, and works
// at any width; horizontal puts a term column, as wide as its widest term,
// beside the details, `space.6` across and `space.3` down, as the web's
// `max-content 1fr` grid does. Terms are the overline style (uppercase
// `text.xs`, secondary) and start aligned in both. A detail is the app's
// content: bare `Text` takes the detail style (`text.sm`, primary) as
// Material's text style and content colour, and a member inside keeps its own.
//
// Each pair is one node, read as the term then the detail, as a screen reader
// reads a `<dt>` and its `<dd>`; the term is spoken as written, not as its
// uppercase. An empty list draws nothing: the empty message is EmptyState's.

package dev.polymorph.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.width
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.SubcomposeLayout
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.intl.LocaleList
import androidx.compose.ui.text.toUpperCase
import androidx.compose.ui.unit.Constraints
import kotlin.math.max

object PMDescriptionList : PMDescriptionListRendering {
    @Composable
    override fun Render(props: PMDescriptionListProps) {
        if (props.items.isEmpty()) return
        val space = PM.theme.defaultDensity.spacing
        val orientation = props.orientation ?: PMDescriptionListOrientation.Vertical
        val root = Modifier
            .pmMember("DescriptionList", mapOf("orientation" to orientation.value, "pairs" to props.items.size.toString()))
            .fillMaxWidth()

        when (orientation) {
            PMDescriptionListOrientation.Vertical -> Column(root, verticalArrangement = Arrangement.spacedBy(space.s4)) {
                for (item in props.items) {
                    Column(
                        Modifier.fillMaxWidth().semantics(mergeDescendants = true) {},
                        verticalArrangement = Arrangement.spacedBy(space.s1),
                    ) {
                        Term(item.term)
                        Detail(item.detail)
                    }
                }
            }
            PMDescriptionListOrientation.Horizontal -> Columns(props.items, root)
        }
    }

    /**
     * The horizontal form: the terms measured first, so the term column is as
     * wide as the widest, then each pair a row of the term at that width and
     * the detail in the rest.
     */
    @Composable
    private fun Columns(items: List<PMDescriptionListItem>, modifier: Modifier) {
        val space = PM.theme.defaultDensity.spacing
        SubcomposeLayout(modifier) { constraints ->
            val terms = subcompose(TERMS) { for (item in items) Term(item.term) }
            val widest = terms.maxOfOrNull { it.maxIntrinsicWidth(Constraints.Infinity) } ?: 0
            val column = if (constraints.hasBoundedWidth) minOf(widest, constraints.maxWidth) else widest
            val rows = subcompose(PAIRS) {
                for (item in items) {
                    Row(
                        Modifier.fillMaxWidth().semantics(mergeDescendants = true) {},
                        horizontalArrangement = Arrangement.spacedBy(space.s6),
                    ) {
                        Term(item.term, Modifier.width(column.toDp()))
                        Detail(item.detail, Modifier.weight(1f))
                    }
                }
            }.map { it.measure(constraints.copy(minHeight = 0)) }
            val gap = space.s3.roundToPx()
            val height = rows.sumOf { it.height } + gap * max(0, rows.size - 1)
            val width = if (constraints.hasBoundedWidth) constraints.maxWidth else rows.maxOfOrNull { it.width } ?: 0
            layout(width, height) {
                var y = 0
                for (row in rows) {
                    row.placeRelative(0, y)
                    y += row.height + gap
                }
            }
        }
    }

    /** A term in the overline style, spoken as written. */
    @Composable
    private fun Term(term: String, modifier: Modifier = Modifier) {
        val theme = PM.theme
        Text(
            text = term.toUpperCase(LocaleList.current),
            style = theme.text.xs.textStyle,
            color = theme.colors.textSecondary.color,
            modifier = modifier.semantics { contentDescription = term },
        )
    }

    /** A detail: the app's content in the detail style. */
    @Composable
    private fun Detail(detail: PMContent, modifier: Modifier = Modifier) {
        val theme = PM.theme
        CompositionLocalProvider(
            LocalTextStyle provides theme.text.sm.textStyle,
            LocalContentColor provides theme.colors.textPrimary.color,
        ) {
            Column(modifier) { detail() }
        }
    }

    private const val TERMS = "terms"
    private const val PAIRS = "pairs"
}

/**
 * DescriptionList's states, from the spec's States table. The empty list draws
 * nothing, so it has no entry: the harness holds every entry to drawing.
 */
object DescriptionListStates : PMStates {
    override val member = "DescriptionList"

    private val pairs = listOf(
        "Status" to "Waiting on customer",
        "Priority" to "High",
        "Assignee" to "Ada Lovelace",
        "Raised" to "3 days ago",
    )

    private val items: List<PMDescriptionListItem>
        get() = pairs.map { (term, detail) -> PMDescriptionListItem(term) { Text(detail) } }

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry("ticket meta", expect = mapOf("orientation" to "vertical", "pairs" to "4")) {
                PMDescriptionList(items = items)
            },
            PMStateEntry("horizontal", expect = mapOf("orientation" to "horizontal", "pairs" to "4")) {
                PMDescriptionList(items = items, orientation = PMDescriptionListOrientation.Horizontal)
            },
            PMStateEntry("member detail", expect = mapOf("pairs" to "2", "contains" to "Badge")) {
                PMDescriptionList(
                    items = listOf(
                        PMDescriptionListItem("Status") { PMBadge(children = "Waiting", tone = PMBadgeTone.Warning) },
                        items[1],
                    ),
                )
            },
            PMStateEntry("member detail, horizontal", expect = mapOf("pairs" to "2", "contains" to "Badge")) {
                PMDescriptionList(
                    items = listOf(
                        PMDescriptionListItem("Status") { PMBadge(children = "Waiting", tone = PMBadgeTone.Warning) },
                        items[1],
                    ),
                    orientation = PMDescriptionListOrientation.Horizontal,
                )
            },
            PMStateEntry("single pair", expect = mapOf("pairs" to "1")) {
                PMDescriptionList(items = listOf(items[2]))
            },
        )
}
