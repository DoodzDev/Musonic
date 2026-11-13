# Contributing to Musonic

Thank you for taking the time to contribute! This document outlines the workflow, conventions, and expectations to keep the project healthy.

---

## Branching Strategy

`main` is the only long-lived branch: stable, release-ready code. Every change goes through a
short branch merged into `main`, then deleted. Releases are tags per app: `mobile-vX.Y.Z`,
`web-vX.Y.Z`, `server-vX.Y.Z`.

### Feature / fix branches

Branch off from `main`, use a short descriptive name:

```
git checkout main
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
| Node.js | `22.11.0` | Pinned in `apps/mobile/.nvmrc`. A version manager such as `fnm` or `nvm` picks it up automatically. |
| JDK | 17 **and** 21 | JDK 21 runs Gradle. The React Native Gradle plugin also requires a JDK 17 toolchain; without it, Gradle tries to download one and fails. |
| Android SDK | Platform 36, Build-Tools 36.0.0 | Install with the command-line tools (`sdkmanager`) or Android Studio. |
| Android NDK | `27.1.12297006` | Plus CMake `3.22.1`. |

Point Gradle to the SDK with `ANDROID_HOME`, or create `apps/mobile/android/local.properties` (gitignored):

```
sdk.dir=/path/to/Android/Sdk
```

### Build variants

| Variant | Package | App name | Use |
|---------|---------|----------|-----|
| `debug` | `com.musonic.debug` | Musonic Dev | Development with Metro and fast refresh. Installs next to the released app. |
| `release` | `com.musonic` | Musonic | Production build. Signed with the release key when `apps/mobile/android/keystore.properties` is present, otherwise with the debug key. |

The release keystore and `apps/mobile/android/keystore.properties` are never committed. Official releases are built and signed by the CI on version tags.

### Commands

```bash
cd apps/mobile                   # the mobile app lives in apps/mobile
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

1. **Target `main`** from your branch; never push directly to `main`.
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
- All **user-facing strings** go through the i18n files, in English and French: `apps/mobile/src/i18n/en.ts` and `fr.ts`, and the same pair in `apps/web/src/i18n/` and `apps/admin/src/i18n/`. No hardcoded text outside them.
- **No comments** unless the *why* is genuinely non-obvious. The code should be self-documenting.
- Run `npm run lint` before committing.

---

## Reporting Issues

Use the GitHub issue templates:

- **Bug report** — steps to reproduce, expected vs actual behaviour, device/OS info.
- **Feature request** — problem statement, proposed solution, alternatives considered.

---

## License

By contributing, you agree that your contributions are licensed like the part of the project they touch: [CC BY-NC 4.0](LICENSE) for the apps and shared packages, [PolyForm Noncommercial 1.0.0](apps/server/LICENSE) for Musonic Server (`apps/server`).
