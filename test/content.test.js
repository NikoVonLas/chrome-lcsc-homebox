/**
 * @jest-environment jsdom
 */
beforeEach(() => jest.spyOn(console, 'error').mockImplementation(() => {}));
afterEach(() => jest.restoreAllMocks());

const {
  extractCNumber, isContextValid, sendMsg,
  injectButton, setBtnLoading, removePicker, showToast,
} = require('../src/content');

// ── extractCNumber ────────────────────────────────────────────────────────────

describe('extractCNumber', () => {
  const setPath = path => window.history.pushState(null, '', path);

  test('extracts C-number from product URL', () => {
    setPath('/product-detail/C2040.html');
    expect(extractCNumber()).toBe('C2040');
  });
  test('returns null when no C-number', () => {
    setPath('/search');
    expect(extractCNumber()).toBeNull();
  });
  test('handles multi-digit numbers', () => {
    setPath('/product-detail/C123456.html');
    expect(extractCNumber()).toBe('C123456');
  });
  test('is case-insensitive', () => {
    setPath('/product-detail/c2040.html');
    expect(extractCNumber()).toBe('C2040');
  });
});

// ── isContextValid ────────────────────────────────────────────────────────────

describe('isContextValid', () => {
  test('returns true when chrome.runtime.id is set', () => {
    chrome.runtime.id = 'test-id';
    expect(isContextValid()).toBe(true);
  });
  test('returns false when chrome.runtime.id is falsy', () => {
    chrome.runtime.id = '';
    expect(isContextValid()).toBe(false);
  });
});

// ── sendMsg ───────────────────────────────────────────────────────────────────

describe('sendMsg', () => {
  test('resolves with response', async () => {
    chrome.runtime.sendMessage.mockImplementation((msg, cb) => cb({ ok: true }));
    await expect(sendMsg({ type: 'TEST' })).resolves.toEqual({ ok: true });
  });
  test('rejects on response.error', async () => {
    chrome.runtime.sendMessage.mockImplementation((msg, cb) => cb({ error: 'oops' }));
    await expect(sendMsg({ type: 'TEST' })).rejects.toThrow('oops');
  });
  test('rejects on runtime.lastError', async () => {
    chrome.runtime.sendMessage.mockImplementation((msg, cb) => {
      Object.defineProperty(chrome.runtime, 'lastError', { value: { message: 'ext err' }, configurable: true });
      cb();
      Object.defineProperty(chrome.runtime, 'lastError', { value: null, configurable: true });
    });
    await expect(sendMsg({ type: 'TEST' })).rejects.toThrow('ext err');
  });
});

// ── injectButton ──────────────────────────────────────────────────────────────

describe('injectButton', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  test('appends to body as fallback', () => {
    injectButton();
    expect(document.getElementById('hb-save-btn')).toBeTruthy();
  });
  test('appends to share container when present', () => {
    document.body.innerHTML = '<div class="absolute right-0 top-0 flex items-center"></div>';
    injectButton();
    const container = document.querySelector('.absolute');
    expect(container.querySelector('#hb-save-btn')).toBeTruthy();
  });
  test('appends after h1 when no share container', () => {
    document.body.innerHTML = '<h1>Title</h1>';
    injectButton();
    expect(document.getElementById('hb-save-btn')).toBeTruthy();
  });
  test('does not inject twice', () => {
    injectButton();
    injectButton();
    expect(document.querySelectorAll('#hb-save-btn')).toHaveLength(1);
  });
});

// ── setBtnLoading ─────────────────────────────────────────────────────────────

describe('setBtnLoading', () => {
  test('adds hb-loading class and disables pointer events', () => {
    const btn = document.createElement('span');
    setBtnLoading(btn, true);
    expect(btn.classList.contains('hb-loading')).toBe(true);
    expect(btn.style.pointerEvents).toBe('none');
  });
  test('removes hb-loading class and restores pointer events', () => {
    const btn = document.createElement('span');
    btn.classList.add('hb-loading');
    btn.style.pointerEvents = 'none';
    setBtnLoading(btn, false);
    expect(btn.classList.contains('hb-loading')).toBe(false);
    expect(btn.style.pointerEvents).toBe('');
  });
});

// ── removePicker ──────────────────────────────────────────────────────────────

describe('removePicker', () => {
  test('removes picker element if present', () => {
    const div = document.createElement('div');
    div.id = 'hb-picker';
    document.body.appendChild(div);
    removePicker();
    expect(document.getElementById('hb-picker')).toBeNull();
  });
  test('does nothing when picker absent', () => {
    expect(() => removePicker()).not.toThrow();
  });
});

// ── onSaveClick (via button click) ────────────────────────────────────────────

