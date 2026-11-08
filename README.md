# Salo Kusina

A mobile recipe-sharing app — "Wattpad, but for food recipes." Users can publish their own
recipes, browse a featured dish and personalized "For You" feed, and explore recipes by category.

## Tech stack

- **Ionic 9 + Angular 22** (standalone components, zoneless change detection)
- **Firebase** — Authentication + Cloud Firestore
- **Capacitor** — Android build (`android/`)
- **DOMPurify** — sanitizes user-submitted recipe HTML

## Project layout

```
src/app/
  login/ register/ account-setup/   authentication and profile onboarding
  home/                             featured dish, For You feed, categories
  menu/                             recipe browsing
  recipe-setup/ recipe-editor/      creating and editing recipes
  recipe-detail/                    viewing a recipe
  shared/                           shared services and helpers
firestore.rules                     Firestore security rules
android/                            Capacitor Android platform
```

## Running locally

```bash
npm install
npm start          # dev server at http://localhost:4200
```

## Building the Android APK

```bash
npm run build
npx cap sync android
cd android && ./gradlew assembleDebug
```

The APK lands in `android/app/build/outputs/apk/debug/`.
