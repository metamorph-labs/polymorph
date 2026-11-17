package dev.polymorph.ui

import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.semantics.SemanticsNode
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

/**
 * Every entry, composed by Compose for desktop at the canvas's width and its
 * own height under the default pairing, left to right and right to left
 * (`Harness.rightToLeft`), holds the rules in `SemanticsAudit`
 * (`src/commonTest/kotlin`): its root carries its member's identity and what
 * the entry's `expect` promises, everything a person can act on is named, and
 * every control has its action and its state. The scene's first semantics
 * owner is the entry's window; each further owner is a window over it (a
 * dialog, a menu, a bottom sheet). The Android audit applies the same rules to
 * the same entries on Android's Compose runtime.
 */
class IdentityTest {
    @Test
    fun everyEntryRootCarriesItsMemberAndItsPromises() {
        assertTrue(Harness.fixtures.isNotEmpty(), "no fixture to check")
        val failures = mutableListOf<String>()
        for (fixture in Harness.fixtures) {
            for (entry in fixture.entries) for (pass in listOf(Harness.passes.first(), Harness.rightToLeft)) {
                val label = "${fixture.member} — ${entry.name} (${pass.name})"
                val scene = Harness.scene(entry, pass, Harness.height(entry, pass))
                try {
                    Harness.settle(scene)
                    val windows = scene.semanticsOwners.map { it.rootSemanticsNode }
                    failures += SemanticsAudit.check(fixture.member, entry, windows).map { "$label: $it" }
                } finally {
                    scene.close()
                }
            }
        }
        assertTrue(failures.isEmpty(), failures.joinToString("\n"))
    }

    /**
     * A text field's name is on a node inside the editable one (`pmFieldName`),
     * never the editable node's own content description: TalkBack reads that
     * description in place of what was typed. Every editable node, in every
     * window of every entry, carries no content description, and a node under
     * it carries the field's name. That node is not hidden, has no click
     * action and no role, and is not inside a control of the field's own: a
     * stepper, a reveal toggle, an expand or a clear button is named by its own
     * description, which does not name the field. The tree does not say what
     * each field's name is, because a placeholder and an `ariaLabel` are drawn
     * nowhere a node holds them, so the name's node is found by what it is.
     */
    @Test
    fun everyTextFieldIsNamedInsideItself() {
        val failures = mutableListOf<String>()
        val pass = Harness.passes.first()
        for (fixture in Harness.fixtures) {
            for (entry in fixture.entries) {
                val scene = Harness.scene(entry, pass, Harness.height(entry, pass))
                try {
                    Harness.settle(scene)
                    val fields = scene.semanticsOwners
                        .flatMap { SemanticsAudit.walk(it.unmergedRootSemanticsNode) }
                        .filter { SemanticsProperties.EditableText in it.config }
                    for (field in fields) {
                        val label = "${fixture.member} — ${entry.name}"
                        field.config.getOrNull(SemanticsProperties.ContentDescription)?.let {
                            failures += "$label: a text field carries its own content description $it"
                        }
                        val named = SemanticsAudit.walk(field).drop(1).any { node ->
                            node.config.getOrNull(SemanticsProperties.ContentDescription)?.isNotEmpty() == true &&
                                SemanticsActions.OnClick !in node.config &&
                                SemanticsProperties.Role !in node.config &&
                                !insideControl(node, field) &&
                                !SemanticsAudit.hiddenUnder(node, field)
                        }
                        if (!named) failures += "$label: no node inside a text field names it"
                    }
                } finally {
                    scene.close()
                }
            }
        }
        assertTrue(failures.isEmpty(), failures.joinToString("\n"))
    }

    /** Whether a node is inside a control below `field`: a node between them with a click action. */
    private fun insideControl(node: SemanticsNode, field: SemanticsNode): Boolean {
        var current = node.parent
        while (current != null && current.id != field.id) {
            if (SemanticsActions.OnClick in current.config) return true
            current = current.parent
        }
        return false
    }

    @Test
    fun theIdentifierRoundTrips() {
        val member = PMMember("Badge", mapOf("variant" to "soft", "tone" to "neutral"))
        assertEquals("member:Badge tone=neutral variant=soft", member.identifier)
        assertEquals(member, PMMember.parse(member.identifier))
        assertEquals(null, PMMember.parse("Badge tone=neutral"))
        assertNotNull(PMMember.parse("member:Card"))
    }
}
