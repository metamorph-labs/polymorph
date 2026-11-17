// The Polymorph modules for Android and any other Kotlin target. An app
// includes this build (`includeBuild`) and depends on `dev.polymorph:tokens`
// and `dev.polymorph:ui`; README.md has the lines.

pluginManagement {
    repositories {
        gradlePluginPortal()
        google()
        mavenCentral()
    }
}

dependencyResolutionManagement {
    repositories {
        // Compose Multiplatform depends on AndroidX libraries, which Google's
        // repository publishes and Maven Central does not.
        google()
        mavenCentral()
    }
}

rootProject.name = "polymorph-android"

include(":tokens")
include(":ui")
// Relay's inbox, emitted from a screen spec and rendered by an app's own
// store: the Compose screen emitter's example (`examples/relay`).
include(":examples:relay")
