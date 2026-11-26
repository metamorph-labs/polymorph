import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    kotlin("jvm")
    `maven-publish`
}

group = "dev.polymorph"
version = "1.0.18"

// JitPack builds the library from a tag or a commit of this repository (`jitpack.yml` at its
// root) and serves each module as `com.github.metamorph-labs.polymorph:<module>:<tag or commit>`.
// It sets these variables while it builds; every other build keeps `dev.polymorph` and the
// release's version, which `pnpm native:version` writes above.
if (System.getenv("JITPACK") == "true") {
    group = "${System.getenv("GROUP")}.${System.getenv("ARTIFACT")}"
    version = System.getenv("VERSION")
}

java {
    // 17 is the bytecode level current Android builds accept.
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
}

kotlin {
    compilerOptions {
        jvmTarget = JvmTarget.JVM_17
    }
    // `src/main/kotlin` holds the hand-written types; `src/generated/kotlin`
    // holds what `pnpm emit:native` writes, which the emitter owns outright.
    sourceSets.named("main") {
        kotlin.srcDir("src/generated/kotlin")
    }
}

dependencies {
    testImplementation(kotlin("test"))
}

tasks.test {
    useJUnitPlatform()
}

// The module's one publication, which JitPack serves (`jitpack.yml`).
publishing {
    publications {
        create<MavenPublication>("maven") {
            from(components["java"])
        }
    }
}