describe('onSaveClick', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  test('shows error toast when context is invalid', () => {
    chrome.runtime.id = '';
    injectButton();
    document.getElementById('hb-save-btn').click();
    const toast = document.getElementById('hb-toast');
    expect(toast).toBeTruthy();
    expect(toast.className).toContain('hb-toast--error');
  });

  test('shows error toast when no C-number in URL', () => {
    chrome.runtime.id = 'test-id';
    window.history.pushState(null, '', '/search');
    injectButton();
    document.getElementById('hb-save-btn').click();
    const toast = document.getElementById('hb-toast');
    expect(toast).toBeTruthy();
    expect(toast.className).toContain('hb-toast--error');
  });

  test('shows picker after successful sendMsg', async () => {
    chrome.runtime.id = 'test-id';
    window.history.pushState(null, '', '/product-detail/C2040.html');
    chrome.runtime.sendMessage.mockImplementation((msg, cb) => cb([]));
    injectButton();
    document.getElementById('hb-save-btn').click();
    await new Promise(r => setTimeout(r, 0));
    expect(document.getElementById('hb-picker')).toBeTruthy();
  });

  test('shows error toast and still shows picker when sendMsg fails', async () => {
    chrome.runtime.id = 'test-id';
    window.history.pushState(null, '', '/product-detail/C2040.html');
    chrome.runtime.sendMessage.mockImplementation((msg, cb) => cb({ error: 'network error' }));
    injectButton();
    document.getElementById('hb-save-btn').click();
    await new Promise(r => setTimeout(r, 0));
    expect(document.getElementById('hb-picker')).toBeTruthy();
    expect(document.getElementById('hb-toast')).toBeTruthy();
  });
});

// ── showPicker (via picker buttons) ───────────────────────────────────────────

describe('showPicker', () => {
  async function openPicker(locations = []) {
    document.body.innerHTML = '';
    chrome.runtime.id = 'test-id';
    window.history.pushState(null, '', '/product-detail/C2040.html');
    chrome.runtime.sendMessage.mockImplementation((msg, cb) => {
      if (msg.type === 'GET_LOCATIONS') cb(locations);
    });
    injectButton();
    document.getElementById('hb-save-btn').click();
    await new Promise(r => setTimeout(r, 0));
  }

  test('cancel button removes picker and re-enables button', async () => {
    await openPicker();
    document.querySelector('.hb-picker-cancel').click();
    expect(document.getElementById('hb-picker')).toBeNull();
    expect(document.getElementById('hb-save-btn').style.pointerEvents).toBe('');
  });

  test('populates select with location options', async () => {
    await openPicker([{ id: '1', name: 'Room' }]);
    const options = document.querySelectorAll('#hb-loc-select option');
    expect(options.length).toBe(2);
    expect(options[1].value).toBe('1');
  });

  test('save sends SAVE_TO_HOMEBOX and shows success toast with link', async () => {
    await openPicker();
    chrome.runtime.sendMessage.mockImplementation((msg, cb) => {
      if (msg.type === 'SAVE_TO_HOMEBOX') cb({ success: true, itemUrl: 'http://box/item/1' });
    });
    document.querySelector('.hb-picker-save').click();
    await new Promise(r => setTimeout(r, 0));
    const toast = document.getElementById('hb-toast');
    expect(toast).toBeTruthy();
    expect(toast.className).toContain('hb-toast--success');
    expect(toast.querySelector('a')).toBeTruthy();
  });

  test('save shows error toast when SAVE_TO_HOMEBOX fails', async () => {
    await openPicker();
    chrome.runtime.sendMessage.mockImplementation((msg, cb) => cb({ error: 'save failed' }));
    document.querySelector('.hb-picker-save').click();
    await new Promise(r => setTimeout(r, 0));
    expect(document.getElementById('hb-toast').className).toContain('hb-toast--error');
  });

  test('save passes selected locationId in message', async () => {
    await openPicker([{ id: 'loc99', name: 'Shelf' }]);
    document.getElementById('hb-loc-select').value = 'loc99';
    chrome.runtime.sendMessage.mockImplementation((msg, cb) => {
      if (msg.type === 'SAVE_TO_HOMEBOX') {
        expect(msg.locationId).toBe('loc99');
        cb({ success: true, itemUrl: 'http://box/item/x' });
      }
    });
    document.querySelector('.hb-picker-save').click();
    await new Promise(r => setTimeout(r, 0));
  });
});

// ── showToast ─────────────────────────────────────────────────────────────────

describe('showToast', () => {
  beforeEach(() => { document.getElementById('hb-toast')?.remove(); });

  test('appends toast with message', () => {
    showToast('hello', 'success');
    const toast = document.getElementById('hb-toast');
    expect(toast).toBeTruthy();
    expect(toast.textContent).toContain('hello');
  });
  test('applies type class', () => {
    showToast('msg', 'error');
    expect(document.getElementById('hb-toast').className).toContain('hb-toast--error');
  });
  test('appends link when provided', () => {
    showToast('saved', 'success', 'http://box/item/1');
    const link = document.getElementById('hb-toast').querySelector('a');
    expect(link).toBeTruthy();
    expect(link.href).toBe('http://box/item/1');
  });
  test('replaces existing toast', () => {
    showToast('first', 'success');
    showToast('second', 'success');
    expect(document.querySelectorAll('#hb-toast')).toHaveLength(1);
    expect(document.getElementById('hb-toast').textContent).toContain('second');
  });
});
