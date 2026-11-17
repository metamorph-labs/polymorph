// Pagination (`design/components/pagination.md`): numbered page controls for a
// paged list. Always the first and the last page and the current page with its
// siblings; a gap of two or more pages is an ellipsis, a gap of one shows the
// page. The arrows and the numbers are Buttons at `sm`: ghost, and the current
// page soft accent with the selected state (the web's `aria-current`), because
// the page's one solid button is its primary action. The row is a wrapping
// Inline `space.1` apart, because its length depends on the data. One page or
// none draws nothing.
//
// Every name the pager speaks is in `messages`; without it the spec's English
// defaults (`PMStrings.paginationMessages`) are used, which an app translates.
// A number's visible text is the digit and its name says "Page 3", which
// contains it. The ellipsis is drawn `controlHeight.sm` wide in `text.sm`
// muted and is not read: nothing is there to act on.
//
// `disabled` is the app's hold, for while it does something else to the list:
// every control is disabled, the current page too, and the pager is still
// drawn. The current page stays soft accent and selected, so the pager still
// says where the list is.

package dev.polymorph.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.hideFromAccessibility
import androidx.compose.ui.semantics.isTraversalGroup
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp

object PMPagination : PMPaginationRendering {
    @Composable
    override fun Render(props: PMPaginationProps) {
        val page = props.page.toInt()
        val count = props.pageCount.toInt()
        val window = window(page, count, props.siblingCount?.value ?: 1)
        if (window.isEmpty()) return
        val strings = PMSpecDefault.strings
        val messages = props.messages ?: strings.paginationMessages
        val label = props.label ?: strings.pagination
        val held = props.disabled ?: false

        Box(
            Modifier
                .pmMember(
                    "Pagination",
                    // `disabled` while the app holds the pager, as the web's `data-disabled`.
                    buildMap {
                        put("page", page.toString())
                        put("pages", count.toString())
                        if (held) put("disabled", "true")
                    },
                )
                .semantics {
                    contentDescription = label
                    isTraversalGroup = true
                },
        ) {
            PMInline(gap = PMSpaceStep.S1, wrap = true) {
                PMButton(
                    disabled = held || page <= 1,
                    icon = PMIconRole.Previous,
                    iconOnly = true,
                    label = messages.previous,
                    onClick = { props.onPageChange((page - 1).toDouble()) },
                    size = PMControlSize.Sm,
                    appearance = PMButtonAppearance.GhostNeutral,
                )
                for (entry in window) {
                    if (entry == null) Ellipsis() else Number(entry, entry == page, held, messages, props.onPageChange)
                }
                PMButton(
                    disabled = held || page >= count,
                    icon = PMIconRole.Next,
                    iconOnly = true,
                    label = messages.next,
                    onClick = { props.onPageChange((page + 1).toDouble()) },
                    size = PMControlSize.Sm,
                    appearance = PMButtonAppearance.GhostNeutral,
                )
            }
        }
    }

    /**
     * A page's Button: soft accent and selected for the current page, which has no action. A
     * held pager disables the current page with the others, so no control looks pressable.
     */
    @Composable
    private fun Number(
        entry: Int,
        current: Boolean,
        held: Boolean,
        messages: PMPaginationMessages,
        change: (Double) -> Unit,
    ) {
        PMButton(
            ariaLabel = messages.page(entry.toDouble()),
            current = current,
            disabled = held,
            label = entry.toString(),
            onClick = if (current) null else ({ change(entry.toDouble()) }),
            size = PMControlSize.Sm,
            appearance = if (current) PMButtonAppearance.SoftAccent else PMButtonAppearance.GhostNeutral,
        )
    }

    /** The pages not offered: as wide as a number's button, so the row's spacing stays even. */
    @Composable
    private fun Ellipsis() {
        val theme = PM.theme
        Box(
            Modifier
                .semantics { hideFromAccessibility() }
                .width(theme.defaultDensity.controlHeight.sm.dp),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = ELLIPSIS,
                style = theme.text.sm.textStyle,
                color = theme.colors.textMuted.color,
                textAlign = TextAlign.Center,
            )
        }
    }

    private const val ELLIPSIS = "…"

    /**
     * The visible pages, `null` for an ellipsis: the first, the last and
     * `page ± siblings`, a gap of one page shown and a longer gap collapsed, as
     * the web's `paginationWindow` computes it.
     */
    fun window(page: Int, count: Int, siblings: Int): List<Int?> {
        if (count <= 1) return emptyList()
        val wanted = sortedSetOf(1, count)
        for (offset in -siblings..siblings) {
            if (page + offset in 1..count) wanted += page + offset
        }
        val out = mutableListOf<Int?>()
        var previous: Int? = null
        for (value in wanted) {
            if (previous != null && value - previous > 1) out += if (value - previous == 2) previous + 1 else null
            out += value
            previous = value
        }
        return out
    }
}

/**
 * Pagination's states, from the spec: five pages at the first, the middle and
 * the last, twelve pages in the middle (an ellipsis each side), twelve with two
 * siblings, two pages, and a pager the app holds. One page draws nothing, so it
 * has no entry: the harness holds every entry to drawing.
 */
object PaginationStates : PMStates {
    override val member = "Pagination"

    @Composable
    private fun Pager(
        page: Int,
        count: Int,
        siblings: PMPaginationSiblingCount? = null,
        disabled: Boolean? = null,
    ) {
        PMPagination(
            disabled = disabled,
            onPageChange = {},
            page = page.toDouble(),
            pageCount = count.toDouble(),
            siblingCount = siblings,
        )
    }

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry("five pages at 1", expect = mapOf("page" to "1", "pages" to "5", "label" to "Pagination")) { Pager(1, 5) },
            PMStateEntry("five pages at 3", expect = mapOf("page" to "3", "pages" to "5", "contains" to "Button")) { Pager(3, 5) },
            PMStateEntry("five pages at 5", expect = mapOf("page" to "5", "pages" to "5")) { Pager(5, 5) },
            PMStateEntry("twelve pages at 6 — an ellipsis each side", expect = mapOf("page" to "6", "pages" to "12")) { Pager(6, 12) },
            PMStateEntry("twelve pages at 6, two siblings", expect = mapOf("page" to "6", "pages" to "12")) {
                Pager(6, 12, PMPaginationSiblingCount.SiblingCount2)
            },
            PMStateEntry("two pages", expect = mapOf("page" to "1", "pages" to "2")) { Pager(1, 2) },
            PMStateEntry("held by the app — no page can be asked for", expect = mapOf("page" to "3", "disabled" to "true")) {
                Pager(3, 5, disabled = true)
            },
            PMStateEntry("localized", expect = mapOf("label" to "Seiten")) {
                PMPagination(
                    label = "Seiten",
                    messages = PMPaginationMessages("Vorherige Seite", "Nächste Seite") { "Seite ${it.toInt()}" },
                    onPageChange = {},
                    page = 2.0,
                    pageCount = 4.0,
                )
            },
        )
}
