// Drawer (`design/components/drawer.md`): Dialog's modal panel pinned to an
// edge. It has no trigger: the screen opens it with `open`, or `defaultOpen`,
// and hears it close through `onOpenChange`.
//
// On a phone's window, below 30rem (the overlay class's one line), every side
// is the platform's bottom sheet (`PMBottomSheet`), as Material keeps side
// sheets to wider windows and as the SwiftUI drawer does on iPhone: a bottom
// drawer as tall as its content up to half, two thirds or four fifths of the
// window by `size` (`PMRecipe.drawerHeight…`), and a start or end drawer as
// tall as the sheet goes, a side panel's full block size. On a wider window a
// bottom drawer is the same sheet, and a start or end drawer is a modal side
// sheet in a dialog window, which takes the back gesture and dims the screen
// behind it as the platform dims behind a dialog: the panel pinned to its
// edge, four, five or six `space-10` steps wide by `size`
// (`PMRecipe.drawerWidth…`) and no wider than the window, `radius.surface` on
// its free corners, a `border.subtle` hairline on its inner edge and the
// transient shadow, sliding in from fully off its edge over the overlay
// duration on the enter easing and out over the overlay's exit duration on
// the exit easing, because the distance is the panel's geometry. A press
// beside the panel dismisses it. `end` is the right in a left-to-right layout.
//
// The panel is Dialog's anatomy at Drawer's insets: the header (`space-5`
// around, `space-3` under), with the title in `text.xl`, a heading, the
// description in `text.sm` `text.secondary` and the close button, Button's
// ghost/neutral/sm icon-only `close` named by `closeLabel` (default
// "Close"); the body, the one part that scrolls, `space-5` across; and the
// footer's actions at the trailing end, `space-3` apart, `space-3` above and
// `space-5` around. `dismissible: false` removes the close button, the drag,
// the back gesture and the press beside the panel together, so the footer must
// answer. The panel is a pane titled by `title`.
//
// Not honoured: `initialFocus`, as on Dialog, because the footer is content
// the drawer cannot reach into; TalkBack starts on the title.

package dev.polymorph.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.MutableTransitionState
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.platform.LocalWindowInfo
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.paneTitle
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties

/** The two forms of an open Drawer's panel. */
enum class PMDrawerForm {
    /** The bottom sheet: every side on a phone, and a bottom drawer everywhere. */
    Sheet,

    /** A side sheet pinned to its edge: a start or end drawer on a wider window. */
    Side,
}

object PMDrawer : PMDrawerRendering {
    @Composable
    override fun Render(props: PMDrawerProps) {
        var own by remember { mutableStateOf(props.defaultOpen ?: false) }
        val open = props.open ?: own
        val dismissible = props.dismissible ?: true
        val side = props.side ?: PMDrawerSide.End
        val setOpen: (Boolean) -> Unit = { next ->
            own = next
            props.onOpenChange?.invoke(next)
        }
        val close = { setOpen(false) }
        val form = if (side == PMDrawerSide.Bottom || pmCompactWindow()) PMDrawerForm.Sheet else PMDrawerForm.Side

        Box(Modifier.pmMember("Drawer", attributes(open, props)))
        when (form) {
            PMDrawerForm.Sheet -> if (open) {
                PMBottomSheet(
                    onDismiss = close,
                    dismissible = dismissible,
                    cap = if (side == PMDrawerSide.Bottom) heightOf(props.size ?: PMControlSize.Md) else WHOLE,
                    fill = side != PMDrawerSide.Bottom,
                ) { PMDrawerPanel(props, PMDrawerForm.Sheet, close) }
            }
            PMDrawerForm.Side -> SideSheet(open, props, close)
        }
    }

    /** A start or end drawer on a wider window: the dialog window, and the panel sliding in from its edge. */
    @Composable
    private fun SideSheet(open: Boolean, props: PMDrawerProps, close: () -> Unit) {
        val visible = remember { MutableTransitionState(false) }
        visible.targetState = open
        if (!visible.currentState && !visible.targetState) return
        val dismissible = props.dismissible ?: true
        val motion = PM.theme.defaultMotion
        // The end side is the right in a left-to-right layout.
        val toRight = (props.side == PMDrawerSide.Start) == (LocalLayoutDirection.current == LayoutDirection.Rtl)
        val off = { width: Int -> if (toRight) width else -width }
        Dialog(
            onDismissRequest = { if (dismissible) close() },
            properties = DialogProperties(
                dismissOnBackPress = dismissible,
                dismissOnClickOutside = dismissible,
                usePlatformDefaultWidth = false,
            ),
        ) {
            Box(
                Modifier
                    .fillMaxSize()
                    .pointerInput(dismissible) { detectTapGestures { if (dismissible) close() } },
                contentAlignment = if (props.side == PMDrawerSide.Start) Alignment.CenterStart else Alignment.CenterEnd,
            ) {
                AnimatedVisibility(
                    visibleState = visible,
                    enter = slideInHorizontally(motion.easing.enter.tween(motion.duration.overlay), off),
                    exit = slideOutHorizontally(motion.easing.exit.tween(motion.duration.overlayExit), off),
                ) {
                    // The panel keeps its own presses.
                    PMOverlayContent {
                        PMDrawerPanel(props, PMDrawerForm.Side, close, Modifier.pointerInput(Unit) { detectTapGestures { } })
                    }
                }
            }
        }
    }

