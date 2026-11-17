/**
 * The file gate and the size format (`design/components/file-upload.md`):
 * which chosen files a field accepts, and how a size reads. FileUpload,
 * PromptInput and AttachmentChip use them in every framework, so a file a
 * field refuses, and the size a chip shows, are decided once.
 */

/**
 * Why the gate refused a file.
 *
 * This is the reason, not the message. `too large` in one product is `over your plan's limit` in
 * another, and the app writes the text either way (`message` on the row). The reason is what the
 * app needs to choose that text.
 */
export type FileRejectionReason = 'type' | 'size' | 'count'

export interface FileRejection {
  file: File
  reason: FileRejectionReason
}

/** The rules a field applies to every file, from the picker or a drop. */
export interface FileGate {
  /** The native syntax (`.pdf`, `image/*`, `application/pdf`). */
  accept?: string
  /** When `false`, the first file that passes is kept and the rest are refused. */
  multiple?: boolean
  /** The size ceiling, in bytes. */
  maxSize?: number
}

/**
 * Parses `accept` the way the native picker does: a comma-separated list of extensions (`.pdf`),
 * exact types (`application/pdf`) and type wildcards (`image/*`).
 *
 * A dropped file often has an empty `type`, because the browser only guesses one from extensions
 * it recognises. Only an extension token can match such a file, so a list that includes both
 * makes dropping work as well as clicking.
 */
function matchesAccept(accept: string, file: File): boolean {
  const type = file.type.toLowerCase()
  const name = file.name.toLowerCase()

  return accept
    .split(',')
    .map((token) => token.trim().toLowerCase())
    .filter((token) => token !== '')
    .some((token) => {
      if (token === '*' || token === '*/*') return true
      if (token.startsWith('.')) return name.endsWith(token)
      if (token.endsWith('/*')) return type.startsWith(token.slice(0, -1))
      return type === token
    })
}

/**
 * Applies the rules once, for both the picker and drops.
 *
 * The picker enforces `accept` and `multiple` itself and a drop enforces nothing, so a component
 * that trusted the input would apply weaker rules to users who drag instead of click. Order
 * matters: a file is refused for what it *is* before it is refused for arriving second, which is
 * the order a user would expect.
 */
export function gateFiles(
  files: File[],
  options: FileGate,
): { accepted: File[]; rejected: FileRejection[] } {
  const { accept, multiple = true, maxSize } = options
  const accepted: File[] = []
  const rejected: FileRejection[] = []

  for (const file of files) {
    if (accept !== undefined && accept !== '' && !matchesAccept(accept, file)) {
      rejected.push({ file, reason: 'type' })
    } else if (maxSize !== undefined && file.size > maxSize) {
      rejected.push({ file, reason: 'size' })
    } else if (!multiple && accepted.length === 1) {
      // A single-file field takes the first file that passed and refuses the rest, rather than
      // choosing one of several for reasons the user cannot see.
      rejected.push({ file, reason: 'count' })
    } else {
      accepted.push(file)
    }
  }

  return { accepted, rejected }
}

/** `1536` -> `1.5 KB`. Only a number format, because the vocabulary writes no prose. */
export function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = Math.max(0, bytes)
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  // Bytes stay whole. Scaled values get one decimal, dropped when it is zero: "2 MB", not
  // "2.0 MB".
  const rounded = unit === 0 ? value : Math.round(value * 10) / 10
  return `${rounded} ${units[unit]}`
}
