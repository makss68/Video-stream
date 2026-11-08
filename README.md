# StreamViewer

Expo app for web, Android and Android TV.

```sh
npm ci
npm start                 # Expo development server
npm run web               # Web development server
npm run typecheck
npm run build:web         # Generates dist/ for deployment
```

Android builds require the Android SDK and Java:

```sh
npm run android
npm run build:tv:apk      # Release APK from the existing android/ project
```

If `android/` is missing, regenerate it with `npm run prebuild:android` first.
That command recreates the native project and applies TV, font and signing patches.
Release signing uses the local `keystore.properties` and keystore files; retain them.

## Reclaim disk space

Run after stopping any development servers or builds:

```sh
npm run clean -- --dry-run  # Preview the paths to remove
npm run clean
```

This removes web exports, Expo state, Android build intermediates and caches,
including native build data inside dependencies. It keeps installed packages,
native project configuration, signing files and completed Android outputs in
`android/app/build/outputs/`. The next Android build regenerates intermediates
and takes longer. Recreate the web export with `npm run build:web` before deploying.