    /** A bottom drawer's greatest height by size, as a fraction of the window's. */
    private fun heightOf(size: PMControlSize): Float = when (size) {
        PMControlSize.Sm -> PMRecipe.drawerHeightSm
        PMControlSize.Md -> PMRecipe.drawerHeightMd
        PMControlSize.Lg -> PMRecipe.drawerHeightLg
    }

    /** A side drawer's sheet on a phone: as tall as the window lets a sheet be. */
    private const val WHOLE = 1f

    /** The member's attributes: the web's `data-state`, `data-side` and `data-size`. */
    fun attributes(open: Boolean, props: PMDrawerProps): Map<String, String> = mapOf(
        "state" to if (open) "open" else "closed",
        "side" to (props.side ?: PMDrawerSide.End).value,
        "size" to (props.size ?: PMControlSize.Md).value,
    )
}

/**
 * The drawer's panel: the header with the close button, the body and the
 * footer. In the sheet it is bare, because the sheet draws the surface, and
 * its foot clears the system bars. As a side sheet it is the window's height
 * and its size's width, no wider than `window` when there is one to fit, on
 * the overlay surface with its free corners rounded and its inner edge a
 * hairline, inside the system bars.
 */
@Composable
fun PMDrawerPanel(
    props: PMDrawerProps,
    form: PMDrawerForm,
    close: () -> Unit,
    modifier: Modifier = Modifier,
    window: Dp? = null,
) {
    val theme = PM.theme
    val space = theme.defaultDensity.spacing
    val dismissible = props.dismissible ?: true
    val side = props.side ?: PMDrawerSide.End
    val frame = when (form) {
        PMDrawerForm.Sheet -> Modifier.windowInsetsPadding(WindowInsets.safeDrawing.only(WindowInsetsSides.Bottom))
        PMDrawerForm.Side -> {
            val width = space.s10 * when (props.size ?: PMControlSize.Md) {
                PMControlSize.Sm -> PMRecipe.drawerWidthSm
                PMControlSize.Md -> PMRecipe.drawerWidthMd
                PMControlSize.Lg -> PMRecipe.drawerWidthLg
            }
            val fits = window ?: with(LocalDensity.current) { LocalWindowInfo.current.containerSize.width.toDp() }
            val radius = theme.radius.surface.dp
            val start = side == PMDrawerSide.Start
            // The corners on the attached edge are square; the free ones are rounded.
            val shape = if (start) {
                RoundedCornerShape(topEnd = radius, bottomEnd = radius)
            } else {
                RoundedCornerShape(topStart = radius, bottomStart = radius)
            }
            Modifier
                .width(minOf(width, fits))
                .fillMaxHeight()
                .pmShadow(theme.shadows.transient, shape)
                .background(theme.colors.bgOverlay.color, shape)
                .windowInsetsPadding(WindowInsets.safeDrawing)
        }
    }

    Box(modifier.then(frame)) {
        Column(
            Modifier
                .pmMember("Drawer", PMDrawer.attributes(true, props).let { if (form == PMDrawerForm.Sheet) pmInSheet(it) else it })
                .semantics { paneTitle = props.title }
                .then(if (form == PMDrawerForm.Side) Modifier.fillMaxHeight() else Modifier),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(start = space.s5, top = space.s5, end = space.s5, bottom = space.s3),
                horizontalArrangement = Arrangement.spacedBy(space.s3),
                verticalAlignment = Alignment.Top,
            ) {
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(space.s2)) {
                    Text(
                        text = props.title,
                        style = theme.text.xl.textStyle,
                        color = theme.colors.textPrimary.color,
                        modifier = Modifier.semantics { heading() },
                    )
                    props.description?.let {
                        Text(text = it, style = theme.text.sm.textStyle, color = theme.colors.textSecondary.color)
                    }
                }
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
            props.children?.let { body -> Body(form, body) }
            props.footer?.let { footer ->
                Row(
                    modifier = Modifier.fillMaxWidth().padding(start = space.s5, top = space.s3, end = space.s5, bottom = space.s5),
                    horizontalArrangement = Arrangement.spacedBy(space.s3, Alignment.End),
                    verticalAlignment = Alignment.CenterVertically,
                ) { footer() }
            }
        }
        // The hairline on the inner edge of a side sheet.
        if (form == PMDrawerForm.Side) {
            PMRule(
                theme.colors.borderSubtle,
                Modifier.align(if (side == PMDrawerSide.Start) Alignment.CenterEnd else Alignment.CenterStart).fillMaxHeight(),
                vertical = true,
            )
        }
    }
}

/**
 * The body: the one part that scrolls, `space-5` across, while the header and
 * the footer stay, and the panel's one scroll region, which a ScrollArea or a
 * ChatThread inside shares (`PMOverlayBody`).
 */
