# Compose: members, a worked screen and the app around it

## Add the modules

JitPack builds the two Gradle modules from the release tag: `tokens`, plain Kotlin with each
catalogue pairing as a `PMTheme`, and `ui`, the members on Compose Multiplatform, published with
an Android library and a JVM variant:

```kotlin
// settings.gradle.kts
dependencyResolutionManagement {
    repositories {
        google()
        mavenCentral()
        maven("https://jitpack.io")
    }
}

// app/build.gradle.kts
dependencies {
    implementation("com.github.metamorph-labs.polymorph:tokens:v1.0.18")
    implementation("com.github.metamorph-labs.polymorph:ui:v1.0.18")
}
```

The app module compiles against API 37 (`compileSdk = 37`), because the Compose libraries `ui`
brings require it. JitPack builds a tag the first time an app asks for it, which takes some
minutes. A repository that holds a checkout of polymorph at the tag, or a git submodule of it,
includes the build instead (the last section).

## How a member is written

A file imports each name from `dev.polymorph.ui`, and pairings from `dev.polymorph.tokens`. A
member is a composable that takes its props as named arguments, in any order. A required argument
without a default, such as `label` on `PMButton`, must be given. The generated `Members.kt`
declares every composable. An IDE shows its parameters, and a checkout of polymorph has it at
`platforms/android/ui/src/generated/kotlin/dev/polymorph/ui/Members.kt`.

| On the web | In Compose |
| --- | --- |
| A member, `Button` | `PMButton(label = "Save")` |
| A part, `SettingsRow.Group` | `PMSettingsRowGroup`: the member's name and the part's, joined |
| A string or a boolean | Itself: `label = "Save"`, `disabled = true` |
| A number | A Kotlin Double: `lines = 2.0` |
| A literal value | An enum: `size = PMControlSize.Sm`, `icon = PMIconRole.Add` |
| A spacing step, `gap={6}` | `gap = PMSpaceStep.S6` |
| `Grid`'s `columns={4}` | `columns = PMGridColumns.Columns4` |
| `Button`'s `variant="outline"` with `tone="danger"` | `appearance = PMButtonAppearance.OutlineDanger`, one of the lawful pairs |
| A child | The trailing lambda: `PMCard { … }` |
| A prop that holds an element (`control`, `actions`, `search`) | A `@Composable` lambda: `control = { PMSwitch(…) }` |
| Words where an element goes, as `Text`'s children | Material's `Text("…")`, which takes the style the member provides |
| A callback | A function without the DOM event. A required action binds as a reference, `onClick = actions::onSignOut`, and an optional one as itself, `onRetry = actions.onRetry` |
| A value the app controls that may be null, as `Select`'s `value` | `value = PMSome(model.frequency)`: given, `null` included. Left out, the member holds the value itself. |
| A data type, such as `SelectOption` | `PM` and its name: `PMSelectOptionEntry.Option(PMSelectOption(value = "now", label = "As they happen"))` |

`PMSome` tells a value that is given as null from a value left out. A prop
named `as` is written between backticks in Kotlin, because `as` is a keyword there.

## A worked screen

This file compiles against the package at the release tag. It is the shape the screen contract
asks for, and the shape to write by hand.

```kotlin
package com.example.app

import androidx.compose.runtime.Composable
import dev.polymorph.ui.PMButton
import dev.polymorph.ui.PMButtonAppearance
import dev.polymorph.ui.PMLoadStatus
import dev.polymorph.ui.PMSelect
import dev.polymorph.ui.PMSelectOptionEntry
import dev.polymorph.ui.PMSettingsPage
import dev.polymorph.ui.PMSettingsRow
import dev.polymorph.ui.PMSettingsRowGroup
import dev.polymorph.ui.PMSome
import dev.polymorph.ui.PMSwitch

/** What `NotificationsScreen` shows. `loadStatus` says which of the four load states it is in. */
data class NotificationsModel(
    val loadStatus: PMLoadStatus,
    /** Whether the morning digest is on. */
    val digest: Boolean,
    val frequency: String?,
    val frequencyOptions: List<PMSelectOptionEntry>,
) {
    companion object
}

/** The code the app supplies to `NotificationsScreen`, one function per action. */
interface NotificationsActions {
    fun onDigestChange(next: Boolean)
    fun onFrequencyChange(value: String?)
    fun onSignOut()
}

/** Which emails the person receives, and a way to sign out. */
@Composable
fun NotificationsScreen(model: NotificationsModel, actions: NotificationsActions) {
    PMSettingsPage(loadStatus = model.loadStatus, title = "Notifications") {
        PMSettingsRowGroup(title = "Email") {
            PMSettingsRow(
                control = {
                    PMSwitch(checked = model.digest, onCheckedChange = actions::onDigestChange)
                },
                description = "One email with what changed overnight.",
                label = "Morning digest",
            )
            PMSettingsRow(
                control = {
                    PMSelect(
                        onChange = actions::onFrequencyChange,
                        options = model.frequencyOptions,
                        value = PMSome(model.frequency),
                    )
                },
                label = "Alerts",
            )
        }
        PMSettingsRowGroup(title = "Account") {
            PMSettingsRow(
                control = {
                    PMButton(
                        label = "Sign out",
                        onClick = actions::onSignOut,
                        appearance = PMButtonAppearance.OutlineDanger,
                    )
                },
                label = "This device",
            )
        }
    }
}

/** Every action doing nothing, so the app compiles before it wires its store. */
object NotificationsInert : NotificationsActions {
    override fun onDigestChange(next: Boolean) {}
    override fun onFrequencyChange(value: String?) {}
    override fun onSignOut() {}
}
```

