# Sudden Karaoke Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an Even Hub web app for G2 glasses that identifies songs via AudD and displays time-synced karaoke lyrics from LRCLIB.

**Architecture:** Pure client-side web app. `index.html` serves as the phone setup UI (90s karaoke theme). `src/main.js` handles all glasses logic — state machine, audio capture, API calls, lyrics sync, and display rendering. No backend server.

**Tech Stack:** Vite, @evenrealities/even_hub_sdk, AudD API, LRCLIB API

**Spec:** `DESIGN.md` in repo root

**Reference:** The DocLens app at `~/work/even-realities/` demonstrates Even Hub SDK patterns (container layouts, event handling, audio capture, `textContainerUpgrade`).

---

## File Structure

```
sudden-karaoke/
  index.html              # Phone setup UI — 90s karaoke themed HTML/CSS/JS
  src/
    main.js               # All glasses logic (state machine, screens, audio, APIs, lyrics sync)
  app.json                # Even Hub app config
  package.json            # Dependencies and scripts
  .gitignore              # node_modules, dist, .DS_Store
  DESIGN.md               # Design spec (already exists)
```

- `index.html` — Self-contained phone UI. Inline `<style>` for 90s theme, inline `<script type="module">` for setup logic (bridge init, localStorage read/write, screen transitions). No build step needed for this file.
- `src/main.js` — Single ES module. Imports `waitForEvenAppBridge` from the SDK. Contains: constants, state variables, screen builders, audio helpers, API callers, LRC parser, lyrics scheduler, event handler, and `main()` entry point.

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `app.json`
- Existing: `.gitignore` (already exists)

- [ ] **Step 1: Create package.json**

```json
{
  "name": "sudden-karaoke",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "npx vite --port 5174 --host",
    "build": "npx vite build",
    "simulator": "npx evenhub-simulator http://localhost:5174",
    "qr": "npx evenhub qr --port 5174 --http"
  },
  "dependencies": {
    "@evenrealities/even_hub_sdk": "^0.0.7",
    "@evenrealities/evenhub-cli": "^0.1.5",
    "@evenrealities/evenhub-simulator": "^0.4.1"
  },
  "devDependencies": {
    "vite": "^7.3.1"
  }
}
```

Note: Port 5174 to avoid conflicts with DocLens on 5173.

- [ ] **Step 2: Create app.json**

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

- [ ] **Step 3: Install dependencies**

Run: `cd ~/repos/sudden-karaoke && npm install`
Expected: `node_modules/` created with even_hub_sdk, evenhub-cli, evenhub-simulator, vite

- [ ] **Step 4: Commit**

```bash
git add package.json app.json package-lock.json
git commit -m "feat: project scaffolding with dependencies and app config"
```

---

### Task 2: Phone Setup UI (index.html with 90s Karaoke Theme)

**Files:**
- Create: `index.html`

This is the phone-side WebView UI. It handles API key onboarding and stores the key via the SDK bridge. The 90s karaoke theme uses inline CSS — neon gradients, CRT effects, retro fonts.

