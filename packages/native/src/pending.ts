/**
 * The members the iOS platform map marks `native` or `adapted` that have no
 * SwiftUI rendering in `platforms/ios/Sources/PolymorphUI`.
 *
 * The conformance law (`laws.test.ts`) holds every native or adapted member to
 * one of two places: a member file there, or this list. Its length is pinned in
 * the law (`PENDING_COUNT`), so a member that gains a rendering without leaving
 * the list, or joins it without being counted, fails. `pnpm new:member` adds a
 * new member here and raises the count. Writing a member's rendering, or
 * marking it absent on iOS, removes it here and lowers the count in the same
 * change.
 */
export const PENDING: readonly string[] = ['RichTextContent']

/** Something a spec's contract asks of a member that its SwiftUI rendering cannot do. */
export interface PlatformGap {
  /** The member, which has a rendering. */
  member: string
  /** What the contract asks for that the rendering does not do. */
  behaviour: string
  /** Why the platform does not allow it. */
  reason: string
}

/**
 * What members with a SwiftUI rendering cannot do that their spec's contract
 * asks for, because iOS does not allow it, each with the reason. A member
 * listed here names the list in its file's header, so a reader of the member
 * finds the gap. A law in `laws.test.ts` holds each entry to a member with a
 * rendering, a behaviour and a reason. A gap the platform closes leaves the
 * list in the change that closes it.
 */
export const PLATFORM_GAPS: readonly PlatformGap[] = [
  {
    member: 'Banner',
    behaviour:
      'the root is a live region, `status` for neutral, info and warning and `alert` for ' +
      'danger, and a danger Banner is announced when it appears (`role root status`, ' +
      '`role root alert`, `announces live:assertive`)',
    reason:
      'iOS has no status or alert role for a view and no live region. An announcement is a ' +
      'string the member posts, and the message is the view the app passes (`children`), whose ' +
      'words the member cannot read. VoiceOver reads the Banner where it is, first in the frame, ' +
      'and its identifier carries `tone`.',
  },
  {
    member: 'DurationInput',
    behaviour:
      'without `max` the largest count has no ceiling (no `aria-valuemax`), so any number of ' +
      'its unit can be entered',
    reason:
      'The counts are set on the platform’s wheel pickers, as the Clock app’s timer sets a ' +
      'length, and a SwiftUI wheel draws its whole list of rows. Without `max` the largest ' +
      'unit’s wheel offers 0 to 999, or to the count the field holds when that is more; a ' +
      'longer length reaches the field as the app’s `value`.',
  },
  {
    member: 'Tabs',
    behaviour:
      'the strip is always one stop in the keyboard order, the web’s roving `tabindex` (`role tab`)',
    reason:
      'A SwiftUI button takes keyboard focus only while the system’s keyboard navigation is on ' +
      '(Full Keyboard Access on iOS, Keyboard navigation on macOS), as every button in an app ' +
      'does, so the strip’s one trigger (the active tab’s, or the first enabled tab’s while ' +
      'the active one is disabled or unknown) is a stop only then. Whenever a trigger has ' +
      'focus, the arrows, Home and End select a tab and focus follows.',
  },
  {
    member: 'Tabs',
    behaviour: 'a vertical strip says it is vertical (`aria-orientation=vertical`)',
    reason:
      'An accessibility element on iOS has no orientation for VoiceOver to speak; a vertical ' +
      'strip takes Up and Down instead of Left and Right, and its identifier carries ' +
      '`orientation=vertical`.',
  },
  {
    member: 'Tree',
    behaviour:
      'the root is a tree whose rows are tree items, each open level a group (`role root tree`, ' +
      '`role item treeitem`, `role group group`)',
    reason:
      'iOS has no tree, tree item or group role for a view, and VoiceOver counts no level or depth ' +
      'outside a scrolling `List`. The tree is a container named by `label`, a branch’s chevron ' +
      'says expanded or collapsed, and the selected row has the selected trait.',
  },
  {
    member: 'Tree',
    behaviour: 'a branch whose level loads is busy (`attr more aria-busy=true`, `announces busy`)',
    reason:
      'iOS has no busy state for a view. The busy row’s Spinner announces `messages.loading` once ' +
      'when it appears, and the row’s identifier carries `busy=true`.',
  },
  {
    member: 'Tree',
    behaviour:
      'the tree is one stop in the keyboard order, and its arrow keys, Home and End move between ' +
      'rows and open and close branches (`attr item tabindex=0`, `key ArrowDown ' +
      'moves-focus-next`, `key ArrowRight opens`, `key ArrowLeft closes`)',
    reason:
      'A SwiftUI button takes keyboard focus only while the system’s keyboard navigation is on ' +
      '(Full Keyboard Access on iOS), and then each row and each chevron is a stop of its own: ' +
      'the system’s keys move between them, and Space presses the one with focus, as in every ' +
      'app.',
  },
  {
    member: 'TableOfContents',
    behaviour:
      'the current link follows the reader’s scroll: the last section whose top is above a line ' +
      'a quarter of the way down the page, the last section at the page’s end, and the mark a ' +
      'click holds until the reader scrolls (`attr link aria-current=location when a page of ' +
      'sections`)',
    reason:
      'The sections are the app’s views in the app’s scroll view, and a SwiftUI view cannot ' +
      'measure views it is not an ancestor of or find a view by an id. A link opens `#id` ' +
      'through the app’s open-URL action, which scrolls to the section; the link the app ' +
      'accepts is marked and reported through `onCurrentChange`, and the mark stays until the ' +
      'reader goes to another section through the list.',
  },
  {
    member: 'SearchPage',
    behaviour:
      'while a search runs the results region is busy (`attr results aria-busy="true" when ' +
      'searching`)',
    reason:
      'iOS has no busy state for a view. The results keep what they hold, the submit Button’s ' +
      '`loading` is what VoiceOver hears, and the page’s identifier carries `status=loading`.',
  },
  {
    member: 'InlineEdit',
    behaviour:
      'the field opens with its text all selected, so typing replaces the value (`focus on-open ' +
      'field`, Behaviour, "Opening")',
    reason:
      'SwiftUI’s text field takes a selection only from iOS 18, and the package supports iOS 17. ' +
      'The field opens with keyboard focus in it and the caret after the text.',
  },
  {
    member: 'InlineEdit',
    behaviour:
      'while a save is in flight the field is read-only and keeps its text and focus ' +
      '(`announces busy when pending`, Behaviour, "A save that waits")',
    reason:
      'A SwiftUI text field has no read-only mode, so the field is Input’s read-only form, ' +
      'selectable text, and keyboard focus leaves it. When the save fails, focus goes back into ' +
      'the field if it was there when the save started.',
  },
]
