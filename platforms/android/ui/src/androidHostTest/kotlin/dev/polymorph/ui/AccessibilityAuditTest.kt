package dev.polymorph.ui

import android.graphics.Rect
import android.view.View
import android.view.accessibility.AccessibilityManager
import android.view.accessibility.AccessibilityNodeInfo
import android.view.accessibility.AccessibilityNodeProvider
import androidx.activity.ComponentActivity
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshots.Snapshot
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.platform.ViewRootForTest
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.SemanticsNode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.hideFromAccessibility
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.test.isRoot
import androidx.compose.ui.test.junit4.v2.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import dev.polymorph.tokens.PMTheme
import dev.polymorph.tokens.PMThemes
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import kotlin.math.roundToInt

/**
 * The Android accessibility audit, run by `scripts/android-audit.mjs` as
 * `platforms/android/gradlew -p platforms/android :ui:testAndroidHostTest`.
 * Every states fixture entry is composed by Android's own Compose runtime
 * (`AndroidComposeView`, with a dialog or a popup in a window of its own) in
 * an activity under Robolectric, in a window 360dp wide and 844dp tall at two
 * pixels per dp, under the default pairing in light mode, with Android's
 * accessibility manager reporting a service on. No device or emulator is
 * involved.
 *
 * Each entry must hold two sets of rules:
 *
 * 1. `SemanticsAudit`, the rules the JVM harness holds the same entry to on
 *    Compose for desktop: identity, the `expect` promises, a name on
 *    everything a person can act on, and each control's action and state.
 * 2. The rules of the Accessibility Test Framework's error-level checks, over
 *    the `AccessibilityNodeInfo` each window's Compose view publishes for each
 *    node, which is what TalkBack reads. A node visible to the user that a
 *    person can act on (it offers a click or a long click) must be at least
 *    48dp in each direction (`PMTheme.floor.hitTarget`, the touch target
 *    check). It must say something: its own text or description, or that of
 *    a child visible to the user that is not a control of its own (speakable
 *    text). It must not share its bounds with another such node (duplicate
 *    clickable bounds). A node a person types into must not carry a content
 *    description, which TalkBack would read in place of what was typed
 *    (editable description).
 *
 * The nodes are read as the provider publishes them, each node's children by
 * the ids its node info lists. That list includes the node Compose adds to a
 * node that merges its children, because Compose publishes such a node's
 * content description on a child node of its own, not on the node. Reading the
 * ids needs Robolectric's real `AccessibilityNodeInfo`, which the test task
 * turns on (`robolectric.useRealAni`, `ui/build.gradle.kts`).
 *
 * The framework itself does not run here: Compose's own bridge to it
 * (`enableAccessibilityChecks`) declines to run under Robolectric, and the
 * framework's hierarchy cannot reach Compose's virtual nodes there. Its
 * contrast checks need a screenshot and are not reproduced; the theme's
 * contrast law covers the pairings' colours.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36], qualifiers = "w360dp-h844dp-xhdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class AccessibilityAuditTest {
    @get:Rule
    val compose = createAndroidComposeRule<ComponentActivity>()

    /** The entry the activity composes. */
    private var current by mutableStateOf<PMStateEntry?>(null)

    @Test
    fun everyEntryPassesTheAudit() {
        val fixtures = fixtures()
        assertTrue("no fixture to audit", fixtures.isNotEmpty())
        val theme = start()
        val failures = mutableListOf<String>()
        var audited = 0
        var published = 0
        for (fixture in fixtures) {
            for (entry in fixture.entries) {
                val label = "${fixture.member} — ${entry.name}"
                show(entry)
                failures += SemanticsAudit.check(fixture.member, entry, windows()).map { "$label: $it" }
                val nodes = publishedNodes()
                published += nodes.sumOf { flatten(it).size }
                failures += android(nodes, theme.floor.hitTarget).map { "$label: $it" }
                audited++
            }
            show(null)
        }
        println(
            "AccessibilityAuditTest: audited $audited entries of ${fixtures.size} fixtures " +
                "($published nodes published to Android's accessibility API)",
        )
        assertTrue("no node was published to Android's accessibility API", published > 0)
        assertTrue(failures.joinToString("\n"), failures.isEmpty())
    }

    /**
     * The audit hears a control as TalkBack does. A control that merges its
     * parts and is named by its own content description says its name, which
     * Compose publishes on a node it adds under the control. A control whose
     * only words are hidden from accessibility says nothing.
     */
    @Test
    fun theAuditHearsWhatTalkBackHears() {
        val theme = start()
        val named = PMStateEntry("named, over a silent part") {
            Box(Modifier.size(48.dp).clickable {}.semantics { contentDescription = "Probe" }) {
                Box(Modifier.size(24.dp).testTag("part"))
            }
        }
        val hidden = PMStateEntry("its words hidden") {
            Box(Modifier.size(48.dp).clickable {}) {
                BasicText("Probe", Modifier.semantics { hideFromAccessibility() })
            }
        }
        val hiddenPart = PMStateEntry("its words in a hidden part") {
            Box(Modifier.size(48.dp).clickable {}) {
                Box(Modifier.semantics { hideFromAccessibility() }) { BasicText("Probe") }
            }
        }
        show(named)
        assertEquals(emptyList<String>(), android(publishedNodes(), theme.floor.hitTarget))
        show(hidden)
        assertEquals(listOf("View has nothing to say"), android(publishedNodes(), theme.floor.hitTarget))
        show(hiddenPart)
        assertEquals(listOf("View has nothing to say"), android(publishedNodes(), theme.floor.hitTarget))
    }

    /**
     * Composes whatever `current` holds in the activity, under the default
     * pairing in light mode, with the test clock stopped and Android's
     * accessibility manager reporting a service on, as TalkBack turns it on,
     * so the windows publish their nodes and send events. Returns the pairing.
     */
    private fun start(): PMTheme {
        assertTrue(
            "the audit reads the ids of each node's children, which only Robolectric's real " +
                "AccessibilityNodeInfo keeps: run it with -Drobolectric.useRealAni=true",
            System.getProperty("robolectric.useRealAni") == "true",
        )
        val theme = PMThemes.default
        compose.mainClock.autoAdvance = false
        compose.runOnUiThread {
            val manager = compose.activity.getSystemService(AccessibilityManager::class.java)
            shadowOf(manager).setEnabled(true)
            shadowOf(manager).setTouchExplorationEnabled(true)
        }
        compose.setContent {
            CompositionLocalProvider(LocalPMTheme provides theme, LocalPMDark provides false) {
                Box(Modifier.fillMaxSize().background(theme.colors.bgApp.resolve(false).color).testTag(CANVAS)) {
                    current?.let { entry -> key(entry) { entry.render() } }
                }
            }
        }
        return theme
    }

    /**
     * A node as Android publishes it, with the published nodes under it, and
     * the scale it is drawn at: a fixture that lays out a tablet's form draws it
     * scaled down into the canvas (`PMFixtureWidth`), and its sizes are judged at
     * the size it is laid out at.
     */
    private class Published(
        val info: AccessibilityNodeInfo?,
        val children: List<Published>,
        val scale: Float,
        val laidOut: IntSize,
    ) {
        val bounds: Rect = Rect().also { info?.getBoundsInScreen(it) }
        val acts: Boolean
            get() = info != null && info.isVisibleToUser && (info.isClickable || info.isLongClickable)
        /** What TalkBack reads on the node itself: its description, else its text, else a field's hint. */
        val says: String?
            get() = listOf(info?.contentDescription, info?.text, info?.hintText)
                .firstOrNull { !it.isNullOrBlank() }?.toString()
        val name: String
            get() = says?.let { "\"$it\"" } ?: info?.className?.toString()?.substringAfterLast('.') ?: "a node"
    }

    /** What `nodes` break of the framework's error-level rules, one sentence each. */
    private fun android(nodes: List<Published>, hitTarget: Float): List<String> {
        val density = compose.activity.resources.displayMetrics.density
        val least = (hitTarget * density).roundToInt()
        val failures = mutableListOf<String>()
        val all = nodes.flatMap { flatten(it) }
        for (node in all) {
            if (node.acts) {
                val width = node.bounds.width() / node.scale
                val height = node.bounds.height() / node.scale
                // A scaled node's bounds are whole pixels of the scaled drawing,
                // so its size is known to one of them.
                val slack = if (node.scale < 1f) 1f / node.scale else 0f
                if (width + slack < least || height + slack < least) {
                    val dp = { w: Float, h: Float -> "${(w / density).roundToInt()}×${(h / density).roundToInt()}dp" }
                    failures += "${node.name} takes touches over ${dp(width, height)}, under the " +
                        "${hitTarget.roundToInt()}dp touch target (laid out at " +
                        "${dp(node.laidOut.width.toFloat(), node.laidOut.height.toFloat())})"
                }
                if (speakable(node) == null) failures += "${node.name} has nothing to say"
            }
            if (node.info?.isEditable == true && !node.info.contentDescription.isNullOrEmpty()) {
                failures += "${node.name} is typed into and carries a content description"
            }
        }
        val acting = all.filter { it.acts }
        for ((bounds, alike) in acting.groupBy { it.bounds.toShortString() }) {
            if (alike.size > 1) failures += "${alike.joinToString(" and ") { it.name }} share the bounds $bounds"
        }
        return failures
    }

    /**
     * What TalkBack says for a node: its own words, else those of a child it
     * reads with it. TalkBack leaves out a child that is not visible to the
     * user, with what is under it (a part hidden from accessibility or drawn
     * transparent), and a child that is a control or focusable of its own. A
     * child that is not important for accessibility is a layout with nothing
     * of its own to say: its words are not read, and its children are read
     * through it.
     */
    private fun speakable(node: Published): String? =
        node.says.takeIf { node.info?.isImportantForAccessibility == true } ?: node.children
            .filter { it.info?.isVisibleToUser == true }
            .filterNot { it.acts || it.info?.isFocusable == true }
            .firstNotNullOfOrNull { speakable(it) }

    private fun flatten(node: Published): List<Published> = listOf(node) + node.children.flatMap { flatten(it) }

    /**
     * The nodes each window's Compose view publishes, read through its
     * accessibility node provider as TalkBack reads them: the view's own node,
     * then each node's children by the ids its node info lists. A node hidden
     * or covered is not listed, and a node Compose adds (a merged node's
     * content description) is.
     */
    private fun publishedNodes(): List<Published> {
        val roots = compose.onAllNodes(isRoot(), useUnmergedTree = true).fetchSemanticsNodes()
        val views = roots.mapNotNull { it.root as? ViewRootForTest }.distinctBy { it.view }
        compose.runOnUiThread { views.forEach { it.forceAccessibilityForTesting(true) } }
        compose.waitForIdle()
        val found = mutableListOf<Published>()
        compose.runOnUiThread {
            for (root in roots) {
                val provider = (root.root as? ViewRootForTest)?.view?.accessibilityNodeProvider ?: continue
                val nodes = SemanticsAudit.walk(root).associateBy { it.id }
                publish(View.NO_ID, root, provider, nodes)?.let { found += it }
            }
        }
        return found
    }

    /**
     * The node the provider publishes for `id` and the nodes it lists under
     * it. A node Compose adds has no semantics node of its own, so its size
     * and scale are those of `parent`, whose bounds it takes.
     */
    private fun publish(
        id: Int,
        parent: SemanticsNode,
        provider: AccessibilityNodeProvider,
        nodes: Map<Int, SemanticsNode>,
    ): Published? {
        val info = provider.createAccessibilityNodeInfo(id) ?: return null
        val node = if (id == View.NO_ID) parent else nodes[id] ?: parent
        val children = (0 until info.childCount).mapNotNull { index ->
            val child = virtualId(childId.invoke(info, index) as Long)
            // A child that is a view of its own (an Android view a member
            // hosts) is published by that view, not by this provider.
            if (child == UNDEFINED_ITEM_ID) null else publish(child, node, provider, nodes)
        }
        return Published(info, children, scale(node), node.size)
    }

    /** The scale `node` is drawn at in its window: its width there over its own width. */
    private fun scale(node: SemanticsNode): Float {
        val coordinates = node.layoutInfo.coordinates
        val width = node.size.width.toFloat()
        if (width <= 0f || !coordinates.isAttached) return 1f
        val drawn = coordinates.localToRoot(Offset(width, 0f)).x - coordinates.localToRoot(Offset.Zero).x
        return if (drawn > 0f) drawn / width else 1f
    }

    /**
     * Composes `entry` in place of the last one and lets it settle. The state
     * write is applied at once, so the next frame composes the new entry, and
     * the test clock then advances as the JVM harness draws a scene: four
     * frames a frame apart, so work that waits a frame for a layout takes its
     * steps, then two seconds twice, by which every enter transition has
     * finished.
     */
    private fun show(entry: PMStateEntry?) {
        compose.runOnUiThread {
            current = entry
            Snapshot.sendApplyNotifications()
        }
        compose.waitForIdle()
        repeat(OPENING_FRAMES) { compose.mainClock.advanceTimeByFrame() }
        compose.mainClock.advanceTimeBy(SETTLED_MILLIS)
        compose.mainClock.advanceTimeBy(SETTLED_MILLIS)
        compose.waitForIdle()
    }

    /** The root of every window, the entry's own first, then each window over it. */
    private fun windows(): List<SemanticsNode> {
        var own = compose.onNodeWithTag(CANVAS).fetchSemanticsNode()
        while (own.parent != null) own = own.parent!!
        val others = compose.onAllNodes(isRoot()).fetchSemanticsNodes().filter { it.layoutInfo !== own.layoutInfo }
        return listOf(own) + others
    }

    /**
     * Every fixture, or only the members the `pm.members` system property
     * names, as the JVM harness reads it (`./gradlew :ui:testAndroidHostTest
     * -Ppm.members=Menu,Popover` in `platforms/android`). A name no fixture
     * carries stops the run.
     */
    private fun fixtures(): List<PMStates> {
        val only = System.getProperty("pm.members")?.split(",")?.map { it.trim() }?.filter { it.isNotEmpty() }
        if (only.isNullOrEmpty()) return PMFixtures.all
        val unknown = only - PMFixtures.all.map { it.member }.toSet()
        require(unknown.isEmpty()) { "pm.members names no fixture: ${unknown.joinToString(", ")}" }
        return PMFixtures.all.filter { it.member in only }
    }

    private companion object {
        /** The test tag on the box every entry is composed in, which finds the entry's own window. */
        const val CANVAS = "pm-audit-canvas"

        /**
         * `AccessibilityNodeInfo.getChildId(index)`, which the SDK hides: a
         * child's node id, the view's accessibility id in the low 32 bits and
         * the provider's virtual id in the high 32.
         */
        val childId: java.lang.reflect.Method =
            AccessibilityNodeInfo::class.java.getDeclaredMethod("getChildId", Int::class.javaPrimitiveType)

        /**
         * The virtual id in a node id, the high 32 bits, as the SDK's hidden
         * `AccessibilityNodeInfo.getVirtualDescendantId` reads it.
         */
        fun virtualId(nodeId: Long): Int = (nodeId ushr 32).toInt()

        /**
         * The virtual id of a child that is a view of its own rather than a
         * node of the provider: `AccessibilityNodeInfo.UNDEFINED_ITEM_ID`.
         */
        const val UNDEFINED_ITEM_ID = Int.MAX_VALUE

        const val OPENING_FRAMES = 4
        const val SETTLED_MILLIS = 2_000L
    }
}
