# Sudden Karaoke - Design Spec

## Overview

An Even Hub app for Even Realities G2 glasses that listens to ambient music, identifies the song, and displays time-synced karaoke lyrics on the glasses display. Pure client-side — no backend server.

## Architecture

```
G2 Glasses <--Even Hub SDK--> Web App (Vite, single main.js) <--fetch--> AudD API
                                                               <--fetch--> LRCLIB API
```

- **Platform**: Even Hub web app (HTML + JS + Even Hub SDK)
- **Build tool**: Vite (dev server + production build)
- **Song recognition**: AudD API (https://api.audd.io/)
- **Lyrics**: LRCLIB API (https://lrclib.net/)
- **No backend server** — all logic runs client-side in the WebView

## External APIs

### AudD (Song Recognition)

- **Endpoint**: `POST https://api.audd.io/`
- **Auth**: API token (user-provided, stored via SDK localStorage)
- **Input**: Base64-encoded audio or file upload
- **Output**: `{ artist, title, album, release_date, timecode }`
- **Free tier**: 300 requests on signup
- **Audio requirements**: Accepts WAV, MP3, etc. We send WAV (16kHz PCM with header).
- **Recommended clip length**: 10-15 seconds

### LRCLIB (Time-Synced Lyrics)

- **Endpoint**: `GET https://lrclib.net/api/get?artist_name={artist}&track_name={track}`
- **Auth**: None required
- **Output**: `{ syncedLyrics, plainLyrics, trackName, artistName, duration }`
- **syncedLyrics format**: LRC — `[MM:SS.ms] lyric line text`
- **Free**: Completely free, no API key
- **Fallback**: If `syncedLyrics` is null, fall back to `plainLyrics` (static display)

## User Experience

### Phone Side (Hub App WebView)

The phone screen serves as setup and onboarding. Visual theme: **nostalgic 90s karaoke** — think neon gradients, starfield or sparkle backgrounds, chunky retro fonts, and a CRT/VHS aesthetic.

#### Setup Flow:
1. **Welcome screen**: App title "Sudden Karaoke" in retro neon style, tagline "Hear a song? Sing along!", "Get Started" button
2. **API key setup**: Step-by-step guide to get an AudD API key:
   - "Step 1: Visit audd.io and create a free account"
   - "Step 2: Go to your Dashboard to find your API token"
   - "Step 3: Paste your API token below"
   - Link button: "Open audd.io" (opens in browser)
   - Text input for pasting the key
   - "Save" button stores key via `bridge.setLocalStorage()`
3. **Ready screen**: "You're all set! Launch Sudden Karaoke from your glasses." with a retro microphone graphic
   - "Change API Key" link to go back to step 2

All screens maintain the 90s karaoke visual theme — neon colors, retro typography, nostalgic vibes.

### Glasses Side (Launched from Menu)

#### Screen 1: Mode Select

- List container with 2 items: **"One Shot"** (default selected) / **"Always On"**
- User can swipe to change selection, tap to confirm
- Double-tap exits the app

#### Screen 2: Listening (Adaptive Duration)

Adaptive two-pass capture for faster response:

1. Show "Listening..." — capture 5 seconds of mic audio via `bridge.audioControl(true)`
2. Convert PCM to WAV, base64-encode, POST to AudD
3. If match found: proceed to Result
4. If no match: update text to "Still listening...", capture another 7 seconds, retry AudD
5. If still no match: show "No song found. Tap to retry."

- Best case: match in ~5s + API latency (1 API call)
- Worst case: ~12s total + 2x API latency (2 API calls)
- Double-tap cancels and goes back to Mode Select at any point

#### Screen 3: Result (Karaoke Lyrics)

- **Line 1**: Song title + artist (text container, top)
- **Lines 2-3**: Current lyrics in karaoke style (text container, main area)
- Auto-scrolls using LRC timestamps synced to estimated playback position
- Tap shows Quit Confirm screen
- Double-tap goes back to Mode Select

**In Always On mode**: When lyrics end or after a timeout, automatically returns to Listening to identify the next song/segment. Loops until user exits.

#### Screen 4: Quit Confirm

- List container with 2 items: **"No"** (default selected) / **"Yes"**
- Shown when user taps during Result screen
- Default is "No" so a quick tap resumes lyrics immediately
- "Yes" returns to Mode Select
- "No" returns to Result (lyrics resume)

### Navigation (All Screens)

- **Tap**: Primary action (select list item, trigger confirm). List selection is determined by `listEvent.currentSelectItemName` from the `CLICK_EVENT` (numeric value `0`). Text container taps arrive as `textEvent` with `eventType: 0`.
- **Double-tap**: Always "go back" (consistent with Even Hub convention). Event type numeric value `3`.
  - No API Key -> exit app
  - Mode Select -> exit app (`bridge.shutDownPageContainer()`)
  - Listening -> cancel, back to Mode Select
  - Result -> back to Mode Select
  - Quit Confirm -> back to Result (same as "No")

## Lyrics Sync Strategy

### Best-Effort Sync (Phase 1)

1. AudD returns a `timecode` string (e.g., `"01:23"`) indicating where in the song the match occurred
2. Parse to seconds: `timecodeSeconds = MM * 60 + SS` (e.g., `"01:23"` -> `83`)
3. Record `matchTime = Date.now()` when the AudD response arrives
4. For each LRC line `[MM:SS.ms] text`:
   - Parse to seconds: `lineSeconds = MM * 60 + SS.ms`
   - Schedule display at: `matchTime + (lineSeconds - timecodeSeconds) * 1000` ms
   - Lines where `lineSeconds < timecodeSeconds` have already passed — skip or show immediately
5. Update lyrics display only when the current line changes (not on a fixed timer interval)
6. Accept ~1-3 second drift — fine for casual karaoke

### Periodic Re-Sync (Phase 2 — Always On Mode)

In Always On mode, the app re-identifies every ~30 seconds (or when lyrics end, whichever comes first):
- If same song: update `matchTime` and `timecodeSeconds` to correct drift
- If different song: fetch new lyrics and restart display
- Each re-identification costs 1 AudD API call

### Fallback: Plain Lyrics

If LRCLIB returns `plainLyrics` but no `syncedLyrics`:
- Display lyrics as paginated static text
- On `SCROLL_BOTTOM_EVENT` (swipe down): advance displayed lyrics window by 3 lines via `textContainerUpgrade`
- On `SCROLL_TOP_EVENT` (swipe up): go back 3 lines via `textContainerUpgrade`
- No auto-scroll timing

## Audio Capture

- **Source**: G2 glasses microphone via Even Hub SDK
- **Format**: 16kHz PCM, signed 16-bit little-endian, mono (per SDK README)
- **Chunk delivery**: Via `event.audioEvent.audioPcm` (Uint8Array) from `onEvenHubEvent`
- **Capture duration**: Adaptive — 5s first pass, 7s second pass if needed (12s total worst case)
- **Processing**:
  1. Collect PCM chunks into array
  2. Concatenate into single buffer
  3. Prepend 44-byte WAV header (same `pcmToWav` logic as DocLens)
  4. Base64-encode for AudD API submission

**Note**: The SDK README states 16kHz/16-bit at 100ms per event, but also mentions 10ms/40-byte frames elsewhere. The actual chunk size must be verified on a real device by inspecting `event.audioEvent.audioPcm.length` before tuning capture duration. If chunks are smaller than expected, increase capture time accordingly.

## Data Persistence

Via Even Hub SDK `setLocalStorage` / `getLocalStorage`:

- `audd_api_key`: User's AudD API token
- `last_song`: Last identified song (artist + title) — shown on home screen for fun

## Display Layout

Canvas: 576 x 288 pixels. Max 4 containers per page.

### Mode Select Screen
| Container | Type | Position | Size | EventCapture |
|-----------|------|----------|------|--------------|
| title | text | (20, 40) | 536x60 | 0 |
| modes | list | (20, 120) | 536x148 | 1 |

### No API Key Screen
| Container | Type | Position | Size | EventCapture |
|-----------|------|----------|------|--------------|
| message | text | (20, 60) | 536x160 | 1 |

Content: "No API key set.\nOpen Sudden Karaoke in\nthe phone app to set up."

### Listening Screen
| Container | Type | Position | Size | EventCapture |
|-----------|------|----------|------|--------------|
| status | text | (20, 80) | 536x120 | 1 |

### Error Screen
| Container | Type | Position | Size | EventCapture |
|-----------|------|----------|------|--------------|
| message | text | (20, 60) | 536x160 | 1 |

Content varies by error type (see Error Handling section).

### Result Screen
| Container | Type | Position | Size | EventCapture |
|-----------|------|----------|------|--------------|
| songinfo | text | (20, 10) | 536x50 | 0 |
| lyrics | text | (20, 70) | 536x200 | 1 |

### Quit Confirm Screen
| Container | Type | Position | Size | EventCapture |
|-----------|------|----------|------|--------------|
| prompt | text | (20, 40) | 536x60 | 0 |
| choices | list | (20, 120) | 536x148 | 1 |

## app.json

```json
{
  "package_id": "com.example.sudden-karaoke",
  "edition": "202601",
  "name": "Sudden Karaoke",
  "version": "0.1.0",
  "min_app_version": "0.1.0",
  "tagline": "Hear a song? Sing along!",
  "description": "Identifies songs playing around you and displays karaoke lyrics on your G2 glasses. Tap to identify, or turn on Always On mode for continuous recognition.",
  "author": "inutano",
  "entrypoint": "index.html",
  "permissions": {
    "network": [
      "api.audd.io",
      "lrclib.net"
    ],
    "fs": []
  }
}
```

## Project Structure

```
sudden-karaoke/
  index.html          # Entry point
  src/
    main.js           # All app logic (screens, events, API calls, lyrics sync)
  app.json            # Even Hub app config
  package.json        # Dependencies (even_hub_sdk, vite)
```

Single `main.js` for glasses logic. Phone setup UI is the `index.html` page itself (styled with 90s karaoke CSS).

## State Machine

```
SETUP (phone) --key saved--> MODE_SELECT
NO_API_KEY (glasses, no key found) --double-tap--> EXIT
MODE_SELECT --tap "One Shot"--> LISTENING
MODE_SELECT --tap "Always On"--> LISTENING (continuous=true)
MODE_SELECT --double-tap--> EXIT

LISTENING --5s capture, AudD match--> RESULT
LISTENING --5s capture, no match--> LISTENING_RETRY (show "Still listening...")
LISTENING --double-tap--> MODE_SELECT
LISTENING_RETRY --7s capture, AudD match--> RESULT
LISTENING_RETRY --7s capture, no match--> ERROR
LISTENING_RETRY --double-tap--> MODE_SELECT

RESULT --tap--> QUIT_CONFIRM
RESULT --double-tap--> MODE_SELECT
RESULT --lyrics end + continuous--> LISTENING

QUIT_CONFIRM --tap "Yes"--> MODE_SELECT
QUIT_CONFIRM --tap "No"--> RESULT
QUIT_CONFIRM --double-tap--> RESULT

ERROR --tap--> LISTENING (retry)
ERROR --double-tap--> MODE_SELECT
```

## Error Handling

- **No API key**: Show No API Key screen (see layout above). Double-tap exits app.
- **Mic access failed** (`audioControl` returns false): "Mic unavailable. Check permissions." Tap to retry, double-tap back.
- **AudD failure / no match**: "No song found. Tap to retry." Double-tap goes to Mode Select.
- **AudD quota exhausted** (HTTP 429 or auth error): "API limit reached. Get a new key at audd.io." Double-tap goes to Mode Select.
- **LRCLIB no entry** (404 or network error): Show song title + "No lyrics available." Tap to retry recognition, double-tap back.
- **LRCLIB no synced lyrics** (plainLyrics only): Fall back to paginated plain lyrics (see Fallback section).
- **Network error**: "Network error. Check WiFi." Tap to retry, double-tap back.
- **Audio too short**: If < 1 second captured, "Couldn't hear anything. Tap to retry."
- **Device disconnect**: No special handling — app resumes on reconnection or user restarts.

## Testing

- **Simulator**: Use `evenhub-simulator` for UI flow testing (won't have real mic)
- **Real device**: QR code workflow with `evenhub qr`
- **Manual API test**: `curl -X POST https://api.audd.io/ -F api_token=YOUR_KEY -F file=@sample.wav`
- **LRCLIB test**: `curl "https://lrclib.net/api/get?artist_name=Queen&track_name=Bohemian+Rhapsody"`

## Future: ShazamKit Migration Path

If Even Realities adds native API bridging (GitHub issue #49):
- Replace AudD calls with ShazamKit via the native bridge
- Remove API key setup screen
- Keep LRCLIB for lyrics (no change)
- Sync improves because ShazamKit provides real-time match offsets
