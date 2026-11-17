// AppShell (`design/archetypes/app-shell.md`): the application's frame around
// its router, never a screen. On Android it is the platform's own frame:
//
// - **Below a 48rem window** (a phone), the web's drawer breakpoint: the
//   topbar carries a `menu` button that opens the rail as Material's modal
//   navigation drawer over the content. On a phone the rail never collapses,
//   so every item keeps its visible label (the platform map's note). The
//   drawer closes when the page changes (`transitionKey`).
// - **From 48rem** (a tablet): the rail beside the content at the shell's rail
//   width, with its collapse toggle in its head; `collapsed`, controlled or
//   not, narrows it to the collapsed width, and the toggle reports through
//   `onCollapsedChange`.
//
// `navigation`, which lays the web's rail along the top of a wide window,
// draws nothing here: Material has no bar of first-level destinations for one
// composable the app passes, so both frames are drawn whatever it says
// (`undrawn.ts`).
//
// The regions take the shell's tokens: the topbar `space.7 + space.6` tall on
// `shell.topbar.bg` with its border and the raised shadow, the rail on
// `shell.rail.bg` with its border, the content on the app background. The
// sidebar's navigation is the app's content (`sidebar`), drawn in the rail;
// `contentLayout: page` puts the children in a bounded, centred reading
// column. `dock` floats over the content's foot and the content leaves room
// for it. `pending` draws the accent ribbon along the content's top, growing
// over the ambient period, and a new `transitionKey` fades the content in
// without replacing it.
//
// `banner` is a row of its own above either frame, as wide as the window. On a
// phone it is the first row of the drawer's content, so the drawer and its
// scrim open over it, as Material's drawer covers a top app bar. On a tablet
// the rail and the topbar start under it. The frame is shorter by the banner's
// height, and nothing scrolls under it. The row takes the top and side
// safe-drawing insets, as Material's top app bar does, so the notice is clear
// of the status bar and a display cutout in an app drawn edge to edge. The
// slot draws the content the app passes, and its node carries the shell's
// identity with `part=banner`.
//
// `messages` is the opaque `PMUnsupportedAppShellMessages` (an inline object
// type the contract cannot write), so the controls' names are the spec's
// English defaults, which an app translates through `LocalPMStrings`. The skip
// link is a keyboard affordance of the web's document, with no counterpart in
// an Android window.

package dev.polymorph.ui

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.DrawerValue
import androidx.compose.material3.ModalDrawerSheet
import androidx.compose.material3.ModalNavigationDrawer
import androidx.compose.material3.rememberDrawerState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.RectangleShape
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalWindowInfo
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.isTraversalGroup
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch

/** Which frame an AppShell draws. */
enum class PMShellLayout(val value: String) { Stack("stack"), Split("split") }

/**
 * The AppShell frame to draw regardless of the window, for a fixture or a
 * preview; null follows the window's width.
 */
val LocalPMShellLayout = compositionLocalOf<PMShellLayout?> { null }

/** Whether a phone's drawer starts open: a fixture's way to draw it. */
internal val LocalPMShellDrawerOpen = compositionLocalOf { false }

