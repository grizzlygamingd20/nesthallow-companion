# Nesthallow Companion (Project Acorn, milestone 1)

A private Android app for the Keeper: hold the button, talk, and Nesthallow answers out loud while her moth face reacts. The app is Android-only, for one user, installed as a signed APK, with no app store.

```
android/   Kotlin + Jetpack Compose app
backend/   Vercel functions: holds the AI keys and Nesthallow's persona
.github/   GitHub Actions: builds a signed APK on every push
```

## How a conversation works

1. You hold the button. The phone records 16 kHz audio (up to 60 s).
2. On release, the app sends the recording and the last 12 turns to `POST /api/talk` on your backend.
3. The backend answers with one of two brains, picked by the switch at the top of the app:
   - **OpenAI:** one speech-to-speech call (`gpt-audio-1.5`). This is usually the fastest.
   - **Claude:** speech-to-text, then Claude, then OpenAI's voice. It's a little slower, but she thinks with Claude.
4. The app plays her reply and shows the time from when you let go to when her answer arrived.

Both brains use the same voice, so she sounds like herself either way.

## One-time setup

### 1. Deploy the backend on Vercel

1. In Vercel, choose **Add New → Project** and import this repo.
2. Set **Root Directory** to `backend`. Leave the framework preset at "Other".
3. Add these environment variables:

| Name | Value |
|---|---|
| `DEVICE_TOKEN` | The device token Birch gave you (at least 24 characters) |
| `OPENAI_API_KEY` | Your OpenAI API key. Both brains use it for hearing and voice. |
| `ANTHROPIC_API_KEY` | Your Anthropic API key, for the Claude brain |

Optional: `NESTHALLOW_VOICE` (default `coral`), `NESTHALLOW_VOICE_STYLE`, `OPENAI_AUDIO_MODEL`, `CLAUDE_MODEL`.

4. Deploy. Your address will look like `https://nesthallow-companion-xyz.vercel.app`.

This is a new Vercel project. It is not the Tavern.

### 2. Install the app

1. On your phone, open this repo's **Releases** page in the GitHub app or a browser and download the newest `nesthallow-*.apk`.
2. Tap it. Android will ask you to allow installs from that app once.
3. Open Nesthallow. On first launch, paste the backend address and the device token, tap **Test connection**, then **Save**.
4. Allow the microphone when asked.

### Updates

Every push to `main` builds a new signed APK as a new release. Install it over the old one; your settings stay.

## Nesthallow's persona

`backend/lib/persona.mjs` holds a starting draft. Nesthallow should rewrite it in her own words. It's sent with every request, so keep it short.

## Built for the acorn later

- `AudioIO` in the app is the only place that touches the mic and speaker. The acorn will add an implementation over Bluetooth LE, and nothing else in the app changes.
- The backend doesn't care who is calling, so the acorn, via the phone, and the fox can use the same `/api/talk`.

## Signing key

The release signing key lives in two Actions secrets, under **Settings → Secrets and variables → Actions**:

- `KEYSTORE_B64`: the base64 text of the key file
- `KEYSTORE_PASSWORD`: its password

Without them, builds still compile the code but don't publish an APK. Keep the backup copy Birch sent you somewhere safe. Android only installs updates signed with the same key, so losing it means uninstalling and reinstalling the app.
