// LogView (`design/components/log-view.md`): lines of output that arrive over
// time, held at the newest line while the reader is there. ChatThread's frame
// around CodeBlock's surface: the member fills the box it is given and scrolls
// inside it, on the mono face at `text.sm` in `text.primary` on `bg.subtle`,
// inside a `border.subtle` hairline at `radius.md`, the lines `space.2` from
// its top and bottom. The lines are a `LazyColumn` keyed by each line's id, so
// a line that arrives composes itself and the ones on screen. Given no height
// of its own (in a column that scrolls), the log grows with its lines.
//
// A line is a marker cell `space.6` wide, its time, and its text, each
// `space.3` in from the cell before it. A level is never colour alone: its icon
// sits in the marker cell, centred on the first line, and its word is read
// before the line. `info` is the muted icon on the log's own surface;
// `warning` and `error` wash the cell, `{tone}.text` on `{tone}.subtle`, as
// tall as the line, and the wash stops at the cell. The time and the source are
// `text.muted`, the source one space before the text. Whitespace is content. A
// long line wraps inside its row (`wrap`, the default) or, unwrapped, keeps to
// one row and the log scrolls sideways too. While `streaming`, a row after the
// last line holds StreamingText's steady caret where the next line will start.
//
// Follow is ChatThread's rule: while the reader is within `space.5` of the end,
// a line that arrives moves the log to its new end, at once and never
// animated; a line that arrives while the reader drags is followed when the
// drag ends, if they are still at the end then. Scrolling sideways does not
// stop it. Once the reader has scrolled up, nothing moves until they press the
// jump control: Button `outline/neutral/sm` with the `down` glyph, named by
// `messages.jumpToLatest`, on a raised backing (`bg.raised`, `radius.control`,
// `shadow.raised`), centred `space.4` above the bottom edge. It exists only
// while the reader is detached, so it is out of the tree, and TalkBack's, while
// it would do nothing. The log starts at its end.
//
// TalkBack: the root is a group named by `label`, the web's `log`, which
// TalkBack scrolls with its own gestures. Compose has no log role and no busy
// state, and the log announces nothing, as the web's `aria-live="off"` says;
// the root carries `streaming` while more lines are coming. Each line is one
// node read as its level's word, its time, its source and its text; the
// markers and the caret are hidden.

package dev.polymorph.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.scrollBy
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.hideFromAccessibility
import androidx.compose.ui.semantics.isTraversalGroup
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.text
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.sp
import dev.polymorph.tokens.PMDynamicColor
import dev.polymorph.tokens.PMTextStyle
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.launch

object PMLogView : PMLogViewRendering {
    @Composable
    override fun Render(props: PMLogViewProps) {
        // The constraints decide whether the log scrolls itself: it does
        // wherever its height is bounded, and grows with its lines in a column
        // that scrolls. It fills the height a box gives it, however few its lines.
        BoxWithConstraints(propagateMinConstraints = true) {
            Log(props, bounded = constraints.maxHeight != Constraints.Infinity, least = minHeight)
        }
    }

    /** The keys of the rows that are not lines: the padding above and below, and the caret's row. */
    private const val TOP = "pm.log-view.top"
    private const val BOTTOM = "pm.log-view.bottom"
    private const val CARET = "pm.log-view.caret"

