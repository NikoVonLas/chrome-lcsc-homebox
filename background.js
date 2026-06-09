const HOMEBOX_TIMEOUT_MS = 30000;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'SAVE_TO_HOMEBOX') {
    const tabId = sender.tab?.id;
    fetchLcscViaTab(tabId, msg.cNumber)
      .then(product => saveToHomebox(product, msg.locationId))
      .then(sendResponse)
      .catch(err => sendResponse({ error: err.message }));
    return true;
  }
  if (msg.type === 'GET_LOCATIONS') {
    getLocations().then(sendResponse).catch(err => sendResponse({ error: err.message }));
    return true;
  }
  if (msg.type === 'TEST_CONNECTION') {
    testConnection(msg.settings).then(sendResponse).catch(err => sendResponse({ error: err.message }));
    return true;
  }
});

const t = (key, ...subs) => chrome.i18n.getMessage(key, subs);

// ── LCSC ─────────────────────────────────────────────────────────────────────

async function fetchLcscViaTab(tabId, cNumber) {
  if (!tabId) throw new Error(t('errNoTab'));
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: (code) => {
      function findInObj(obj, depth) {
        if (depth > 10 || !obj || typeof obj !== 'object') return null;
        if (obj.productCode === code) return obj;
        for (const v of Object.values(obj)) {
          const r = findInObj(v, depth + 1);
          if (r) return r;
        }
        return null;
      }
      try {
        const nd = globalThis.__NEXT_DATA__;
        if (nd) {
          const p = findInObj(nd.props, 0);
          if (p) return { ok: true, data: p };
          return { ok: false, error: 'NEXT_DATA: product not found. props keys: ' + Object.keys(nd.props || {}).join(', ') };
        }
        const nuxt = globalThis.__NUXT__ || globalThis.__INITIAL_STATE__ || globalThis.__STORE__;
        if (nuxt) {
          const p = findInObj(nuxt, 0);
          if (p) return { ok: true, data: p };
        }
        const globals = Object.keys(globalThis).filter(k => k.startsWith('__')).slice(0, 20).join(', ');
        return { ok: false, error: 'No page data. Globals: ' + globals };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    },
    args: [cNumber],
  });
  const res = results[0]?.result;
  if (!res) throw new Error(`executeScript вернул null: ${JSON.stringify(results[0]?.error)}`);
  if (!res.ok) throw new Error(res.error);
  return res.data;
}

// ── Homebox API ───────────────────────────────────────────────────────────────

function sanitize(str) {
  return (str || '').replace(/[^\x20-\x7E]/g, '').trim();
}

async function getSettings() {
  return new Promise(resolve => chrome.storage.sync.get(['hbUrl', 'hbToken', 'lcscInSerial'], data => {
    resolve({
      hbUrl: sanitize(data.hbUrl),
      hbToken: sanitize(data.hbToken),
      lcscInSerial: data.lcscInSerial !== false, // по умолчанию true
    });
  }));
}

async function apiFetch(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HOMEBOX_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
    return res;
  } finally {
    clearTimeout(timer);
  }
}

async function testConnection(settings) {
  const hbUrl   = sanitize(settings.hbUrl);
  const hbToken = sanitize(settings.hbToken);
  if (!hbUrl || !hbToken) throw new Error(t('errSettingsEmpty'));
  const base = hbUrl.replace(/\/$/, '');
  const res = await apiFetch(`${base}/api/v1/users/self`, {
    headers: { Authorization: `Bearer ${hbToken}` },
  });
  const data = await res.json();
  return { ok: true, name: data.name || data.email || 'OK' };
}

// v0.26+: локации и айтемы — единый /entities. Дерево без withItems = только контейнеры.
async function getLocations() {
  const { hbUrl, hbToken } = await getSettings();
  if (!hbUrl || !hbToken) throw new Error(t('errConfigure'));
  const base = hbUrl.replace(/\/$/, '');
  const headers = { Authorization: `Bearer ${hbToken}` };

  const res = await apiFetch(`${base}/api/v1/entities/tree`, { headers });
  const data = await res.json();
  const list = Array.isArray(data) ? data : (data.items || []);
  return flattenLocations(list);
}

function flattenLocations(list, prefix) {
  const result = [];
  for (const loc of list) {
    if (!loc) continue;
    const id   = loc.id   ?? loc.ID;
    const name = loc.name ?? loc.Name ?? '';
    if (!id || !name) continue;
    const label = prefix ? `${prefix} / ${name}` : name;
    result.push({ id, name: label });
    const children = loc.children ?? loc.Children ?? [];
    if (children.length) result.push(...flattenLocations(children, label));
  }
  return result;
}


async function saveToHomebox(product, locationId) {
  const { hbUrl, hbToken, lcscInSerial } = await getSettings();
  if (!hbUrl || !hbToken) throw new Error(t('errConfigure'));
  const base = hbUrl.replace(/\/$/, '');
  const headers = { Authorization: `Bearer ${hbToken}`, 'Content-Type': 'application/json' };

  const createBody = {
    name: buildItemName(product),
    description: product.productDescEn || '',
    quantity: 0,
  };
  if (locationId) createBody.parentId = locationId;

  const createRes = await apiFetch(`${base}/api/v1/entities`, {
    method: 'POST',
    headers,
    body: JSON.stringify(createBody),
  });
  const entity = await createRes.json();
  const entityId = entity.id;

  const updateBody = {
    name: createBody.name,
    description: product.productDescEn || '',
    manufacturer: product.brandNameEn || '',
    modelNumber: product.productModel || '',
    notes: buildNotes(product),
    quantity: 0,
  };
  if (locationId) updateBody.parentId = locationId;
  if (lcscInSerial && product.productCode) updateBody.serialNumber = `LCSC:${product.productCode}`;

  await apiFetch(`${base}/api/v1/entities/${entityId}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(updateBody),
  });

  const images = product.productImages?.length
    ? product.productImages
    : [product.productImageUrlBig || product.productImageUrl].filter(Boolean);
  for (let i = 0; i < images.length; i++) {
    await uploadAttachment(base, hbToken, entityId, images[i], `${product.productCode}_photo_${i + 1}`, 'photo', i === 0);
  }

  if (product.pdfUrl) {
    await uploadAttachment(base, hbToken, entityId, product.pdfUrl, `${product.productCode}_datasheet.pdf`, 'manual', false);
  }

  return { success: true, itemUrl: `${base}/item/${entityId}` };
}

async function uploadAttachment(base, token, entityId, fileUrl, filename, type, primary) {
  let blob;
  try {
    const res = await fetch(fileUrl);
    if (!res.ok) return;
    blob = await res.blob();
  } catch {
    return;
  }

  const form = new FormData();
  form.append('file', blob, filename);
  form.append('name', filename);
  form.append('type', type);
  if (primary) form.append('primary', 'true');

  await apiFetch(`${base}/api/v1/entities/${entityId}/attachments`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  }).catch(() => {});
}

function stripHtml(str) {
  return (str || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

function buildItemName(p) {
  return p.productModel || p.productCode;
}

function buildNotes(p) {
  const lines = [];

  if (p.encapStandard) lines.push(`Packaging: ${stripHtml(p.encapStandard)}`);

  for (const param of p.paramVOList || []) {
    const val = stripHtml(
      param.paramDetailValue || `${param.paramValueEn || ''}${param.paramUnit ? ' ' + param.paramUnit : ''}`
    );
    if (val) lines.push(`${stripHtml(param.paramNameEn)}: ${val}`);
  }

  return lines.join('  \n');
}
