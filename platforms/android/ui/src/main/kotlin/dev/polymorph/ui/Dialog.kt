// Dialog (`design/components/dialog.md`), adapted on Android: a full-screen
// dialog on phones, centred on tablets, the platform map's form. The trigger
// stays where the screen puts it; opening presents the panel in a Compose
// `Dialog` window, which takes the back gesture and makes the rest of the
// screen inert to TalkBack. The window draws the scrim, and its colour is the
// platform's, not `bg.scrim`: the platform dims behind a dialog window, and a
// scrim drawn inside it as well would darken the screen twice. The panel is
// the title (`text.xl`, a heading), the description, the body, which scrolls
// while the title and the footer stay, and the footer's actions at the
// trailing end, with the close button (Button's ghost/neutral/sm icon-only
// `close`, named by `closeLabel`, default "Close") at the title's end.
//
// Below 30rem of window width, the recipe's breakpoint (`PMRecipe.dialogBelow`),
// the panel fills the window, the phone's full-screen dialog; wider, it is a
// card of its size's width (`space.10` × 4, 5 or 7), no taller than the window
// less `space.8` above and below, on the overlay surface. `presentation:
// sheet` keeps the card from 30rem and, below it, makes the panel the recipe's
// bottom sheet instead of filling the window: attached to the bottom edge,
// full width, its top corners at `radius.surface` and its top edge the only
// border, as tall as its content up to two thirds of the window
// (`PMRecipe.sheetHeight`), its foot clear of the system bars. A tap above the
// sheet dismisses it, as a tap on the scrim does. `size` has no visible effect
// below 30rem in either form. `dismissible: false` removes the close button
// and stops the back gesture and the scrim tap, so the footer must answer.
//
// The trigger is any composable; the dialog puts its opening action in
// `LocalPMTriggerAction`, and Button runs it after its own action. `open` with
// `onOpenChange` is the controlled form; `defaultOpen` opens it on its own.
//
// Not honoured: `initialFocus`, because the footer is content the dialog cannot
// reach into (TalkBack starts on the title, as in every dialog window); and
// `alert`, because a dialog window is already modal to accessibility services,
// which is what `alertdialog` adds on the web.

package dev.polymorph.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalWindowInfo
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.paneTitle
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.toSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties

/** The three forms of an open Dialog's panel. */
enum class PMDialogForm(val value: String) {
    /** A card of its size's width, centred: the form from 30rem of window. */
    Centred("centred"),

    /** The window, edge to edge: the form below 30rem. */
    FullScreen("full-screen"),

    /** A bottom sheet as tall as its content: below 30rem with `presentation: sheet`. */
    Sheet("sheet"),
}

object PMDialog : PMDialogRendering {
    @Composable
    override fun Render(props: PMDialogProps) {
        var own by remember { mutableStateOf(props.defaultOpen ?: false) }
        val open = props.open ?: own
        val dismissible = props.dismissible ?: true
        val setOpen: (Boolean) -> Unit = { next ->
            own = next
            props.onOpenChange?.invoke(next)
        }
        val size = props.size ?: PMControlSize.Md

        Box(Modifier.pmMember("Dialog", mapOf("state" to if (open) "open" else "closed", "size" to size.value))) {
            PMOverlayTrigger(props.trigger) { setOpen(true) }
        }
        if (open) {
            val window = with(LocalDensity.current) { LocalWindowInfo.current.containerSize.toSize().toDpSize() }
            val form = when {
                window.width >= PMRecipe.dialogBelow -> PMDialogForm.Centred
                props.presentation == PMDialogPresentation.Sheet -> PMDialogForm.Sheet
                else -> PMDialogForm.FullScreen
            }
            Dialog(
                onDismissRequest = { if (dismissible) setOpen(false) },
                properties = DialogProperties(
                    dismissOnBackPress = dismissible,
                    dismissOnClickOutside = dismissible,
                    usePlatformDefaultWidth = false,
                ),
            ) {
                PMOverlayContent {
                    if (form == PMDialogForm.Sheet) {
                        // The window above the sheet is the scrim's area: a tap
                        // there dismisses, and the sheet keeps its own taps.
                        Box(
                            Modifier
                                .fillMaxSize()
                                .pointerInput(dismissible) { detectTapGestures { if (dismissible) setOpen(false) } },
                            contentAlignment = Alignment.BottomCenter,
                        ) {
                            PMDialogPanel(props, form, window, Modifier.pointerInput(Unit) { detectTapGestures { } }) {
                                setOpen(false)
                            }
                        }
                    } else {
                        PMDialogPanel(props, form, window) { setOpen(false) }
                    }
                }
            }
        }
    }
}

