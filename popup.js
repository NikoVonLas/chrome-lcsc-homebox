const $ = id => document.getElementById(id);
const t = (key, ...subs) => chrome.i18n.getMessage(key, subs);

function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });
}

async function load() {
  applyI18n();
  const data = await chrome.storage.sync.get(['hbUrl', 'hbToken', 'lcscInSerial']);
  if (data.hbUrl)   $('hbUrl').value   = data.hbUrl;
  if (data.hbToken) $('hbToken').value = data.hbToken;
  $('lcscInSerial').checked = data.lcscInSerial !== false;
}

function setStatus(msg, type) {
  const el = $('status');
  el.textContent = msg;
  el.className = `status ${type}`;
}

$('btnSave').addEventListener('click', async () => {
  const hbUrl   = $('hbUrl').value.trim().replace(/\/$/, '');
  const hbToken = $('hbToken').value.trim();

  if (!hbUrl || !hbToken) {
    setStatus(t('statusFillFields'), 'error');
    return;
  }

  const lcscInSerial = $('lcscInSerial').checked;
  await chrome.storage.sync.set({ hbUrl, hbToken, lcscInSerial });
  setStatus(t('statusSaved'), 'ok');
});

$('btnTest').addEventListener('click', async () => {
  const hbUrl   = $('hbUrl').value.trim().replace(/\/$/, '');
  const hbToken = $('hbToken').value.trim();

  if (!hbUrl || !hbToken) {
    setStatus(t('statusFillFields'), 'error');
    return;
  }

  $('btnTest').disabled = true;
  setStatus(t('statusTesting'), '');

  chrome.runtime.sendMessage(
    { type: 'TEST_CONNECTION', settings: { hbUrl, hbToken } },
    (res) => {
      $('btnTest').disabled = false;
      if (chrome.runtime.lastError) {
        setStatus(t('statusError', chrome.runtime.lastError.message), 'error');
      } else if (res?.error) {
        setStatus(t('statusError', res.error), 'error');
      } else {
        setStatus(t('statusConnected', res.name), 'ok');
      }
    }
  );
});

load();
