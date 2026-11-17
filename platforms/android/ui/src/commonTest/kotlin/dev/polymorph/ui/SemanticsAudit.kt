package dev.polymorph.ui

import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.semantics.SemanticsNode
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull

/**
 * The rules a states fixture entry's semantics tree is held to, on both
 * targets that compose it: the JVM harness (`IdentityTest`, Compose for
 * desktop) and the Android audit (`AccessibilityAuditTest`, Android's Compose
 * runtime under Robolectric). Each target composes the entry and passes the
 * root node of every window it drew, the entry's own window first, then each
 * window over it (a dialog, a menu, a bottom sheet).
 *
 * The entry's root, the first node in its own window that carries a member
 * (`PMMemberKey`, set by `Modifier.pmMember`), must be the fixture's member and
 * expose what the entry's `expect` promises, read from the merged semantics
 * tree, as an accessibility service reads it; an empty expected value means
 * the attribute is absent. An entry whose `expect` sets `hidden` is a
 * decorative state: its root hides itself from accessibility, and nothing
 * under it is read. An entry whose `expect` sets `contains` names
 * members that must each be the member of some node inside the root: the
 * affordance a page archetype's state draws, and a field still present after a
 * failure. An entry whose `expect` sets `presentation` names how its panel is
 * presented: the first node, in any window, that carries the member and a
 * `presentation` attribute must carry that one, because a bottom sheet is a
 * window of its own, which the root's window does not hold.
 *
 * Every control in every window is something a person acts on, whichever
 * member draws it: a node with a click or a toggle has a name; a node whose
 * role is Button, Checkbox, RadioButton, Switch, Tab or DropdownList has its
 * click action, a RadioButton or Tab its selected state, and a Checkbox or
 * Switch its toggle state. A Button, Checkbox or Switch member's root also has
 * its member's role, and a disabled one says so.
 */
object SemanticsAudit {
    /** What `entry` of `member`'s fixture breaks, one sentence each; empty when it holds every rule. */
    fun check(member: String, entry: PMStateEntry, windows: List<SemanticsNode>): List<String> {
        val own = windows.firstOrNull() ?: return listOf("no semantics")
        val root = walk(own).firstOrNull { it.config.getOrNull(PMMemberKey) != null }
            ?: return listOf("no node carries a member")
        val failures = mutableListOf<String>()
        val identity = root.config.getOrNull(PMMemberKey)!!
        if (identity.name != member) failures += "the root is ${identity.identifier}"
        if (entry.hidden) {
            if (root.config.getOrNull(SemanticsProperties.HideFromAccessibility) == null) {
                failures += "a hidden entry's root is not hidden from accessibility"
            }
            val read = walk(root).filter { spoken(it) != null && !hiddenUnder(it, root) }
            if (read.isNotEmpty()) failures += "a hidden entry exposes ${read.map(::spoken)}"
        }
        // Everything a person can act on says what it is: a node with a click
        // or a toggle, outside a hidden subtree, has a name, in the entry's
        // window and in every window over it.
        for (window in windows) {
            for (node in walk(window)) {
                val acts = node.config.getOrNull(SemanticsActions.OnClick) != null ||
                    node.config.getOrNull(SemanticsProperties.ToggleableState) != null
                if (acts && spoken(node).isNullOrEmpty() && !isLinkRun(node) && !hiddenUnder(node, window)) {
                    failures += "an unnamed node a person can act on (${node.config})"
                }
                if (!hiddenUnder(node, window)) acting(node)?.let { failures += it }
                control(node)?.let { failures += it }
            }
        }
        for ((key, value) in entry.expect) {
            when (key) {
                "hidden" -> {}
                "presentation" -> {
                    val shown = windows
                        .flatMap { walk(it) }
                        .mapNotNull { it.config.getOrNull(PMMemberKey) }
                        .firstOrNull { it.name == member && "presentation" in it.attributes }
                        ?.attributes?.get("presentation")
                    if (shown != value) failures += "presentation is \"$shown\", not \"$value\""
                }
                "contains" -> {
                    val found = walk(root).drop(1).mapNotNull { it.config.getOrNull(PMMemberKey)?.name }.toSet()
                    val missing = entry.contains.filter { it !in found }
                    if (missing.isNotEmpty()) failures += "contains none of $missing; found ${found.sorted()}"
                }
                "label" -> if (spoken(root) != value) failures += "label is \"${spoken(root)}\", not \"$value\""
                "value" -> {
                    val state = root.config.getOrNull(SemanticsProperties.StateDescription)
                    if (state != value) failures += "value is \"$state\", not \"$value\""
                }
                // An empty expected value means the attribute is absent, as the web's `null` does.
                else -> if ((identity.attributes[key] ?: "") != value) {
                    failures += "$key is \"${identity.attributes[key] ?: ""}\", not \"$value\""
                }
            }
        }
        return failures
    }

