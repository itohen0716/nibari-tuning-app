'use strict';

const AudioContextClass =
  window.AudioContext || window.webkitAudioContext;

const BASE_NOTES = Object.freeze({
  1: 174.61,
  2: 164.81,
  3: 155.56,
  4: 146.83,
  5: 138.59,
  6: 130.81,
  7: 123.47,
  8: 116.54,
  9: 110.00,
  10: 103.83,
  11: 98.00,
  12: 92.50
});

let audioContext = null;
let deferredInstallPrompt = null;
let currentNotes = {
  ichi: 130.81,
  ni: 196.22,
  san: 261.62
};

const elements = {
  hon: document.getElementById('hon'),
  tuningInfo: document.getElementById('tuningInfo'),
  ichiFrequency: document.getElementById('ichiFrequency'),
  niFrequency: document.getElementById('niFrequency'),
  sanFrequency: document.getElementById('sanFrequency'),
  playAllButton: document.getElementById('playAllButton'),
  audioStatus: document.getElementById('audioStatus'),
  installButton: document.getElementById('installButton')
};

function setStatus(message) {
  elements.audioStatus.textContent = message;
}

function updateTuning() {
  const hon = Number(elements.hon.value);
  const ichi = BASE_NOTES[hon];

  if (!Number.isFinite(ichi)) {
    elements.tuningInfo.textContent =
      '本数設定を読み込めませんでした。';
    return;
  }

  currentNotes = {
    ichi,
    ni: ichi * 1.5,
    san: ichi * 2
  };

  elements.tuningInfo.innerHTML =
    `<strong>${hon}本・二上り</strong><br>` +
    `一の糸：${currentNotes.ichi.toFixed(2)} Hz<br>` +
    `二の糸：${currentNotes.ni.toFixed(2)} Hz<br>` +
    `三の糸：${currentNotes.san.toFixed(2)} Hz`;

  elements.ichiFrequency.textContent =
    `${currentNotes.ichi.toFixed(2)} Hz`;
  elements.niFrequency.textContent =
    `${currentNotes.ni.toFixed(2)} Hz`;
  elements.sanFrequency.textContent =
    `${currentNotes.san.toFixed(2)} Hz`;

  localStorage.setItem('nibari-hon', String(hon));
}

async function ensureAudioContext() {
  if (!AudioContextClass) {
    throw new Error('このブラウザはWeb Audio APIに対応していません。');
  }

  if (!audioContext || audioContext.state === 'closed') {
    audioContext = new AudioContextClass();
  }

  if (audioContext.state === 'suspended') {
    await audioContext.resume();
  }

  return audioContext;
}

function createTone(context, frequency, startTime, duration = 1.8) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();

  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(frequency, startTime);

  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(0.28, startTime + 0.03);
  gain.gain.exponentialRampToValueAtTime(
    0.0001,
    startTime + duration
  );

  oscillator.connect(gain);
  gain.connect(context.destination);

  oscillator.start(startTime);
  oscillator.stop(startTime + duration + 0.05);
}

async function playNote(noteName) {
  try {
    const frequency = currentNotes[noteName];

    if (!Number.isFinite(frequency)) {
      throw new Error('音程データが見つかりません。');
    }

    const context = await ensureAudioContext();
    createTone(context, frequency, context.currentTime);

    const labels = {
      ichi: '一の糸',
      ni: '二の糸',
      san: '三の糸'
    };

    setStatus(
      `${labels[noteName]} ${frequency.toFixed(2)} Hzを再生中`
    );
  } catch (error) {
    console.error(error);
    setStatus(
      `音を再生できません：${error.message}`
    );
  }
}

async function playAll() {
  try {
    const context = await ensureAudioContext();
    const start = context.currentTime + 0.05;
    const interval = 2.05;

    createTone(context, currentNotes.ichi, start);
    createTone(context, currentNotes.ni, start + interval);
    createTone(context, currentNotes.san, start + interval * 2);

    setStatus('一の糸→二の糸→三の糸を連続再生中');
  } catch (error) {
    console.error(error);
    setStatus(
      `連続再生できません：${error.message}`
    );
  }
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    return;
  }

  try {
    await navigator.serviceWorker.register(
      './service-worker.js',
      { scope: './' }
    );
  } catch (error) {
    console.error('Service Worker登録失敗:', error);
  }
}

function restoreSettings() {
  const savedHon = localStorage.getItem('nibari-hon');

  if (savedHon && Object.hasOwn(BASE_NOTES, savedHon)) {
    elements.hon.value = savedHon;
  }

  updateTuning();
}

function bindEvents() {
  elements.hon.addEventListener('change', updateTuning);
  elements.playAllButton.addEventListener('click', playAll);

  document
    .querySelectorAll('[data-note]')
    .forEach((button) => {
      button.addEventListener('click', () => {
        void playNote(button.dataset.note);
      });
    });

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    elements.installButton.hidden = false;
  });

  elements.installButton.addEventListener('click', async () => {
    if (!deferredInstallPrompt) {
      return;
    }

    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;

    deferredInstallPrompt = null;
    elements.installButton.hidden = true;
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    elements.installButton.hidden = true;
  });
}

function initialize() {
  restoreSettings();
  bindEvents();
  void registerServiceWorker();
}

initialize();
