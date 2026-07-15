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

const TUNING_MODES = Object.freeze({
  hon: {
    label: '本調子',
    ratios: {
      ichi: 1,
      ni: 4 / 3,
      san: 2
    },
    guide:
      '一の糸を基準に、二の糸を完全4度上、三の糸を1オクターブ上に合わせます。'
  },
  niage: {
    label: '二上り',
    ratios: {
      ichi: 1,
      ni: 3 / 2,
      san: 2
    },
    guide:
      '一の糸を基準に、二の糸を完全5度上、三の糸を1オクターブ上に合わせます。'
  },
  sansage: {
    label: '三下り',
    ratios: {
      ichi: 1,
      ni: 4 / 3,
      san: 16 / 9
    },
    guide:
      '一の糸を基準に、二の糸を完全4度上、三の糸を短7度上に合わせます。'
  }
});

let audioContext = null;
let deferredInstallPrompt = null;
let currentMode = 'hon';
let currentNotes = {
  ichi: 130.81,
  ni: 174.41,
  san: 261.62
};

const elements = {
  hon: document.getElementById('hon'),
  tuningInfo: document.getElementById('tuningInfo'),
  tuningGuide: document.getElementById('tuningGuide'),
  ichiFrequency: document.getElementById('ichiFrequency'),
  niFrequency: document.getElementById('niFrequency'),
  sanFrequency: document.getElementById('sanFrequency'),
  playAllButton: document.getElementById('playAllButton'),
  audioStatus: document.getElementById('audioStatus'),
  installButton: document.getElementById('installButton')
};

function setStatus(message) {
  if (elements.audioStatus) {
    elements.audioStatus.textContent = message;
  }
}

function updateModeButtons() {
  document
    .querySelectorAll('[data-mode]')
    .forEach((button) => {
      const isActive = button.dataset.mode === currentMode;

      button.classList.toggle('active', isActive);
      button.setAttribute(
        'aria-pressed',
        isActive ? 'true' : 'false'
      );
    });
}

function updateTuning() {
  if (!elements.hon || !elements.tuningInfo) {
    return;
  }

  const hon = Number(elements.hon.value);
  const ichi = BASE_NOTES[hon];
  const mode = TUNING_MODES[currentMode];

  if (!Number.isFinite(ichi) || !mode) {
    elements.tuningInfo.textContent =
      '調弦設定を読み込めませんでした。';
    return;
  }

  currentNotes = {
    ichi: ichi * mode.ratios.ichi,
    ni: ichi * mode.ratios.ni,
    san: ichi * mode.ratios.san
  };

  elements.tuningInfo.innerHTML =
    `<strong>${hon}本・${mode.label}</strong><br>` +
    `一の糸：${currentNotes.ichi.toFixed(2)} Hz<br>` +
    `二の糸：${currentNotes.ni.toFixed(2)} Hz<br>` +
    `三の糸：${currentNotes.san.toFixed(2)} Hz`;

  if (elements.ichiFrequency) {
    elements.ichiFrequency.textContent =
      `${currentNotes.ichi.toFixed(2)} Hz`;
  }

  if (elements.niFrequency) {
    elements.niFrequency.textContent =
      `${currentNotes.ni.toFixed(2)} Hz`;
  }

  if (elements.sanFrequency) {
    elements.sanFrequency.textContent =
      `${currentNotes.san.toFixed(2)} Hz`;
  }

  if (elements.tuningGuide) {
    elements.tuningGuide.innerHTML =
      `<p><strong>${mode.label}</strong></p>` +
      `<p>${mode.guide}</p>`;
  }

  localStorage.setItem(
    'shian-shamisen-hon',
    String(hon)
  );

  localStorage.setItem(
    'shian-shamisen-mode',
    currentMode
  );
}

function selectTuningMode(modeName) {
  if (!Object.hasOwn(TUNING_MODES, modeName)) {
    return;
  }

  currentMode = modeName;
  updateModeButtons();
  updateTuning();

  setStatus(
    `${TUNING_MODES[currentMode].label}を選びました。`
  );
}

async function ensureAudioContext() {
  if (!AudioContextClass) {
    throw new Error(
      'このブラウザはWeb Audio APIに対応していません。'
    );
  }

  if (!audioContext || audioContext.state === 'closed') {
    audioContext = new AudioContextClass();
  }

  if (audioContext.state === 'suspended') {
    await audioContext.resume();
  }

  return audioContext;
}

function createTone(
  context,
  frequency,
  startTime,
  duration = 1.8
) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();

  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(
    frequency,
    startTime
  );

  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(
    0.28,
    startTime + 0.03
  );

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

    createTone(
      context,
      frequency,
      context.currentTime
    );

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

    createTone(
      context,
      currentNotes.ichi,
      start
    );

    createTone(
      context,
      currentNotes.ni,
      start + interval
    );

    createTone(
      context,
      currentNotes.san,
      start + interval * 2
    );

    setStatus(
      `${TUNING_MODES[currentMode].label}の一・二・三の糸を連続再生中`
    );
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
    console.error(
      'Service Worker登録失敗:',
      error
    );
  }
}

function restoreSettings() {
  if (!elements.hon) {
    return;
  }

  const savedHon =
    localStorage.getItem('shian-shamisen-hon');

  const savedMode =
    localStorage.getItem('shian-shamisen-mode');

  if (
    savedHon &&
    Object.hasOwn(BASE_NOTES, savedHon)
  ) {
    elements.hon.value = savedHon;
  }

  if (
    savedMode &&
    Object.hasOwn(TUNING_MODES, savedMode)
  ) {
    currentMode = savedMode;
  }

  updateModeButtons();
  updateTuning();
}

function bindTuningEvents() {
  if (elements.hon) {
    elements.hon.addEventListener(
      'change',
      updateTuning
    );
  }

  if (elements.playAllButton) {
    elements.playAllButton.addEventListener(
      'click',
      playAll
    );
  }

  document
    .querySelectorAll('[data-note]')
    .forEach((button) => {
      button.addEventListener('click', () => {
        void playNote(button.dataset.note);
      });
    });

  document
    .querySelectorAll('[data-mode]')
    .forEach((button) => {
      button.addEventListener('click', () => {
        selectTuningMode(button.dataset.mode);
      });
    });
}

function bindInstallEvents() {
  if (!elements.installButton) {
    return;
  }

  window.addEventListener(
    'beforeinstallprompt',
    (event) => {
      event.preventDefault();
      deferredInstallPrompt = event;
      elements.installButton.hidden = false;
    }
  );

  elements.installButton.addEventListener(
    'click',
    async () => {
      if (!deferredInstallPrompt) {
        return;
      }

      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;

      deferredInstallPrompt = null;
      elements.installButton.hidden = true;
    }
  );

  window.addEventListener(
    'appinstalled',
    () => {
      deferredInstallPrompt = null;
      elements.installButton.hidden = true;
    }
  );
}

function initialize() {
  bindTuningEvents();
  bindInstallEvents();
  restoreSettings();
  void registerServiceWorker();
}

initialize();
