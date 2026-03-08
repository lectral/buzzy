const { formatTimeDifference, hexToRgb } = window.BuzzyUtils;
const CONFIG_PLACEHOLDER_SOUND = 'https://assets.mixkit.co/active_storage/sfx/2578/2578-preview.mp3'; // Generic buzzer sound

const state = {
    buzzers: [],
    locked: false,
    events: [],
    resetClicks: 0,
    resetTimeout: null
};

// DOM Elements
const buzzersContainer = document.getElementById('buzzers-container');
const resultsList = document.getElementById('results-list');
const btnReset = document.getElementById('btn-reset');
const btnSettings = document.getElementById('btn-settings');
const modalSettings = document.getElementById('settings-modal');
const btnSaveSettings = document.getElementById('btn-save-settings');
const btnCancelSettings = document.getElementById('btn-cancel-settings');
const btnAddBuzzer = document.getElementById('btn-add-buzzer');
const settingsList = document.getElementById('settings-buzzers-list');
const themeSwitch = document.getElementById('theme-switch');
const audio = new Audio(CONFIG_PLACEHOLDER_SOUND);

// Initialization
function init() {
    setupEventSource();
    setupEventListeners();
}

function setupEventListeners() {
    // Reset requires 3 rapid clicks to prevent accidental resets
    btnReset.addEventListener('click', () => {
        state.resetClicks++;
        btnReset.textContent = `Reset (${state.resetClicks}/3)`;

        if (state.resetTimeout) {
            clearTimeout(state.resetTimeout);
        }

        state.resetTimeout = setTimeout(() => {
            state.resetClicks = 0;
            btnReset.textContent = 'Reset (0/3)';
        }, 2000);

        if (state.resetClicks >= 3) {
            fetch('/api/reset', { method: 'POST' });
            state.resetClicks = 0;
            btnReset.textContent = 'Reset (0/3)';
        }
    });

    btnSettings.addEventListener('click', openSettings);
    btnCancelSettings.addEventListener('click', closeSettings);
    btnSaveSettings.addEventListener('click', saveSettings);
    btnAddBuzzer.addEventListener('click', addBuzzerSettingRow);

    if (themeSwitch) {
        themeSwitch.addEventListener('change', (e) => {
            const nextTheme = e.target.checked ? 'dark' : 'light';
            fetch('/api/theme', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ theme: nextTheme })
            });
        });
    }
}

function setupEventSource() {
    const evtSource = new EventSource('/api/events');

    evtSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'update') {
            updateState(data);
        }
    };

    evtSource.onerror = (err) => {
        console.error('EventSource failed:', err);
    };
}

function updateState(data) {
    const configChanged = JSON.stringify(state.buzzers) !== JSON.stringify(data.config.buzzers);
    state.buzzers = data.config.buzzers || [];

    if (data.config && data.config.theme) {
        applyTheme(data.config.theme);
    }

    const oldBuzzCount = state.events.length;
    state.events = data.buzzes || [];

    if (configChanged) {
        renderBuzzers();
    }

    // Play sound when a new buzz is received
    if (state.events.length > oldBuzzCount) {
        audio.play().catch(() => console.log('Audio play failed (user interaction needed first)'));
    }

    renderLockState();
    renderResults();
}

function applyTheme(theme) {
    if (theme === 'dark') {
        document.body.classList.add('dark-mode');
        if (themeSwitch) {
            themeSwitch.checked = true;
        }
    } else {
        document.body.classList.remove('dark-mode');
        if (themeSwitch) {
            themeSwitch.checked = false;
        }
    }
}