- [ ] **Step 1: Create index.html with full phone setup UI**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Sudden Karaoke</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&family=VT323&display=swap');

    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: 'VT323', monospace;
      background: #0a0014;
      color: #fff;
      min-height: 100vh;
      overflow-x: hidden;
      position: relative;
    }

    /* Starfield background */
    body::before {
      content: '';
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: radial-gradient(2px 2px at 20px 30px, #fff, transparent),
                  radial-gradient(2px 2px at 40px 70px, rgba(255,255,255,0.8), transparent),
                  radial-gradient(1px 1px at 90px 40px, #fff, transparent),
                  radial-gradient(1px 1px at 130px 80px, rgba(255,255,255,0.6), transparent),
                  radial-gradient(2px 2px at 160px 30px, #fff, transparent);
      background-size: 200px 100px;
      animation: twinkle 4s ease-in-out infinite alternate;
      z-index: 0;
    }

    @keyframes twinkle {
      0% { opacity: 0.3; }
      100% { opacity: 0.7; }
    }

    .container {
      position: relative;
      z-index: 1;
      max-width: 420px;
      margin: 0 auto;
      padding: 40px 24px;
      text-align: center;
    }

    /* CRT scanline overlay */
    .container::after {
      content: '';
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: repeating-linear-gradient(
        0deg,
        transparent,
        transparent 2px,
        rgba(0,0,0,0.1) 2px,
        rgba(0,0,0,0.1) 4px
      );
      pointer-events: none;
      z-index: 100;
    }

    h1 {
      font-family: 'Press Start 2P', cursive;
      font-size: 22px;
      background: linear-gradient(180deg, #ff00ff, #00ffff);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      text-shadow: none;
      margin-bottom: 8px;
      line-height: 1.6;
    }

    .tagline {
      font-size: 24px;
      color: #ff79c6;
      margin-bottom: 40px;
    }

    .screen { display: none; }
    .screen.active { display: block; }

    .btn {
      font-family: 'Press Start 2P', cursive;
      font-size: 12px;
      padding: 16px 32px;
      border: 2px solid #ff00ff;
      background: linear-gradient(180deg, #330033, #1a001a);
      color: #ff00ff;
      cursor: pointer;
      text-transform: uppercase;
      transition: all 0.2s;
      margin: 12px 0;
      display: inline-block;
    }

    .btn:hover {
      background: linear-gradient(180deg, #ff00ff, #8800aa);
      color: #fff;
      box-shadow: 0 0 20px rgba(255,0,255,0.5);
    }

    .btn-link {
      font-family: 'VT323', monospace;
      font-size: 20px;
      color: #00ffff;
      background: none;
      border: none;
      cursor: pointer;
      text-decoration: underline;
      padding: 8px;
    }

    .btn-link:hover { color: #ff79c6; }

    .step {
      text-align: left;
      background: rgba(255,0,255,0.05);
      border: 1px solid rgba(255,0,255,0.2);
      border-radius: 4px;
      padding: 16px;
      margin: 12px 0;
      font-size: 20px;
      line-height: 1.4;
    }

    .step-num {
      font-family: 'Press Start 2P', cursive;
      font-size: 10px;
      color: #00ffff;
      display: block;
      margin-bottom: 6px;
    }

    input[type="text"] {
      font-family: 'VT323', monospace;
      font-size: 22px;
      width: 100%;
      padding: 12px 16px;
      background: rgba(0,0,0,0.6);
      border: 2px solid #00ffff;
      color: #00ffff;
      outline: none;
      margin: 8px 0;
    }

    input[type="text"]:focus {
      border-color: #ff00ff;
      box-shadow: 0 0 10px rgba(255,0,255,0.3);
    }

    input[type="text"]::placeholder { color: rgba(0,255,255,0.4); }

    .mic-graphic {
      font-size: 64px;
      margin: 24px 0;
    }

    .ready-msg {
      font-size: 22px;
      color: #50fa7b;
      line-height: 1.5;
    }

    .error-msg {
      color: #ff5555;
      font-size: 18px;
      margin-top: 8px;
      min-height: 22px;
    }
  </style>
</head>
<body>
  <div class="container">
    <!-- Screen 1: Welcome -->
    <div id="screen-welcome" class="screen active">
      <h1>Sudden Karaoke</h1>
      <p class="tagline">Hear a song? Sing along!</p>
      <button class="btn" onclick="showScreen('setup')">Get Started</button>
    </div>

    <!-- Screen 2: API Key Setup -->
    <div id="screen-setup" class="screen">
      <h1>Setup</h1>
      <div class="step">
        <span class="step-num">Step 1</span>
        Visit audd.io and create a free account
      </div>
      <div class="step">
        <span class="step-num">Step 2</span>
        Go to your Dashboard to find your API token
      </div>
      <div class="step">
        <span class="step-num">Step 3</span>
        Paste your API token below
      </div>
      <a href="https://audd.io" target="_blank" class="btn" style="margin: 16px 0; display: inline-block;">Open audd.io</a>
      <br />
      <input type="text" id="api-key-input" placeholder="Paste API token here..." />
      <div class="error-msg" id="error-msg"></div>
      <button class="btn" onclick="saveApiKey()">Save</button>
    </div>

    <!-- Screen 3: Ready -->
    <div id="screen-ready" class="screen">
      <h1>Ready!</h1>
      <div class="mic-graphic">&#127908;</div>
      <p class="ready-msg">
        Launch Sudden Karaoke<br/>from your glasses.
      </p>
      <br/>
      <button class="btn-link" onclick="showScreen('setup')">Change API Key</button>
    </div>
  </div>

  <script type="module">
    import { waitForEvenAppBridge } from '@evenrealities/even_hub_sdk';

    let bridge = null;

    window.showScreen = function(name) {
      document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
      document.getElementById(`screen-${name}`).classList.add('active');
    };

    window.saveApiKey = async function() {
      const input = document.getElementById('api-key-input');
      const errorEl = document.getElementById('error-msg');
      const key = input.value.trim();

      if (!key) {
        errorEl.textContent = 'Please enter an API token.';
        return;
      }

      try {
        await bridge.setLocalStorage('audd_api_key', key);
        showScreen('ready');
      } catch (err) {
        errorEl.textContent = 'Failed to save. Try again.';
        console.error('Save error:', err);
      }
    };

    async function init() {
      bridge = await waitForEvenAppBridge();

      // Check if key already saved
      try {
        const existingKey = await bridge.getLocalStorage('audd_api_key');
        if (existingKey) {
          showScreen('ready');
          return;
        }
      } catch (e) {
        // No key saved yet
      }

      showScreen('welcome');
    }

    init().catch(console.error);
  </script>
</body>
</html>
```

- [ ] **Step 2: Verify dev server starts**

Run: `cd ~/repos/sudden-karaoke && npm run dev`
Expected: Vite serves on http://localhost:5174, page loads with neon-styled welcome screen.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: phone setup UI with 90s karaoke theme and API key onboarding"
```

---

### Task 3: Glasses Core — State Machine, Screens, and Event Handling

**Files:**
- Create: `src/main.js`

This is the core glasses logic: state machine, all screen builders, and the event router. No API calls yet — just the navigation shell.

- [ ] **Step 1: Create src/main.js with state machine and all screens**

```js
import { waitForEvenAppBridge } from '@evenrealities/even_hub_sdk';

// --- Constants ---
const CLICK_EVENT = 0;
const SCROLL_TOP_EVENT = 1;
const SCROLL_BOTTOM_EVENT = 2;
const DOUBLE_CLICK_EVENT = 3;

// --- State ---
let bridge = null;
let currentScreen = 'init';
let continuous = false;
let audioChunks = [];
let isCapturing = false;
let captureTimer = null;
let lyricsTimer = null;
let currentSong = null;    // { artist, title, timecode }
let syncedLines = [];      // [{ time: seconds, text: string }]
let plainLines = [];       // [string]
let plainOffset = 0;       // for paginated plain lyrics
let matchTime = 0;         // Date.now() when AudD matched
let timecodeSeconds = 0;   // parsed from AudD timecode
let currentLineIndex = -1;

// --- Screen Builders ---

function screenModeSelect() {
  return {
    containerTotalNum: 2,
    listObject: [{
      xPosition: 20, yPosition: 120, width: 536, height: 148,
      containerID: 2, containerName: 'modes',
      itemContainer: { itemCount: 2, itemName: ['One Shot', 'Always On'] },
      isEventCapture: 1,
    }],
    textObject: [{
      xPosition: 20, yPosition: 40, width: 536, height: 60,
      containerID: 1, containerName: 'title',
      content: 'Sudden Karaoke',
      isEventCapture: 0,
    }],
    imageObject: [],
  };
}

function screenNoApiKey() {
  return {
    containerTotalNum: 1,
    listObject: [],
    textObject: [{
      xPosition: 20, yPosition: 60, width: 536, height: 160,
      containerID: 1, containerName: 'message',
      content: 'No API key set.\nOpen Sudden Karaoke in\nthe phone app to set up.',
      isEventCapture: 1,
    }],
    imageObject: [],
  };
}

function screenListening(retry) {
  return {
    containerTotalNum: 1,
    listObject: [],
    textObject: [{
      xPosition: 20, yPosition: 80, width: 536, height: 120,
      containerID: 1, containerName: 'status',
      content: retry ? 'Still listening...' : 'Listening...',
      isEventCapture: 1,
    }],
    imageObject: [],
  };
}

function screenError(message) {
  return {
    containerTotalNum: 1,
    listObject: [],
    textObject: [{
      xPosition: 20, yPosition: 60, width: 536, height: 160,
      containerID: 1, containerName: 'message',
      content: message,
      isEventCapture: 1,
    }],
    imageObject: [],
  };
}

function screenResult(songinfo, lyricsText) {
  return {
    containerTotalNum: 2,
    listObject: [],
    textObject: [
      {
        xPosition: 20, yPosition: 10, width: 536, height: 50,
        containerID: 1, containerName: 'songinfo',
        content: songinfo.slice(0, 200),
        isEventCapture: 0,
      },
      {
        xPosition: 20, yPosition: 70, width: 536, height: 200,
        containerID: 2, containerName: 'lyrics',
        content: lyricsText.slice(0, 2000),
        isEventCapture: 1,
      },
    ],
    imageObject: [],
  };
}

function screenQuitConfirm() {
  return {
    containerTotalNum: 2,
    listObject: [{
      xPosition: 20, yPosition: 120, width: 536, height: 148,
      containerID: 2, containerName: 'choices',
      itemContainer: { itemCount: 2, itemName: ['No', 'Yes'] },
      isEventCapture: 1,
    }],
    textObject: [{
      xPosition: 20, yPosition: 40, width: 536, height: 60,
      containerID: 1, containerName: 'prompt',
      content: 'Quit?',
      isEventCapture: 0,
    }],
    imageObject: [],
  };
}

// --- Navigation Helpers ---

function goTo(screen, ...args) {
  stopCapture();
  stopLyricsTimer();
  currentScreen = screen;
  console.log('Screen:', screen);

  switch (screen) {
    case 'no_api_key':
      bridge.rebuildPageContainer(screenNoApiKey());
      break;
    case 'mode_select':
      currentSong = null;
      bridge.rebuildPageContainer(screenModeSelect());
      break;
    case 'listening':
      bridge.rebuildPageContainer(screenListening(false));
      startCapture(5000); // first pass: 5s
      break;
    case 'listening_retry':
      bridge.rebuildPageContainer(screenListening(true));
      startCapture(7000); // second pass: 7s
      break;
    case 'result':
      showResultScreen();
      break;
    case 'quit_confirm':
      bridge.rebuildPageContainer(screenQuitConfirm());
      break;
    case 'error':
      bridge.rebuildPageContainer(screenError(args[0] || 'Something went wrong.\nTap to retry.'));
      break;
  }
}

// --- Event Handling ---

function handleTapEvent(eventType) {
  console.log('Event:', eventType, 'Screen:', currentScreen);

  if (eventType === CLICK_EVENT) {
    switch (currentScreen) {
      case 'no_api_key':
        // no action on tap
        break;
      case 'error':
        goTo('listening');
        break;
      case 'result':
        goTo('quit_confirm');
        break;
      case 'quit_confirm':
        // handled by list event
        break;
    }
  } else if (eventType === DOUBLE_CLICK_EVENT) {
    switch (currentScreen) {
      case 'no_api_key':
        bridge.shutDownPageContainer(0);
        break;
      case 'mode_select':
        bridge.shutDownPageContainer(0);
        break;
      case 'listening':
      case 'listening_retry':
        goTo('mode_select');
        break;
      case 'result':
        goTo('mode_select');
        break;
      case 'quit_confirm':
        goTo('result'); // same as "No"
        break;
      case 'error':
        goTo('mode_select');
        break;
    }
  }
}

function handleListEvent(event) {
  const et = event.listEvent.eventType;

  // Route non-click events (double-tap, scroll) to their handlers
  if (et === DOUBLE_CLICK_EVENT) {
    handleTapEvent(DOUBLE_CLICK_EVENT);
    return;
  }
  if (et !== CLICK_EVENT) return; // ignore scroll on lists

  const name = event.listEvent.currentSelectItemName;

  if (currentScreen === 'mode_select') {
    continuous = (name === 'Always On');
    console.log('Mode:', continuous ? 'Always On' : 'One Shot');
    goTo('listening');
  } else if (currentScreen === 'quit_confirm') {
    if (name === 'Yes') {
      goTo('mode_select');
    } else {
      goTo('result');
    }
  }
}

function handleScrollEvent(eventType) {
  if (currentScreen !== 'result' || syncedLines.length > 0) return;
  // Plain lyrics pagination
  if (eventType === SCROLL_BOTTOM_EVENT) {
    plainOffset = Math.min(plainOffset + 3, Math.max(0, plainLines.length - 3));
  } else if (eventType === SCROLL_TOP_EVENT) {
    plainOffset = Math.max(0, plainOffset - 3);
  }
  updatePlainLyricsDisplay();
}

function handleEvent(event) {
  // Audio PCM data
  if (event.audioEvent && isCapturing) {
    const pcm = event.audioEvent.audioPcm;
    if (pcm) audioChunks.push(new Uint8Array(pcm));
    return;
  }

  // List events
  if (event.listEvent) {
    handleListEvent(event);
    return;
  }

  // Text container events
  if (event.textEvent) {
    const et = event.textEvent.eventType;
    if (et === SCROLL_TOP_EVENT || et === SCROLL_BOTTOM_EVENT) {
      handleScrollEvent(et);
    } else {
      handleTapEvent(et);
    }
    return;
  }

  // System events
  if (event.sysEvent) {
    handleTapEvent(event.sysEvent.eventType);
  }
}

// --- Audio Capture (stub — implemented in Task 4) ---

function startCapture(durationMs) {
  // Will be implemented in Task 4
}

function stopCapture() {
  if (captureTimer) clearTimeout(captureTimer);
  captureTimer = null;
  if (isCapturing) {
    isCapturing = false;
    bridge.audioControl(false);
  }
  audioChunks = [];
}

// --- Lyrics Display (stub — implemented in Task 6) ---

function showResultScreen() {
  // Will be implemented in Task 6
}

function stopLyricsTimer() {
  if (lyricsTimer) clearInterval(lyricsTimer);
  lyricsTimer = null;
}

function updatePlainLyricsDisplay() {
  // Will be implemented in Task 6
}

// --- Main ---

async function main() {
  bridge = await waitForEvenAppBridge();
  const user = await bridge.getUserInfo();
  console.log('Sudden Karaoke — User:', user.name);

  // Check for API key
  let apiKey = null;
  try {
    apiKey = await bridge.getLocalStorage('audd_api_key');
  } catch (e) {
    // no key
  }

  if (!apiKey) {
    currentScreen = 'no_api_key';
    await bridge.createStartUpPageContainer(screenNoApiKey());
  } else {
    currentScreen = 'mode_select';
    await bridge.createStartUpPageContainer(screenModeSelect());
  }

  bridge.onEvenHubEvent(handleEvent);
}

main().catch(console.error);
```

- [ ] **Step 2: Verify it loads in dev server**

Run: `cd ~/repos/sudden-karaoke && npm run dev`
Open http://localhost:5174 — should see the phone setup UI (index.html is served by Vite).

- [ ] **Step 3: Commit**

```bash
git add src/main.js
git commit -m "feat: glasses core — state machine, all screens, event handling"
```

---

### Task 4: Audio Capture and AudD Recognition

**Files:**
- Modify: `src/main.js` — replace `startCapture` stub, add `pcmToWav`, `recognizeSong`, `captureAndRecognize`

- [ ] **Step 1: Add audio capture and AudD API integration**

Replace the audio capture stub section in `src/main.js` with:

```js
// --- Audio Helpers ---

function pcmToWav(pcmBuffer) {
  const sampleRate = 16000;
  const bitsPerSample = 16;
  const numChannels = 1;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = pcmBuffer.length;
  const headerSize = 44;

  const wav = new ArrayBuffer(headerSize + dataSize);
  const view = new DataView(wav);

  // RIFF header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');
  // fmt chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  // data chunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);
  // PCM data
  new Uint8Array(wav, 44).set(pcmBuffer);

  return wav;
}

function writeString(view, offset, str) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function collectPcm() {
  const totalLength = audioChunks.reduce((sum, c) => sum + c.length, 0);
  const pcm = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of audioChunks) {
    pcm.set(chunk, offset);
    offset += chunk.length;
  }
  audioChunks = [];
  return pcm;
}

async function recognizeSong(pcmBuffer) {
  const apiKey = await bridge.getLocalStorage('audd_api_key');
  const wavBuffer = pcmToWav(pcmBuffer);
  const base64Audio = arrayBufferToBase64(wavBuffer);

  const formData = new FormData();
  formData.append('api_token', apiKey);
  formData.append('audio', base64Audio);
  formData.append('return', 'timecode');

  const res = await fetch('https://api.audd.io/', {
    method: 'POST',
    body: formData,
  });

  if (res.status === 429) {
    throw new Error('QUOTA_EXHAUSTED');
  }
  if (!res.ok) {
    throw new Error(`AudD HTTP ${res.status}`);
  }

  const data = await res.json();

  if (data.status === 'error') {
    if (data.error && data.error.error_code === 901) {
      throw new Error('QUOTA_EXHAUSTED');
    }
    throw new Error(data.error?.error_message || 'AudD error');
  }

  if (!data.result) return null; // no match

  return {
    artist: data.result.artist || 'Unknown',
    title: data.result.title || 'Unknown',
    timecode: data.result.timecode || '00:00',
  };
}

// --- Audio Capture (real implementation) ---

async function startCapture(durationMs) {
  audioChunks = [];
  isCapturing = true;
  const micOk = await bridge.audioControl(true);
  if (!micOk) {
    isCapturing = false;
    goTo('error', 'Mic unavailable.\nCheck permissions.');
    return;
  }
  console.log(`Mic started, capturing ${durationMs}ms`);

  captureTimer = setTimeout(async () => {
    captureTimer = null;
    isCapturing = false;
    await bridge.audioControl(false);
    console.log(`Mic stopped, ${audioChunks.length} chunks`);
    processCapture();
  }, durationMs);
}

async function processCapture() {
  const pcm = collectPcm();
  console.log(`PCM collected: ${pcm.length} bytes`);

  if (pcm.length < 32000) {
    // Less than ~1 second of 16kHz 16-bit mono audio
    goTo('error', "Couldn't hear anything.\nTap to retry.");
    return;
  }

  // Update display
  bridge.textContainerUpgrade({
    containerID: 1, containerName: 'status',
    contentOffset: 0, contentLength: 20,
    content: 'Identifying...',
  });

  try {
    const song = await recognizeSong(pcm);

    // Guard: user may have navigated away during API call
    if (currentScreen !== 'listening' && currentScreen !== 'listening_retry') return;

    if (!song) {
      if (currentScreen === 'listening') {
        // First pass failed — try second pass
        goTo('listening_retry');
        return;
      }
      // Second pass also failed
      goTo('error', 'No song found.\nTap to retry.');
      return;
    }

    console.log('Matched:', song.artist, '-', song.title);
    currentSong = song;
    matchTime = Date.now();
    timecodeSeconds = parseTimecode(song.timecode);

    // Save last song for fun
    bridge.setLocalStorage('last_song', `${song.artist} - ${song.title}`);

    // Fetch lyrics next
    await fetchAndShowLyrics();
  } catch (err) {
    console.error('Recognition error:', err);
    if (err.message === 'QUOTA_EXHAUSTED') {
      goTo('error', 'API limit reached.\nGet a new key at audd.io.');
    } else {
      goTo('error', 'Network error.\nCheck WiFi.');
    }
  }
}

function parseTimecode(tc) {
  // "01:23" -> 83
  const parts = tc.split(':');
  if (parts.length === 2) {
    return parseInt(parts[0], 10) * 60 + parseFloat(parts[1]);
  }
  return 0;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/main.js
git commit -m "feat: audio capture with adaptive 2-pass AudD recognition"
```

---

### Task 5: LRCLIB Lyrics Fetching and LRC Parsing

**Files:**
- Modify: `src/main.js` — add `fetchAndShowLyrics`, `fetchLyrics`, `parseLrc`

- [ ] **Step 1: Add LRCLIB API call and LRC parser**

Add after the `parseTimecode` function in `src/main.js`:

```js
// --- Lyrics ---

async function fetchLyrics(artist, title) {
  const params = new URLSearchParams({
    artist_name: artist,
    track_name: title,
  });

  const res = await fetch(`https://lrclib.net/api/get?${params}`, {
    headers: { 'User-Agent': 'SuddenKaraoke/0.1.0' },
  });

  if (!res.ok) return null;

  const data = await res.json();
  return {
    synced: data.syncedLyrics || null,
    plain: data.plainLyrics || null,
  };
}

function parseLrc(lrcString) {
  // Parse "[MM:SS.ms] text" lines into [{ time, text }]
  const lines = [];
  for (const line of lrcString.split('\n')) {
    const match = line.match(/^\[(\d{2}):(\d{2}\.\d{2,3})\]\s*(.*)$/);
    if (match) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseFloat(match[2]);
      lines.push({
        time: minutes * 60 + seconds,
        text: match[3],
      });
    }
  }
  return lines;
}

async function fetchAndShowLyrics() {
  bridge.textContainerUpgrade({
    containerID: 1, containerName: 'status',
    contentOffset: 0, contentLength: 20,
    content: 'Fetching lyrics...',
  });

  try {
    const lyrics = await fetchLyrics(currentSong.artist, currentSong.title);

    // Guard: user may have navigated away during fetch
    if (currentScreen !== 'listening' && currentScreen !== 'listening_retry') return;

    if (!lyrics || (!lyrics.synced && !lyrics.plain)) {
      goTo('error', `${currentSong.title}\nby ${currentSong.artist}\n\nNo lyrics available.\nTap to retry.`);
      return;
    }

    if (lyrics.synced) {
      syncedLines = parseLrc(lyrics.synced);
      plainLines = [];
      plainOffset = 0;
    } else {
      syncedLines = [];
      plainLines = lyrics.plain.split('\n').filter(l => l.trim());
      plainOffset = 0;
    }

    goTo('result');
  } catch (err) {
    console.error('Lyrics fetch error:', err);
    goTo('error', `${currentSong.title}\nby ${currentSong.artist}\n\nLyrics fetch failed.\nTap to retry.`);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/main.js
git commit -m "feat: LRCLIB lyrics fetching and LRC timestamp parser"
```

---

### Task 6: Lyrics Display and Sync Timer

**Files:**
- Modify: `src/main.js` — replace `showResultScreen`, `updatePlainLyricsDisplay` stubs, add `startLyricsSync`, `updateLyricsDisplay`

- [ ] **Step 1: Implement lyrics display and sync**

Replace the lyrics display stub section in `src/main.js`:

```js
// --- Lyrics Display ---

function showResultScreen() {
  const songinfo = `${currentSong.title} - ${currentSong.artist}`;

  if (syncedLines.length > 0) {
    // Start with first upcoming line
    currentLineIndex = -1;
    const initialLyrics = getDisplayLines(-1);
    bridge.rebuildPageContainer(screenResult(songinfo, initialLyrics));
    startLyricsSync();
  } else if (plainLines.length > 0) {
    // Plain lyrics, paginated
    plainOffset = 0;
    const initialLyrics = plainLines.slice(0, 6).join('\n');
    bridge.rebuildPageContainer(screenResult(songinfo, initialLyrics));
  } else {
    bridge.rebuildPageContainer(screenResult(songinfo, 'No lyrics available.'));
  }
}

function getDisplayLines(lineIndex) {
  // Show 3 lines: previous, current (highlighted with ">"), next
  if (syncedLines.length === 0) return '';

  const idx = Math.max(0, Math.min(lineIndex, syncedLines.length - 1));
  const lines = [];

  // Previous line
  if (idx > 0) {
    lines.push(syncedLines[idx - 1].text);
  } else {
    lines.push('');
  }

  // Current line with marker
  lines.push('> ' + (syncedLines[idx]?.text || ''));

  // Next line
  if (idx + 1 < syncedLines.length) {
    lines.push(syncedLines[idx + 1].text);
  } else {
    lines.push('');
  }

  return lines.join('\n');
}

function startLyricsSync() {
  stopLyricsTimer();

  lyricsTimer = setInterval(() => {
    const elapsed = (Date.now() - matchTime) / 1000;
    const songPosition = timecodeSeconds + elapsed;

    // Find current line
    let newIndex = -1;
    for (let i = syncedLines.length - 1; i >= 0; i--) {
      if (syncedLines[i].time <= songPosition) {
        newIndex = i;
        break;
      }
    }

    if (newIndex !== currentLineIndex && newIndex >= 0) {
      currentLineIndex = newIndex;
      const displayText = getDisplayLines(newIndex);
      bridge.textContainerUpgrade({
        containerID: 2, containerName: 'lyrics',
        contentOffset: 0,
        contentLength: displayText.length + 10,
        content: displayText,
      });
    }

    // Check if song ended (past last line by 10 seconds)
    if (syncedLines.length > 0) {
      const lastLineTime = syncedLines[syncedLines.length - 1].time;
      if (songPosition > lastLineTime + 10) {
        console.log('Song ended');
        if (continuous) {
          goTo('listening'); // re-identify next song
        }
        // In one-shot mode, just stay on last lyrics until user exits
      }
    }
  }, 500); // check twice per second — only updates display when line changes
}

function updatePlainLyricsDisplay() {
  const displayText = plainLines.slice(plainOffset, plainOffset + 6).join('\n');
  bridge.textContainerUpgrade({
    containerID: 2, containerName: 'lyrics',
    contentOffset: 0,
    contentLength: displayText.length + 10,
    content: displayText,
  });
}
```

- [ ] **Step 2: Test with simulator**

Run: `npm run simulator`
Expected: Simulator loads, shows "No API key set" screen (since no bridge localStorage). UI flow can be tested for screen transitions.

- [ ] **Step 3: Commit**

```bash
git add src/main.js
git commit -m "feat: karaoke lyrics display with time-synced scrolling"
```

---

### Task 7: Integration Testing with Real APIs

**Files:** None (manual testing)

- [ ] **Step 1: Test AudD API manually**

Run:
```bash
curl -X POST https://api.audd.io/ \
  -F "api_token=YOUR_KEY" \
  -F "url=https://audd.io/example.mp3" \
  -F "return=timecode"
```
Expected: JSON with `result.artist`, `result.title`, `result.timecode`

- [ ] **Step 2: Test LRCLIB API manually**

Run:
```bash
curl "https://lrclib.net/api/get?artist_name=Queen&track_name=Bohemian+Rhapsody"
```
Expected: JSON with `syncedLyrics` containing `[MM:SS.ms]` format lines

- [ ] **Step 3: Test on G2 glasses via QR code**

```bash
cd ~/repos/sudden-karaoke
npm run dev
npm run qr
```

1. Scan QR code with Even App on phone
2. Verify phone shows setup screen with 90s theme
3. Enter AudD API key and save
4. Launch app from glasses menu
5. Select "One Shot", play a well-known song nearby
6. Verify: Listening → Identifying → Song title + lyrics displayed
7. Test double-tap back, tap quit confirm flow

- [ ] **Step 4: Commit any fixes discovered during testing**

```bash
git add -A
git commit -m "fix: adjustments from integration testing"
```

---

### Task 8: Always On Mode and Re-Sync

**Files:**
- Modify: `src/main.js` — enhance `startLyricsSync` with periodic re-identification

The core lyrics sync from Task 6 already handles `continuous` flag for auto-looping when lyrics end. This task adds periodic re-sync (every 30s) for drift correction during long sessions.

- [ ] **Step 1: Add re-sync timer to Always On mode**

Add a `resyncTimer` variable at the top with other state vars:
```js
let resyncTimer = null;
```

Add to `stopLyricsTimer`:
```js
function stopLyricsTimer() {
  if (lyricsTimer) clearInterval(lyricsTimer);
  lyricsTimer = null;
  if (resyncTimer) clearTimeout(resyncTimer);
  resyncTimer = null;
}
```

Add this function and call it at the end of `showResultScreen` when `continuous && syncedLines.length > 0`:

```js
function scheduleResync() {
  if (!continuous || currentScreen !== 'result') return;
  resyncTimer = setTimeout(async () => {
    if (currentScreen !== 'result') return; // user navigated away
    console.log('Re-sync: capturing audio for drift correction');
    // Capture in background without changing screen
    audioChunks = [];
    isCapturing = true;
    bridge.audioControl(true);

    setTimeout(async () => {
      isCapturing = false;
      bridge.audioControl(false);
      const pcm = collectPcm();
      if (pcm.length < 1600) {
        scheduleResync(); // try again later
        return;
      }

      try {
        const song = await recognizeSong(pcm);
        if (song) {
          if (song.title === currentSong.title && song.artist === currentSong.artist) {
            // Same song — correct drift
            matchTime = Date.now();
            timecodeSeconds = parseTimecode(song.timecode);
            console.log('Re-synced to', song.timecode);
          } else {
            // Different song — switch
            console.log('New song detected:', song.title);
            currentSong = song;
            matchTime = Date.now();
            timecodeSeconds = parseTimecode(song.timecode);
            await fetchAndShowLyrics();
            return; // fetchAndShowLyrics handles the new display
          }
        }
      } catch (err) {
        console.warn('Re-sync failed:', err.message);
      }

      scheduleResync();
    }, 5000); // 5s capture for re-sync
  }, 30000); // every 30s
}
```

- [ ] **Step 2: Commit**

```bash
git add src/main.js
git commit -m "feat: periodic re-sync in Always On mode for drift correction"
```

---

### Task 9: Final Polish and Push

**Files:**
- All files reviewed

- [ ] **Step 1: Review all console.log statements**

Ensure logs are useful for debugging but not excessive. Keep screen transition logs and API result logs.

- [ ] **Step 2: Test full flow end-to-end on glasses**

1. Fresh install: phone setup → API key → ready screen
2. One Shot: mode select → listening → result → quit confirm → mode select
3. Always On: mode select → listening → result → auto re-listen loop → quit
4. Error cases: no song found → retry, double-tap back from all screens
5. Plain lyrics fallback: test with a song that has no synced lyrics

- [ ] **Step 3: Push to GitHub**

```bash
git push origin main
```

- [ ] **Step 4: Build and package (optional, for future Hub submission)**

```bash
npm run build
npx evenhub pack app.json ./dist --output sudden-karaoke.ehpk
```
