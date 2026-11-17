// Carousel (`design/components/carousel.md`): peer slides shown one at a time,
// moved through by the reader. Never on a timer: there is no autoplay. The
// viewport is Compose's own pager (`HorizontalPager`, one slide per page, each
// as wide as the viewport), so a swipe, its fling and the snap to a slide are
// the platform's; the viewport is clipped to `radius.md` and has no scroll
// bar, because the controls show the position. Under it, `space.3` below and
// `space.3` apart, centred: the previous Button, the dot rail and the next
// Button, the Buttons `ghost`/`neutral`/`sm` icon-only and named by
// `previousLabel` and `nextLabel`.
//
// Swipes, the Buttons and the dots move one position, `index` when the app
// controls it and the carousel's own otherwise (from `defaultIndex`), and
// `onIndexChange` reports it whichever moved it. The Buttons and the dots
// scroll over the surface duration on the standard easing, and at once at the
// `none` temperament, whose duration is 0; a swipe is the reader's own scroll.
// Without `loop` the Buttons are disabled at the ends; with it they wrap.
//
// A dot is `space.2` round in `border.default`, `border.strong` under the
// pointer, and the current one a `space.4` lozenge in `accent.bg`, its width
// changing over the control duration. Each dot is a button named by its
// slide's label and selected while current, the web's `aria-current`. Each is
// drawn at its own size, centred in a slot the hit target square
// (`pmHitTarget`), which is its touch area: the web's dots, `space.2` apart,
// have hit areas that overlap their neighbours', and a touch area on Android
// must be the dot's own, so the dots are a hit target apart here, the
// platform map's adapted form (`design/platforms/android.json`). A rail wider
// than the room between the Buttons shows as many whole slots as fit, the
// current dot's in the middle, and composes only those dots. The reader can
// drag it, and when the drag ends it snaps to whole slots, so no dot lies cut
// at the rail's edge once it rests.
//
// Android has no role description a composable can set, so the role words
// (`roleDescriptions`, or the APG's "carousel" and "slide") are the last
// clause of the names TalkBack reads: the carousel is "Product tour, carousel"
// and a slide "Compose, slide". Slides off screen stay in the pager, as the
// web keeps them in the DOM.

package dev.polymorph.ui

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.snapping.SnapPosition
import androidx.compose.foundation.gestures.snapping.rememberSnapFlingBehavior
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.interaction.collectIsHoveredAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.layout
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.isTraversalGroup
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.launch

object PMCarousel : PMCarouselRendering {
    @Composable
    override fun Render(props: PMCarouselProps) {
        val count = props.slides.size
        if (count == 0) return
        val theme = PM.theme
        val space = theme.defaultDensity.spacing
        val motion = theme.defaultMotion
        val words = props.roleDescriptions ?: PMSpecDefault.strings.carouselRoleDescriptions
        val loop = props.loop ?: false
        val start = (props.index ?: props.defaultIndex ?: 0.0).toInt().coerceIn(0, count - 1)
        val pager = rememberPagerState(initialPage = start) { count }
        val scope = rememberCoroutineScope()
        val current = pager.currentPage

        // A controlled index moves the pager; every settled move is reported.
        LaunchedEffect(props.index) {
            val wanted = props.index?.toInt()?.coerceIn(0, count - 1) ?: return@LaunchedEffect
            if (wanted != pager.currentPage) pager.animateScrollToPage(wanted, animationSpec = motion.easing.standard.tween(motion.duration.surface))
        }
        LaunchedEffect(pager) {
            // The first value is where the carousel starts, which no one moved it to.
            snapshotFlow { pager.settledPage }.drop(1).collect { page -> props.onIndexChange?.invoke(page.toDouble()) }
        }
        val go: (Int) -> Unit = { target ->
            val page = if (loop) (target + count) % count else target.coerceIn(0, count - 1)
            scope.launch { pager.animateScrollToPage(page, animationSpec = motion.easing.standard.tween(motion.duration.surface)) }
        }

        Column(
            Modifier
                .pmMember("Carousel", mapOf("slides" to count.toString(), "index" to current.toString()))
                .semantics {
                    contentDescription = "${props.label}, ${words.carousel}"
                    isTraversalGroup = true
                }
                .fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(space.s3),
        ) {
            HorizontalPager(
                state = pager,
                modifier = Modifier.fillMaxWidth().clip(theme.rounded(theme.radius.md)),
            ) { page ->
                val slide = props.slides[page]
                Box(
                    Modifier
                        .fillMaxWidth()
                        .semantics {
                            contentDescription = "${slide.label}, ${words.slide}"
                            isTraversalGroup = true
                        },
                ) { slide.content() }
            }
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(space.s3, Alignment.CenterHorizontally),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                PMButton(
                    disabled = !loop && current == 0,
                    icon = PMIconRole.Previous,
                    iconOnly = true,
                    label = props.previousLabel,
                    onClick = { go(current - 1) },
                    size = PMControlSize.Sm,
                    appearance = PMButtonAppearance.GhostNeutral,
                )
                // The rail scrolls when it is wider than its room. It shows a
                // whole number of slots (each the hit target wide) and scrolls
                // by whole slots, the current dot's in the middle, and it
                // composes only the dots it shows, so no dot's touch area lies
                // at or past the rail's edge.
                val rail = rememberLazyListState()
                val slot = with(LocalDensity.current) { theme.defaultDensity.hitTarget.dp.roundToPx() }
                LaunchedEffect(current) {
                    snapshotFlow { rail.layoutInfo.viewportSize.width }.collect { width ->
                        val shown = (width / slot).coerceAtLeast(1)
                        rail.scrollToItem((current - (shown - 1) / 2).coerceIn(0, (count - shown).coerceAtLeast(0)))
                    }
                }
                LazyRow(
                    state = rail,
                    // A drag ends on whole slots, the first at the rail's start.
                    flingBehavior = rememberSnapFlingBehavior(rail, SnapPosition.Start),
                    modifier = Modifier
                        .weight(1f, fill = false)
                        .layout { measurable, constraints ->
                            val whole = if (constraints.hasBoundedWidth) {
                                constraints.copy(maxWidth = (constraints.maxWidth / slot).coerceAtLeast(1) * slot)
                            } else {
                                constraints
                            }
                            val placeable = measurable.measure(whole)
                            layout(placeable.width, placeable.height) { placeable.place(0, 0) }
                        },
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    itemsIndexed(props.slides) { index, slide -> Dot(slide.label, index == current) { go(index) } }
                }
                PMButton(
                    disabled = !loop && current == count - 1,
                    icon = PMIconRole.Next,
                    iconOnly = true,
                    label = props.nextLabel,
                    onClick = { go(current + 1) },
                    size = PMControlSize.Sm,
                    appearance = PMButtonAppearance.GhostNeutral,
                )
            }
        }
    }

    /** One dot: a button named by its slide, a lozenge while current. */
    @Composable
    private fun Dot(label: String, current: Boolean, select: () -> Unit) {
        val theme = PM.theme
        val space = theme.defaultDensity.spacing
        val motion = theme.defaultMotion
        val interaction = remember { MutableInteractionSource() }
        val hovered by interaction.collectIsHoveredAsState()
        val focused by interaction.collectIsFocusedAsState()
        val width by animateDpAsState(if (current) space.s4 else space.s2, motion.easing.standard.tween(motion.duration.control), label = "dot")
        val fill by animateColorAsState(
            when {
                current -> theme.colors.accentBg
                hovered -> theme.colors.borderStrong
                else -> theme.colors.borderDefault
            }.color,
            motion.easing.standard.tween(motion.duration.control),
            label = "dot",
        )
        val pill = theme.rounded(theme.radius.pill)
        Box(
            Modifier
                .clickable(interactionSource = interaction, indication = null, onClick = select)
                .clearAndSetSemantics {
                    contentDescription = label
                    role = Role.Button
                    if (current) selected = true
                }
                .pmHitTarget()
                .pmFocusRing(focused, theme.radius.pill.dp)
                .width(width)
                .height(space.s2)
                .background(fill, pill),
        )
    }
}