object PMAppShell : PMAppShellRendering {
    @Composable
    override fun Render(props: PMAppShellProps) {
        val theme = PM.theme
        val space = theme.defaultDensity.spacing
        val window = with(LocalDensity.current) { LocalWindowInfo.current.containerSize.width.toDp() }
        val layout = LocalPMShellLayout.current
            ?: if (window < PMRecipe.appShellDrawerBelow) PMShellLayout.Stack else PMShellLayout.Split
        var own by remember { mutableStateOf<Boolean?>(null) }
        val collapsed = props.collapsed ?: own ?: props.defaultCollapsed ?: false
        val setCollapsed: (Boolean) -> Unit = { next ->
            if (props.collapsed == null) own = next
            props.onCollapsedChange?.invoke(next)
        }
        val attributes = buildMap {
            put("layout", layout.value)
            put("content", (props.contentLayout ?: PMAppShellContentLayout.Full).value)
            if (collapsed && layout == PMShellLayout.Split) put("collapsed", "true")
            if (props.pending == true) put("pending", "true")
        }
        val root = Modifier.pmMember("AppShell", attributes).fillMaxSize().background(theme.colors.bgApp.color)

        when (layout) {
            PMShellLayout.Stack -> PMMaterialTheme {
                val drawer = rememberDrawerState(if (LocalPMShellDrawerOpen.current) DrawerValue.Open else DrawerValue.Closed)
                val scope = rememberCoroutineScope()
                // A new page closes the drawer; the first one leaves it as it starts.
                var shown by remember { mutableStateOf(props.transitionKey) }
                LaunchedEffect(props.transitionKey) {
                    if (props.transitionKey != shown) {
                        shown = props.transitionKey
                        drawer.close()
                    }
                }
                ModalNavigationDrawer(
                    modifier = root,
                    drawerState = drawer,
                    // The scrim is `bg.scrim`, its alpha included, not Material's.
                    scrimColor = theme.colors.bgScrim.color,
                    drawerContent = {
                        // The drawer is the rail, at the rail's width. The sheet
                        // given the drawer's state is the one that registers
                        // Back, which closes the drawer; `ModalNavigationDrawer`
                        // registers none, so without it Back leaves the screen.
                        ModalDrawerSheet(
                            drawerState = drawer,
                            modifier = Modifier.width(space.s10 * PMRecipe.appShellRailWidth + space.s7),
                            drawerShape = RoundedCornerShape(topEnd = theme.radius.surface.dp, bottomEnd = theme.radius.surface.dp),
                            drawerContainerColor = theme.shell.railBg.color,
                            drawerTonalElevation = 0.dp,
                        ) { Rail(props, collapsed = false, toggle = null) }
                    },
                ) {
                    Column(Modifier.fillMaxSize()) {
                        Banner(props)
                        Topbar(props) {
                            PMButton(
                                icon = PMIconRole.Menu,
                                iconOnly = true,
                                label = PMSpecDefault.strings.openNavigation,
                                onClick = { scope.launch { drawer.open() } },
                                size = PMControlSize.Sm,
                                appearance = PMButtonAppearance.GhostNeutral,
                            )
                        }
                        Content(props, Modifier.weight(1f))
                    }
                }
            }
            PMShellLayout.Split -> {
                val railBorder = theme.shell.railBorder.color
                val width by animateDpAsState(
                    if (collapsed) {
                        space.s7 * PMRecipe.appShellRailCollapsedWidth + space.s5
                    } else {
                        space.s10 * PMRecipe.appShellRailWidth + space.s7
                    },
                    theme.defaultMotion.easing.standard.tween(theme.defaultMotion.duration.surface),
                    label = "rail",
                )
                Column(root) {
                    Banner(props)
                    Row(Modifier.weight(1f).fillMaxWidth()) {
                        Box(
                            Modifier
                                .width(width)
                                .fillMaxHeight()
                                .clipToBounds()
                                .background(theme.shell.railBg.color)
                                .drawBehind {
                                    // The rail's end edge: the right in a left-to-right layout, the left in a right-to-left one.
                                    val line = PMGeometry.hairline.toPx()
                                    val x = if (layoutDirection == LayoutDirection.Rtl) 0f else size.width - line
                                    drawRect(railBorder, topLeft = Offset(x, 0f), size = Size(line, size.height))
                                },
                        ) { Rail(props, collapsed, toggle = { setCollapsed(!collapsed) }) }
                        Column(Modifier.weight(1f).fillMaxHeight()) {
                            Topbar(props, menu = null)
                            Content(props, Modifier.weight(1f))
                        }
                    }
                }
            }
        }
    }

    /**
     * The banner's row: the app's notice across the frame, above the rail and
     * the topbar, inside the top and side safe-drawing insets.
     */
    @Composable
    private fun Banner(props: PMAppShellProps) {
        val banner = props.banner ?: return
        Box(
            Modifier
                .fillMaxWidth()
                .pmMember("AppShell", mapOf("part" to "banner"))
                .windowInsetsPadding(WindowInsets.safeDrawing.only(WindowInsetsSides.Top + WindowInsetsSides.Horizontal)),
        ) { banner() }
    }