    @Composable
    private fun Log(props: PMLogViewProps, bounded: Boolean, least: Dp) {
        val theme = PM.theme
        val space = theme.defaultDensity.spacing
        val streaming = props.streaming ?: false
        val wrap = props.wrap ?: true
        val messages = props.messages ?: PMSpecDefault.strings.logViewMessages
        val step = theme.text.sm.mono(theme)
        val shape = theme.rounded(theme.radius.md)
        val state = rememberLazyListState()
        val sideways = rememberScrollState()
        val scope = rememberCoroutineScope()
        var following by remember { mutableStateOf(true) }
        // Lines arrived during a drag and were not followed.
        var missed by remember { mutableStateOf(false) }
        val slack = with(LocalDensity.current) { space.s5.roundToPx() }
        val detached = bounded && !following
        val attributes = buildMap {
            if (detached) put("state", "detached")
            if (streaming) put("streaming", "true")
            if (wrap) put("wrap", "true")
        }

        if (bounded) {
            // Two observations: how far the end is, and how many rows there are
            // in how tall a viewport.
            LaunchedEffect(state) {
                var extent = -1 to -1
                snapshotFlow { (state.layoutInfo.totalItemsCount to state.layoutInfo.viewportSize.height) to state.distanceToEnd() }
                    .collect { (measured, distance) ->
                        if (measured != extent) {
                            extent = measured
                            // More lines: follow them to the new end while
                            // following. During a drag it waits for the drag's
                            // end; a drag cancels a scroll started under it, and
                            // that cancellation is the drag's, not this effect's.
                            if (following && state.isScrollInProgress) missed = true
                            if (following && !state.isScrollInProgress) {
                                try {
                                    state.toEnd()
                                } catch (cancelled: CancellationException) {
                                    currentCoroutineContext().ensureActive()
                                }
                            }
                        } else {
                            // The reader's own scroll decides whether they are at the end.
                            following = distance <= slack
                        }
                    }
            }
            // The drag has ended: what arrived during it is followed, if the
            // reader is still at the end.
            LaunchedEffect(state) {
                snapshotFlow { state.isScrollInProgress }.collect { moving ->
                    if (!moving && missed) {
                        missed = false
                        if (following) state.toEnd()
                    }
                }
            }
        }

        Box(
            Modifier
                .pmMember("LogView", attributes)
                .semantics {
                    contentDescription = props.label
                    isTraversalGroup = true
                }
                .fillMaxWidth(),
        ) {
            CompositionLocalProvider(LocalTextStyle provides step.textStyle, LocalContentColor provides theme.colors.textPrimary.color) {
                val surface = Modifier
                    .fillMaxWidth()
                    .heightIn(min = least)
                    .clip(shape)
                    .background(theme.colors.bgSubtle.color)
                    .border(PMGeometry.hairline, theme.colors.borderSubtle.color, shape)
                if (bounded) {
                    BoxWithConstraints(surface, propagateMinConstraints = true) {
                        // An unwrapped log's lines are at least the viewport's width.
                        val viewport = maxWidth
                        LazyColumn(
                            state = state,
                            modifier = if (wrap) Modifier else Modifier.horizontalScroll(sideways),
                        ) {
                            item(key = TOP) { Spacer(Modifier.height(space.s2)) }
                            items(props.lines, key = { it.id }) { line -> Line(line, wrap, messages, step, viewport) }
                            if (streaming) item(key = CARET) { Caret(step) }
                            item(key = BOTTOM) { Spacer(Modifier.height(space.s2)) }
                        }
                    }
                } else {
                    BoxWithConstraints(surface) {
                        val viewport = maxWidth
                        Column(
                            Modifier
                                .padding(vertical = space.s2)
                                .then(if (wrap) Modifier else Modifier.horizontalScroll(sideways)),
                        ) {
                            for (line in props.lines) Line(line, wrap, messages, step, viewport)
                            if (streaming) Caret(step)
                        }
                    }
                }
            }
            if (detached) {
                val control = theme.rounded(theme.radius.control)
                Box(
                    Modifier
                        .align(Alignment.BottomCenter)
                        .padding(bottom = space.s4)
                        .pmShadow(theme.shadows.raised, control)
                        .background(theme.colors.bgRaised.color, control),
                ) {
                    PMButton(
                        icon = PMIconRole.Down,
                        label = messages.jumpToLatest,
                        onClick = {
                            following = true
                            scope.launch { state.toEnd() }
                        },
                        size = PMControlSize.Sm,
                        appearance = PMButtonAppearance.OutlineNeutral,
                    )
                }
            }
        }
    }

    /**
     * How far the end of the rows is below the viewport's, in pixels: none at
     * the end, and the most there is while the last row is not on screen.
     */
    private fun LazyListState.distanceToEnd(): Int {
        val info = layoutInfo
        val last = info.visibleItemsInfo.lastOrNull() ?: return 0
        if (last.index < info.totalItemsCount - 1) return Int.MAX_VALUE
        return (last.offset + last.size - info.viewportSize.height).coerceAtLeast(0)
    }

    /** Moves to the end at once: to the last row, which the list holds at its bottom. */
    private suspend fun LazyListState.toEnd() {
        val last = layoutInfo.totalItemsCount - 1
        if (last < 0) return
        scrollToItem(last)
        val rest = distanceToEnd()
        if (rest in 1 until Int.MAX_VALUE) scrollBy(rest.toFloat())
    }

