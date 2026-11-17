package dev.polymorph.ui

import androidx.compose.runtime.Composable
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assertIsFocused
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.performImeAction
import androidx.compose.ui.test.performSemanticsAction
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.v2.runComposeUiTest
import kotlin.test.Test
import kotlin.test.assertEquals

/** InlineEdit's opening, saving and cancelling, on the JVM target. */
@OptIn(ExperimentalTestApi::class)
class InlineEditBehaviourTest {
    @Composable
    private fun Scene(content: @Composable () -> Unit) {
        Harness.Scene(Harness.passes.first()) { content() }
    }

    /** The Button named `label`. */
    private fun button(label: String) = SemanticsMatcher("Button $label") { node ->
        node.config.getOrNull(PMMemberKey)?.name == "Button"
    } and hasContentDescription(label)

    private fun editing(test: androidx.compose.ui.test.ComposeUiTest): String? =
        test.onNode(SemanticsMatcher("InlineEdit") { it.config.getOrNull(PMMemberKey)?.name == "InlineEdit" })
            .fetchSemanticsNode().config[PMMemberKey].attributes["editing"]

    @Test
    fun theEditControlOpensTheFieldWithFocusAndDoneSavesTheChangedTextOnce() = runComposeUiTest {
        val committed = mutableListOf<String>()
        val opened = mutableListOf<Boolean>()
        setContent {
            Scene {
                PMInlineEdit(label = "Project name", onCommit = { committed += it }, onEditingChange = { opened += it }, value = "Acme billing")
            }
        }
        onNode(button("Edit Project name")).performSemanticsAction(SemanticsActions.OnClick)
        waitForIdle()
        assertEquals(listOf(true), opened)
        assertEquals("true", editing(this))
        val field = onNode(hasSetTextAction())
        field.assertIsFocused()
        field.performTextInput("Acme payroll")
        field.performImeAction()
        waitForIdle()
        assertEquals(listOf("Acme payroll"), committed, "typing replaces the selected value, reported once as typed")
        assertEquals(null, editing(this), "an uncontrolled field closes once it saves")
    }

    @Test
    fun anUnchangedSaveAndACancelReportNoText() = runComposeUiTest {
        val committed = mutableListOf<String>()
        val opened = mutableListOf<Boolean>()
        setContent {
            Scene {
                PMInlineEdit(
                    defaultEditing = true,
                    label = "Project name",
                    onCommit = { committed += it },
                    onEditingChange = { opened += it },
                    value = "Acme billing",
                )
            }
        }
        onNode(button("Save")).performSemanticsAction(SemanticsActions.OnClick)
        waitForIdle()
        assertEquals(emptyList(), committed, "an unchanged text is not reported")
        onNode(button("Edit Project name")).performSemanticsAction(SemanticsActions.OnClick)
        waitForIdle()
        onNode(hasSetTextAction()).performTextInput("!")
        onNode(button("Cancel")).performSemanticsAction(SemanticsActions.OnClick)
        waitForIdle()
        assertEquals(emptyList(), committed, "a cancel reports nothing")
        assertEquals(listOf(false, true, false), opened)
    }

    @Test
    fun aRequiredBlankTextCannotBeSaved() = runComposeUiTest {
        setContent {
            Scene { PMInlineEdit(defaultEditing = true, label = "Project name", onCommit = {}, required = true, value = "") }
        }
        onNode(button("Save")).assertIsNotEnabled()
    }
}
