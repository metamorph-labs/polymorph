import org.jetbrains.kotlin.gradle.dsl.JvmTarget

// Relay's inbox as an app writes it: the screen the Compose emitter wrote from
// `Screens/inbox.json` (`pnpm emit:examples`), the app's `Ticket` and store, and
// a test that renders the screen in its four load states. It builds the JVM
// target only, as the member module's harness does, so it needs no Android
// SDK; `src/main/kotlin` is common code an Android app compiles as it is.

plugins {
    kotlin("multiplatform")
    kotlin("plugin.compose")
    id("org.jetbrains.compose")
}

val composeVersion = "1.12.1"

// Skia's native library for the machine the tests run on, as in `ui`.
val desktopTarget: String = run {
    val os = System.getProperty("os.name").lowercase()
    val arch = if (System.getProperty("os.arch") in setOf("aarch64", "arm64")) "arm64" else "x64"
    val family = when {
        os.contains("mac") -> "macos"
        os.contains("win") -> "windows"
        else -> "linux"
    }
    "$family-$arch"
}

// The member module's rendering harness. Only `Harness.kt` is compiled here,
// with the semantics rules it walks a tree by (`SemanticsAudit.kt`): the
// module's own tests run in `:ui:jvmTest`.
val harness: File = rootProject.file("ui/src/test/kotlin")
val semanticsAudit: File = rootProject.file("ui/src/commonTest/kotlin")

kotlin {
    jvm {
        compilerOptions { jvmTarget = JvmTarget.JVM_17 }
    }

    sourceSets {
        commonMain {
            kotlin.srcDir("src/main/kotlin")
            dependencies {
                implementation(project(":ui"))
                // The store is a ViewModel, as the screen contract's worked example writes it.
                implementation("org.jetbrains.androidx.lifecycle:lifecycle-viewmodel:2.9.6")
                implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.9.0")
            }
        }
        jvmTest {
            kotlin.srcDir("src/test/kotlin")
            kotlin.srcDir(harness)
            kotlin.srcDir(semanticsAudit)
            kotlin.exclude { !it.isDirectory && it.file.startsWith(harness) && it.name != "Harness.kt" }
            dependencies {
                implementation(kotlin("test"))
                implementation("org.jetbrains.compose.desktop:desktop-jvm-$desktopTarget:$composeVersion")
                // A main dispatcher for the store's `viewModelScope`, which the
                // JVM has none of: the store test sets one (`Dispatchers.setMain`).
                implementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.9.0")
            }
        }
    }
}

tasks.withType<Test>().configureEach {
    // The harness draws offscreen; no display is needed.
    systemProperty("java.awt.headless", "true")
    // Skia loads its native library itself; Java 22 and later warn unless allowed.
    if (JavaVersion.current() >= JavaVersion.VERSION_22) jvmArgs("--enable-native-access=ALL-UNNAMED")
}
