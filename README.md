# StreamViewer

Expo app for web, Android and Android TV.

```sh
npm ci
npm start                 # Expo development server
npm run web               # Web development server
npm run typecheck
npm run build:web         # Generates dist/ for deployment
```

## Servers and accounts

Servers and logins live in `src/config.local.ts`. That file is git-ignored, so it is
never committed, but it is bundled into every build made on this machine (APK, web).
`npm ci` / `npm install` creates it from `src/config.local.example.ts` when it is
missing; fill in the copy. A build without configured accounts opens on the login screen.

## Logo

`node scripts/render-brand.cjs` regenerates the icon, adaptive icon, TV banner, favicon
and in-app logo in `assets/` (needs Google Chrome). Run `npm run prebuild:android`
afterwards so the Android launcher icons and TV banner are updated.

## Android

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
