// ConfirmDialog (`design/components/confirm-dialog.md`), adapted on Android: a
// confirmation as a modal bottom sheet, the platform map's form, at every
// window width, where Material's sheet keeps its own greatest width. The
// sheet (`PMBottomSheet`) asks the question: the title in `text.xl`, a
// heading, the description in `text.sm` `text.secondary`, and the footer,
// Dialog's `sm` footer: cancel (`outline/neutral`, `cancelLabel`, default
// "Cancel") and confirm (`solid` in the tone, `confirmLabel`) at the trailing
// end, confirm last. The `danger` tone, the default, guards a destruction;
// `accent` a consequential but safe action. With a keyboard, focus starts on
// cancel in a danger confirm, so a stray Enter destroys nothing, and on
// confirm in an accent one. The sheet is a pane titled by `title`.
//
// A typed confirmation (`confirmWith`) adds the phrase's FormField and Input
// between the description and the footer, labelled `confirmWithLabel` ("Type
// {phrase} to confirm" by default), and focus starts in the field in both
// tones. The field takes the text as typed: it asks the keyboard for no
// correction and no capitals, because a correction can change a phrase such
// as "acme-billing" as it is typed, and Compose draws no spelling marks. The
// confirm is disabled until the field holds the phrase, compared with the
// spaces around it removed and letter case ignored, and the field shows
// `confirmWithError` ("The text does not match") while its text cannot become
// the phrase. The field is emptied each time the sheet opens, and the
// keyboard's action in it confirms nothing.
//
// The trigger is any composable; the confirm puts its opening action in
// `LocalPMTriggerAction`, and Button runs it, as Dialog's does. `open` with
// `onOpenChange` is the controlled pair. Choosing confirm runs `onConfirm` and
// closes the sheet; cancel, the drag, the back gesture and the scrim close it.
//
// Not honoured: the pending state. The web's `onConfirm` may return a promise
// that holds the dialog until it settles; the contract types it `() -> Unit`,
// because the app owns every task, so an action that takes time reports its
// outcome on the screen, as on iOS. `closeLabel` names a close button the
// sheet does not draw, because cancel is its close, and `presentation` has no
// second form here: the sheet is the form at every width.

package dev.polymorph.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.paneTitle
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp

object PMConfirmDialog : PMConfirmDialogRendering {
    @Composable
    override fun Render(props: PMConfirmDialogProps) {
        Render(props, typed = "")
    }

    /**
     * ConfirmDialog with [typed] in a typed confirmation's field as the sheet
     * opens: empty, except in the states fixture's mistyped entry.
     */
    @Composable
    internal fun Render(props: PMConfirmDialogProps, typed: String) {
        var own by remember { mutableStateOf(false) }
        val open = props.open ?: own
        val tone = props.tone ?: PMConfirmDialogTone.Danger
        val setOpen: (Boolean) -> Unit = { next ->
            own = next
            props.onOpenChange?.invoke(next)
        }
        val attributes = mapOf("state" to if (open) "open" else "closed", "tone" to tone.value)

        Box(Modifier.pmMember("ConfirmDialog", attributes)) {
            PMOverlayTrigger(props.trigger) { setOpen(true) }
        }
        if (open) {
            PMBottomSheet(onDismiss = { setOpen(false) }) {
                Sheet(props, tone, attributes, typed) { setOpen(false) }
            }
        }
    }

    /** The question, what happens, and the two answers, confirm last. */
    @Composable
    private fun Sheet(
        props: PMConfirmDialogProps,
        tone: PMConfirmDialogTone,
        attributes: Map<String, String>,
        initial: String,
        close: () -> Unit,
    ) {
        val theme = PM.theme
        val space = theme.defaultDensity.spacing
        val inset = theme.defaultDensity.inset.surface.dp
        val first = remember { FocusRequester() }
        val phrase = props.confirmWith?.let(::PMConfirmPhrase)
        // Emptied as the sheet opens: the sheet is composed afresh each time.
        var typed by remember { mutableStateOf(initial) }
        // A danger confirm starts on cancel, an accent one on confirm; a typed
        // confirmation's field takes focus itself.
        LaunchedEffect(Unit) { if (phrase == null) first.requestFocus() }
        val cancel: @Composable () -> Unit = {
            PMButton(
                label = props.cancelLabel ?: PMSpecDefault.strings.cancel,
                onClick = close,
                appearance = PMButtonAppearance.OutlineNeutral,
            )
        }
        val confirm: @Composable () -> Unit = {
            PMButton(
                label = props.confirmLabel,
                onClick = {
                    props.onConfirm()
                    close()
                },
                disabled = phrase?.holds(typed) == false,
                appearance = if (tone == PMConfirmDialogTone.Danger) PMButtonAppearance.SolidDanger else PMButtonAppearance.SolidAccent,
            )
        }
        Column(
            Modifier
                .pmMember("ConfirmDialog", pmInSheet(attributes))
                .semantics { paneTitle = props.title }
                .fillMaxWidth()
                // The surface inset, below the sheet's handle, which is its top.
                .padding(start = inset, end = inset, bottom = inset)
                .windowInsetsPadding(WindowInsets.safeDrawing.only(WindowInsetsSides.Bottom)),
        ) {
            Text(
                text = props.title,
                style = theme.text.xl.textStyle,
                color = theme.colors.textPrimary.color,
                modifier = Modifier.semantics { heading() },
            )
            // The description scrolls when the sheet's cap is too short for it
            // (a large font scale, a landscape phone), so the buttons below it
            // stay on screen.
            Box(Modifier.weight(1f, fill = false).verticalScroll(rememberScrollState())) {
                Text(
                    text = props.description,
                    style = theme.text.sm.textStyle,
                    color = theme.colors.textSecondary.color,
                    modifier = Modifier.padding(top = space.s2),
                )
            }
            if (phrase != null) {
                val strings = PMSpecDefault.strings
                Box(Modifier.padding(top = space.s5)) {
                    PMFormField(
                        error = if (phrase.refuses(typed)) props.confirmWithError ?: strings.confirmWithError else null,
                        label = props.confirmWithLabel ?: strings.confirmWithLabel(props.confirmWith.orEmpty()),
                    ) {
                        // A text field asks for no autofill: nothing types the phrase for the
                        // person. `exact` keeps the phrase as typed.
                        PMInput(autoFocus = true, exact = true, onChange = { typed = it }, value = typed)
                    }
                }
            }
            Row(
                modifier = Modifier.fillMaxWidth().padding(top = space.s6),
                horizontalArrangement = Arrangement.spacedBy(space.s3, Alignment.End),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                val danger = tone == PMConfirmDialogTone.Danger
                Box(if (danger) Modifier.focusRequester(first) else Modifier) { cancel() }
                Box(if (danger) Modifier else Modifier.focusRequester(first)) { confirm() }
            }
        }
    }
}