    /** Every node at and under `node`, in tree order. */
    fun walk(node: SemanticsNode): List<SemanticsNode> = listOf(node) + node.children.flatMap { walk(it) }

    /** What an accessibility service reads on a node: its content description, else its text. */
    fun spoken(node: SemanticsNode): String? {
        node.config.getOrNull(SemanticsProperties.ContentDescription)?.let { return it.joinToString(", ") }
        node.config.getOrNull(SemanticsProperties.Text)?.let { texts ->
            if (texts.isNotEmpty()) return texts.joinToString(", ") { it.text }
        }
        return null
    }

    /**
     * Whether a node is inside a subtree that hides itself, below `root`. The
     * root's own flag does not count: a hidden entry's root hides itself, and
     * what is under it must still say nothing.
     */
    fun hiddenUnder(node: SemanticsNode, root: SemanticsNode): Boolean {
        var current: SemanticsNode? = node
        while (current != null) {
            if (current.id == root.id) return false
            if (current.config.getOrNull(SemanticsProperties.HideFromAccessibility) != null) return true
            current = current.parent
        }
        return false
    }

    /**
     * Whether a node is a link run inside a text, which Compose gives a node of
     * its own (a `LinkAnnotation`'s): it is named by its words, which its
     * parent's text carries with the link's span, as an accessibility service
     * reads a paragraph's links (Markdown's).
     */
    private fun isLinkRun(node: SemanticsNode): Boolean =
        node.config.any { it.key.name == "LinkTestMarker" } &&
            node.parent?.config?.getOrNull(SemanticsProperties.Text)
                ?.any { text -> text.getLinkAnnotations(0, text.length).isNotEmpty() } == true

    /**
     * What a node with a control's role lacks of what an accessibility
     * service needs to act on it, or null when it has it all: the click
     * action, a radio button's or a tab's selected state, and a checkbox's or a
     * switch's toggle state. A clickable placed after a clearing modifier
     * leaves a role with no action, which this finds in any member.
     */
    private fun acting(node: SemanticsNode): String? {
        val role = node.config.getOrNull(SemanticsProperties.Role) ?: return null
        if (role !in actingRoles) return null
        val missing = buildList {
            if (node.config.getOrNull(SemanticsActions.OnClick) == null) add("no click action")
            if ((role == Role.RadioButton || role == Role.Tab) && node.config.getOrNull(SemanticsProperties.Selected) == null) {
                add("no selected state")
            }
            if ((role == Role.Checkbox || role == Role.Switch) && node.config.getOrNull(SemanticsProperties.ToggleableState) == null) {
                add("no toggle state")
            }
        }
        val name = node.config.getOrNull(PMMemberKey)?.identifier ?: spoken(node) ?: "a node"
        return if (missing.isEmpty()) null else "$name, a $role: ${missing.joinToString(", ")}"
    }

    /** The roles of the controls a person acts on. */
    private val actingRoles = setOf(Role.Button, Role.Checkbox, Role.RadioButton, Role.Switch, Role.Tab, Role.DropdownList)

    /** The roles of the members a person toggles or presses, by member. */
    private val controls = mapOf("Button" to Role.Button, "Checkbox" to Role.Checkbox, "Switch" to Role.Switch)

    /**
     * What a Button, Checkbox or Switch root lacks of its control semantics,
     * or null when it has them all: the click action, its role, a toggle's
     * state, and the disabled state when its identity says it is disabled.
     */
    private fun control(node: SemanticsNode): String? {
        val member = node.config.getOrNull(PMMemberKey) ?: return null
        val role = controls[member.name] ?: return null
        val missing = buildList {
            if (node.config.getOrNull(SemanticsActions.OnClick) == null) add("no click action")
            val actual = node.config.getOrNull(SemanticsProperties.Role)
            if (actual != role) add("the role $actual, not $role")
            if (role != Role.Button && node.config.getOrNull(SemanticsProperties.ToggleableState) == null) {
                add("no toggle state")
            }
            val disabled = node.config.getOrNull(SemanticsProperties.Disabled) != null
            if (member.attributes["disabled"] == "true" && !disabled) add("no disabled state")
        }
        return if (missing.isEmpty()) null else "${member.identifier}: ${missing.joinToString(", ")}"
    }
}
