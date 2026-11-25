// FormPage (`design/archetypes/form-page.md`): the create and edit screen. The
// page header, the cards of fields, and the committing row of actions, in a
// reading column narrower than a list's, because fields wider than the measure
// are hard to scan. The actions row is anchored: a rule above it connects the
// commit to the column it commits, under every theme. A leading action
// (`leadingAction`), such as a destructive tertiary "Delete…", is a group of
// its own at the row's start, and the actions stay together at its end.
//
// The load status (`design/native/screen-contract.md`): `loading` draws
// Skeletons over the cards and disables the actions row; `failed` puts a
// danger Alert above the cards, which keep what the person typed; `empty` is
// `ready`, because a blank form is its own empty form. The cards are composed
// in every state at one place in the tree, hidden while loading, so a change of
// status never recomposes them away: a field keeps its draft and its focus.
//
// Submitting: the keyboard's Done in a field submits through `onSubmit`, as
// Enter does in the web's `<form>`, and so does a `submit` Button anywhere in
// the form, which the web puts inside the form. A composable belongs to no
// form, so the page hands `onSubmit` to the fields and buttons under it
// (`LocalPMSubmitAction`). An overlay opened from the page (a dialog, a
// sheet, a popover) is outside the form, as the web portals it out of the
// `<form>` (`PMOverlayContent`).

package dev.polymorph.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.semantics.clearAndSetSemantics

object PMFormPage : PMFormPageRendering {
    /** Skeleton rows over the cards while loading. */
    private const val SKELETON_ROWS = 3

    @Composable
    override fun Render(props: PMFormPageProps) {
        val theme = PM.theme
        val space = theme.defaultDensity.spacing
        val status = props.loadStatus
        val loading = status == PMLoadStatus.Loading
        val failure = (status as? PMLoadStatus.Failed)?.message

        PMPage(PMRecipe.formPageMeasure, "FormPage", status) {
            PMPageHeader(description = props.description, title = props.title)
            // Above the cards, which keep what the person typed.
            failure?.let { PMPageFailure(it, props.onRetry) }
            CompositionLocalProvider(LocalPMSubmitAction provides props.onSubmit) {
                Box {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .alpha(if (loading) 0f else 1f)
                            .then(if (loading) Modifier.clearAndSetSemantics {} else Modifier),
                        verticalArrangement = Arrangement.spacedBy(space.s6),
                    ) {
                        CompositionLocalProvider(LocalPMEnabled provides !loading) { props.children() }
                    }
                    if (loading) {
                        PMPagePanel {
                            Box(Modifier.padding(space.s6)) { PMPageSkeletonRows(SKELETON_ROWS) }
                        }
                    }
                }
                Column {
                    PMRule(theme.colors.borderSubtle)
                    val leading = props.leadingAction
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(top = space.s5),
                        horizontalArrangement = if (leading == null) {
                            Arrangement.spacedBy(space.s3, Alignment.End)
                        } else {
                            Arrangement.SpaceBetween
                        },
                    ) {
                        CompositionLocalProvider(LocalPMEnabled provides !loading) {
                            if (leading == null) {
                                props.actions()
                            } else {
                                leading()
                                Row(horizontalArrangement = Arrangement.spacedBy(space.s3)) {
                                    props.actions()
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

/**
 * FormPage's states: the four load states, the failed one keeping its fields.
 * Each names what its body holds (`contains`): the fields while they show, the
 * Skeletons while loading, and the Alert above the fields when loading failed.
 */
object FormPageStates : PMStates {
    override val member = "FormPage"

    private const val title = "New ticket"
    private const val description = "Describe the problem; we reply within a day."
    private const val create = "Create ticket"
    private const val cancel = "Cancel"
    private const val subject = "Subject"
    private const val typed = "Refund for a duplicate charge"
    private const val notes = "The customer was charged twice on the first of the month."
    private const val failure = "The ticket could not be saved. Try again in a moment."

    @Composable
    private fun Page(status: PMLoadStatus) {
        PMFormPage(
            loadStatus = status,
            onRetry = {},
            actions = {
                PMButton(label = cancel, appearance = PMButtonAppearance.GhostNeutral)
                PMButton(label = create, type = PMButtonType.Submit)
            },
            description = description,
            onSubmit = {},
            title = title,
        ) {
            PMCard {
                PMStack(gap = PMSpaceStep.S5) {
                    PMFormField(label = subject) { PMInput(defaultValue = typed) }
                    PMText(size = PMTextSize.Sm, tone = PMTextTone.Secondary) { Text(notes) }
                }
            }
        }
    }

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry("ready", expect = mapOf("status" to "ready", "contains" to "FormField,Input")) {
                Page(PMLoadStatus.Ready)
            },
            PMStateEntry("loading", expect = mapOf("status" to "loading", "contains" to "Skeleton")) {
                Page(PMLoadStatus.Loading)
            },
            PMStateEntry("empty", expect = mapOf("status" to "empty", "contains" to "FormField,Input")) {
                Page(PMLoadStatus.Empty)
            },
            PMStateEntry(
                "failed, the fields kept",
                expect = mapOf("status" to "failed", "contains" to "Alert,Input"),
            ) { Page(PMLoadStatus.Failed(failure)) },
        )
}
