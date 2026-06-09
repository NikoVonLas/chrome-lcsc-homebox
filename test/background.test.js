global.fetch = jest.fn();
chrome.scripting = { executeScript: jest.fn() };

const {
  sanitize, stripHtml, buildItemName, buildNotes, flattenLocations,
  getSettings, apiFetch, testConnection, getLocations,
  saveToHomebox, uploadAttachment, fetchLcscViaTab, _pageScript,
} = require('../src/background');

// Capture the message listener before any mock resets
let messageListener;
beforeAll(() => {
  messageListener = chrome.runtime.onMessage.addListener.mock.calls[0][0];
});

// resetAllMocks clears both call history and queued once-mocks
beforeEach(() => jest.resetAllMocks());

// ── sanitize ──────────────────────────────────────────────────────────────────

describe('sanitize', () => {
  test('strips non-ASCII', () => expect(sanitize('héllo')).toBe('hllo'));
  test('trims whitespace', () => expect(sanitize('  hi  ')).toBe('hi'));
  test('handles null', () => expect(sanitize(null)).toBe(''));
  test('handles undefined', () => expect(sanitize(undefined)).toBe(''));
  test('keeps printable ASCII', () => expect(sanitize('abc 123')).toBe('abc 123'));
});

// ── stripHtml ─────────────────────────────────────────────────────────────────

describe('stripHtml', () => {
  test('removes tags', () => expect(stripHtml('<b>text</b>')).toBe('text'));
  test('normalizes spaces', () => expect(stripHtml('a   b')).toBe('a b'));
  test('handles nested tags', () => expect(stripHtml('<div><b>x</b></div>')).toBe('x'));
  test('handles unclosed tag', () => expect(stripHtml('<b unclosed')).toBe(''));
  test('handles null', () => expect(stripHtml(null)).toBe(''));
  test('handles empty string', () => expect(stripHtml('')).toBe(''));
});

// ── buildItemName ─────────────────────────────────────────────────────────────

describe('buildItemName', () => {
  test('prefers productModel', () =>
    expect(buildItemName({ productModel: 'STM32', productCode: 'C123' })).toBe('STM32'));
  test('falls back to productCode', () =>
    expect(buildItemName({ productCode: 'C123' })).toBe('C123'));
});

// ── buildNotes ────────────────────────────────────────────────────────────────

describe('buildNotes', () => {
  test('includes packaging', () =>
    expect(buildNotes({ encapStandard: 'SMD-0402', paramVOList: [] }))
      .toContain('Packaging: SMD-0402'));
  test('includes param with unit', () => {
    const notes = buildNotes({ paramVOList: [{ paramNameEn: 'V', paramValueEn: '3.3', paramUnit: 'V' }] });
    expect(notes).toContain('V: 3.3 V');
  });
  test('uses paramDetailValue over computed value', () => {
    const notes = buildNotes({ paramVOList: [{ paramNameEn: 'D', paramDetailValue: '<b>val</b>' }] });
    expect(notes).toContain('D: val');
  });
  test('skips empty params', () =>
    expect(buildNotes({ paramVOList: [{ paramNameEn: 'X', paramValueEn: '' }] })).toBe(''));
  test('handles empty product', () => expect(buildNotes({})).toBe(''));
  test('strips HTML from packaging', () =>
    expect(buildNotes({ encapStandard: '<b>DIP</b>', paramVOList: [] }))
      .toContain('Packaging: DIP'));
});

// ── flattenLocations ──────────────────────────────────────────────────────────

describe('flattenLocations', () => {
  test('returns flat list', () =>
    expect(flattenLocations([{ id: '1', name: 'Room', children: [] }]))
      .toEqual([{ id: '1', name: 'Room' }]));
  test('flattens children with prefix', () => {
    const result = flattenLocations([{
      id: '1', name: 'Room',
      children: [{ id: '2', name: 'Shelf', children: [] }],
    }]);
    expect(result).toEqual([{ id: '1', name: 'Room' }, { id: '2', name: 'Room / Shelf' }]);
  });
  test('uses prefix argument', () =>
    expect(flattenLocations([{ id: '1', name: 'A', children: [] }], 'Root')[0].name)
      .toBe('Root / A'));
  test('skips null entries', () =>
    expect(flattenLocations([null, { id: '1', name: 'V', children: [] }])).toHaveLength(1));
  test('skips entries without id or name', () =>
    expect(flattenLocations([{ name: 'NoId' }, { id: '1' }])).toHaveLength(0));
  test('supports capitalized keys', () =>
    expect(flattenLocations([{ ID: '1', Name: 'Room', Children: [] }]))
      .toEqual([{ id: '1', name: 'Room' }]));
});

