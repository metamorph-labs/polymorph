---
'@polymorph/native': patch
---

**On iOS, the box that takes a text field's tap is at least 44 points on each axis.** Three
SwiftUI members drew a text field in a box shorter than the hit target, and now lay the box out at
the hit target:

- OTPInput's cells sit centred in a box 44 points tall, 4 points taller than the large control
  height the cells keep. Its hidden field keeps the default text size, so at an accessibility text
  size it no longer reaches past the cells and takes the taps of what lies above and below them.
- PromptInput's field is at least 44 points tall, its first line at the top, as on Android. An
  empty composer is taller than one line and its padding, and a field of two lines or more keeps
  its height.
- A Textarea of one row is 44 points tall. A Textarea of two rows or more keeps its height.

Every text-entry member takes the tap in its box through one foundation modifier, which publishes
the box for the simulator audit, so the audit holds a text field to the box a person taps rather
than to the editable line UIKit publishes. Nothing changes in an app's code.