    /**
     * The rail: its head (the brand and, on a tablet, the collapse toggle), the
     * app's navigation, and its footer, on the rail's surface.
     */
    @Composable
    private fun Rail(props: PMAppShellProps, collapsed: Boolean, toggle: (() -> Unit)?) {
        val theme = PM.theme
        val space = theme.defaultDensity.spacing
        val strings = PMSpecDefault.strings
        Column(
            Modifier
                .fillMaxHeight()
                .semantics {
                    contentDescription = strings.primaryNavigation
                    isTraversalGroup = true
                }
                .padding(space.s4),
            verticalArrangement = Arrangement.spacedBy(space.s2),
        ) {
            Row(
                Modifier.fillMaxWidth().heightIn(min = space.s7 + space.s6),
                horizontalArrangement = Arrangement.spacedBy(space.s2),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                props.brand?.let { brand ->
                    if (!collapsed) Box(Modifier.weight(1f).padding(horizontal = space.s3)) { brand() }
                }
                toggle?.let {
                    PMButton(
                        icon = if (collapsed) PMIconRole.Next else PMIconRole.Previous,
                        iconOnly = true,
                        label = if (collapsed) strings.expandSidebar else strings.collapseSidebar,
                        onClick = it,
                        size = PMControlSize.Sm,
                        appearance = PMButtonAppearance.GhostNeutral,
                    )
                }
            }
            Column(
                Modifier.weight(1f).verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(space.s2),
            ) { props.sidebar() }
            props.sidebarFooter?.invoke()
        }
    }

    /** The topbar: the menu button (a phone's), then the leading and trailing slots at its two ends. */
    @Composable
    private fun Topbar(props: PMAppShellProps, menu: PMContent?) {
        val theme = PM.theme
        val space = theme.defaultDensity.spacing
        val border = theme.shell.topbarBorder.color
        Row(
            Modifier
                .fillMaxWidth()
                .height(space.s7 + space.s6)
                .pmShadow(theme.shadows.raised, RectangleShape)
                .background(theme.shell.topbarBg.color)
                .drawBehind {
                    val line = PMGeometry.hairline.toPx()
                    drawRect(border, topLeft = Offset(0f, size.height - line), size = Size(size.width, line))
                }
                .padding(horizontal = space.s6),
            horizontalArrangement = Arrangement.spacedBy(space.s3),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            menu?.invoke()
            Box(Modifier.weight(1f)) { props.topbar?.leading?.invoke() }
            props.topbar?.trailing?.invoke()
        }
    }

    /**
     * The content region: the children (in a reading column for `page`), the
     * pending ribbon, the dock and the arrival fade.
     */
    @Composable
    private fun Content(props: PMAppShellProps, modifier: Modifier) {
        val theme = PM.theme
        val space = theme.defaultDensity.spacing
        val motion = theme.defaultMotion
        val arrival = remember { Animatable(1f) }
        var dock by remember { mutableIntStateOf(0) }
        LaunchedEffect(props.transitionKey) {
            if (props.transitionKey != null && motion.duration.surface > 0) {
                arrival.snapTo(0f)
                arrival.animateTo(1f, motion.easing.enter.tween(motion.duration.surface))
            }
        }
        Box(modifier.fillMaxWidth().background(theme.colors.bgApp.color).clipToBounds()) {
            Box(
                Modifier
                    .fillMaxSize()
                    .padding(bottom = with(LocalDensity.current) { dock.toDp() })
                    .alpha(arrival.value),
            ) {
                if (props.contentLayout == PMAppShellContentLayout.Page) {
                    Box(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
                        PMPageColumn(
                            wide = space.s8 to space.s8,
                            narrow = space.s6 to space.s6,
                            maxWidth = space.s10 * PMRecipe.appShellReadingMeasure,
                            breakpoint = PMRecipe.pageNarrowBelow,
                        ) { Column { props.children() } }
                    }
                } else {
                    props.children()
                }
            }
            if (props.pending == true) PMPageRibbon(Modifier.align(Alignment.TopStart))
            props.dock?.let { content ->
                Box(
                    Modifier
                        .align(Alignment.BottomCenter)
                        .onSizeChanged { dock = it.height }
                        .padding(start = space.s6, end = space.s6, bottom = space.s5),
                ) { content() }
            }
        }
    }
}