// ── getSettings ───────────────────────────────────────────────────────────────

describe('getSettings', () => {
  test('returns sanitized settings', async () => {
    chrome.storage.sync.get.mockImplementation((k, cb) =>
      cb({ hbUrl: 'http://box', hbToken: 'tok', lcscInSerial: true }));
    await expect(getSettings()).resolves.toEqual({ hbUrl: 'http://box', hbToken: 'tok', lcscInSerial: true });
  });
  test('lcscInSerial defaults to true', async () => {
    chrome.storage.sync.get.mockImplementation((k, cb) => cb({}));
    expect((await getSettings()).lcscInSerial).toBe(true);
  });
  test('lcscInSerial respects explicit false', async () => {
    chrome.storage.sync.get.mockImplementation((k, cb) => cb({ lcscInSerial: false }));
    expect((await getSettings()).lcscInSerial).toBe(false);
  });
});

// ── apiFetch ──────────────────────────────────────────────────────────────────

describe('apiFetch', () => {
  test('returns response on ok', async () => {
    const res = { ok: true };
    global.fetch.mockResolvedValue(res);
    await expect(apiFetch('http://test/')).resolves.toBe(res);
  });
  test('throws on non-ok with status and body', async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 404, text: () => Promise.resolve('Not Found') });
    await expect(apiFetch('http://test/')).rejects.toThrow('HTTP 404');
  });
});

// ── testConnection ────────────────────────────────────────────────────────────

describe('testConnection', () => {
  test('returns ok with name', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ name: 'Denis' }) });
    await expect(testConnection({ hbUrl: 'http://box', hbToken: 'tok' }))
      .resolves.toEqual({ ok: true, name: 'Denis' });
  });
  test('falls back to email', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ email: 'a@b.com' }) });
    expect((await testConnection({ hbUrl: 'http://box', hbToken: 'tok' })).name).toBe('a@b.com');
  });
  test('falls back to OK string', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
    expect((await testConnection({ hbUrl: 'http://box', hbToken: 'tok' })).name).toBe('OK');
  });
  test('throws when settings empty', async () => {
    await expect(testConnection({ hbUrl: '', hbToken: '' })).rejects.toThrow();
  });
});

// ── getLocations ──────────────────────────────────────────────────────────────

describe('getLocations', () => {
  const mockStorage = (data = { hbUrl: 'http://box', hbToken: 'tok' }) =>
    chrome.storage.sync.get.mockImplementation((k, cb) => cb(data));

  test('returns flattened list', async () => {
    mockStorage();
    global.fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve([{ id: '1', name: 'Room', children: [] }]) });
    await expect(getLocations()).resolves.toEqual([{ id: '1', name: 'Room' }]);
  });
  test('handles data.items wrapper', async () => {
    mockStorage();
    global.fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ items: [{ id: '2', name: 'Shelf', children: [] }] }) });
    expect((await getLocations())[0].id).toBe('2');
  });
  test('throws when not configured', async () => {
    mockStorage({ hbUrl: '', hbToken: '' });
    await expect(getLocations()).rejects.toThrow();
  });
});

// ── fetchLcscViaTab ───────────────────────────────────────────────────────────

describe('fetchLcscViaTab', () => {
  test('throws when tabId is null', async () => {
    await expect(fetchLcscViaTab(null, 'C2040')).rejects.toThrow();
  });
  test('throws when result is null', async () => {
    chrome.scripting.executeScript.mockResolvedValue([{ result: null }]);
    await expect(fetchLcscViaTab(1, 'C2040')).rejects.toThrow();
  });
  test('throws when result.ok is false', async () => {
    chrome.scripting.executeScript.mockResolvedValue([{ result: { ok: false, error: 'not found' } }]);
    await expect(fetchLcscViaTab(1, 'C2040')).rejects.toThrow('not found');
  });
  test('returns data on success', async () => {
    const product = { productCode: 'C2040' };
    chrome.scripting.executeScript.mockResolvedValue([{ result: { ok: true, data: product } }]);
    await expect(fetchLcscViaTab(1, 'C2040')).resolves.toEqual(product);
  });
});

