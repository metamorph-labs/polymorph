// The Kotlin, Compose and Android plugins are declared once here and applied
// by each module. The token module uses the JVM plugin, not the Android one:
// it holds plain values, so it builds without an Android SDK and any Android
// module can depend on it. The member module is Compose Multiplatform: its JVM
// target builds and renders anywhere, and its Android target compiles where an
// Android SDK is installed (ui/build.gradle.kts).

plugins {
    kotlin("jvm") version "2.3.21" apply false
    kotlin("multiplatform") version "2.3.21" apply false
    kotlin("plugin.compose") version "2.3.21" apply false
    id("org.jetbrains.compose") version "1.12.1" apply false
    // 9.2 is the newest Android Gradle plugin that accepts Gradle 9.5.
    id("com.android.kotlin.multiplatform.library") version "9.2.1" apply false
}
