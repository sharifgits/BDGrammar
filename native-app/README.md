# Grammar BD Native (Option A)

This folder is a starter scaffold for migrating the current web app to a true native app using React Native.

## Create app with Expo

```bash
npx create-expo-app@latest grammarbd-native -t blank-typescript
```

Then copy `App.tsx` from this folder as initial shell.

## Recommended dependencies

```bash
npx expo install expo-camera expo-av expo-file-system expo-sharing
npx expo install @react-native-async-storage/async-storage
npm i @react-navigation/native @react-navigation/native-stack
npx expo install react-native-screens react-native-safe-area-context
```

## Migration map

1. `SmartCreator.tsx` -> `screens/SmartCreatorScreen.tsx`
2. `GrammarExplanation.tsx` -> `screens/GrammarExplanationScreen.tsx`
3. `SpeakingView.tsx` -> `screens/SpeakingScreen.tsx`
4. `VocabView.tsx` -> `screens/VocabScreen.tsx`
5. `localforage` -> `AsyncStorage`
6. browser downloads -> `expo-sharing` / `expo-file-system`
7. browser camera/mic -> `expo-camera` + `expo-av`

## Native permissions (app.json)

Add Android permissions:

```json
{
  "expo": {
    "android": {
      "permissions": ["CAMERA", "RECORD_AUDIO"]
    }
  }
}
```

## Optional API settings

For Gemini calls in native, store your key in `.env` and load it via Expo config/plugin pattern (never hardcode key in UI code).
