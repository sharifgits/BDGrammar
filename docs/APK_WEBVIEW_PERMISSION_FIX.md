# APK WebView Camera/Microphone Permission Fix

If your app is built as an APK wrapper around this web app, browser-side code is **not enough**.
The Android wrapper must explicitly grant and forward runtime permissions.

## Required native permissions (AndroidManifest.xml)

```xml
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />
```

## Required WebView runtime handling

In your Android Activity/Fragment hosting WebView:

1. Enable JS and media playback in WebView settings.
2. Handle `WebChromeClient.onPermissionRequest(...)`.
3. Request Android runtime permissions (`CAMERA`, `RECORD_AUDIO`) if not granted.
4. On grant, call `request.grant(request.getResources())`.

## HTTPS / secure context rule

`getUserMedia` only works in secure contexts:
- `https://...` OR
- `http://localhost`

It will fail on plain `http://` and many non-secure file origins.

## Why popup may never show

If wrapper does not forward permissions from WebChromeClient, the web app never receives camera/mic access prompt.

## Quick verification checklist

- [ ] APK has CAMERA + RECORD_AUDIO in manifest.
- [ ] Runtime permission dialog appears at native layer.
- [ ] `onPermissionRequest` grants requested resources.
- [ ] WebView loads app over secure origin.
- [ ] Device camera/mic are not blocked by OS privacy settings.