// ── _pageScript ───────────────────────────────────────────────────────────────

describe('_pageScript', () => {
  const product = { productCode: 'C2040', paramVOList: [] };

  afterEach(() => {
    delete globalThis.__NEXT_DATA__;
    delete globalThis.__NUXT__;
    delete globalThis.__INITIAL_STATE__;
    delete globalThis.__STORE__;
  });

  test('finds product directly in __NEXT_DATA__.props', () => {
    globalThis.__NEXT_DATA__ = { props: { ...product } };
    expect(_pageScript('C2040')).toEqual({ ok: true, data: product });
  });

  test('finds product nested inside __NEXT_DATA__.props', () => {
    globalThis.__NEXT_DATA__ = { props: { pageProps: { ...product } } };
    expect(_pageScript('C2040')).toEqual({ ok: true, data: product });
  });

  test('returns error when __NEXT_DATA__ has no matching product', () => {
    globalThis.__NEXT_DATA__ = { props: { other: 'data' } };
    const result = _pageScript('C9999');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('NEXT_DATA');
  });

  test('finds product in __NUXT__', () => {
    globalThis.__NUXT__ = { ...product };
    expect(_pageScript('C2040')).toEqual({ ok: true, data: product });
  });

  test('finds product in __INITIAL_STATE__', () => {
    globalThis.__INITIAL_STATE__ = { ...product };
    expect(_pageScript('C2040')).toEqual({ ok: true, data: product });
  });

  test('finds product in __STORE__', () => {
    globalThis.__STORE__ = { ...product };
    expect(_pageScript('C2040')).toEqual({ ok: true, data: product });
  });

  test('returns No page data error when nothing found', () => {
    const result = _pageScript('C0000');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('No page data');
  });

  test('falls through to No page data when __NUXT__ has no matching product', () => {
    globalThis.__NUXT__ = { other: 'data' };
    const result = _pageScript('C9999');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('No page data');
  });

  test('returns error on exception', () => {
    Object.defineProperty(globalThis, '__NEXT_DATA__', {
      get() { throw new Error('access denied'); },
      configurable: true,
    });
    const result = _pageScript('C0000');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('access denied');
  });

  test('stops recursion at depth > 10 and reports not found', () => {
    let nested = { productCode: 'C2040' };
    for (let i = 0; i < 11; i++) nested = { child: nested };
    globalThis.__NEXT_DATA__ = { props: nested };
    const result = _pageScript('C2040');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('NEXT_DATA');
  });
});

// ── uploadAttachment ──────────────────────────────────────────────────────────

describe('uploadAttachment', () => {
  test('returns early on network error (catch branch)', async () => {
    global.fetch.mockRejectedValue(new Error('network'));
    await expect(uploadAttachment('http://box', 'tok', 'id', 'http://img', 'f.jpg', 'photo', true))
      .resolves.toBeUndefined();
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
  test('returns early when file fetch not ok', async () => {
    global.fetch.mockResolvedValue({ ok: false });
    await expect(uploadAttachment('http://box', 'tok', 'id', 'http://img', 'f.jpg', 'photo', true))
      .resolves.toBeUndefined();
  });
  test('downloads and uploads, calls upload endpoint', async () => {
    global.fetch
      .mockResolvedValueOnce({ ok: true, blob: () => Promise.resolve(new Blob(['x'])) })
      .mockResolvedValueOnce({ ok: true });
    await uploadAttachment('http://box', 'tok', 'id', 'http://img', 'f.jpg', 'photo', true);
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(global.fetch.mock.calls[1][0]).toContain('/attachments');
  });
  test('upload without primary flag omits primary field', async () => {
    global.fetch
      .mockResolvedValueOnce({ ok: true, blob: () => Promise.resolve(new Blob(['x'])) })
      .mockResolvedValueOnce({ ok: true });
    await uploadAttachment('http://box', 'tok', 'id', 'http://img', 'f.jpg', 'photo', false);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});

// ── message listener ─────────────────────────────────────────────────────────

describe('message listener', () => {
  test('handles GET_LOCATIONS and returns true', () => {
    chrome.storage.sync.get.mockImplementation((k, cb) =>
      cb({ hbUrl: 'http://box', hbToken: 'tok' }));
    global.fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve([]) });
    const result = messageListener({ type: 'GET_LOCATIONS' }, {}, jest.fn());
    expect(result).toBe(true);
  });

  test('handles TEST_CONNECTION and returns true', () => {
    global.fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ name: 'X' }) });
    const result = messageListener({ type: 'TEST_CONNECTION', settings: { hbUrl: 'http://box', hbToken: 'tok' } }, {}, jest.fn());
    expect(result).toBe(true);
  });

  test('handles SAVE_TO_HOMEBOX and returns true', () => {
    chrome.storage.sync.get.mockImplementation((k, cb) =>
      cb({ hbUrl: 'http://box', hbToken: 'tok', lcscInSerial: false }));
    chrome.scripting.executeScript.mockResolvedValue([{ result: { ok: true, data: { productCode: 'C1', paramVOList: [], productImages: [] } } }]);
    global.fetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ id: 'x' }) })
      .mockResolvedValueOnce({ ok: true });
    const result = messageListener({ type: 'SAVE_TO_HOMEBOX', cNumber: 'C1', locationId: null }, { tab: { id: 1 } }, jest.fn());
    expect(result).toBe(true);
  });

  test('SAVE_TO_HOMEBOX calls sendResponse with error when chain rejects', async () => {
    chrome.scripting.executeScript.mockResolvedValue([{ result: null }]);
    const sendResponse = jest.fn();
    messageListener({ type: 'SAVE_TO_HOMEBOX', cNumber: 'C1', locationId: null }, { tab: { id: 1 } }, sendResponse);
    await new Promise(r => setTimeout(r, 0));
    expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));
  });
});

