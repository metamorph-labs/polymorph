// The parts the file members share (FileUpload, and PromptInput's
// attachments): the picker an app provides, the drop target that hands a
// drop's files to the member, the gate every chosen or dropped file passes,
// and the size format, the engine's (`packages/engine/src/
// conventions/files.ts`) in Kotlin, so a file a field refuses, and the size a
// row shows, are decided as on the web.

package dev.polymorph.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.draganddrop.DragAndDropEvent
import androidx.compose.ui.draganddrop.DragAndDropTarget
import kotlin.math.roundToInt

/**
 * How an app lets a person choose files, and reads the files of a drop. The
 * platform's document picker is an activity's (`ActivityResultContracts.
 * OpenMultipleDocuments` on Android), which this module, one source set for
 * the JVM and Android targets, cannot reach, so the app provides one through
 * `LocalPMFilePicker`, as it provides its image loader.
 */
interface PMFilePicker {
    /**
     * Opens the picker for files of the `accept` types (the native syntax's
     * media types and extensions, as `accept` writes them), one or several,
     * and hands back the files chosen; none when the person cancels.
     */
    fun pick(accept: String?, multiple: Boolean, deliver: (List<PMFile>) -> Unit)

    /** The files a drop carries, or null when it carries none this picker can read. */
    fun dropped(event: DragAndDropEvent): List<PMFile>? = null
}

/** The app's file picker; unprovided, none, and a press on a dropzone opens nothing. */
val LocalPMFilePicker = staticCompositionLocalOf<PMFilePicker?> { null }

/**
 * The drop target of a member that takes files (FileUpload's dropzone,
 * PromptInput's frame): `onTargeted` hears a drag enter and leave, and a drop
 * hands the files `picker` reads from it to `receive`. Both are read when the
 * drag happens, so a drop is gated by the props of that moment, not of the
 * composition that made the target. A drop the picker cannot read, or one with
 * no picker, is refused.
 */
@Composable
fun rememberPMDropTarget(
    picker: PMFilePicker?,
    onTargeted: (Boolean) -> Unit,
    receive: (List<PMFile>) -> Unit,
): DragAndDropTarget {
    val targeted by rememberUpdatedState(onTargeted)
    val deliver by rememberUpdatedState(receive)
    return remember(picker) {
        object : DragAndDropTarget {
            override fun onEntered(event: DragAndDropEvent) = targeted(true)

            override fun onExited(event: DragAndDropEvent) = targeted(false)

            override fun onEnded(event: DragAndDropEvent) = targeted(false)

            override fun onDrop(event: DragAndDropEvent): Boolean {
                targeted(false)
                val dropped = picker?.dropped(event) ?: return false
                deliver(dropped)
                return true
            }
        }
    }
}

/** The file gate (`design/components/file-upload.md`): which chosen files a field accepts. */
object PMFileGate {
    /**
     * Whether a file matches `accept`: a comma-separated list of extensions
     * (`.pdf`), exact types (`application/pdf`) and type wildcards (a type
     * and a slash before a star). A file with no type matches only by its
     * extension.
     */
    fun matches(accept: String, file: PMFile): Boolean {
        val type = file.type.lowercase()
        val name = file.name.lowercase()
        return accept.split(",").map { it.trim().lowercase() }.filter { it.isNotEmpty() }.any { token ->
            when {
                token == "*" || token == "*/*" -> true
                token.startsWith(".") -> name.endsWith(token)
                token.endsWith("/*") -> type.startsWith(token.dropLast(1))
                else -> type == token
            }
        }
    }

    /**
     * Applies the rules once, for the picker and drops alike: a file is
     * refused for what it is (`type`, then `size`) before it is refused for
     * arriving second (`count`, when `multiple` is false and one has passed).
     */
    fun gate(files: List<PMFile>, accept: String?, multiple: Boolean, maxSize: Double?): Pair<List<PMFile>, List<PMFileRejection>> {
        val accepted = mutableListOf<PMFile>()
        val rejected = mutableListOf<PMFileRejection>()
        for (file in files) {
            when {
                !accept.isNullOrEmpty() && !matches(accept, file) -> rejected += PMFileRejection(file, PMFileRejectionReason.Type)
                maxSize != null && file.size > maxSize -> rejected += PMFileRejection(file, PMFileRejectionReason.Size)
                !multiple && accepted.size == 1 -> rejected += PMFileRejection(file, PMFileRejectionReason.Count)
                else -> accepted += file
            }
        }
        return accepted to rejected
    }
}

/**
 * A size in bytes as it reads: binary steps with the international unit
 * symbols, bytes whole and larger units to one decimal, dropped when it is
 * zero (`2 MB`, `1.5 KB`). A number format, not prose: `messages.formatSize`
 * replaces it.
 */
object PMByteCount {
    private val units = listOf("B", "KB", "MB", "GB", "TB")

    /** The bytes in a binary step. */
    private const val STEP = 1024.0

    /** The decimals a scaled size keeps, as a multiplier. */
    private const val TENTHS = 10.0

    fun format(bytes: Double): String {
        var value = maxOf(0.0, bytes)
        var unit = 0
        while (value >= STEP && unit < units.lastIndex) {
            value /= STEP
            unit += 1
        }
        val rounded = if (unit == 0) value.roundToInt().toDouble() else (value * TENTHS).roundToInt() / TENTHS
        val number = if (rounded % 1.0 == 0.0) rounded.toLong().toString() else rounded.toString()
        return "$number ${units[unit]}"
    }
}
