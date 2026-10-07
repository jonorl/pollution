# Mobile

The dashboard as an Android app: React Native and Expo, with the same five three.js views drawn natively through expo-gl, in English and Argentine Spanish.

```sh
npm install
npx expo start          # press a for a phone or emulator, or scan the QR code with Expo Go
```

`npm run android` makes a development build instead and installs it on a connected phone or running emulator; that needs JDK 17 and the Android SDK. Set `EXPO_PUBLIC_API_URL` to point at another API, such as a local backend.

## How it differs from the web

- **3D:** three.js renders into an expo-gl context. With no DOM, the shared `Stage` swaps three's OrbitControls for gesture-handler gestures ([`scene/orbit.ts`](src/scene/orbit.ts)) and its CSS2D labels for React Native text that Reanimated moves every frame ([`scene/labels.ts`](src/scene/labels.ts)). expo-gl can't make multisampled render targets, so every view ends with an FXAA pass.
- **Data:** the same API and polling, paused while the app is in the background. Pull down on the panels to refresh.
- **Copied code:** `bands.ts`, `sizes.ts`, `breath.ts`, `strings.ts`, `format.ts` and the views started as copies of `frontend/src`, so a change to one usually belongs in both.

## Building an APK locally

Needs JDK 17 and the Android SDK, with `JAVA_HOME` and `ANDROID_HOME` set.

```sh
npx expo prebuild --platform android      # generates android/, which is gitignored
cd android && ./gradlew assembleRelease   # → app/build/outputs/apk/release/app-release.apk
```

Without the upload key (below) the APK is signed with the debug key. That installs and runs, but can't update a copy installed from a GitHub release. To sign locally, put the four `POLLUTION_UPLOAD_*` properties from the table below in `~/.gradle/gradle.properties`.

## Releasing

Pushing a `mobile-v*` tag runs [`release-android.yml`](../.github/workflows/release-android.yml), which builds a signed APK for arm64 and 32-bit ARM phones and attaches it to a GitHub release.

**Once:** make an upload key and add it to the repository's Actions secrets. keytool asks for one password, which serves as both the store and the key password.

```sh
keytool -genkeypair -v -keystore upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 upload.jks
```

| Secret | Value | Gradle property for local signing |
| --- | --- | --- |
| `ANDROID_UPLOAD_KEYSTORE` | The base64 output | `POLLUTION_UPLOAD_STORE_FILE` (path to `upload.jks`) |
| `ANDROID_UPLOAD_STORE_PASSWORD` | The password | `POLLUTION_UPLOAD_STORE_PASSWORD` |
| `ANDROID_UPLOAD_KEY_ALIAS` | `upload` | `POLLUTION_UPLOAD_KEY_ALIAS` |
| `ANDROID_UPLOAD_KEY_PASSWORD` | The password | `POLLUTION_UPLOAD_KEY_PASSWORD` |

Keep `upload.jks` and its password somewhere safe outside the repo. Every later release must be signed with the same key, or phones refuse to install it over the earlier one.

**Each release:** bump `version` in `package.json` (Android's version code follows from it: 1.2.3 → 10203), push, then tag the same version.

```sh
git tag mobile-v1.0.1 && git push origin mobile-v1.0.1
```
