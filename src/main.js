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

// ── Audio helpers ───────────────────────────────────────────────────────────

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
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);
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

function parseTimecode(tc) {
  const parts = tc.split(':');
  if (parts.length === 2) {
    return parseInt(parts[0], 10) * 60 + parseFloat(parts[1]);
  }
  return 0;
}

// ── AudD API ────────────────────────────────────────────────────────────────

async function recognizeSong(pcmBuffer) {
  const apiKey = await bridge.getLocalStorage('audd_api_key');
  const wavBuffer = pcmToWav(pcmBuffer);
  const base64Audio = arrayBufferToBase64(wavBuffer);

  const formData = new FormData();
  formData.append('api_token', apiKey);
  formData.append('audio', base64Audio);
  formData.append('return', 'timecode');

  const res = await fetch('https://api.audd.io/', { method: 'POST', body: formData });

  if (res.status === 429) throw new Error('QUOTA_EXHAUSTED');
  if (!res.ok) throw new Error(`AudD HTTP ${res.status}`);

  const data = await res.json();
  if (data.status === 'error') {
    if (data.error && data.error.error_code === 901) throw new Error('QUOTA_EXHAUSTED');
    throw new Error(data.error?.error_message || 'AudD error');
  }
  if (!data.result) return null;

  return {
    artist: data.result.artist || 'Unknown',
    title: data.result.title || 'Unknown',
    timecode: data.result.timecode || '00:00',
  };
}

// ── Audio capture ───────────────────────────────────────────────────────────

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

function stopCapture() {
  if (captureTimer) clearTimeout(captureTimer);
  captureTimer = null;
  if (isCapturing) { isCapturing = false; bridge.audioControl(false); }
  audioChunks = [];
}