/**
 * The typed confirmation's comparison (`confirm-dialog.md`): a text with the
 * spaces around it removed and letter case ignored, because a phone
 * capitalises a field's first letter.
 */
internal class PMConfirmPhrase(phrase: String) {
    private val phrase = comparable(phrase)

    private fun comparable(text: String): String = text.trim().lowercase()

    /** Whether [typed] is the phrase, which enables the confirm. */
    fun holds(typed: String): Boolean = comparable(typed) == phrase

    /** Whether [typed] cannot become the phrase: not empty and not its start, which shows the error. */
    fun refuses(typed: String): Boolean {
        val entered = comparable(typed)
        return entered.isNotEmpty() && !phrase.startsWith(entered)
    }
}

/**
 * ConfirmDialog's states, from the spec's States table: the closed trigger in
 * each tone, the open sheet in each tone, and the typed confirmation closed,
 * open, and open with a phrase mistyped, each open one opened by `open` in its
 * own window over the canvas. The pending state has no form here.
 */
object ConfirmDialogStates : PMStates {
    override val member = "ConfirmDialog"

    private const val discard = "Discard this ticket?"
    private const val lost = "The subject and requester you have typed will be lost."
    private const val publish = "Publish this article?"
    private const val visible = "It becomes visible to everyone with the link, immediately."
    private const val project = "Delete the acme-billing project?"
    private const val deleted = "Its tickets, members and settings are deleted with it."

    @Composable
    private fun Trigger(label: String) {
        PMButton(label = label, appearance = PMButtonAppearance.GhostNeutral)
    }

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry("closed — just the trigger", expect = mapOf("state" to "closed", "tone" to "danger", "contains" to "Button")) {
                PMConfirmDialog(confirmLabel = "Discard", description = lost, onConfirm = {}, title = discard, trigger = { Trigger("Discard") })
            },
            PMStateEntry("closed, accent — consequential but safe", expect = mapOf("state" to "closed", "tone" to "accent")) {
                PMConfirmDialog(
                    cancelLabel = "Not yet",
                    confirmLabel = "Publish",
                    description = visible,
                    onConfirm = {},
                    title = publish,
                    tone = PMConfirmDialogTone.Accent,
                    trigger = { Trigger("Publish") },
                )
            },
            PMStateEntry("open, guarding a destruction", expect = mapOf("state" to "open", "tone" to "danger", "presentation" to "sheet")) {
                PMFixturePhone {
                    PMConfirmDialog(confirmLabel = "Discard", description = lost, onConfirm = {}, open = true, title = discard, trigger = { Trigger("Discard") })
                }
            },
            PMStateEntry("closed, with a phrase to type", expect = mapOf("state" to "closed", "tone" to "danger")) {
                PMConfirmDialog(
                    confirmLabel = "Delete project",
                    confirmWith = "acme-billing",
                    description = deleted,
                    onConfirm = {},
                    title = project,
                    trigger = { Trigger("Delete project") },
                )
            },
            PMStateEntry("open, awaiting the phrase", expect = mapOf("state" to "open", "tone" to "danger", "presentation" to "sheet")) {
                PMFixturePhone {
                    PMConfirmDialog(
                        confirmLabel = "Delete project",
                        confirmWith = "acme-billing",
                        description = deleted,
                        onConfirm = {},
                        open = true,
                        title = project,
                        trigger = { Trigger("Delete project") },
                    )
                }
            },
            PMStateEntry("open, the phrase mistyped", expect = mapOf("state" to "open", "tone" to "danger", "presentation" to "sheet")) {
                PMFixturePhone {
                    PMConfirmDialog.Render(
                        PMConfirmDialogProps(
                            confirmLabel = "Delete project",
                            confirmWith = "acme-billing",
                            description = deleted,
                            onConfirm = {},
                            open = true,
                            title = project,
                            trigger = { Trigger("Delete project") },
                        ),
                        typed = "acme-biling",
                    )
                }
            },
            PMStateEntry("open, guarding something consequential but safe", expect = mapOf("state" to "open", "tone" to "accent", "presentation" to "sheet")) {
                PMFixturePhone {
                    PMConfirmDialog(
                        cancelLabel = "Not yet",
                        confirmLabel = "Publish",
                        description = visible,
                        onConfirm = {},
                        open = true,
                        title = publish,
                        tone = PMConfirmDialogTone.Accent,
                        trigger = { Trigger("Publish") },
                    )
                }
            },
        )
}
