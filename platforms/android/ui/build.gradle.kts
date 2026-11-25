import org.jetbrains.kotlin.gradle.dsl.JvmTarget

// The members, drawn with Compose Multiplatform. One source set holds them,
// `src/main/kotlin` with `src/generated/kotlin` beside it, shared by two
// targets:
//
// - `jvm`, Compose for desktop, which compiles and renders without an Android
//   SDK. The rendering harness (`src/test/kotlin`) runs on it, drawing each
//   states fixture entry with `ImageComposeScene`.
// - `android`, an Android library, whose tasks need an Android SDK
//   (`ANDROID_HOME`, or `sdk.dir` in `local.properties`). Without one the
//   target is still declared and configured; only its tasks fail.

plugins {
    kotlin("multiplatform")
    kotlin("plugin.compose")
    id("org.jetbrains.compose")
    id("com.android.kotlin.multiplatform.library")
}

group = "dev.polymorph"
version = "1.0.17"

val composeVersion = "1.12.1"

// Skia's native library for the machine the tests run on: Compose for
// desktop publishes one artifact per operating system and architecture.
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

kotlin {
    // A warning is an error here, so a deprecated name fails the build: an
    // icon role's vector under the wrong set (`Icons.Outlined` where Compose
    // has moved it to `Icons.AutoMirrored`), or a Compose API on its way out.
    compilerOptions { allWarningsAsErrors = true }

    jvm {
        // 17 is the bytecode level current Android builds accept.
        compilerOptions { jvmTarget = JvmTarget.JVM_17 }
    }

    android {
        namespace = "dev.polymorph.ui"
        // The Compose 1.12 libraries Compose Multiplatform resolves to on
        // Android declare that a module using them compiles against API 37.
        compileSdk = 37
        minSdk = 24
        // The accessibility audit (`src/androidHostTest/kotlin`): every states
        // fixture entry composed by Android's own Compose runtime, under
        // Robolectric on the JVM, so it needs the SDK and no device.
        // `isIncludeAndroidResources` merges the test libraries' manifests,
        // which declare the activity the entries are composed in.
        withHostTest { isIncludeAndroidResources = true }
    }

    sourceSets {
        commonMain {
            // `src/main/kotlin` holds the hand-written foundation and members;
            // `src/generated/kotlin` holds what `pnpm native:contracts` writes,
            // which the generator owns outright.
            kotlin.srcDir("src/main/kotlin")
            kotlin.srcDir("src/generated/kotlin")
            dependencies {
                api(project(":tokens"))
                api("org.jetbrains.compose.runtime:runtime:$composeVersion")
                api("org.jetbrains.compose.foundation:foundation:$composeVersion")
                api("org.jetbrains.compose.ui:ui:$composeVersion")
                // The newest stable Material 3; Compose Multiplatform's later
                // ones are alphas.
                api("org.jetbrains.compose.material3:material3:1.9.0")
                // The icon gateway draws each role's Material Symbols name from
                // the outlined Material Icons, the set's vector form.
                implementation("org.jetbrains.compose.material:material-icons-extended:1.7.3")
                // Compose's Back handler, through which MasterDetailPage hands
                // the system's Back to `onBack`. Compose's UI already brings it
                // at this version; the member calls it, so it is declared.
                implementation("org.jetbrains.compose.ui:ui-backhandler:$composeVersion")
            }
        }
        // `src/commonTest/kotlin` holds what both targets' tests share: the
        // rules a fixture entry's semantics tree is held to (`SemanticsAudit`).
        commonTest {
            dependencies {
                implementation(kotlin("test"))
            }
        }
        jvmTest {
            kotlin.srcDir("src/test/kotlin")
            dependencies {
                implementation("org.jetbrains.compose.desktop:desktop-jvm-$desktopTarget:$composeVersion")
                implementation("org.jetbrains.compose.ui:ui-test:$composeVersion")
            }
        }
        getByName("androidHostTest") {
            dependencies {
                implementation("junit:junit:4.13.2")
                implementation("org.robolectric:robolectric:4.17")
                // Android's Compose test rule, and the manifest that declares the
                // activity it composes in, at the release Compose Multiplatform
                // resolves to on Android.
                implementation("androidx.compose.ui:ui-test-junit4:$composeVersion")
                implementation("androidx.compose.ui:ui-test-manifest:$composeVersion")
            }
        }
    }
}

tasks.withType<Test>().configureEach {
    // The harness draws offscreen; no display is needed.
    systemProperty("java.awt.headless", "true")
    // `-Ppm.members=Menu,Popover` renders only those members' fixtures
    // (`Harness.fixtures`); without it, every fixture renders.
    providers.gradleProperty("pm.members").orNull?.let { systemProperty("pm.members", it) }
    // Skia loads its native library itself; Java 22 and later warn unless allowed.
    if (JavaVersion.current() >= JavaVersion.VERSION_22) jvmArgs("--enable-native-access=ALL-UNNAMED")
}

tasks.withType<Test>().matching { it.name == "testAndroidHostTest" }.configureEach {
    // Robolectric's Android reaches into the JDK's file descriptors and shared
    // secrets, which the JDK's modules close to other code from Java 17 on.
    jvmArgs(
        "--add-exports=java.base/jdk.internal.access=ALL-UNNAMED",
        "--add-opens=java.base/java.io=ALL-UNNAMED",
        "--add-opens=java.base/java.lang=ALL-UNNAMED",
    )
    // Every fixture entry is composed in one test, in one Android sandbox.
    maxHeapSize = "4g"
    // Android's own `AccessibilityNodeInfo` in place of Robolectric's stand-in,
    // which drops the ids of a node's children: the audit reads them to walk
    // the nodes as the provider publishes them.
    systemProperty("robolectric.useRealAni", "true")
}
