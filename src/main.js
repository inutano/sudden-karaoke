import { waitForEvenAppBridge } from '@evenrealities/even_hub_sdk';

// Event type constants
const CLICK_EVENT = 0;
const SCROLL_TOP_EVENT = 1;
const SCROLL_BOTTOM_EVENT = 2;
const DOUBLE_CLICK_EVENT = 3;

// State variables
let bridge = null;
let currentScreen = 'init';
let continuous = false;
let audioChunks = [];
let isCapturing = false;
let captureTimer = null;
let lyricsTimer = null;
let resyncTimer = null;
let currentSong = null;    // { artist, title, timecode }
let syncedLines = [];      // [{ time: seconds, text: string }]
let plainLines = [];       // [string]
let plainOffset = 0;
let matchTime = 0;
let timecodeSeconds = 0;
let currentLineIndex = -1;

// ── Screen builders ──────────────────────────────────────────────────────────

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

// ── Stubs (to be replaced in Tasks 4–6) ─────────────────────────────────────

function startCapture(durationMs) { /* Task 4 */ }

function stopCapture() {
  if (captureTimer) clearTimeout(captureTimer);
  captureTimer = null;
  if (isCapturing) { isCapturing = false; bridge.audioControl(false); }
  audioChunks = [];
}

function showResultScreen() { /* Task 6 */ }

function stopLyricsTimer() {
  if (lyricsTimer) clearInterval(lyricsTimer);
  lyricsTimer = null;
  if (resyncTimer) clearTimeout(resyncTimer);
  resyncTimer = null;
}

function updatePlainLyricsDisplay() { /* Task 6 */ }

// ── Navigation ───────────────────────────────────────────────────────────────

function goTo(screen, ...args) {
  stopCapture();
  stopLyricsTimer();
  currentScreen = screen;

  switch (screen) {
    case 'mode_select':
      currentSong = null;
      bridge.rebuildPageContainer(screenModeSelect());
      break;
    case 'no_api_key':
      bridge.rebuildPageContainer(screenNoApiKey());
      break;
    case 'listening':
      bridge.rebuildPageContainer(screenListening(false));
      startCapture(5000);
      break;
    case 'listening_retry':
      bridge.rebuildPageContainer(screenListening(true));
      startCapture(7000);
      break;
    case 'result':
      showResultScreen();
      break;
    case 'quit_confirm':
      bridge.rebuildPageContainer(screenQuitConfirm());
      break;
    case 'error':
      bridge.rebuildPageContainer(screenError(args[0]));
      break;
    default:
      console.warn('goTo: unknown screen', screen);
  }
}

// ── Event handling ───────────────────────────────────────────────────────────

function handleTapEvent(eventType) {
  if (eventType === CLICK_EVENT) {
    switch (currentScreen) {
      case 'error':
        goTo('listening');
        break;
      case 'result':
        goTo('quit_confirm');
        break;
    }
  } else if (eventType === DOUBLE_CLICK_EVENT) {
    switch (currentScreen) {
      case 'no_api_key':
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
        goTo('result');
        break;
      case 'error':
        goTo('mode_select');
        break;
    }
  }
}

function handleListEvent(event) {
  const listEvent = event.listEvent;

  if (listEvent.eventType === DOUBLE_CLICK_EVENT) {
    handleTapEvent(DOUBLE_CLICK_EVENT);
    return;
  }

  if (listEvent.eventType !== CLICK_EVENT) {
    // Ignore scroll and other event types
    return;
  }

  const name = listEvent.currentSelectItemName;

  switch (currentScreen) {
    case 'mode_select':
      continuous = (name === 'Always On');
      goTo('listening');
      break;
    case 'quit_confirm':
      if (name === 'Yes') {
        goTo('mode_select');
      } else {
        goTo('result');
      }
      break;
  }
}

function handleScrollEvent(eventType) {
  if (currentScreen !== 'result') return;
  if (syncedLines.length !== 0) return;

  if (eventType === SCROLL_BOTTOM_EVENT) {
    plainOffset = Math.min(plainOffset + 3, Math.max(0, plainLines.length - 3));
  } else if (eventType === SCROLL_TOP_EVENT) {
    plainOffset = Math.max(0, plainOffset - 3);
  }

  updatePlainLyricsDisplay();
}

function handleEvent(event) {
  if (event.audioEvent && isCapturing) {
    const pcm = event.audioEvent.audioPcm;
    if (pcm) audioChunks.push(new Uint8Array(pcm));
    return;
  }

  if (event.listEvent) {
    handleListEvent(event);
    return;
  }

  if (event.textEvent) {
    const et = event.textEvent.eventType;
    if (et === SCROLL_TOP_EVENT || et === SCROLL_BOTTOM_EVENT) {
      handleScrollEvent(et);
    } else {
      handleTapEvent(et);
    }
    return;
  }

  if (event.sysEvent) {
    handleTapEvent(event.sysEvent.eventType);
  }
}

// ── Entry point ──────────────────────────────────────────────────────────────

async function main() {
  bridge = await waitForEvenAppBridge();
  const user = await bridge.getUserInfo();
  console.log('Sudden Karaoke — User:', user.name);

  let apiKey = null;
  try { apiKey = await bridge.getLocalStorage('audd_api_key'); } catch (e) {}

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
