// TableOfContents (`design/components/table-of-contents.md`): the links to
// the sections of one long page, with the section the reader went to marked.
// It is not SectionNav, whose items are pages, and not Tree, which a reader
// opens level by level.
//
// A column `space.2` apart: the overline (`label`, `text.xs`, uppercase,
// `text.muted`, `space.3` in), then the links `space.1` apart. A level-2 item
// sits in a sublist under the item before it, `space.1` below it and
// `space.4` in from the start edge, its links `space.1` apart; a level-2 item
// with nothing before it is drawn at the first level. A link spans the column:
// its label in `text.sm`, `text.secondary`, `space.2` by `space.3` inside a
// shape of `radius.md` at least the small control height tall, wrapping onto
// further lines. Under the pointer a link other than the marked one is
// `text.primary` on `bg.subtle`, over the control duration; a press ripples
// from the touch point in `bg.subtle` and scales it as a pressed control. The
// marked link is `selection.text` on `selection.bg`, SectionNav's selection.
// Keyboard focus draws the focus ring around the link's shape. Each link
// reserves the hit target in the layout (`pmHitTarget`), so neighbouring
// links' touch areas do not overlap. Right to left, the sublist's indent is at
// the right.
//
// A link opens `#id` through the composition's `LocalUriHandler`, which is how
// an app scrolls its page to the section: its handler finds the section and
// brings it into view. When the handler opens it, the link is marked at once
// and `onCurrentChange` is called with its id, the web's click rule; when the
// handler throws, as Android's does for a fragment no activity takes, nothing
// is marked. Of two items with one id, the first is marked.
//
// The current section does not follow the reader's scroll: the sections are
// the app's nodes in the app's scrolling container, which a composable outside
// them cannot measure. Until the reader goes to a section through the list, no
// link is marked; after, the mark stays on that section until they go to
// another.
//
// The column is one node named by `label`, the web's navigation landmark,
// which TalkBack reads first; the overline draws the same words and is not
// read a second time. Each link is a node whose text is a link run, which
// TalkBack announces as a link, and the marked one is selected, the web's
// `aria-current="location"`. Nothing moves between links: the mark does not
// slide.

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
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.semantics.CollectionInfo
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.collectionInfo
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.hideFromAccessibility
import androidx.compose.ui.semantics.isTraversalGroup
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.text
import androidx.compose.ui.text.LinkAnnotation
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.intl.LocaleList
import androidx.compose.ui.text.toUpperCase
import androidx.compose.ui.text.withLink
import androidx.compose.ui.unit.dp

object PMTableOfContents : PMTableOfContentsRendering {
    @Composable
    override fun Render(props: PMTableOfContentsProps) = Draw(props, marked = null)

    /** The list with `marked` already gone to, as the states fixture draws it. */
    @Composable
    internal fun Draw(props: PMTableOfContentsProps, marked: String?) {
        val theme = PM.theme
        val space = theme.defaultDensity.spacing
        var mark by rememberSaveable { mutableStateOf(marked) }
        val at = mark?.let { id -> props.items.indexOfFirst { it.id == id }.takeIf { it != -1 } }
        val arrive = { id: String ->
            if (mark != id) {
                mark = id
                props.onCurrentChange?.invoke(id)
            }
        }
        val attributes = at?.let { mapOf("current" to props.items[it].id) } ?: emptyMap()

        Column(
            Modifier
                .pmMember("TableOfContents", attributes)
                .semantics {
                    contentDescription = props.label
                    isTraversalGroup = true
                }
                .fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(space.s2),
        ) {
            Text(
                text = props.label.toUpperCase(LocaleList.current),
                style = theme.text.xs.textStyle,
                color = theme.colors.textMuted.color,
                modifier = Modifier.padding(horizontal = space.s3).semantics { hideFromAccessibility() },
            )
            Column(
                Modifier
                    .fillMaxWidth()
                    .semantics { collectionInfo = CollectionInfo(rowCount = props.items.size, columnCount = 1) },
                verticalArrangement = Arrangement.spacedBy(space.s1),
            ) {
                groups(props.items).forEach { group ->
                    Column(Modifier.fillMaxWidth()) {
                        Link(props.items[group.at], group.at == at, arrive)
                        if (group.children.isNotEmpty()) {
                            Column(
                                Modifier.fillMaxWidth().padding(start = space.s4, top = space.s1),
                                verticalArrangement = Arrangement.spacedBy(space.s1),
                            ) {
                                group.children.forEach { child -> Link(props.items[child], child == at, arrive) }
                            }
                        }
                    }
                }
            }
        }
    }