/**
 * The panel the dialog window holds: the header with the close button, the
 * description, the body and the footer, inset by the surface inset. In its
 * `form`: full-screen, it fills the window on the overlay colour, inside the
 * system bars; a sheet, it spans the window's width at its foot, no taller
 * than `PMRecipe.sheetHeight` of it; centred, it is a card of its size's
 * width, no wider than `window` less `space.7` on each side and no taller than
 * it less `space.8` above and below, when there is a window to fit.
 */
@Composable
fun PMDialogPanel(
    props: PMDialogProps,
    form: PMDialogForm,
    window: DpSize?,
    modifier: Modifier = Modifier,
    close: () -> Unit,
) {
    val theme = PM.theme
    val density = theme.defaultDensity
    val space = density.spacing
    val dismissible = props.dismissible ?: true
    val size = props.size ?: PMControlSize.Md
    val full = form == PMDialogForm.FullScreen
    val width = when (size) {
        PMControlSize.Sm -> space.s10 * PMRecipe.dialogWidthSm
        PMControlSize.Md -> space.s10 * PMRecipe.dialogWidthMd
        PMControlSize.Lg -> space.s10 * PMRecipe.dialogWidthLg
    }
    val frame = when (form) {
        // The window itself, edge to edge: no radius, border or shadow.
        PMDialogForm.FullScreen -> Modifier
            .fillMaxSize()
            .background(theme.colors.bgOverlay.color)
            .windowInsetsPadding(WindowInsets.safeDrawing)
        PMDialogForm.Sheet -> Modifier
            .fillMaxWidth()
            .then(if (window != null) Modifier.heightIn(max = window.height * PMRecipe.sheetHeight) else Modifier)
            .pmSheetSurface()
        PMDialogForm.Centred -> Modifier
            .width(if (window == null) width else minOf(width, window.width - PMGeometry.bothEdges(space.s7)))
            .then(if (window != null) Modifier.heightIn(max = window.height - PMGeometry.bothEdges(space.s8)) else Modifier)
            .pmOverlaySurface(theme.colors.bgOverlay, theme.colors.borderSubtle)
    }
    val attributes = buildMap {
        put("state", "open")
        put("size", size.value)
        put("form", form.value)
        if (form == PMDialogForm.Sheet) put("presentation", "sheet")
    }

    Column(
        modifier = modifier
            .pmMember("Dialog", attributes)
            .semantics { paneTitle = props.title }
            .then(frame)
            .padding(density.inset.surface.dp)
            // The sheet's foot clears the system bars, as the web's adds the safe area.
            .then(
                if (form == PMDialogForm.Sheet) {
                    Modifier.windowInsetsPadding(WindowInsets.safeDrawing.only(WindowInsetsSides.Bottom))
                } else {
                    Modifier
                },
            ),
    ) {
        Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(space.s3)) {
            Text(
                text = props.title,
                style = theme.text.xl.textStyle,
                color = theme.colors.textPrimary.color,
                modifier = Modifier.weight(1f).semantics { heading() },
            )
            if (dismissible) {
                PMButton(
                    icon = PMIconRole.Close,
                    iconOnly = true,
                    label = props.closeLabel ?: PMSpecDefault.strings.close,
                    onClick = close,
                    size = PMControlSize.Sm,
                    appearance = PMButtonAppearance.GhostNeutral,
                )
            }
        }
        props.description?.let {
            Text(
                text = it,
                style = theme.text.sm.textStyle,
                color = theme.colors.textSecondary.color,
                modifier = Modifier.padding(top = space.s2),
            )
        }
        props.children?.let { body ->
            // The body scrolls while the title and the footer stay: the
            // panel's one scroll region, which a ScrollArea inside shares.
            PMOverlayBody(
                Modifier
                    .padding(top = space.s5)
                    .weight(1f, fill = full)
                    .fillMaxWidth(),
            ) {
                CompositionLocalProvider(
                    LocalTextStyle provides theme.text.md.textStyle,
                    LocalContentColor provides theme.colors.textPrimary.color,
                ) { body() }
            }
        }
        props.footer?.let { footer ->
            Row(
                modifier = Modifier.fillMaxWidth().padding(top = space.s6),
                horizontalArrangement = Arrangement.spacedBy(space.s3, Alignment.End),
                verticalAlignment = Alignment.CenterVertically,
            ) { footer() }
        }
    }
}