/**
 * AppShell's states: the phone's frame with each content layout, pending, a
 * dock and the drawer open, the tablet's frame, open and collapsed, laid out
 * at a tablet's width, and the phone's frame with a banner.
 */
object AppShellStates : PMStates {
    override val member = "AppShell"

    private val pages = listOf("Inbox", "Customers", "Reports")
    private const val title = "Inbox"
    private const val body = "Every ticket waiting for a reply."
    private const val notice = "Your trial ends in 3 days."

    /** The notice in the `banner` slot: a warning Banner with the way out. */
    @Composable
    private fun Notice() {
        PMBanner(
            action = { PMButton(label = "Upgrade plan", size = PMControlSize.Sm, appearance = PMButtonAppearance.SoftAccent) },
            tone = PMBannerTone.Warning,
        ) { Text(notice) }
    }

    @Composable
    private fun Shell(
        banner: PMContent? = null,
        pending: Boolean? = null,
        layout: PMAppShellContentLayout? = null,
        dock: PMContent? = null,
        collapsed: Boolean? = null,
    ) {
        PMAppShell(
            banner = banner,
            brand = { PMHeading(children = "Relay", level = PMHeadingLevel.Level4) },
            contentLayout = layout,
            defaultCollapsed = collapsed,
            dock = dock,
            pending = pending,
            sidebar = { for (page in pages) PMText { Text(page) } },
            topbar = PMAppShellTopbar(
                trailing = {
                    PMButton(
                        icon = PMIconRole.User,
                        iconOnly = true,
                        label = "Account",
                        size = PMControlSize.Sm,
                        appearance = PMButtonAppearance.GhostNeutral,
                    )
                },
            ),
        ) {
            PMStack(gap = PMSpaceStep.S2, p = if (layout == PMAppShellContentLayout.Page) null else PMSpaceStep.S6) {
                PMHeading(children = title)
                PMText(tone = PMTextTone.Secondary) { Text(body) }
            }
        }
    }

    @Composable
    private fun Tablet(collapsed: Boolean) {
        CompositionLocalProvider(LocalPMShellLayout provides PMShellLayout.Split) {
            PMFixtureWidth(PMGeometry.compactWidth) {
                Box(Modifier.height(PMGeometry.compactWidth * TABLET_ASPECT)) { Shell(collapsed = collapsed) }
            }
        }
    }

    /** A tablet's height for its width, landscape: geometry for the fixture's frame. */
    private const val TABLET_ASPECT = 0.75f

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry("full content", expect = mapOf("layout" to "stack", "content" to "full", "contains" to "Heading")) {
                Shell()
            },
            PMStateEntry("page content", expect = mapOf("content" to "page")) { Shell(layout = PMAppShellContentLayout.Page) },
            PMStateEntry("pending", expect = mapOf("pending" to "true")) { Shell(pending = true) },
            PMStateEntry("with a dock") {
                Shell(dock = { PMButton(icon = PMIconRole.Send, label = "Ask a question") })
            },
            PMStateEntry("the drawer open", expect = mapOf("layout" to "stack")) {
                CompositionLocalProvider(LocalPMShellDrawerOpen provides true) { Shell() }
            },
            PMStateEntry("tablet, the rail beside the content", expect = mapOf("layout" to "split")) { Tablet(collapsed = false) },
            PMStateEntry("tablet, collapsed", expect = mapOf("layout" to "split", "collapsed" to "true")) {
                Tablet(collapsed = true)
            },
            PMStateEntry(
                "with a banner — a notice across the frame, above the rail and the topbar",
                expect = mapOf("layout" to "stack", "contains" to "Banner"),
            ) { Shell(banner = { Notice() }) },
        )
}