    /** One link, to its section's fragment. */
    @Composable
    private fun Link(item: PMTableOfContentsItem, current: Boolean, arrive: (String) -> Unit) {
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
        val fragment = "#" + item.id
        // The handler opens the fragment; the link is marked when it does.
        val open = { if (runCatching { uri.openUri(fragment) }.isSuccess) arrive(item.id) }
        val run = buildAnnotatedString {
            withLink(LinkAnnotation.Clickable(fragment) { open() }) { append(item.label) }
        }

        Box(
            Modifier
                .fillMaxWidth()
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
                // Outside the clip, so a mark a system draws outside the edge is
                // not cut. The current item's fill gives the mark its text colour.
                .pmFocusRing(focused, theme.radius.md.dp, onFill = if (current) text else null)
                .clip(shape)
                .background(fill)
                .heightIn(min = density.controlHeight.sm.dp),
            contentAlignment = Alignment.CenterStart,
        ) {
            if (!current) PMPressLayer(interaction, colors.bgSubtle.color, Modifier.matchParentSize())
            Text(
                text = item.label,
                style = theme.text.sm.textStyle,
                color = text,
                modifier = Modifier.padding(horizontal = density.spacing.s3, vertical = density.spacing.s2),
            )
        }
    }

    /** A first-level item and the subsections drawn under it, by their indices in `items`. */
    internal class Group(val at: Int) {
        val children = mutableListOf<Int>()
    }

    /**
     * The items as the list draws them, by index: each section with the
     * subsections after it. A subsection with no section before it is drawn as
     * a section.
     */
    internal fun groups(items: List<PMTableOfContentsItem>): List<Group> {
        val groups = mutableListOf<Group>()
        items.forEachIndexed { index, item ->
            val parent = groups.lastOrNull()
            if (item.level == PMTableOfContentsItemLevel.Level2 && parent != null) parent.children += index else groups += Group(index)
        }
        return groups
    }
}

/**
 * TableOfContents's states, from the spec's States table: a page of sections
 * before and after the reader goes to one, two levels, a long label and a
 * section the page lacks. The list draws without its page on a phone, so the
 * web's entry at a phone's width is the first one.
 */
object TableOfContentsStates : PMStates {
    override val member = "TableOfContents"

    private const val label = "On this page"

    private val sections = listOf(
        PMTableOfContentsItem("overview", "Overview"),
        PMTableOfContentsItem("install", "Install"),
        PMTableOfContentsItem("configure", "Configure"),
        PMTableOfContentsItem("deploy", "Deploy"),
        PMTableOfContentsItem("troubleshoot", "Troubleshoot"),
    )

    private val levels = listOf(
        sections[0],
        sections[1],
        PMTableOfContentsItem("npm", "With npm", PMTableOfContentsItemLevel.Level2),
        PMTableOfContentsItem("pnpm", "With pnpm", PMTableOfContentsItemLevel.Level2),
        sections[2],
        PMTableOfContentsItem("environment", "Environment", PMTableOfContentsItemLevel.Level2),
        sections[3],
    )

    private val long = listOf(
        sections[0],
        PMTableOfContentsItem("approvals", "Delegated administration approvals awaiting a second reviewer in every region"),
        sections[3],
    )

    private val missing = sections.take(2) + PMTableOfContentsItem("release-notes", "Release notes") + sections.drop(2)

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry(
                "a page of sections — none marked before the reader goes to one",
                expect = mapOf("label" to label, "current" to ""),
            ) { PMTableOfContents(items = sections, label = label) },
            PMStateEntry("a section reached through the list — marked", expect = mapOf("current" to "configure")) {
                PMTableOfContents.Draw(PMTableOfContentsProps(items = sections, label = label), marked = "configure")
            },
            PMStateEntry("two levels — subsections one step in, under their section", expect = mapOf("current" to "pnpm")) {
                PMTableOfContents.Draw(PMTableOfContentsProps(items = levels, label = label), marked = "pnpm")
            },
            PMStateEntry("a long label — it wraps, so the column does not widen", expect = mapOf("current" to "approvals")) {
                PMTableOfContents.Draw(PMTableOfContentsProps(items = long, label = label), marked = "approvals")
            },
            PMStateEntry("a missing section — still a link", expect = mapOf("current" to "")) {
                PMTableOfContents(items = missing, label = label)
            },
        )
}