/**
 * Dialog's states, from the spec's States table. The closed entries are the
 * trigger the screen shows; the open ones open the dialog with `defaultOpen`,
 * in its window over the canvas: full-screen at a phone's width, and centred
 * where the fixture lays the canvas out at a tablet's.
 */
object DialogStates : PMStates {
    override val member = "Dialog"

    private const val discard = "Discard this ticket?"
    private const val kept = "Nothing you typed is kept."
    private const val plainBody = "This is the body."
    private const val fullBody = "The panel fills the window on a phone."
    private const val primaryBody = "The primary action is the only solid one."
    private const val forcedBody = "A forced choice. Use sparingly."
    private const val shortBody = "Body."
    private val terms = List(4) {
        "Closing a ticket stops its reminders, removes it from every queue and sends the customer the closing " +
            "note. A closed ticket can be reopened for thirty days."
    }.joinToString(" ")

    @Composable
    private fun Footer(cancel: String, confirm: String) {
        PMButton(label = cancel, appearance = PMButtonAppearance.OutlineNeutral)
        PMButton(label = confirm, appearance = PMButtonAppearance.SolidDanger)
    }

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry("plain — the trigger", expect = mapOf("state" to "closed", "contains" to "Button")) {
                PMDialog(title = discard, trigger = { PMButton(label = "Open") }) { Text(plainBody) }
            },
            PMStateEntry("open md — full-screen on a phone", expect = mapOf("state" to "open", "size" to "md")) {
                PMFixturePhone {
                    PMDialog(
                        defaultOpen = true,
                        description = kept,
                        footer = { PMButton(label = "Discard", appearance = PMButtonAppearance.SolidDanger) },
                        title = discard,
                    ) { Text(fullBody) }
                }
            },
            PMStateEntry("with a footer — one primary action, trailing", expect = mapOf("state" to "open")) {
                PMFixturePhone {
                    PMDialog(defaultOpen = true, description = kept, footer = { Footer("Keep editing", "Discard") }, title = discard) {
                        Text(primaryBody)
                    }
                }
            },
            PMStateEntry("with a form", expect = mapOf("state" to "open")) {
                PMFixturePhone {
                    PMDialog(
                        defaultOpen = true,
                        description = "Focus starts in the first field.",
                        footer = { PMButton(label = "Create") },
                        title = "New ticket",
                    ) {
                        PMFormField(description = "One line, as the customer would say it.", label = "Subject") {
                            PMInput(placeholder = "What went wrong?")
                        }
                    }
                }
            },
            PMStateEntry("scrolling body — the title and the footer stay", expect = mapOf("state" to "open")) {
                PMFixturePhone {
                    PMDialog(defaultOpen = true, description = kept, footer = { Footer("Keep it open", "Close ticket") }, title = "Close this ticket?") {
                        Text(terms)
                    }
                }
            },
            PMStateEntry(
                "presentation sheet — a bottom sheet on a phone",
                expect = mapOf("state" to "open", "presentation" to "sheet"),
            ) {
                PMFixturePhone {
                    PMDialog(
                        defaultOpen = true,
                        description = kept,
                        footer = { Footer("Keep editing", "Discard") },
                        presentation = PMDialogPresentation.Sheet,
                        title = discard,
                    ) { Text(shortBody) }
                }
            },
            PMStateEntry("non-dismissible — no close button", expect = mapOf("state" to "open")) {
                PMFixturePhone {
                    PMDialog(
                        defaultOpen = true,
                        description = "This one cannot be waved away.",
                        dismissible = false,
                        footer = { Footer("Cancel", "Continue") },
                        title = "Choose one",
                    ) { Text(forcedBody) }
                }
            },
        ) + PMControlSize.entries.map { size ->
            // The window is the harness's phone-wide canvas, so the centred
            // form is drawn in place, laid out at a tablet's width.
            PMStateEntry("centred on a tablet, ${size.value}", expect = mapOf("state" to "open", "size" to size.value)) {
                PMFixtureWidth(PMGeometry.compactWidth) {
                    Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                        PMDialogPanel(
                            PMDialogProps(
                                children = { Text(shortBody) },
                                description = kept,
                                footer = { PMButton(label = "Discard", appearance = PMButtonAppearance.SolidDanger) },
                                size = size,
                                title = "A ${size.value} dialog",
                            ),
                            form = PMDialogForm.Centred,
                            window = null,
                        ) {}
                    }
                }
            }
        }
}