    /**
     * One line: its level's marker, its time, its source and its text, read as
     * one node in that order with the level's word first. Unwrapped, the row
     * is at least `viewport` wide.
     */
    @Composable
    private fun Line(line: PMLogLine, wrap: Boolean, messages: PMLogViewMessages, step: PMTextStyle, viewport: Dp) {
        val theme = PM.theme
        val colors = theme.colors
        val space = theme.defaultDensity.spacing
        val icon: PMIconRole?
        val ink: PMDynamicColor
        val wash: PMDynamicColor?
        val word: String?
        when (line.level) {
            PMLogLineLevel.Info -> {
                icon = PMIconRole.Info
                ink = colors.textMuted
                wash = null
                word = messages.info
            }
            PMLogLineLevel.Warning -> {
                icon = PMIconRole.Warning
                ink = colors.warningText
                wash = colors.warningSubtle
                word = messages.warning
            }
            PMLogLineLevel.Error -> {
                icon = PMIconRole.Error
                ink = colors.dangerText
                wash = colors.dangerSubtle
                word = messages.error
            }
            null -> {
                icon = null
                ink = colors.textMuted
                wash = null
                word = null
            }
        }
        val spoken = listOfNotNull(word, line.time, line.source, line.text).filter { it.isNotEmpty() }.joinToString(" ")
        val lineBox = with(LocalDensity.current) { step.lineBox.sp.toDp() }
        val muted = SpanStyle(color = colors.textMuted.color)
        Row(
            Modifier
                .then(if (wrap) Modifier.fillMaxWidth() else Modifier.widthIn(min = viewport))
                .height(IntrinsicSize.Min)
                .clearAndSetSemantics { if (spoken.isEmpty()) hideFromAccessibility() else text = AnnotatedString(spoken) },
        ) {
            // One line tall at least, and as tall as the line, so the wash marks
            // all of a wrapped line; the icon is centred on the first.
            Box(
                Modifier
                    .width(space.s6)
                    .fillMaxHeight()
                    .heightIn(min = lineBox)
                    .then(if (wash != null) Modifier.background(wash.color) else Modifier),
                contentAlignment = Alignment.TopCenter,
            ) {
                if (icon != null) {
                    PMIconView(
                        icon,
                        PMControlSize.Sm,
                        Modifier.padding(top = centringInset(lineBox.value, theme.icon.sm.size)),
                        tint = ink.color,
                    )
                }
            }
            if (line.time != null) {
                Text(line.time, color = colors.textMuted.color, softWrap = false, modifier = Modifier.padding(start = space.s3))
            }
            Text(
                buildAnnotatedString {
                    if (line.source != null) {
                        withStyle(muted) { append(line.source) }
                        append(" ")
                    }
                    append(line.text)
                },
                softWrap = wrap,
                modifier = (if (wrap) Modifier.weight(1f) else Modifier).padding(horizontal = space.s3),
            )
        }
    }

    /**
     * Where the next line will appear while more are coming: a row one line
     * tall with StreamingText's steady caret at the text's start,
     * `PMGeometry.proseStroke` wide and the step's size tall, in `accent.bg`.
     * Hidden from TalkBack.
     */
    @Composable
    private fun Caret(step: PMTextStyle) {
        val theme = PM.theme
        val space = theme.defaultDensity.spacing
        val (line, size) = with(LocalDensity.current) { step.lineBox.sp.toDp() to step.size.sp.toDp() }
        Box(
            Modifier
                .fillMaxWidth()
                .height(line)
                .clearAndSetSemantics { hideFromAccessibility() },
            contentAlignment = Alignment.CenterStart,
        ) {
            Box(
                Modifier
                    .padding(start = space.s6 + space.s3)
                    .width(PMGeometry.proseStroke)
                    .height(size)
                    .background(theme.colors.accentBg.color, RoundedCornerShape(PMGeometry.caretRadius)),
            )
        }
    }
}

/**
 * LogView's states, from the spec's States table. The log fills its box: the
 * entries about scrolling render in a box three `space.10`s tall, as the web
 * fixture's harness is, and the others grow to their lines. The detached state
 * is the reader's own and no prop reaches it, so no fixture draws the jump
 * control.
 */
object LogViewStates : PMStates {
    override val member = "LogView"

    /** A build's output: plain lines, a warning and two errors, as a bundler writes them. */
    private val build = listOf(
        PMLogLine(id = "b1", text = "> relay@2.4.0 build"),
        PMLogLine(id = "b2", text = "> vite build"),
        PMLogLine(id = "b3", text = "vite v6.3.5 building for production..."),
        PMLogLine(id = "b4", text = "1284 modules transformed."),
        PMLogLine(id = "b5", text = "src/legacy/chart.ts (14:3): 'Chart' is defined but never used.", level = PMLogLineLevel.Warning),
        PMLogLine(id = "b6", text = "dist/index.html                 0.48 kB  gzip:   0.31 kB"),
        PMLogLine(id = "b7", text = "dist/assets/index-4f2a9c.css   38.12 kB  gzip:   7.90 kB"),
        PMLogLine(
            id = "b8",
            text = "src/inbox/InboxPage.tsx (88:17): Property 'assignee' does not exist on type 'Ticket'.",
            level = PMLogLineLevel.Error,
        ),
        PMLogLine(id = "b9", text = "Build failed in 4.21s.", level = PMLogLineLevel.Error),
    )

