const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');

const utils = require('../frontend/public/main-utils.js');

const MAIN_MODULE_PATH = require.resolve('../frontend/public/main.js');

function createDom() {
    return new JSDOM(`<!DOCTYPE html>
    <html lang="en">
    <body>
        <div id="app">
            <button id="btn-settings" class="corner-btn top-left">Settings</button>
            <button id="btn-reset" class="corner-btn top-right">Reset (0/3)</button>
            <div id="buzzers-container" class="buzzers-grid"></div>
            <div id="results-bar" class="sketchy-box">
                <h3>Results</h3>
                <ul id="results-list"></ul>
            </div>
        </div>
        <div id="settings-modal" class="modal hidden">
            <div class="modal-content sketchy-box">
                <div class="setting-row">
                    <label for="theme-switch">Dark Mode</label>
                    <input type="checkbox" id="theme-switch">
                </div>
                <div id="settings-buzzers-list"></div>
                <button id="btn-add-buzzer" class="sketchy-btn">Add Buzzer</button>
                <div class="modal-actions">
                    <button id="btn-save-settings" class="sketchy-btn primary">Save</button>
                    <button id="btn-cancel-settings" class="sketchy-btn">Cancel</button>
                </div>
            </div>
        </div>
    </body>
    </html>`, {
        url: 'http://localhost/'
    });
}

function loadMainModule(t) {
    const dom = createDom();
    const { window } = dom;
    const fetchCalls = [];
    const scheduledTimeouts = [];
    const originalGlobals = {
        window: global.window,
        document: global.document,
        navigator: global.navigator,
        EventSource: global.EventSource,
        Audio: global.Audio,
        fetch: global.fetch,
        setTimeout: global.setTimeout,
        clearTimeout: global.clearTimeout
    };

    class FakeEventSource {
        static instances = [];

        constructor(url) {
            this.url = url;
            this.onmessage = null;
            this.onerror = null;
            FakeEventSource.instances.push(this);
        }
    }

    class FakeAudio {
        static instances = [];

        constructor(src) {
            this.src = src;
            this.playCalls = 0;
            FakeAudio.instances.push(this);
        }

        play() {
            this.playCalls += 1;
            return Promise.resolve();
        }
    }

    function fakeFetch(url, options = {}) {
        fetchCalls.push({ url, options });
        return Promise.resolve({ ok: true });
    }

    global.window = window;
    global.document = window.document;
    global.navigator = window.navigator;
    global.EventSource = FakeEventSource;
    global.Audio = FakeAudio;
    global.fetch = fakeFetch;
    global.setTimeout = (callback, delay) => {
        const handle = { callback, delay, cleared: false };
        scheduledTimeouts.push(handle);
        return handle;
    };
    global.clearTimeout = (handle) => {
        if (handle) {
            handle.cleared = true;
        }
    };

    window.BuzzyUtils = utils;
    window.EventSource = FakeEventSource;
    window.Audio = FakeAudio;
    window.fetch = fakeFetch;

    delete require.cache[MAIN_MODULE_PATH];
    require(MAIN_MODULE_PATH);

    t.after(() => {
        delete require.cache[MAIN_MODULE_PATH];
        dom.window.close();
        global.window = originalGlobals.window;
        global.document = originalGlobals.document;
        global.navigator = originalGlobals.navigator;
        global.EventSource = originalGlobals.EventSource;
        global.Audio = originalGlobals.Audio;
        global.fetch = originalGlobals.fetch;
        global.setTimeout = originalGlobals.setTimeout;
        global.clearTimeout = originalGlobals.clearTimeout;
    });

    return {
        window,
        document: window.document,
        fetchCalls,
        scheduledTimeouts,
        eventSource: FakeEventSource.instances[0],
        audio: FakeAudio.instances[0]
    };
}

function sendUpdate(eventSource, payload) {
    eventSource.onmessage({
        data: JSON.stringify({ type: 'update', ...payload })
    });
}

test('main.js creates a reset guard and only posts reset on the third click', (t) => {
    const { document, fetchCalls, scheduledTimeouts } = loadMainModule(t);
    const resetButton = document.getElementById('btn-reset');

    resetButton.click();
    resetButton.click();

    assert.equal(resetButton.textContent, 'Reset (2/3)');
    assert.equal(fetchCalls.length, 0);
    assert.equal(scheduledTimeouts.length, 2);
    assert.equal(scheduledTimeouts[0].cleared, true);

    resetButton.click();

    assert.deepEqual(fetchCalls, [{
        url: '/api/reset',
        options: { method: 'POST' }
    }]);
    assert.equal(resetButton.textContent, 'Reset (0/3)');
});