function renderBuzzers() {
    buzzersContainer.innerHTML = '';

    state.buzzers.forEach(buzzer => {
        const element = document.createElement('div');
        element.className = 'buzzer';
        element.dataset.id = buzzer.id;

        element.innerHTML = `
            <div class="buzzer-content">
                <div class="b-dome" style="background-color: ${buzzer.color}">
                    <div class="b-highlight"></div>
                </div>
                <div class="b-neck"></div>
                <div class="b-base"></div>
            </div>
            <div class="b-label">${buzzer.label}</div>
        `;

        element.onclick = () => handleBuzz(buzzer.id);
        element.addEventListener('touchstart', (e) => {
            e.preventDefault();
            handleBuzz(buzzer.id);
        }, { passive: false });

        buzzersContainer.appendChild(element);
    });
}

function handleBuzz(id) {
    const alreadyBuzzed = state.events.some(e => e.buzzerId === id);
    if (alreadyBuzzed) {
        return;
    }

    fetch('/api/buzz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
    });
}

function renderLockState() {
    const buzzers = buzzersContainer.querySelectorAll('.buzzer');
    buzzers.forEach(element => {
        const id = element.dataset.id;
        const buzzIndex = state.events.findIndex(e => e.buzzerId === id);
        const hasBuzzed = buzzIndex !== -1;

        const existingBadge = element.querySelector('.rank-badge');
        if (existingBadge) {
            existingBadge.remove();
        }

        if (hasBuzzed) {
            element.classList.add('locked');

            const badge = document.createElement('div');
            badge.className = 'rank-badge';
            badge.innerText = buzzIndex + 1;

            if (buzzIndex === 0) {
                badge.style.backgroundColor = '#ffd700'; // Gold
            } else if (buzzIndex === 1) {
                badge.style.backgroundColor = '#c0c0c0'; // Silver
            } else if (buzzIndex === 2) {
                badge.style.backgroundColor = '#cd7f32'; // Bronze
            } else {
                badge.style.backgroundColor = '#fff';
            }

            element.appendChild(badge);
        } else {
            element.classList.remove('locked');
        }
    });
}

function renderResults() {
    resultsList.innerHTML = '';
    state.events.forEach((event, index) => {
        const buzzer = state.buzzers.find(b => b.id === event.buzzerId);
        if (!buzzer) {
            return;
        }

        const listItem = document.createElement('li');
        listItem.className = 'result-item';
        listItem.style.backgroundColor = buzzer.color;

        const rgb = hexToRgb(buzzer.color);
        const luminance = 0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b;
        listItem.style.color = luminance < 128 ? 'white' : 'black';

        let timeText;
        if (index === 0) {
            timeText = 'WINNER';
        } else {
            timeText = formatTimeDifference(event.diff);
        }

        listItem.innerHTML = `<strong>${buzzer.label}</strong><br>${timeText}`;
        resultsList.appendChild(listItem);
    });
}

// Settings Modal Management
function openSettings() {
    settingsList.innerHTML = '';
    state.buzzers.forEach(renderSettingRow);
    modalSettings.classList.remove('hidden');
}

function closeSettings() {
    modalSettings.classList.add('hidden');
}

function renderSettingRow(buzzer = { id: Date.now().toString(), label: '', color: '#ffffff' }) {
    const row = document.createElement('div');
    row.className = 'setting-row';
    row.innerHTML = `
        <input type="color" value="${buzzer.color}" class="edit-color">
        <input type="text" value="${buzzer.label}" class="edit-label" placeholder="Label">
        <button class="sketchy-btn" onclick="this.parentElement.remove()">X</button>
    `;
    row.dataset.id = buzzer.id;
    settingsList.appendChild(row);
}

function addBuzzerSettingRow() {
    renderSettingRow();
}

function saveSettings() {
    const rows = settingsList.querySelectorAll('.setting-row');
    const newBuzzers = [];

    rows.forEach(row => {
        const color = row.querySelector('.edit-color').value;
        const label = row.querySelector('.edit-label').value;
        const id = row.dataset.id || Date.now().toString() + Math.random();
        newBuzzers.push({ id, label, color });
    });

    fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ buzzers: newBuzzers })
    }).then(() => {
        closeSettings();
    });
}

init();