async function processCapture() {
  const pcm = collectPcm();
  console.log(`PCM collected: ${pcm.length} bytes`);

  if (pcm.length < 32000) {
    goTo('error', "Couldn't hear anything.\nTap to retry.");
    return;
  }

  bridge.textContainerUpgrade({
    containerID: 1, containerName: 'status',
    contentOffset: 0, contentLength: 20,
    content: 'Identifying...',
  });

  try {
    const song = await recognizeSong(pcm);
    if (currentScreen !== 'listening' && currentScreen !== 'listening_retry') return;

    if (!song) {
      if (currentScreen === 'listening') {
        goTo('listening_retry');
        return;
      }
      goTo('error', 'No song found.\nTap to retry.');
      return;
    }

    console.log('Matched:', song.artist, '-', song.title);
    currentSong = song;
    matchTime = Date.now();
    timecodeSeconds = parseTimecode(song.timecode);
    bridge.setLocalStorage('last_song', `${song.artist} - ${song.title}`);
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

// ── LRCLIB lyrics ───────────────────────────────────────────────────────────

async function fetchLyrics(artist, title) {
  const params = new URLSearchParams({ artist_name: artist, track_name: title });
  const res = await fetch(`https://lrclib.net/api/get?${params}`, {
    headers: { 'User-Agent': 'SuddenKaraoke/0.1.0' },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return { synced: data.syncedLyrics || null, plain: data.plainLyrics || null };
}

function parseLrc(lrcString) {
  const lines = [];
  for (const line of lrcString.split('\n')) {
    const match = line.match(/^\[(\d{2}):(\d{2}\.\d{2,3})\]\s*(.*)$/);
    if (match) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseFloat(match[2]);
      lines.push({ time: minutes * 60 + seconds, text: match[3] });
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

// ── Lyrics display ──────────────────────────────────────────────────────────

function showResultScreen() {
  const songinfo = `${currentSong.title} - ${currentSong.artist}`;

  if (syncedLines.length > 0) {
    currentLineIndex = -1;
    const initialLyrics = getDisplayLines(-1);
    bridge.rebuildPageContainer(screenResult(songinfo, initialLyrics));
    startLyricsSync();
    if (continuous) scheduleResync();
  } else if (plainLines.length > 0) {
    plainOffset = 0;
    const initialLyrics = plainLines.slice(0, 6).join('\n');
    bridge.rebuildPageContainer(screenResult(songinfo, initialLyrics));
  } else {
    bridge.rebuildPageContainer(screenResult(songinfo, 'No lyrics available.'));
  }
}

function getDisplayLines(lineIndex) {
  if (syncedLines.length === 0) return '';
  const idx = Math.max(0, Math.min(lineIndex, syncedLines.length - 1));
  const lines = [];
  if (idx > 0) lines.push(syncedLines[idx - 1].text);
  else lines.push('');
  lines.push('> ' + (syncedLines[idx]?.text || ''));
  if (idx + 1 < syncedLines.length) lines.push(syncedLines[idx + 1].text);
  else lines.push('');
  return lines.join('\n');
}

function startLyricsSync() {
  stopLyricsTimer();
  lyricsTimer = setInterval(() => {
    const elapsed = (Date.now() - matchTime) / 1000;
    const songPosition = timecodeSeconds + elapsed;

    let newIndex = -1;
    for (let i = syncedLines.length - 1; i >= 0; i--) {
      if (syncedLines[i].time <= songPosition) { newIndex = i; break; }
    }

    if (newIndex !== currentLineIndex && newIndex >= 0) {
      currentLineIndex = newIndex;
      const displayText = getDisplayLines(newIndex);
      bridge.textContainerUpgrade({
        containerID: 2, containerName: 'lyrics',
        contentOffset: 0, contentLength: displayText.length + 10,
        content: displayText,
      });
    }

    if (syncedLines.length > 0) {
      const lastLineTime = syncedLines[syncedLines.length - 1].time;
      if (songPosition > lastLineTime + 10) {
        console.log('Song ended');
        if (continuous) goTo('listening');
      }
    }
  }, 500);
}

function stopLyricsTimer() {
  if (lyricsTimer) clearInterval(lyricsTimer);
  lyricsTimer = null;
  if (resyncTimer) clearTimeout(resyncTimer);
  resyncTimer = null;
}

// ── Always On re-sync ────────────────────────────────────────────────────────

function scheduleResync() {
  if (!continuous || currentScreen !== 'result') return;
  resyncTimer = setTimeout(async () => {
    if (currentScreen !== 'result') return;
    console.log('Re-sync: capturing audio for drift correction');

    audioChunks = [];
    isCapturing = true;
    const micOk = await bridge.audioControl(true);
    if (!micOk) { isCapturing = false; scheduleResync(); return; }

    setTimeout(async () => {
      isCapturing = false;
      await bridge.audioControl(false);
      if (currentScreen !== 'result') return;

      const pcm = collectPcm();
      if (pcm.length < 32000) { scheduleResync(); return; }

      try {
        const song = await recognizeSong(pcm);
        if (currentScreen !== 'result') return;
        if (song) {
          if (song.title === currentSong.title && song.artist === currentSong.artist) {
            matchTime = Date.now();
            timecodeSeconds = parseTimecode(song.timecode);
            console.log('Re-synced to', song.timecode);
          } else {
            console.log('New song detected:', song.title);
            currentSong = song;
            matchTime = Date.now();
            timecodeSeconds = parseTimecode(song.timecode);
            bridge.setLocalStorage('last_song', `${song.artist} - ${song.title}`);
            await fetchAndShowLyrics();
            return;
          }
        }
      } catch (err) {
        console.warn('Re-sync failed:', err.message);
      }

      scheduleResync();
    }, 5000);
  }, 30000);
}

function updatePlainLyricsDisplay() {
  const displayText = plainLines.slice(plainOffset, plainOffset + 6).join('\n');
  bridge.textContainerUpgrade({
    containerID: 2, containerName: 'lyrics',
    contentOffset: 0, contentLength: displayText.length + 10,
    content: displayText,
  });
}

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