/**
 * Carousel's states, from the spec's States table. The empty carousel draws
 * nothing, so it has no entry: the harness holds every entry to drawing.
 */
object CarouselStates : PMStates {
    override val member = "Carousel"

    private const val tour = "Product tour"
    private const val previous = "Previous slide"
    private const val next = "Next slide"
    private val titles = listOf("Compose", "Review", "Ship")

    @Composable
    private fun Slide(title: String) {
        PMCard {
            PMStack(gap = PMSpaceStep.S2) {
                PMHeading(children = title, level = PMHeadingLevel.Level3)
                PMText { Text(PMSamples.body) }
            }
        }
    }

    private val slides: List<PMCarouselSlide>
        get() = titles.map { title -> PMCarouselSlide(id = title.lowercase(), label = title) { Slide(title) } }

    /** More slides than a phone's rail shows at once. */
    private val steps = listOf("Inbox", "Compose", "Review", "Assign", "Escalate", "Merge", "Ship", "Report")

    @Composable
    private fun Tour(defaultIndex: Double? = null, index: Double? = null, loop: Boolean? = null) {
        PMCarousel(
            defaultIndex = defaultIndex,
            index = index,
            label = tour,
            loop = loop,
            nextLabel = next,
            previousLabel = previous,
            slides = slides,
        )
    }

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry("a tour", expect = mapOf("slides" to "3", "index" to "0", "label" to "Product tour, carousel")) { Tour() },
            PMStateEntry("second slide", expect = mapOf("index" to "1")) { Tour(defaultIndex = 1.0) },
            PMStateEntry("looping — the first slide's previous goes to the last", expect = mapOf("index" to "0")) { Tour(loop = true) },
            PMStateEntry("at the end — next disabled", expect = mapOf("index" to "2")) { Tour(defaultIndex = 2.0) },
            PMStateEntry("controlled", expect = mapOf("index" to "2")) { Tour(index = 2.0) },
            PMStateEntry("many slides — the rail scrolls by whole dots", expect = mapOf("slides" to "8", "index" to "5")) {
                PMCarousel(
                    defaultIndex = 5.0,
                    label = tour,
                    nextLabel = next,
                    previousLabel = previous,
                    slides = steps.map { title -> PMCarouselSlide(id = title.lowercase(), label = title) { Slide(title) } },
                )
            },
            PMStateEntry("localized role words", expect = mapOf("label" to "Visite, carrousel")) {
                PMCarousel(
                    label = "Visite",
                    nextLabel = "Suivante",
                    previousLabel = "Précédente",
                    roleDescriptions = PMCarouselRoleDescriptions("carrousel", "diapositive"),
                    slides = slides,
                )
            },
        )
}
