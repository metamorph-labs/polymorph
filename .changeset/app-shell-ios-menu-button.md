---
'@polymorph/native': patch
---

**AppShell's menu button on iOS takes a touch anywhere on its platter.** On a compact width class
the SwiftUI AppShell drew the button that opens the rail as a view of its own in the navigation
bar. The bar hosts such a view 36 points high, and a touch on the bar's 44-point platter above or
below it reached nothing. The button is now the bar's own: its label is a title and the `menu`
icon, so the bar draws the icon at its own size, names the button "Open navigation" and takes a
touch over the whole platter, as it does for a bar button in any SwiftUI app. On iOS 26 the
platter is 44 points wide, where it was 56. Nothing changes in an app's code.
