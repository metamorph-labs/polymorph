/**
 * The members the Android platform map marks `native` or `adapted` that have
 * no Compose rendering in `platforms/android/ui/src/main/kotlin`.
 *
 * The conformance law (`kotlin-laws.test.ts`) holds every native or adapted
 * member to one of two places: a member file there, or this list. Its length is
 * pinned in the law (`KOTLIN_PENDING_COUNT`), so a member that gains a
 * rendering without leaving the list, or joins it without being counted, fails.
 * `pnpm new:member` adds a new member here and raises the count. Writing a
 * member's rendering, or marking it absent on Android, removes it here and
 * lowers the count in the same change.
 */
export const KOTLIN_PENDING: readonly string[] = ['RichTextContent']
