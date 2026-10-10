# Contributing to Musonic

Thank you for taking the time to contribute! This document outlines the workflow, conventions, and expectations to keep the project healthy.

---

## Branching Strategy

We follow a two-branch model:

| Branch    | Purpose                                                  |
|-----------|----------------------------------------------------------|
| `main`    | Stable, release-ready code. Only merged from `develop` via a reviewed PR. |
| `develop` | Active development. All feature branches target this branch. |

### Feature / fix branches

Branch off from `develop`, use a short descriptive name:

```
git checkout develop
git checkout -b feat/queue-drag-drop
git checkout -b fix/mini-player-swipe
```

Naming prefixes:

| Prefix   | Use for                                |
|----------|----------------------------------------|
| `feat/`  | New feature                            |
| `fix/`   | Bug fix                                |
| `refactor/` | Code restructure, no behavior change |
| `docs/`  | Documentation only                     |
| `chore/` | Tooling, dependencies, CI              |

---

## Building from Source (Android)

### Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Node.js | `22.11.0` | Pinned in `.nvmrc`. A version manager such as `fnm` or `nvm` picks it up automatically. |
| JDK | 17 **and** 21 | JDK 21 runs Gradle. The React Native Gradle plugin also requires a JDK 17 toolchain; without it, Gradle tries to download one and fails. |
| Android SDK | Platform 36, Build-Tools 36.0.0 | Install with the command-line tools (`sdkmanager`) or Android Studio. |
| Android NDK | `27.1.12297006` | Plus CMake `3.22.1`. |

Point Gradle to the SDK with `ANDROID_HOME`, or create `android/local.properties` (gitignored):

```
sdk.dir=/path/to/Android/Sdk
```

### Build variants

| Variant | Package | App name | Use |
|---------|---------|----------|-----|
| `debug` | `com.musonic.debug` | Musonic Dev | Development with Metro and fast refresh. Installs next to the released app. |
| `release` | `com.musonic` | Musonic | Production build. Signed with the release key when `android/keystore.properties` is present, otherwise with the debug key. |

The release keystore and `android/keystore.properties` are never committed. Official releases are built and signed by the CI on version tags.

### Commands

```bash
npm install                      # also applies patches/ via patch-package

# Development build on a connected device (USB debugging enabled)
npx react-native start
adb reverse tcp:8081 tcp:8081
npx react-native run-android --mode debug --appIdSuffix debug

# Standalone APKs
cd android
./gradlew assembleDebug          # app/build/outputs/apk/debug/app-debug.apk
./gradlew assembleRelease        # app/build/outputs/apk/release/app-release.apk
adb install -r app/build/outputs/apk/release/app-release.apk
```

The first build compiles native code and can take 10 to 15 minutes. Later builds use the Gradle cache.

---

## Opening a Pull Request

1. **Target `develop`**, never push directly to `main`.
2. Fill in the pull request template — description, test plan, and checklist.
3. Keep PRs focused. One logical change per PR makes review faster.
4. Ensure `npm run lint` passes before opening the PR.

---

## Commit Messages

Use the imperative mood, present tense:

```
feat: add crossfade setting to player
fix: prevent mini player flickering on Android
docs: update installation steps in README
```

---

## Code Style

- **TypeScript** everywhere — no `any` unless unavoidable and justified.
- All **user-facing strings** must go through `src/i18n/fr.ts`. No hardcoded French (or any language) outside that file.
- **No comments** unless the *why* is genuinely non-obvious. The code should be self-documenting.
- Run `npm run lint` before committing.

---

## Reporting Issues

Use the GitHub issue templates:

- **Bug report** — steps to reproduce, expected vs actual behaviour, device/OS info.
- **Feature request** — problem statement, proposed solution, alternatives considered.

---

## License

By contributing, you agree that your contributions will be licensed under the same [CC BY-NC 4.0](LICENSE) license as the rest of the project.