    /** A service's logs: every line has a time, a level and the service that wrote it. */
    private val services = listOf(
        PMLogLine(id = "s1", text = "GET / 200 96ms cache=edge", level = PMLogLineLevel.Info, time = "14:24:01.118", source = "svc-web"),
        PMLogLine(
            id = "s2",
            text = "slow query 1840ms: SELECT id, status FROM orders WHERE status = \$1",
            level = PMLogLineLevel.Warning,
            time = "14:24:03.402",
            source = "svc-api",
        ),
        PMLogLine(
            id = "s3",
            text = "job billing.settle done in 412ms attempts=1",
            level = PMLogLineLevel.Info,
            time = "14:24:05.733",
            source = "svc-worker",
        ),
        PMLogLine(
            id = "s4",
            text = "pg: connection reset by peer (pool=replica attempt=1)",
            level = PMLogLineLevel.Error,
            time = "14:24:08.019",
            source = "svc-api",
        ),
        PMLogLine(id = "s5", text = "GET /api/session 200 12ms", level = PMLogLineLevel.Info, time = "14:24:09.250", source = "svc-web"),
    )

    /** Forty lines of a deploy, more than the box holds, so the log scrolls and follows. */
    private val deploy = List(40) { at ->
        PMLogLine(
            id = "d${at + 1}",
            text = "step ${at + 1} of 40: uploaded packages/relay/dist/chunk-${at + 1}.js",
            time = "+${(at * 3).toString().padStart(3, '0')}s",
        )
    }

    /** Lines with no break in them and a table whose columns line up, wider than any box. */
    private val wide = listOf(
        PMLogLine(id = "w1", text = "PID   USER     %CPU  %MEM  COMMAND"),
        PMLogLine(id = "w2", text = "4120  relay    12.4   3.1  node dist/server.js --port 8080 --workers 4"),
        PMLogLine(id = "w3", text = "4188  relay     0.3   0.4  node dist/worker.js --queue jobs-prod"),
        PMLogLine(id = "w4", text = "signing_key=whsec_" + "JBSWY3DPEHPK3PXP".repeat(8), level = PMLogLineLevel.Warning),
    )

    /** The harness box, in multiples of `space.10`: the web fixture's. */
    private const val BOX = 3

    /** A box for the log to fill; narrow, as wide as it is tall, a phone's column. */
    @Composable
    private fun Boxed(narrow: Boolean = false, content: @Composable () -> Unit) {
        val side = PM.theme.defaultDensity.spacing.s10 * BOX
        Box(
            Modifier.then(if (narrow) Modifier.width(side) else Modifier.fillMaxWidth()).height(side),
            propagateMinConstraints = true,
        ) { content() }
    }

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry(
                "build output — plain lines, a warning and two errors",
                expect = mapOf("wrap" to "true", "state" to "", "streaming" to "", "label" to "Build output"),
            ) { PMLogView(label = "Build output", lines = build) },
            PMStateEntry("service logs — a time, a level and a source on every line", expect = mapOf("label" to "Service logs")) {
                PMLogView(label = "Service logs", lines = services)
            },
            PMStateEntry("streaming — more lines coming, a caret after the last", expect = mapOf("streaming" to "true")) {
                PMLogView(label = "Build output", lines = build.take(4), streaming = true)
            },
            PMStateEntry("waiting — streaming with no lines yet", expect = mapOf("streaming" to "true", "label" to "Build output")) {
                PMLogView(label = "Build output", lines = emptyList(), streaming = true)
            },
            PMStateEntry("in a box — the log scrolls inside itself, held at the newest line", expect = mapOf("label" to "Deploy log")) {
                Boxed { PMLogView(label = "Deploy log", lines = deploy) }
            },
            PMStateEntry("unwrapped — long lines scroll the log sideways", expect = mapOf("wrap" to "", "label" to "Process list")) {
                Boxed { PMLogView(label = "Process list", lines = wide, wrap = false) }
            },
            PMStateEntry("narrow — long lines wrap in a phone’s column", expect = mapOf("wrap" to "true", "label" to "Process list")) {
                Boxed(narrow = true) { PMLogView(label = "Process list", lines = wide) }
            },
        )
}
