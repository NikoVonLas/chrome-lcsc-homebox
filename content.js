const BTN_ID    = 'hb-save-btn';
const TOAST_ID  = 'hb-toast';
const PICKER_ID = 'hb-picker';
const t = (key, ...subs) => chrome.i18n.getMessage(key, subs);

const HB_ICON = `<svg viewBox="0 0 10817 9730" xmlns="http://www.w3.org/2000/svg" xml:space="preserve" style="fill-rule:evenodd;clip-rule:evenodd;stroke-linecap:round;stroke-linejoin:round;stroke-miterlimit:5.42683;width:100%;height:100%"><path d="M9310.16 2560.9c245.302 249.894 419.711 539.916 565.373 845.231 47.039 98.872 36.229 215.514-28.2 304.05-64.391 88.536-172.099 134.676-280.631 120.28 0 .053-.039.053-.039.053" style="fill:gray;stroke:#000;stroke-width:206.41px"/><path d="M5401.56 487.044c-127.958 6.227-254.855 40.77-370.992 103.628-765.271 414.225-2397.45 1297.68-3193.03 1728.32-137.966 74.669-250.327 183.605-328.791 313.046l3963.09 2122.43s-249.048 416.428-470.593 786.926c-189.24 316.445-592.833 429.831-919.198 258.219l-2699.36-1419.32v2215.59c0 226.273 128.751 435.33 337.755 548.466 764.649 413.885 2620.97 1418.66 3385.59 1832.51 209.018 113.137 466.496 113.137 675.514 0 764.623-413.857 2620.94-1418.63 3385.59-1832.51 208.989-113.136 337.743-322.193 337.743-548.466v-3513.48c0-318.684-174.59-611.722-454.853-763.409-795.543-430.632-2427.75-1314.09-3193.02-1728.32-141.693-76.684-299.364-111.227-455.442-103.628" style="fill:#dadada;stroke:#000;stroke-width:206.42px"/><path d="M5471.83 4754.46V504.71c-127.958 6.226-325.127 23.1-441.264 85.958-765.271 414.225-2397.45 1297.68-3193.03 1728.32-137.966 74.669-250.327 183.605-328.791 313.046l3963.09 2122.43Z" style="fill:gray;stroke:#000;stroke-width:206.42px"/><path d="m1459.34 2725.96-373.791 715.667c-177.166 339.292-46.417 758 292.375 936.167l4.75 2.5 2699.37 1419.29c326.374 171.625 729.916 58.25 919.165-258.208 221.542-370.5 470.583-786.917 470.583-786.917l-3963.04-2122.42-2.167 3.458-47.25 90.458" style="fill:#dadada;stroke:#000;stroke-width:206.42px"/><path d="M5443.74 520.879v4149.79" style="fill:none;stroke:#000;stroke-width:153.5px"/><path class="hb-fill-primary" d="M8951.41 4102.72c0-41.65-22.221-80.136-58.291-100.961-36.069-20.825-80.51-20.825-116.58 0l-2439.92 1408.69c-36.07 20.825-58.29 59.311-58.29 100.961V7058c0 41.65 22.22 80.136 58.29 100.961 36.07 20.825 80.51 20.825 116.58 0l2439.92-1408.69c36.07-20.825 58.291-59.312 58.291-100.962v-1546.59Z"/><path d="M8951.41 4102.72c0-41.65-22.221-80.136-58.291-100.961-36.069-20.825-80.51-20.825-116.58 0l-2439.92 1408.69c-36.07 20.825-58.29 59.311-58.29 100.961V7058c0 41.65 22.22 80.136 58.29 100.961 36.07 20.825 80.51 20.825 116.58 0l2439.92-1408.69c36.07-20.825 58.291-59.312 58.291-100.962v-1546.59ZM6463.98 5551.29v1387.06l2301.77-1328.92V4222.37L6463.98 5551.29Z"/><path d="M5443.76 9041.74v-4278.4" style="fill:none;stroke:#000;stroke-width:206.44px;stroke-linejoin:miter"/><path d="m5471.79 4773.86 3829.35-2188.22" style="fill:none;stroke:#000;stroke-width:206.43px;stroke-linejoin:miter"/></svg>`;

function extractCNumber() {
  const match = location.pathname.match(/C(\d+)/i);
  return match ? `C${match[1]}` : null;
}

function isContextValid() {
  try { return !!(chrome?.runtime?.id); } catch { return false; }
}

function sendMsg(msg) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(msg, (response) => {
      const err = chrome.runtime?.lastError;
      if (err) return reject(new Error(err.message));
      if (response?.error) return reject(new Error(response.error));
      resolve(response);
    });
  });
}