@Composable
private fun ColumnScope.Body(form: PMDrawerForm, body: PMContent) {
    val theme = PM.theme
    PMOverlayBody(Modifier.weight(1f, fill = form == PMDrawerForm.Side).fillMaxWidth()) {
        Box(Modifier.padding(horizontal = theme.defaultDensity.spacing.s5)) {
            CompositionLocalProvider(
                LocalTextStyle provides theme.text.md.textStyle,
                LocalContentColor provides theme.colors.textPrimary.color,
            ) { body() }
        }
    }
}

/**
 * Drawer's states, from the spec's States table. On a phone every side opens
 * as the bottom sheet, opened by `defaultOpen` in its own window over the
 * canvas; on a tablet a start or end drawer is the side sheet, drawn in place
 * here at a tablet's width.
 */
object DrawerStates : PMStates {
    override val member = "Drawer"

    private const val title = "Ticket details"
    private const val about = "Everything the customer has told us so far."
    private const val body = "The customer was charged twice for the March invoice and asked for the second charge to be refunded to the same card."

    @Composable
    private fun Body(paragraphs: Int = 1) {
        Column(verticalArrangement = Arrangement.spacedBy(PM.theme.defaultDensity.spacing.s3)) {
            repeat(paragraphs) { Text(body) }
        }
    }

    @Composable
    private fun Footer() {
        PMButton(label = "Cancel", appearance = PMButtonAppearance.OutlineNeutral)
        PMButton(label = "Save")
    }

    /**
     * A drawer as a window wider than a phone's presents it: the side sheet, in
     * its dialog window over the canvas, which is as tall as a phone's screen.
     * The canvas is a phone's width, so a panel wider than it takes it all.
     */
    @Composable
    private fun OnAWideWindow(content: @Composable () -> Unit) {
        PMFixturePhone { CompositionLocalProvider(LocalPMCompactWindow provides false) { content() } }
    }

    /**
     * The side sheet's panel drawn in place against its edge at a tablet's
     * width, so its sizes show beside the room it leaves.
     */
    @Composable
    private fun OnATablet(props: PMDrawerProps) {
        val space = PM.theme.defaultDensity.spacing
        PMFixtureWidth(PMGeometry.compactWidth) {
            Box(
                Modifier.fillMaxWidth().height(space.s10 * TABLET_HEIGHT),
                contentAlignment = if (props.side == PMDrawerSide.Start) Alignment.CenterStart else Alignment.CenterEnd,
            ) {
                PMDrawerPanel(props, PMDrawerForm.Side, close = {}, window = PMGeometry.compactWidth)
            }
        }
    }

    /** The tablet canvas's height, in `space-10` steps. */
    private const val TABLET_HEIGHT = 8

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry("open end, on a phone — a full-height bottom sheet", expect = mapOf("state" to "open", "side" to "end", "presentation" to "sheet")) {
                PMFixturePhone { PMDrawer(defaultOpen = true, description = about, title = title) { Body() } }
            },
            PMStateEntry("open bottom, on a phone — as tall as its content", expect = mapOf("state" to "open", "side" to "bottom", "presentation" to "sheet")) {
                PMFixturePhone {
                    PMDrawer(defaultOpen = true, description = about, side = PMDrawerSide.Bottom, title = title) { Body() }
                }
            },
            PMStateEntry("open end, on a tablet — a side sheet", expect = mapOf("state" to "open", "side" to "end")) {
                OnAWideWindow { PMDrawer(defaultOpen = true, description = about, title = title) { Body() } }
            },
            PMStateEntry("open start, on a tablet", expect = mapOf("state" to "open", "side" to "start")) {
                OnAWideWindow { PMDrawer(defaultOpen = true, description = about, side = PMDrawerSide.Start, size = PMControlSize.Sm, title = title) { Body() } }
            },
            PMStateEntry("the side sheet's panel at a tablet's width", expect = mapOf("state" to "open", "side" to "end", "contains" to "Button")) {
                OnATablet(PMDrawerProps(children = { Body() }, description = about, title = title))
            },
        ) + listOf(PMControlSize.Sm, PMControlSize.Lg).map { size ->
            PMStateEntry("size ${size.value}, on a tablet", expect = mapOf("state" to "open", "size" to size.value)) {
                OnATablet(PMDrawerProps(children = { Body() }, size = size, title = title))
            }
        } + listOf(
            PMStateEntry("with footer", expect = mapOf("state" to "open")) {
                PMFixturePhone {
                    PMDrawer(defaultOpen = true, description = about, footer = { Footer() }, side = PMDrawerSide.Bottom, title = title) {
                        Body()
                    }
                }
            },
            PMStateEntry("forced choice — no close button", expect = mapOf("state" to "open")) {
                PMFixturePhone {
                    PMDrawer(defaultOpen = true, dismissible = false, footer = { Footer() }, side = PMDrawerSide.Bottom, title = "Choose a queue") {
                        Body()
                    }
                }
            },
            PMStateEntry("scrolling body — the header and the footer stay", expect = mapOf("state" to "open")) {
                PMFixturePhone { PMDrawer(defaultOpen = true, footer = { Footer() }, title = title) { Body(paragraphs = 8) } }
            },
        )
}