## The app around it

The store is an AndroidX ViewModel that holds the model and implements the actions. The route collects
the model and starts the load, and the root provides the pairing. These are the app's own code, so
coroutines and state live here.

```kotlin
package com.example.app

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.lifecycle.ViewModel
import dev.polymorph.tokens.PMThemes
import dev.polymorph.ui.PMLoadStatus
import dev.polymorph.ui.PMSelectOption
import dev.polymorph.ui.PMSelectOptionEntry
import dev.polymorph.ui.ProvidePMTheme
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

val NotificationsModel.Companion.placeholder: NotificationsModel
    get() = NotificationsModel(
        loadStatus = PMLoadStatus.Loading,
        digest = false,
        frequency = null,
        frequencyOptions = listOf(
            PMSelectOptionEntry.Option(PMSelectOption(value = "now", label = "As they happen")),
            PMSelectOptionEntry.Option(PMSelectOption(value = "hourly", label = "Once an hour")),
        ),
    )

class NotificationsStore : ViewModel(), NotificationsActions {
    private val state = MutableStateFlow(NotificationsModel.placeholder)
    val model: StateFlow<NotificationsModel> = state.asStateFlow()

    override fun onDigestChange(next: Boolean) = state.update { it.copy(digest = next) }
    override fun onFrequencyChange(value: String?) = state.update { it.copy(frequency = value) }
    override fun onSignOut() { /* the app's own sign-out */ }

    suspend fun load() {
        state.update { it.copy(loadStatus = PMLoadStatus.Loading) }
        try {
            val digest = fetchDigest()
            state.update { it.copy(digest = digest, loadStatus = PMLoadStatus.Ready) }
        } catch (error: CancellationException) {
            throw error
        } catch (error: Exception) {
            state.update { it.copy(loadStatus = PMLoadStatus.Failed(error.message.orEmpty())) }
        }
    }

    private suspend fun fetchDigest(): Boolean = true
}

@Composable
fun NotificationsRoute(store: NotificationsStore) {
    val model by store.model.collectAsState()
    LaunchedEffect(store) { store.load() }
    NotificationsScreen(model = model, actions = store)
}

@Composable
fun App(store: NotificationsStore) {
    val theme = PMThemes.plain_neutral
    ProvidePMTheme(theme, dark = theme.preferredDark) {
        NotificationsRoute(store)
    }
}
```

The store needs `androidx.lifecycle` and `kotlinx.coroutines`. `ProvidePMTheme`
also gives Material 3 the pairing, so the app's own Material components match the members. A
composable under none draws under `PMThemes.default` in the
system's mode.

## What the app provides

The members read these from the composition. Provide each that the screen's members need, at the
root, with `CompositionLocalProvider(…)`:

| Composition local | What it is | Without it |
| --- | --- | --- |
| `LocalPMStrings` | The app's translations of the words the members write by default | English |
| `LocalPMFontFamilies` | The font files for the families the pairing names | The system font |
| `LocalPMImageLoader` | A painter for a picture's URL, from the app's image loader | Each member draws its fallback |
| `LocalPMFilePicker` | The platform's document picker, for file upload and attaching | A dropzone opens nothing, and a prompt has no attach button |
| `LocalPMImageEncoder` | Writes an edited image as a file | The image editor's confirm hands nothing over |
| `LocalPMToday` | The person's date, for calendars and relative times | The date in UTC |

A link opens through Compose's `LocalUriHandler.current`, or through a member's `onNavigate` when the
app routes its own paths.

## What no member draws

A `PMBespoke` zone declares it, with the reason a reviewer reads. Inside, the
composable reads the pairing through `PM.theme` and draws with its tokens, and keeps every
accessibility rule.

```kotlin
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.dp
import dev.polymorph.ui.PM
import dev.polymorph.ui.PMBespoke
import dev.polymorph.ui.color

@Composable
fun Flagged() {
    val theme = PM.theme
    PMBespoke(reason = "Unread marker: the vocabulary has no dot that is not a Badge.") {
        Box(
            Modifier
                .size(theme.defaultDensity.space[6].dp)
                .background(theme.colors.accentBg.color, CircleShape)
                .clearAndSetSemantics {},
        )
    }
}
```

`.color` resolves a colour role in the mode the members draw in. `PM.theme`
is the pairing the root provided.

## Check the screen

Search the screen's file for what a screen may not write, and replace each hit as the skill's
table says:

```sh
grep -nE 'Color\(|\.dp([^A-Za-z]|$)|\.sp([^A-Za-z]|$)|MaterialTheme|Modifier\.|animate[A-Z]|remember|mutableStateOf|LaunchedEffect|navigate\(|Icons\.|(^|[^A-Za-z])(Column|Row|Box|Spacer|Button|Switch|TextField|Icon)\(' NotificationsScreen.kt
```

Material's `Text("…")` inside a member is lawful: it is words handed to the member. Then build:
`./gradlew :app:compileDebugKotlin`.

## A checkout instead of JitPack

A repository that holds a checkout of polymorph at the release tag, or a git submodule of it,
includes the Gradle build and depends on the modules by their own names:

```kotlin
// settings.gradle.kts
includeBuild("../polymorph/platforms/android")

// app/build.gradle.kts
dependencies {
    implementation("dev.polymorph:tokens")
    implementation("dev.polymorph:ui")
}
```

The included build runs on the app's Gradle, which is 9.5 or a later 9.x release, and compiles the
members. That compile runs out of memory at Gradle's default heap, so the app's
`gradle.properties` sets `org.gradle.jvmargs=-Xmx4g` and `kotlin.daemon.jvmargs=-Xmx4g`.