function injectButton() {
  if (document.getElementById(BTN_ID)) return;

  const btn = document.createElement('span');
  btn.id = BTN_ID;
  btn.setAttribute('role', 'button');
  btn.title = t('btnTitleSave');
  btn.innerHTML = HB_ICON;
  btn.addEventListener('click', onSaveClick);

  // Встаём рядом с кнопкой шеринга (Copy Link) — контейнер top-right над заголовком
  const shareContainer = document.querySelector('div.absolute.right-0.top-0.flex.items-center');
  if (shareContainer) {
    shareContainer.appendChild(btn);
  } else {
    // fallback: рядом с h1
    const h1 = document.querySelector('h1');
    if (h1) h1.insertAdjacentElement('afterend', btn);
    else document.body.insertAdjacentElement('afterbegin', btn);
  }
}

function setBtnLoading(btn, loading) {
  if (loading) {
    btn.classList.add('hb-loading');
    btn.style.pointerEvents = 'none';
  } else {
    btn.classList.remove('hb-loading');
    btn.style.pointerEvents = '';
    btn.innerHTML = HB_ICON; // восстанавливаем SVG на случай если был текст
  }
}

async function onSaveClick() {
  if (!isContextValid()) {
    showToast(t('toastReload'), 'error');
    return;
  }

  const cNumber = extractCNumber();
  if (!cNumber) {
    showToast(t('toastNoCNumber'), 'error');
    return;
  }

  const btn = document.getElementById(BTN_ID);
  setBtnLoading(btn, true);

  let locations = [];
  try {
    locations = await sendMsg({ type: 'GET_LOCATIONS' });
  } catch (err) {
    // Показываем диагностику но не блокируем — picker откроется с пустым списком
    showToast(err.message, 'error');
  }

  setBtnLoading(btn, false);
  showPicker(btn, locations, cNumber);
}

function showPicker(anchorBtn, locations, cNumber) {
  removePicker();

  const picker = document.createElement('div');
  picker.id = PICKER_ID;

  const select = document.createElement('select');
  select.id = 'hb-loc-select';

  const optNone = document.createElement('option');
  optNone.value = '';
  optNone.textContent = t('pickerNoLocation');
  select.appendChild(optNone);

  for (const loc of locations) {
    const opt = document.createElement('option');
    opt.value = loc.id;
    opt.textContent = loc.name;
    select.appendChild(opt);
  }

  const saveBtn = document.createElement('button');
  saveBtn.textContent = t('pickerSave');
  saveBtn.className = 'hb-picker-save';

  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = t('pickerCancel');
  cancelBtn.className = 'hb-picker-cancel';
  cancelBtn.addEventListener('click', () => { removePicker(); setBtnLoading(anchorBtn, false); });

  saveBtn.addEventListener('click', async () => {
    saveBtn.disabled = true;
    saveBtn.textContent = '⏳';

    const locationId = select.value || null;

    removePicker();
    setBtnLoading(anchorBtn, true);

    try {
      const response = await sendMsg({ type: 'SAVE_TO_HOMEBOX', cNumber, locationId });
      if (response?.success) showToast(t('toastSaved'), 'success', response.itemUrl);
    } catch (err) {
      showToast(t('toastError', err.message), 'error');
    } finally {
      setBtnLoading(anchorBtn, false);
    }
  });

  picker.appendChild(select);
  picker.appendChild(saveBtn);
  picker.appendChild(cancelBtn);

  // Picker — в конец родителя контейнера шеринга
  const shareContainer = document.querySelector('div.absolute.right-0.top-0.flex.items-center');
  const parent = shareContainer?.parentElement || anchorBtn.parentElement || document.body;
  parent.appendChild(picker);
}

function removePicker() {
  document.getElementById(PICKER_ID)?.remove();
}

function showToast(message, type, link) {
  const existing = document.getElementById(TOAST_ID);
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = TOAST_ID;
  toast.className = `hb-toast hb-toast--${type}`;

  const text = document.createElement('span');
  text.textContent = message;
  toast.appendChild(text);

  if (link) {
    const a = document.createElement('a');
    a.href = link;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = 'Открыть';
    toast.appendChild(a);
  }

  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 6000);
}

if (document.readyState === 'complete' || document.readyState === 'interactive') {
  injectButton();
} else {
  document.addEventListener('DOMContentLoaded', injectButton);
}

// SPA-навигация
let lastUrl = location.href;
new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    document.getElementById(BTN_ID)?.remove();
    removePicker();
    if (/\/product-detail\//i.test(location.pathname)) {
      setTimeout(injectButton, 800);
    }
  }
}).observe(document.body, { childList: true, subtree: true });