test('main.js applies update events, renders results, and plays audio for new buzzes', (t) => {
    const { document, eventSource, audio } = loadMainModule(t);

    sendUpdate(eventSource, {
        config: {
            theme: 'dark',
            buzzers: [
                { id: 'alpha', label: 'Alpha', color: '#111111' },
                { id: 'beta', label: 'Beta', color: '#f6f6f6' }
            ]
        },
        buzzes: [
            { buzzerId: 'alpha', diff: 0 },
            { buzzerId: 'beta', diff: 1250 }
        ]
    });

    const buzzerElements = [...document.querySelectorAll('.buzzer')];
    const resultItems = [...document.querySelectorAll('.result-item')];

    assert.equal(document.body.classList.contains('dark-mode'), true);
    assert.equal(document.getElementById('theme-switch').checked, true);
    assert.equal(buzzerElements.length, 2);
    assert.equal(resultItems.length, 2);
    assert.equal(audio.playCalls, 1);
    assert.equal(buzzerElements[0].classList.contains('locked'), true);
    assert.equal(buzzerElements[0].querySelector('.rank-badge').innerText, 1);
    assert.match(resultItems[0].textContent, /Alpha/);
    assert.match(resultItems[0].textContent, /WINNER/);
    assert.equal(resultItems[0].style.color, 'white');
    assert.match(resultItems[1].textContent, /\+1\.25s/);
    assert.equal(resultItems[1].style.color, 'black');
});

test('main.js posts theme changes when the theme switch is toggled', (t) => {
    const { window, document, fetchCalls } = loadMainModule(t);
    const themeSwitch = document.getElementById('theme-switch');

    themeSwitch.checked = true;
    themeSwitch.dispatchEvent(new window.Event('change', { bubbles: true }));

    assert.deepEqual(fetchCalls, [{
        url: '/api/theme',
        options: {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ theme: 'dark' })
        }
    }]);
});

test('main.js saves buzzer settings from the modal and closes it after posting', async (t) => {
    const { document, eventSource, fetchCalls } = loadMainModule(t);
    const settingsButton = document.getElementById('btn-settings');
    const addButton = document.getElementById('btn-add-buzzer');
    const saveButton = document.getElementById('btn-save-settings');
    const modal = document.getElementById('settings-modal');
    const settingsList = document.getElementById('settings-buzzers-list');

    sendUpdate(eventSource, {
        config: {
            theme: 'light',
            buzzers: [
                { id: 'alpha', label: 'Alpha', color: '#111111' }
            ]
        },
        buzzes: []
    });

    settingsButton.click();
    addButton.click();

    const rows = [...settingsList.querySelectorAll('.setting-row')];
    assert.equal(rows.length, 2);
    assert.equal(modal.classList.contains('hidden'), false);

    rows[0].querySelector('.edit-label').value = 'Team Alpha';
    rows[0].querySelector('.edit-color').value = '#123456';
    rows[1].querySelector('.edit-label').value = 'Team Beta';
    rows[1].querySelector('.edit-color').value = '#abcdef';

    saveButton.click();
    await Promise.resolve();

    assert.equal(fetchCalls.length, 1);
    assert.equal(fetchCalls[0].url, '/api/config');
    assert.equal(fetchCalls[0].options.method, 'POST');

    const payload = JSON.parse(fetchCalls[0].options.body);
    assert.deepEqual(payload.buzzers.map(({ label, color }) => ({ label, color })), [
        { label: 'Team Alpha', color: '#123456' },
        { label: 'Team Beta', color: '#abcdef' }
    ]);
    assert.equal(modal.classList.contains('hidden'), true);
});

test('main.js blocks duplicate buzz posts for buzzers that already answered', (t) => {
    const { document, eventSource, fetchCalls } = loadMainModule(t);

    sendUpdate(eventSource, {
        config: {
            theme: 'light',
            buzzers: [
                { id: 'alpha', label: 'Alpha', color: '#111111' },
                { id: 'beta', label: 'Beta', color: '#eeeeee' }
            ]
        },
        buzzes: [
            { buzzerId: 'alpha', diff: 0 }
        ]
    });

    const [alphaBuzzer, betaBuzzer] = [...document.querySelectorAll('.buzzer')];

    alphaBuzzer.click();
    betaBuzzer.click();

    assert.deepEqual(fetchCalls, [{
        url: '/api/buzz',
        options: {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: 'beta' })
        }
    }]);
});