// ── saveToHomebox ─────────────────────────────────────────────────────────────

describe('saveToHomebox', () => {
  beforeEach(() => {
    chrome.storage.sync.get.mockImplementation((k, cb) =>
      cb({ hbUrl: 'http://box', hbToken: 'tok', lcscInSerial: true }));
  });

  test('creates entity and returns itemUrl', async () => {
    global.fetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ id: 'abc123' }) })
      .mockResolvedValueOnce({ ok: true });
    const result = await saveToHomebox(
      { productCode: 'C2040', productModel: 'LM358', productDescEn: '', brandNameEn: 'TI', paramVOList: [], productImages: [] },
      null,
    );
    expect(result).toEqual({ success: true, itemUrl: 'http://box/item/abc123' });
  });

  test('includes parentId when locationId given', async () => {
    global.fetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ id: 'xyz' }) })
      .mockResolvedValueOnce({ ok: true });
    await saveToHomebox({ productCode: 'C1', paramVOList: [], productImages: [] }, 'loc-99');
    const putBody = JSON.parse(global.fetch.mock.calls[1][1].body);
    expect(putBody.parentId).toBe('loc-99');
  });

  test('sets serialNumber when lcscInSerial is true', async () => {
    global.fetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ id: 'x' }) })
      .mockResolvedValueOnce({ ok: true });
    await saveToHomebox({ productCode: 'C99', paramVOList: [], productImages: [] }, null);
    const putBody = JSON.parse(global.fetch.mock.calls[1][1].body);
    expect(putBody.serialNumber).toBe('LCSC:C99');
  });

  test('uploads images and pdf when present', async () => {
    global.fetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ id: 'id2' }) }) // POST create
      .mockResolvedValueOnce({ ok: true })                                               // PUT update
      .mockResolvedValueOnce({ ok: true, blob: () => Promise.resolve(new Blob(['img'])) }) // image download
      .mockResolvedValueOnce({ ok: true })                                               // image upload
      .mockResolvedValueOnce({ ok: true, blob: () => Promise.resolve(new Blob(['pdf'])) }) // pdf download
      .mockResolvedValueOnce({ ok: true });                                              // pdf upload
    const result = await saveToHomebox(
      { productCode: 'C3', paramVOList: [], productImages: ['http://img1'], pdfUrl: 'http://pdf1' },
      null,
    );
    expect(result.success).toBe(true);
  });

  test('uses productImageUrl fallback when productImages empty', async () => {
    global.fetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ id: 'id3' }) })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false }); // image fetch fails gracefully
    const result = await saveToHomebox(
      { productCode: 'C4', paramVOList: [], productImages: [], productImageUrl: 'http://fallback' },
      null,
    );
    expect(result.success).toBe(true);
  });

  test('throws when not configured', async () => {
    chrome.storage.sync.get.mockImplementation((k, cb) => cb({ hbUrl: '', hbToken: '' }));
    await expect(saveToHomebox({}, null)).rejects.toThrow();
  });
});
