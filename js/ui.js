import { esc, $ } from './utils.js';

/* ------------------------------ Íconos ------------------------------ */
const P = {
  home: '<rect x="3" y="3" width="7" height="9" rx="2"/><rect x="14" y="3" width="7" height="5" rx="2"/><rect x="14" y="12" width="7" height="9" rx="2"/><rect x="3" y="16" width="7" height="5" rx="2"/>',
  briefcase: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
  cap: '<path d="M22 10 12 5 2 10l10 5 10-5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>',
  heart: '<path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7Z"/>',
  wallet: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  left: '<path d="m15 18-6-6 6-6"/>',
  right: '<path d="m9 18 6-6-6-6"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  undo: '<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-15-6.7L3 13"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  cal: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
  note: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
  star: '<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8-6.2-3.2L5.8 21 7 14.2 2 9.3l6.9-1z"/>',
  trend: '<path d="m22 7-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5M12 3v12"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
};
export const icon = (n, s = 20) =>
  `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n] || ''}</svg>`;

/* ------------------------------ Campos ------------------------------ */
export function field({ name, label, type = 'text', value = '', options, required, placeholder = '', full, list, step, inputmode }) {
  const req = required ? 'required' : '';
  let ctrl;
  if (type === 'select') {
    ctrl = `<select name="${name}" ${req}>${options.map(([v, l]) =>
      `<option value="${esc(v)}" ${String(v) === String(value ?? '') ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  } else if (type === 'textarea') {
    ctrl = `<textarea name="${name}" rows="${full === 'xl' ? 12 : 3}" placeholder="${esc(placeholder)}">${esc(value)}</textarea>`;
  } else if (type === 'checkbox') {
    return `<label class="check ${full ? 'full' : ''}"><input type="checkbox" name="${name}" ${value ? 'checked' : ''}><span>${esc(label)}</span></label>`;
  } else {
    ctrl = `<input type="${type}" name="${name}" value="${esc(value)}" placeholder="${esc(placeholder)}" ${req}
      ${list ? `list="${list}"` : ''} ${step ? `step="${step}"` : ''} ${inputmode ? `inputmode="${inputmode}"` : ''}>`;
  }
  return `<label class="field ${full ? 'full' : ''}"><span>${esc(label)}</span>${ctrl}</label>`;
}

/* ------------------------------ Modal ------------------------------ */
export function openModal({ title, body, onSubmit, onDelete, submitLabel = 'Guardar', wide = false, accent }) {
  closeModal();
  const root = document.createElement('div');
  root.className = 'modal-root';
  root.innerHTML = `
    <div class="modal-backdrop" data-close></div>
    <form class="modal ${wide ? 'wide' : ''}" novalidate style="${accent ? `--accent:${accent}` : ''}">
      <header class="modal-head">
        <h2>${esc(title)}</h2>
        <button type="button" class="icon-btn" data-close aria-label="Cerrar">${icon('x')}</button>
      </header>
      <div class="modal-body form-grid">${body}</div>
      ${onSubmit || onDelete ? `<footer class="modal-foot">
        ${onDelete ? `<button type="button" class="btn ghost danger" data-del>Eliminar</button>` : '<span></span>'}
        ${onSubmit ? `<button type="submit" class="btn primary">${esc(submitLabel)}</button>` : ''}
      </footer>` : ''}
    </form>`;
  document.body.appendChild(root);
  document.body.classList.add('no-scroll');
  requestAnimationFrame(() => root.classList.add('open'));
  const form = $('form', root);
  const first = form.querySelector('input:not([type=checkbox]),textarea');
  if (first && matchMedia('(hover:hover)').matches) first.focus();

  root.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', closeModal));
  const del = $('[data-del]', root);
  if (del) del.addEventListener('click', async () => {
    if (!del.classList.contains('confirm')) { del.classList.add('confirm'); del.textContent = '¿Confirmás? Tocá de nuevo'; return; }
    try { await onDelete(); closeModal(); } catch (e) { toast(e.message || 'No se pudo eliminar', true); }
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const bad = [...form.querySelectorAll('[required]')].find((i) => !i.value.trim());
    if (bad) { bad.closest('.field')?.classList.add('invalid'); bad.focus(); return; }
    const data = {};
    form.querySelectorAll('input,select,textarea').forEach((i) => {
      if (!i.name) return;
      data[i.name] = i.type === 'checkbox' ? i.checked : (i.value.trim() === '' ? null : i.value.trim());
    });
    const btn = form.querySelector('[type=submit]');
    btn.disabled = true;
    try { await onSubmit(data, form); closeModal(); }
    catch (err) { btn.disabled = false; toast(err.message || 'No se pudo guardar', true); }
  });
  return root;
}

export function closeModal() {
  const r = $('.modal-root');
  if (!r) return;
  r.classList.remove('open');
  document.body.classList.remove('no-scroll');
  setTimeout(() => r.remove(), 180);
}

document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

/* ------------------------------ Toast ------------------------------ */
export function toast(msg, error = false) {
  const t = document.createElement('div');
  t.className = `toast ${error ? 'error' : ''}`;
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 250); }, 2600);
}
