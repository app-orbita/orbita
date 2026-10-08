import * as db from './data.js';
import { CONFIG } from './config.js';
import { icon, field, openModal, closeModal, toast } from './ui.js';
import {
  $, $$, esc, iso, parse, today, todayIso, addDays, startOfWeek, diffDays, DIAS, MESES, cap,
  fmtDate, fmtLong, hhmm, relDay, money, monthKey, monthLabel, shiftMonth,
} from './utils.js';

/* =========================== Configuración =========================== */
const SEG = {
  resumen:   { label: 'Resumen',   icon: 'home' },
  trabajo:   { label: 'Trabajo',   icon: 'briefcase', color: 'var(--c-trabajo)',   kinds: ['tarea', 'reunion', 'vencimiento'],
               tabs: [['tablero', 'Tablero'], ['plan', 'Plan anual'], ['fijos', 'Recurrentes'], ['notas', 'Notas']], blurb: 'Tareas, reuniones, vencimientos y plan del año' },
  academico: { label: 'Académico', icon: 'cap',       color: 'var(--c-academico)', kinds: ['tarea', 'entrega', 'examen', 'clase'],
               tabs: [['tablero', 'Tablero'], ['fijos', 'Recurrentes'], ['notas', 'Notas']], blurb: 'Entregas, exámenes y clases' },
  personal:  { label: 'Personal',  icon: 'heart',     color: 'var(--c-personal)',  kinds: ['turno', 'salud', 'tramite', 'evento', 'tarea'],
               tabs: [['salud', 'Salud'], ['tablero', 'Pendientes'], ['ideas', 'Ideas'], ['fijos', 'Fechas'], ['notas', 'Notas']], blurb: 'Salud, trámites, ideas, cumpleaños y cosas tuyas' },
  cuentas:   { label: 'Cuentas',   icon: 'wallet',    color: 'var(--c-cuentas)',
               tabs: [['situacion', 'Situación mensual'], ['fijos', 'Vencimientos fijos'], ['inversiones', 'Inversiones'], ['notas', 'Notas']], blurb: 'Situación del mes, vencimientos e inversiones' },
};
const KIND = { tarea: 'Tarea', reunion: 'Reunión', vencimiento: 'Vencimiento', entrega: 'Entrega', examen: 'Examen',
  clase: 'Clase', turno: 'Turno médico', salud: 'Salud / estudios', tramite: 'Trámite', evento: 'Evento', cumpleanos: 'Cumpleaños' };
// Recurrentes: qué tipos se ofrecen en cada segmento y con qué frecuencia arrancan
const REC = {
  cuentas:   { kinds: ['vencimiento'], freq: 'mensual', btn: 'Vencimiento fijo', ph: 'Ej: Expensas, Luz, Gas, Monotributo, Obra social' },
  trabajo:   { kinds: ['vencimiento', 'reunion', 'tarea'], freq: 'mensual', btn: 'Recurrente', ph: 'Ej: IVA — Cliente X, Directorio Ventachap' },
  academico: { kinds: ['clase', 'entrega', 'tarea'], freq: 'semanal', btn: 'Recurrente', ph: 'Ej: Clase de Finanzas' },
  personal:  { kinds: ['cumpleanos', 'salud', 'evento', 'tramite'], freq: 'anual', btn: 'Fecha', ph: 'Ej: Cumpleaños de Juan' },
};
const FREQ = [['mensual', 'Todos los meses'], ['meses', 'Meses que elijo (trimestral, semestral…)'], ['anual', 'Todos los años'], ['semanal', 'Todas las semanas']];
const DIAS_PL = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados', 'domingos'];
const LVL = ['Libre', 'Baja', 'Media', 'Alta'];
const STATUS = [['pendiente', 'Pendiente'], ['en_curso', 'En curso'], ['hecho', 'Hecho']];
const PRIO = [['alta', 'Alta'], ['media', 'Media'], ['baja', 'Baja']];
const CATS = ['Comida (súper, verdulería)', 'Varios (juntadas, taxis, limpieza)', 'Monotributo', 'Matrícula / jubilación / obra social',
  'Impuestos / expensas', 'Viandas (trabajo)', 'Compra de dólares', 'Gimnasio', 'Ropa / Regalos', 'Colectivo', 'Compras departamento',
  'Farmacia / estudios', 'Torneo de fútbol', 'Tarjeta de crédito', 'Posgrado', 'Viajes', 'Sueldo Estudio', 'Cobros extra', 'Rendimientos financieros', 'Otros'];
const INV_KINDS = ['Plazo fijo', 'FCI', 'Acciones', 'CEDEARs', 'Bonos', 'Cripto', 'Dólares', 'Otro'];

/* ============================== Estado ============================== */
const S = {
  user: null, profile: null, items: [], notes: [], movements: [], investments: [], recurring: [], workload: [], profiles: [], idea_folders: [], ideas: [], share_tokens: [], accounts: [], month_closings: [], user_settings: [], sharedItems: [], sharedRecs: [], ideaFolder: null,
  route: 'resumen', tabs: {}, calMonth: monthKey(new Date()), selDay: todayIso(), month: monthKey(new Date()),
};
const app = $('#app');

/* ============================== Arranque ============================== */
(async function boot() {
  if (db.MISCONFIG) {
    app.innerHTML = `<main class="login"><div class="login-card"><div class="brand big"><span class="logo"></span>Órbita</div>
      <p><b>La app no está conectada a la base de datos.</b></p>
      <p class="muted">Falta completar <code>js/config.js</code> en GitHub. No cargues nada hasta que esté resuelto: avisale a Uriel.</p></div></main>`;
    return;
  }
  try {
    await db.init();
    S.user = await db.currentUser();
    if (S.user) await enter(); else renderLogin();
  } catch (e) { console.error(e); renderLogin(e.message); }
  window.addEventListener('hashchange', () => { if (S.user) { readRoute(); render(); } });
  // Al volver a la app (por ejemplo después de guardar algo desde Instagram), trae los datos nuevos
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refreshData(); });
  window.addEventListener('focus', () => refreshData());
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(() => {});
})();

let lastLoad = 0, refreshing = false;
async function refreshData(force = false) {
  if (!S.user || refreshing || document.querySelector('.modal-root')) return;
  if (!force && Date.now() - lastLoad < 15000) return;
  refreshing = true;
  try { Object.assign(S, await db.loadAll()); splitShared(); lastLoad = Date.now(); render(); }
  catch (e) { console.warn('No se pudo actualizar', e); }
  refreshing = false;
}
async function enter() {
  if (db.DEMO) db.setDemoUser(S.user.id);
  app.innerHTML = '<div class="loading"><div class="sun"></div></div>';
  Object.assign(S, await db.loadAll());
  splitShared(); lastLoad = Date.now();
  readRoute();
  render();
}
// Separa lo propio de lo que el otro usuario compartió (eso solo se ve en el calendario, en segundo plano)
function splitShared() {
  S.profile = S.profiles.find((p) => p.user_id === S.user.id) || null;
  const mine = (r) => !r.user_id || r.user_id === S.user.id;
  S.sharedItems = S.items.filter((r) => !mine(r)); S.items = S.items.filter(mine);
  S.sharedRecs = S.recurring.filter((r) => !mine(r)); S.recurring = S.recurring.filter(mine);
}
// Nombre del otro usuario (para "Compartir con …" y "de …")
function otherName(uid) {
  const p = uid && S.profiles.find((x) => x.user_id === uid);
  if (p?.display_name) return p.display_name;
  const me = (S.user?.email || '').toLowerCase();
  const o = Object.entries(CONFIG.nombres || {}).find(([e]) => e.toLowerCase() !== me);
  return o ? o[1] : 'el otro usuario';
}
/* ---------- Preferencias de cada usuario: categorías, columnas del tablero y pestañas visibles ---------- */
const DEF_COLS = [['pendiente', 'Pendiente'], ['en_curso', 'En curso'], ['hecho', 'Hecho']];
const DEF_ING = ['Sueldo Estudio', 'Cobros extra', 'Rendimientos financieros', 'Otros ingresos'];
const prefs = () => S.user_settings[0]?.data || {};
async function savePrefs(patch) {
  const data = { ...prefs(), ...patch };
  const [rec] = await db.upsertMany('user_settings', [{ user_id: S.user.id, data }], ['user_id']);
  S.user_settings = [rec];
}
const boardCols = (seg) => { const c = prefs().boards?.[seg]; return c?.length ? c.map((x) => [x.key, x.label]) : DEF_COLS; };
function visibleTabs(seg) {
  const hid = prefs().hiddenTabs?.[seg] || [];
  const t = SEG[seg].tabs.filter(([k]) => !hid.includes(k));
  return t.length ? t : SEG[seg].tabs.slice(0, 1);
}
function catList(type) {
  const saved = prefs().categories?.[type];
  if (saved) return saved;
  const def = type === 'ingreso' ? DEF_ING : CATS.filter((c) => !DEF_ING.includes(c) && c !== 'Otros').concat('Otros');
  const used = S.movements.filter((m) => m.type === type && m.category).map((m) => m.category);
  return [...new Set([...def, ...used])];
}

function readRoute() {
  const r = location.hash.replace('#/', '');
  S.route = SEG[r] || r === 'perfil' ? r : 'resumen';
}
const userName = () => S.profile?.display_name || CONFIG.nombres?.[S.user?.email?.toLowerCase()] ||
  cap((S.user?.email || '').split('@')[0].split(/[._]/)[0] || 'vos');
const avatar = (cls = '') => S.profile?.avatar
  ? `<img class="avatar ${cls}" src="${esc(S.profile.avatar)}" alt="">`
  : `<span class="avatar ${cls}">${esc(userName()[0] || '·')}</span>`;

/* ============================== Login ============================== */
function renderLogin(err) {
  app.innerHTML = `
  <main class="login">
    <div class="login-art" aria-hidden="true"><span class="sun"></span><span class="hill h1"></span><span class="hill h2"></span><span class="hill h3"></span></div>
    <form class="login-card" id="loginForm">
      <div class="brand big"><span class="logo"></span>Órbita</div>
      <p class="muted">Tu organización personal, en un solo lugar.</p>
      ${db.DEMO ? `<div class="demo-note">Modo demo: los datos quedan solo en este navegador. Elegí un usuario o escribí cualquier mail.</div>
        <div class="demo-users"><button type="button" class="btn soft" data-demo="uriel@demo">Entrar como Uriel</button>
        <button type="button" class="btn soft" data-demo="martina@demo">Entrar como Martina</button></div>` : ''}
      <label class="field"><span>Mail</span><input name="email" type="email" autocomplete="username" required></label>
      <label class="field"><span>Contraseña</span><input name="password" type="password" autocomplete="current-password" ${db.DEMO ? '' : 'required'}></label>
      <p class="form-error">${esc(err || '')}</p>
      <button class="btn primary block" type="submit">Ingresar</button>
    </form>
  </main>`;
  const f = $('#loginForm');
  const go = async (email, pw) => {
    f.querySelector('[type=submit]').disabled = true;
    try { S.user = await db.signIn(email, pw); if (db.DEMO && email === 'martina@demo') CONFIG.nombres[email] = 'Martina';
      if (db.DEMO && email === 'uriel@demo') CONFIG.nombres[email] = 'Uriel'; location.hash = '#/resumen'; await enter(); }
    catch (e) { $('.form-error', f).textContent = e.message; f.querySelector('[type=submit]').disabled = false; }
  };
  f.addEventListener('submit', (e) => { e.preventDefault(); go(f.email.value.trim(), f.password.value); });
  $$('[data-demo]', f).forEach((b) => b.addEventListener('click', () => go(b.dataset.demo, '')));
}

/* ============================== Shell ============================== */
function render() {
  const nav = Object.entries(SEG).map(([k, s]) => `
    <a href="#/${k}" class="nav-link ${S.route === k ? 'active' : ''}" style="--seg:${s.color || 'var(--sand)'}">
      ${icon(s.icon)}<span>${s.label}</span></a>`).join('');
  app.innerHTML = `
  <div class="shell">
    <aside class="sidebar">
      <div class="brand"><span class="logo"></span>Órbita</div>
      <nav class="side-nav">${nav}</nav>
      <button class="btn add-main" data-action="quick-add">${icon('plus', 18)} Nuevo</button>
      <div class="me">
        <a href="#/perfil" class="me-link ${S.route === 'perfil' ? 'active' : ''}" title="Mi perfil y ajustes">${avatar()}
          <div><strong>${esc(userName())}</strong><small>Mi perfil y ajustes</small></div></a>
        <button class="icon-btn" data-action="logout" title="Cerrar sesión">${icon('logout', 18)}</button>
      </div>
    </aside>
    <header class="topbar">
      <div class="brand"><span class="logo"></span>Órbita</div>
      <div class="top-actions">
        <button class="fab" data-action="quick-add" aria-label="Nuevo">${icon('plus', 22)}</button>
        <a href="#/perfil" class="top-avatar" aria-label="Mi perfil">${avatar()}</a>
      </div>
    </header>
    <main class="main" id="main">${view()}</main>
    <nav class="bottom-nav">${nav}</nav>
  </div>`;
  bindDnD();
  if (S.route === 'perfil') bindPerfil();
  const isrch = $('#ideaSearch');
  if (isrch) isrch.addEventListener('input', () => {
    S.ideaQuery = isrch.value; const pos = isrch.selectionStart; render();
    const n = $('#ideaSearch'); if (n) { n.focus(); n.setSelectionRange(pos, pos); }
  });
  loadPreviews();
  const xi = $('#xlsInput');
  if (xi) xi.addEventListener('change', () => { const f = xi.files?.[0]; xi.value = ''; if (f) importExcel(f); });
}

function view() {
  if (S.route === 'resumen') return viewResumen();
  if (S.route === 'perfil') return viewPerfil();
  const s = SEG[S.route];
  const vt = visibleTabs(S.route);
  const tab = vt.some(([k]) => k === S.tabs[S.route]) ? S.tabs[S.route] : vt[0][0];
  const tabs = vt.map(([k, l]) => `<button class="tab ${tab === k ? 'active' : ''}" data-action="tab" data-tab="${k}">${l}</button>`).join('');
  let body = '';
  if (tab === 'tablero') body = viewBoard(S.route);
  else if (tab === 'notas') body = viewNotes(S.route);
  else if (tab === 'salud') body = viewSalud();
  else if (tab === 'fijos') body = viewFijos(S.route);
  else if (tab === 'plan') body = viewPlan();
  else if (tab === 'ideas') body = viewIdeas();
  else if (tab === 'situacion') body = viewSituacion();
  else if (tab === 'inversiones') body = viewInversiones();
  return `
  <section class="page" style="--seg:${s.color}">
    <header class="page-head">
      <div><p class="eyebrow"><span class="seg-dot"></span>${s.blurb}</p><h1>${s.label}</h1></div>
      ${primaryButton(S.route, tab)}
    </header>
    <div class="tabs-row"><div class="tabs">${tabs}</div>
      <button class="icon-btn cfg" data-action="customize" data-seg="${S.route}" title="Personalizar ${s.label}" aria-label="Personalizar">${icon('edit', 17)}</button></div>
    ${body}
  </section>`;
}
function primaryButton(seg, tab) {
  const b = (a, l, extra = '') => `<button class="btn primary" data-action="${a}" data-seg="${seg}" ${extra}>${icon('plus', 18)}<span>${l}</span></button>`;
  if (tab === 'notas') return b('new-note', 'Nueva nota');
  if (tab === 'salud') return `<div class="btn-group gap">
    <button class="btn soft" data-action="new-item" data-seg="personal" data-kind="salud">${icon('clock', 18)}<span>Recordatorio</span></button>
    ${b('new-item', 'Turno', 'data-kind="turno"')}</div>`;
  if (tab === 'fijos') return b('new-rec', REC[seg].btn);
  if (tab === 'plan') return b('new-work', 'Trabajo anual');
  if (tab === 'ideas') return S.idea_folders.some((f) => f.id === S.ideaFolder) ? b('new-idea', 'Idea') : b('new-folder', 'Carpeta');
  if (tab === 'situacion') return b('new-mov', 'Movimiento');
  if (tab === 'inversiones') return b('new-inv', 'Inversión');
  return b('new-item', seg === 'personal' ? 'Nuevo pendiente' : 'Nueva tarea');
}

/* ============================== Recurrentes ============================== */
const daysIn = (y, m0) => new Date(y, m0 + 1, 0).getDate();
const addMonths = (d, n) => { const x = new Date(d.getFullYear(), d.getMonth() + n, 1);
  x.setDate(Math.min(d.getDate(), daysIn(x.getFullYear(), x.getMonth()))); return x; };
const isDone = (r, date) => (r.done_dates || []).includes(date);
const firstOfMonth = () => { const t = today(); return iso(new Date(t.getFullYear(), t.getMonth(), 1)); };
const lastOfMonth = () => { const t = today(); return iso(new Date(t.getFullYear(), t.getMonth() + 1, 0)); };

// Fechas (YYYY-MM-DD) en las que cae un recurrente dentro de [from, to]
function occurrences(r, from, to) {
  if (r.active === false) return [];
  const start = r.start_date && r.start_date > from ? r.start_date : from;
  const end = r.end_date && r.end_date < to ? r.end_date : to;
  if (start > end) return [];
  const s = parse(start), e = parse(end), out = [];
  const push = (d) => { const k = iso(d); if (k >= start && k <= end) out.push(k); };
  if (r.freq === 'semanal') {
    let d = new Date(s);
    while ((d.getDay() + 6) % 7 !== Number(r.weekday ?? 0)) d = addDays(d, 1);
    for (; d <= e; d = addDays(d, 7)) out.push(iso(d));
  } else if (r.freq === 'meses') {
    const ms = (r.months || []).map(Number);
    let y = s.getFullYear(), m = s.getMonth();
    while (y < e.getFullYear() || (y === e.getFullYear() && m <= e.getMonth())) {
      if (ms.includes(m + 1)) push(new Date(y, m, Math.min(Number(r.day_of_month || 1), daysIn(y, m))));
      if (++m > 11) { m = 0; y++; }
    }
  } else if (r.freq === 'anual') {
    const m = Number(r.month || 1) - 1;
    for (let y = s.getFullYear(); y <= e.getFullYear(); y++) push(new Date(y, m, Math.min(Number(r.day_of_month || 1), daysIn(y, m))));
  } else {
    let y = s.getFullYear(), m = s.getMonth();
    while (y < e.getFullYear() || (y === e.getFullYear() && m <= e.getMonth())) {
      push(new Date(y, m, Math.min(Number(r.day_of_month || 1), daysIn(y, m))));
      if (++m > 11) { m = 0; y++; }
    }
  }
  return out;
}
// Próxima ocurrencia sin marcar (incluye las atrasadas del mes en curso)
function pendingOcc(r) {
  const from = r.freq === 'semanal' ? iso(addDays(today(), -7)) : firstOfMonth();
  return occurrences(r, from, iso(addDays(today(), 400))).find((d) => !isDone(r, d)) || null;
}
function freqText(r) {
  if (r.freq === 'semanal') return `Todos los ${DIAS_PL[Number(r.weekday ?? 0)]}`;
  if (r.freq === 'anual') return `Todos los años, ${r.day_of_month} de ${MESES[Number(r.month || 1) - 1]}`;
  if (r.freq === 'meses') {
    const ms = [...(r.months || [])].map(Number).sort((a, b) => a - b).map((m) => MESES[m - 1].slice(0, 3));
    return `En ${ms.length > 1 ? ms.slice(0, -1).join(', ') + ' y ' + ms[ms.length - 1] : ms[0] || '—'}, día ${r.day_of_month}`;
  }
  return `Todos los meses, día ${r.day_of_month}`;
}

/* ============================== Eventos (calendario) ============================== */
function events(from, to) {
  const ev = [];
  const inR = (d) => d && d >= from && d <= to;
  for (const it of S.items) if (inR(it.due_date)) ev.push({
    date: it.due_date, time: hhmm(it.due_time), title: it.title, seg: it.segment, tag: KIND[it.kind] || '',
    done: it.status === 'hecho', type: 'item', id: it.id });
  for (const m of S.movements) if (!m.paid && inR(m.date)) ev.push({
    date: m.date, title: `Pagar: ${m.description || m.category || 'gasto'}`, sub: money(m.amount, m.currency),
    seg: 'cuentas', tag: 'Vencimiento', type: 'mov', id: m.id });
  for (const v of S.investments) if (v.active && inR(v.maturity_date)) ev.push({
    date: v.maturity_date, title: `Vence: ${v.name}`, sub: money(v.current_value ?? v.invested, v.currency),
    seg: 'cuentas', tag: 'Inversión', type: 'inv', id: v.id });
  for (const r of S.recurring) for (const d of occurrences(r, from, to)) ev.push({
    date: d, time: hhmm(r.due_time), title: r.title, seg: r.segment,
    tag: r.segment === 'cuentas' ? 'Vencimiento fijo' : (KIND[r.kind] || 'Recurrente'),
    sub: r.amount ? `aprox. ${money(r.amount, r.currency)}` : '', done: isDone(r, d), type: 'rec', id: r.id });
  // Compartido por el otro usuario: va en segundo plano
  for (const it of S.sharedItems) if (inR(it.due_date)) ev.push({
    date: it.due_date, time: hhmm(it.due_time), title: it.title, seg: it.segment, tag: KIND[it.kind] || '',
    done: it.status === 'hecho', type: 'shared', id: it.id, theirs: otherName(it.user_id) });
  for (const r of S.sharedRecs) for (const d of occurrences(r, from, to)) ev.push({
    date: d, time: hhmm(r.due_time), title: r.title, seg: r.segment, tag: KIND[r.kind] || 'Recurrente',
    done: isDone(r, d), type: 'sharedrec', id: r.id, theirs: otherName(r.user_id) });
  return ev.sort((a, b) => (!!a.theirs - !!b.theirs) || (a.date + (a.time || '99')).localeCompare(b.date + (b.time || '99')));
}
const evRow = (e) => `
  <button class="ev-row ${e.done ? 'done' : ''} ${e.theirs ? 'theirs' : ''}" style="--seg:var(--c-${e.seg})" data-action="open-ref" data-type="${e.type}" data-id="${e.id}" data-date="${e.date}">
    <span class="ev-bar"></span>
    <span class="ev-main"><strong>${esc(e.title)}</strong>
      <small>${e.theirs ? `${icon('users', 12)} De ${esc(e.theirs)} · ` : ''}${esc(SEG[e.seg].label)}${e.tag ? ' · ' + esc(e.tag) : ''}${e.sub ? ' · ' + esc(e.sub) : ''}</small></span>
    ${e.done ? `<span class="ev-ok">${icon('check', 15)}</span>` : e.time ? `<span class="ev-time">${e.time}</span>` : ''}
  </button>`;

// Carga de trabajo de un mes (1–12) según el plan anual: 0 libre … 3 alta
function workLevel(m) {
  const tot = (mm) => S.workload.reduce((s, w) => s + Number(w.levels?.[mm] || 0), 0);
  const max = Math.max(0, ...Array.from({ length: 12 }, (_, i) => tot(i + 1)));
  const v = tot(m);
  return { v, lvl: !v || !max ? 0 : Math.max(1, Math.ceil((v / max) * 3)) };
}

/* ============================== Resumen ============================== */
function viewResumen() {
  const t = todayIso();
  const [cy, cm] = S.calMonth.split('-').map(Number);
  const gStart = startOfWeek(new Date(cy, cm - 1, 1));
  const gEnd = addDays(startOfWeek(new Date(cy, cm, 0)), 6);
  const days = []; for (let d = gStart; d <= gEnd; d = addDays(d, 1)) days.push(d);
  const in14 = iso(addDays(today(), 14));
  const from = iso(gStart) < t ? iso(gStart) : t;
  const to = iso(gEnd) > in14 ? iso(gEnd) : in14;
  const selFrom = S.selDay < from ? S.selDay : from, selTo = S.selDay > to ? S.selDay : to;
  const ev = events(selFrom, selTo);

  const open = S.items.filter((i) => i.status !== 'hecho');
  const overdue = open.filter((i) => i.due_date && i.due_date < t).length;
  const week = ev.filter((e) => !e.theirs && !e.done && e.date >= t && diffDays(e.date) < 7).length;
  const nextTurno = S.items.filter((i) => (i.kind === 'turno' || i.kind === 'salud') && i.status !== 'hecho' && i.due_date >= t)
    .sort((a, b) => (a.due_date + (a.due_time || '')).localeCompare(b.due_date + (b.due_time || '')))[0];
  const mk = monthKey(new Date());
  const spent = (cur) => S.movements.filter((m) => m.paid && m.type === 'gasto' && m.currency === cur && m.date.startsWith(mk))
    .reduce((s, m) => s + Number(m.amount), 0);
  const usd = spent('USD');

  // Calendario mensual
  const byDay = {};
  ev.forEach((e) => (byDay[e.date] ||= []).push(e));
  const cells = days.map((d) => {
    const k = iso(d); const list = byDay[k] || [];
    const cls = [k === t && 'today', k < t && 'past', k === S.selDay && 'sel', d.getMonth() !== cm - 1 && 'out'].filter(Boolean).join(' ');
    return `<button class="cal-cell ${cls}" data-action="sel-day" data-date="${k}">
      <span class="cal-num">${d.getDate()}</span>
      <span class="chips">${list.slice(0, 3).map((e) => `<span class="chip ${e.done ? 'done' : ''} ${e.theirs ? 'theirs' : ''}" style="--seg:var(--c-${e.seg})" title="${e.theirs ? 'De ' + esc(e.theirs) : ''}">${esc(e.title)}</span>`).join('')}
        ${list.length > 3 ? `<span class="more">+${list.length - 3} más</span>` : ''}</span>
      <span class="dots">${list.slice(0, 4).map((e) => `<i style="--seg:var(--c-${e.seg})" class="${e.done ? 'done' : ''} ${e.theirs ? 'theirs' : ''}"></i>`).join('')}</span>
    </button>`;
  }).join('');
  const wl = S.workload.length ? workLevel(cm) : null;
  const sel = byDay[S.selDay] || [];
  const upcoming = ev.filter((e) => !e.done && e.date >= t && e.date <= in14);
  const groups = {};
  upcoming.forEach((e) => (groups[e.date] ||= []).push(e));

  const segCard = (k) => {
    const s = SEG[k];
    let l1, l2;
    if (k === 'cuentas') {
      const due = S.movements.filter((m) => !m.paid).map((m) => ({ d: m.date, n: m.description || m.category }));
      S.recurring.filter((r) => r.segment === 'cuentas').forEach((r) => {
        occurrences(r, firstOfMonth(), lastOfMonth()).filter((d) => !isDone(r, d)).forEach((d) => due.push({ d, n: r.title }));
      });
      l1 = `<b>${due.length}</b> por pagar`;
      const nx = due.sort((a, b) => a.d.localeCompare(b.d))[0];
      l2 = nx ? `Próximo: ${esc(nx.n)} · ${relDay(nx.d)}` : 'Nada pendiente este mes';
    } else {
      const its = S.items.filter((i) => i.segment === k);
      const p = its.filter((i) => i.status === 'pendiente').length; const c = its.filter((i) => i.status === 'en_curso').length;
      l1 = `<b>${p}</b> pendientes · <b>${c}</b> en curso`;
      const nx = ev.filter((e) => e.seg === k && !e.done && e.date >= t)[0];
      l2 = nx ? `Próximo: ${esc(nx.title)} · ${relDay(nx.date)}` : 'Nada próximo';
    }
    return `<a class="seg-card" href="#/${k}" style="--seg:${s.color}">
      <span class="seg-ico">${icon(s.icon)}</span>
      <div><h3>${s.label}</h3><p>${l1}</p><small>${l2}</small></div>${icon('right', 18)}</a>`;
  };

  const hour = new Date().getHours();
  const hi = hour < 13 ? 'Buen día' : hour < 20 ? 'Buenas tardes' : 'Buenas noches';
  return `
  <section class="page">
    <header class="page-head">
      <div><p class="eyebrow">${fmtLong(t)}</p><h1>${hi}, ${esc(userName())}</h1></div>
    </header>
    <div class="stats">
      <div class="stat s-ink"><span>Pendientes</span><strong>${open.length}</strong><small>${overdue ? `${overdue} vencida${overdue > 1 ? 's' : ''}` : 'Ninguna vencida'}</small></div>
      <div class="stat s-teal"><span>Próximos 7 días</span><strong>${week}</strong><small>actividades en agenda</small></div>
      <div class="stat s-rust"><span>Próximo en salud</span><strong class="sm">${nextTurno ? relDay(nextTurno.due_date) + (nextTurno.due_time ? ' · ' + hhmm(nextTurno.due_time) : '') : '—'}</strong>
        <small>${nextTurno ? esc(nextTurno.title) : 'Sin turnos ni controles'}</small></div>
      <div class="stat s-sand"><span>Gastos de ${MESES[new Date().getMonth()]}</span><strong class="sm">${money(spent('ARS'))}</strong>
        <small>${usd ? money(usd, 'USD') + ' en dólares' : 'pagados en el mes'}</small></div>
    </div>
    <div class="grid-main">
      <div class="card cal-card">
        <div class="card-head">
          <div><h2>${monthLabel(S.calMonth)}</h2>
            ${wl ? `<small class="load-pill lvl-${wl.lvl}" title="Según tu plan anual de trabajo">Carga de trabajo: ${LVL[wl.lvl].toLowerCase()}</small>` : ''}</div>
          <div class="btn-group">
            <button class="icon-btn" data-action="cal-month" data-n="-1" aria-label="Mes anterior">${icon('left', 18)}</button>
            <button class="btn soft sm" data-action="cal-today">Hoy</button>
            <button class="icon-btn" data-action="cal-month" data-n="1" aria-label="Mes siguiente">${icon('right', 18)}</button>
          </div>
        </div>
        <div class="legend">${['trabajo', 'academico', 'personal', 'cuentas'].map((k) => `<span style="--seg:var(--c-${k})"><i></i>${SEG[k].label}</span>`).join('')}</div>
        <div class="cal month">${DIAS.map((d) => `<span class="cal-dow">${d}</span>`).join('')}${cells}</div>
      </div>
      <div class="side-col">
        <div class="card">
          <div class="card-head"><h2>${S.selDay === t ? 'Hoy' : fmtLong(S.selDay)}</h2></div>
          ${sel.length ? `<div class="ev-list">${sel.map(evRow).join('')}</div>` : '<p class="empty">Nada agendado para este día.</p>'}
        </div>
        <div class="card">
          <div class="card-head"><h2>Próximos 14 días</h2></div>
          ${Object.keys(groups).length ? Object.entries(groups).map(([d, l]) =>
            `<div class="day-group"><h4>${relDay(d)}${diffDays(d) < 7 && diffDays(d) > 1 ? ` · ${fmtDate(d, { weekday: 'long' })}` : ''}</h4>${l.map(evRow).join('')}</div>`).join('')
            : '<p class="empty">Sin actividades en las próximas dos semanas.</p>'}
        </div>
      </div>
    </div>
    <h2 class="section-title">Segmentos</h2>
    <div class="seg-cards">${['trabajo', 'academico', 'personal', 'cuentas'].map(segCard).join('')}</div>
  </section>`;
}

/* ============================== Tablero ============================== */
const prioRank = { alta: 0, media: 1, baja: 2 };
function viewBoard(seg) {
  const its = S.items.filter((i) => i.segment === seg && !(seg === 'personal' && (i.kind === 'turno' || i.kind === 'salud')));
  const t = todayIso();
  const C = boardCols(seg);
  const keys = C.map(([k]) => k);
  const colOf = (i) => (keys.includes(i.status) ? i.status : keys[0]);
  const cols = C.map(([st, label], ci) => {
    const list = its.filter((i) => colOf(i) === st).sort((a, b) =>
      (a.due_date || '9999').localeCompare(b.due_date || '9999') || prioRank[a.priority] - prioRank[b.priority]);
    const cards = list.map((i) => {
      const late = i.due_date && i.due_date < t && st !== 'hecho';
      const nk = C[ci + 1];
      const next = !nk ? [keys[0], 'undo', `Volver a ${C[0][1]}`] : nk[0] === 'hecho' ? ['hecho', 'check', 'Marcar hecho'] : [nk[0], 'arrow', `Pasar a ${nk[1]}`];
      return `<article class="task prio-${i.priority}" draggable="true" data-id="${i.id}" data-action="edit-item">
        <div class="task-top"><span class="tag">${esc(KIND[i.kind] || 'Tarea')}</span>${i.shared ? `<span class="shared-mini" title="Compartido con ${esc(otherName())}">${icon('users', 13)}</span>` : ''}<span class="prio" title="Prioridad ${i.priority}"></span></div>
        <h4>${esc(i.title)}</h4>
        ${i.description ? `<p class="desc">${esc(i.description.slice(0, 110))}</p>` : ''}
        <div class="task-foot">
          ${i.due_date ? `<span class="due ${late ? 'late' : ''}">${icon('cal', 14)}${relDay(i.due_date)}${i.due_time ? ' · ' + hhmm(i.due_time) : ''}</span>` : '<span></span>'}
          <button class="icon-btn sm" data-action="move-item" data-id="${i.id}" data-status="${next[0]}" title="${next[2]}">${icon(next[1], 16)}</button>
        </div>
      </article>`;
    }).join('');
    return `<div class="col" data-status="${st}">
      <div class="col-head"><span class="st st-${['pendiente', 'en_curso', 'hecho'].includes(st) ? st : 'custom'}"></span>${esc(label)}<span class="count">${list.length}</span></div>
      <div class="col-body">${cards || '<p class="empty sm">Arrastrá tarjetas acá</p>'}</div>
      ${st !== 'hecho' ? `<button class="add-inline" data-action="new-item" data-seg="${seg}" data-status="${st}">${icon('plus', 16)} Agregar</button>` : ''}
    </div>`;
  }).join('');
  return `<div class="board" style="--cols:${C.length}">${cols}</div>`;
}

function bindDnD() {
  $$('.task[draggable]').forEach((c) => c.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/plain', c.dataset.id); c.classList.add('dragging');
  }));
  $$('.task[draggable]').forEach((c) => c.addEventListener('dragend', () => c.classList.remove('dragging')));
  $$('.col').forEach((col) => {
    col.addEventListener('dragover', (e) => { e.preventDefault(); col.classList.add('over'); });
    col.addEventListener('dragleave', () => col.classList.remove('over'));
    col.addEventListener('drop', (e) => {
      e.preventDefault(); col.classList.remove('over');
      const id = e.dataTransfer.getData('text/plain');
      const it = S.items.find((i) => i.id === id);
      if (it && it.status !== col.dataset.status) save('items', id, { status: col.dataset.status });
    });
  });
}

/* ============================== Salud (turnos + recordatorios) ============================== */
function viewSalud() {
  const t = todayIso();
  const all = S.items.filter((i) => i.segment === 'personal' && (i.kind === 'turno' || i.kind === 'salud'));
  const up = all.filter((i) => i.status !== 'hecho' && (!i.due_date || i.due_date >= t))
    .sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999'));
  const past = all.filter((i) => !up.includes(i)).sort((a, b) => (b.due_date || '').localeCompare(a.due_date || '')).slice(0, 12);
  const card = (i) => {
    const d = i.due_date ? parse(i.due_date) : null;
    return `<button class="turno ${i.kind === 'salud' ? 'is-rem' : ''}" data-action="edit-item" data-id="${i.id}">
      <span class="date-block">${d ? `<small>${DIAS[(d.getDay() + 6) % 7]}</small><b>${d.getDate()}</b><small>${MESES[d.getMonth()].slice(0, 3)}${d.getFullYear() !== new Date().getFullYear() ? ' ' + String(d.getFullYear()).slice(2) : ''}</small>` : '<b>—</b>'}</span>
      <span class="turno-main"><span class="tag">${i.kind === 'salud' ? 'Recordatorio' : 'Turno'}</span><strong>${esc(i.title)}</strong>
        ${i.location ? `<small>${icon('pin', 14)}${esc(i.location)}</small>` : ''}
        ${i.description ? `<small class="muted">${esc(i.description.slice(0, 80))}</small>` : ''}</span>
      <span class="turno-side">${i.due_time ? `<span class="pill">${icon('clock', 14)}${hhmm(i.due_time)}</span>` : ''}
        ${i.due_date ? `<small>${relDay(i.due_date)}</small>` : ''}</span>
    </button>`;
  };
  return `
    <p class="hint">Turnos con fecha y hora, y recordatorios a futuro (ej.: "estudios en 6 meses"). Todo aparece en el calendario.</p>
    <div class="turnos">${up.length ? up.map(card).join('') : `<div class="card empty-card">${icon('heart', 28)}<p>No tenés turnos ni controles próximos.</p>
      <button class="btn soft" data-action="new-item" data-seg="personal" data-kind="turno">Cargar un turno</button></div>`}</div>
    ${past.length ? `<h2 class="section-title">Anteriores</h2><div class="turnos past">${past.map(card).join('')}</div>` : ''}`;
}

/* ============================== Recurrentes (vista por segmento) ============================== */
function viewFijos(seg) {
  const t = todayIso();
  const list = S.recurring.filter((r) => r.segment === seg).map((r) => {
    const cur = r.freq === 'mensual' ? occurrences(r, firstOfMonth(), lastOfMonth())[0] : null;
    return { r, p: pendingOcc(r), curDone: cur && isDone(r, cur) };
  }).sort((a, b) => (a.r.active === false) - (b.r.active === false) || (a.p || '9999').localeCompare(b.p || '9999'));
  const doneLabel = seg === 'cuentas' ? 'Pagado' : 'Hecho';
  const row = ({ r, p, curDone }) => `
    <div class="rec-row ${r.active === false ? 'paused' : ''}" style="--seg:var(--c-${seg})">
      <button class="rec-main" data-action="edit-rec" data-id="${r.id}">
        <span class="rec-ico">${icon(r.kind === 'cumpleanos' ? 'star' : r.freq === 'semanal' ? 'clock' : 'cal', 17)}</span>
        <span class="rec-txt"><strong>${esc(r.title)}</strong>
          <small>${freqText(r)}${r.due_time ? ' · ' + hhmm(r.due_time) : ''}${r.amount ? ` · aprox. ${money(r.amount, r.currency)}` : ''}</small></span>
      </button>
      <div class="rec-side">
        ${r.active === false ? '<small>Pausado</small>' : p ? `<small class="${p < t ? 'late' : ''}">${curDone ? `<span class="ok">${icon('check', 13)} ${cap(MESES[today().getMonth()])}</span> · ` : ''}${p < t ? 'Atrasado · ' : ''}${relDay(p)}</small>
          <button class="btn soft sm" data-action="done-rec" data-id="${r.id}" data-date="${p}">${icon('check', 15)} ${doneLabel}</button>` : '<small>Sin próximas fechas</small>'}
      </div>
    </div>`;
  let summary = '';
  if (seg === 'cuentas' && list.length) {
    const tot = {}; let paid = 0, n = 0;
    S.recurring.filter((r) => r.segment === 'cuentas' && r.active !== false).forEach((r) => {
      const occ = occurrences(r, firstOfMonth(), lastOfMonth());
      n += occ.length; paid += occ.filter((d) => isDone(r, d)).length;
      if (r.amount) tot[r.currency] = (tot[r.currency] || 0) + Number(r.amount) * occ.length;
    });
    summary = `<div class="money-cards">
      <div class="money-card"><span class="cur">${cap(MESES[today().getMonth()])}</span>
        <div class="money-row"><span>Vencimientos del mes</span><b>${n}</b></div>
        <div class="money-row"><span>Ya pagados</span><b class="pos">${paid}</b></div>
        <div class="money-row total"><span>Faltan</span><b class="${n - paid ? 'neg' : ''}">${n - paid}</b></div></div>
      ${Object.keys(tot).length ? `<div class="money-card"><span class="cur">Total aproximado del mes</span>
        ${Object.entries(tot).map(([c, v]) => `<div class="money-row"><span>${c === 'ARS' ? 'Pesos' : 'Dólares'}</span><b>${money(v, c)}</b></div>`).join('')}
        <small class="muted">Es una referencia: lo que pagás de verdad lo cargás en Movimientos.</small></div>` : ''}
    </div>`;
  }
  const hints = {
    cuentas: 'Cargá una vez lo que vence todos los meses (expensas, luz, gas, monotributo, obra social) y te aparece en el calendario cada mes. Tocá "Pagado" para tildarlo.',
    trabajo: 'Lo que se repite: vencimientos de IVA por cliente, reuniones fijas, etc. Aparece en el calendario automáticamente.',
    academico: 'Clases fijas por semana, entregas que se repiten, etc.',
    personal: 'Cumpleaños, aniversarios y cualquier fecha que se repite. Se ven en el calendario todos los años.',
  };
  return `${summary}
    <p class="hint">${hints[seg]}</p>
    <div class="card rec-list">${list.length ? list.map(row).join('') : `<div class="empty-card">${icon('cal', 28)}<p>Todavía no cargaste nada.</p>
      <button class="btn soft" data-action="new-rec" data-seg="${seg}">${REC[seg].btn}</button></div>`}</div>`;
}

/* ============================== Plan anual (Trabajo) ============================== */
function viewPlan() {
  const rows = [...S.workload].sort((a, b) => a.title.localeCompare(b.title));
  const cm = new Date().getMonth() + 1;
  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  const ml = (m) => cap(MESES[m - 1].slice(0, 3));
  const head = `<div class="plan-name plan-h">Cliente / trabajo</div>${months.map((m) => `<div class="plan-h ${m === cm ? 'cur' : ''}">${ml(m)}</div>`).join('')}`;
  const total = rows.length ? `<div class="plan-name plan-total">Carga del mes</div>${months.map((m) => {
    const w = workLevel(m); return `<div class="plan-cell heat lvl-${w.lvl} ${m === cm ? 'cur' : ''}" title="${LVL[w.lvl]}">${w.v || ''}</div>`; }).join('')}` : '';
  const body = rows.map((r) => `<button class="plan-name" data-action="edit-work" data-id="${r.id}"><strong>${esc(r.title)}</strong>${r.detail ? `<small>${esc(r.detail)}</small>` : ''}</button>
    ${months.map((m) => { const v = Number(r.levels?.[m] || 0);
      return `<button class="plan-cell lvl-${v} ${m === cm ? 'cur' : ''}" data-action="cycle-level" data-id="${r.id}" data-m="${m}" title="${ml(m)}: ${LVL[v]}" aria-label="${ml(m)}: ${LVL[v]}"></button>`; }).join('')}`).join('');
  const ranked = months.map((m) => ({ m, ...workLevel(m) })).filter((x) => x.v).sort((a, b) => b.v - a.v).slice(0, 3);
  return `
    <p class="hint">Marcá en qué meses te ocupa cada cliente. Tocá un mes para cambiar el nivel (libre → baja → media → alta). Se repite todos los años.</p>
    ${ranked.length ? `<div class="plan-top">${ranked.map((x) => `<span class="load-pill lvl-${x.lvl}">${cap(MESES[x.m - 1])}</span>`).join('')}<small class="muted">meses más cargados</small></div>` : ''}
    <div class="card plan-card">
      ${rows.length ? `<div class="plan-wrap"><div class="plan">${head}${total}${body}</div></div>
        <div class="plan-legend">${LVL.map((l, i) => `<span><i class="plan-cell lvl-${i}"></i>${l}</span>`).join('')}</div>`
        : `<div class="empty-card">${icon('briefcase', 28)}<p>Agregá tus clientes con trabajos que se repiten cada año (ej.: un balance que cierra en marzo te ocupa de abril a junio).</p>
          <button class="btn soft" data-action="new-work">Agregar trabajo anual</button></div>`}
    </div>`;
}

/* ============================== Perfil y ajustes ============================== */
function viewPerfil() {
  return `
  <section class="page" style="--seg:var(--ink)">
    <header class="page-head"><div><p class="eyebrow">Ajustes</p><h1>Mi perfil</h1></div></header>
    <div class="profile-grid">
      <div class="card profile-card">
        <div class="avatar-edit">${avatar('xl')}
          <div class="avatar-actions">
            <label class="btn soft sm">${icon('plus', 15)} ${S.profile?.avatar ? 'Cambiar foto' : 'Subir foto'}<input type="file" accept="image/*" id="avatarInput" hidden></label>
            ${S.profile?.avatar ? '<button class="btn ghost sm" data-action="remove-avatar">Quitar</button>' : ''}
          </div>
        </div>
        <label class="field"><span>Nombre (como querés que te salude)</span><input id="pfName" value="${esc(userName())}" maxlength="40"></label>
        <label class="field"><span>Mail de ingreso</span><input value="${esc(S.user.email)}" disabled></label>
        <button class="btn primary" data-action="save-profile">Guardar cambios</button>
      </div>
      <div class="side-col">
        <div class="card">
          <div class="card-head"><h2>Cambiar contraseña</h2></div>
          <div class="form-grid one">
            <label class="field"><span>Nueva contraseña</span><input id="pw1" type="password" autocomplete="new-password" minlength="6"></label>
            <label class="field"><span>Repetila</span><input id="pw2" type="password" autocomplete="new-password"></label>
            <button class="btn soft" data-action="change-pw">Actualizar contraseña</button>
          </div>
        </div>
        ${dataCard()}
        ${shortcutCard()}
        <div class="card">
          <div class="card-head"><h2>Sesión</h2></div>
          <p class="muted small">La sesión queda abierta en cada dispositivo hasta que la cierres.</p>
          <button class="btn soft danger-soft" data-action="logout">${icon('logout', 17)} Cerrar sesión</button>
        </div>
      </div>
    </div>
  </section>`;
}
function bindPerfil() {
  const inp = $('#avatarInput');
  if (!inp) return;
  inp.addEventListener('change', async () => {
    const f = inp.files?.[0]; if (!f) return;
    try { const data = await toAvatar(f); S.profile = await db.saveProfile(S.user.id, { avatar: data }); render(); toast('Foto actualizada'); }
    catch (e) { toast(e.message || 'No se pudo subir la foto', true); }
  });
}
// Recorta la foto al centro y la achica a 256×256 (queda liviana, ~20 KB)
async function toAvatar(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise((ok, ko) => { img.onload = ok; img.onerror = () => ko(new Error('No se pudo leer la imagen')); img.src = url; });
    const s = Math.min(img.naturalWidth, img.naturalHeight);
    const c = document.createElement('canvas'); c.width = c.height = 256;
    c.getContext('2d').drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, 256, 256);
    return c.toDataURL('image/jpeg', 0.85);
  } finally { URL.revokeObjectURL(url); }
}

/* ============================== Ideas (Personal) ============================== */
const PLAT = [
  [/instagram\.com/, 'Instagram', '#C13584'], [/tiktok\.com/, 'TikTok', '#1F3434'], [/youtube\.com|youtu\.be/, 'YouTube', '#C4302B'],
  [/pinterest\./, 'Pinterest', '#BD081C'], [/(^|\.)x\.com|twitter\.com/, 'X', '#1F3434'], [/facebook\.com|fb\.watch/, 'Facebook', '#3B5998'],
  [/mercadolibre\./, 'Mercado Libre', '#B38B00'], [/spotify\.com/, 'Spotify', '#1D9A50'], [/maps\.app\.goo\.gl|google\.[a-z.]+\/maps/, 'Mapa', '#416B66'],
];
function linkInfo(url) {
  try {
    const h = new URL(url).hostname.replace(/^www\./, '');
    const p = PLAT.find(([re]) => re.test(h + new URL(url).pathname));
    return { host: h, name: p ? p[1] : h, color: p ? p[2] : 'var(--olive)' };
  } catch { return { host: url, name: 'Link', color: 'var(--olive)' }; }
}
const personName = (uid) => uid === S.user.id ? 'vos' : (S.profiles.find((p) => p.user_id === uid)?.display_name || 'M');
const personAvatar = (uid) => {
  if (uid === S.user.id) return avatar('xs');
  const p = S.profiles.find((x) => x.user_id === uid);
  return p?.avatar ? `<img class="avatar xs" src="${esc(p.avatar)}" alt="">` : `<span class="avatar xs">${esc((p?.display_name || 'M')[0])}</span>`;
};
/* ---------- Vista previa de links (texto e imagen del posteo) ---------- */
// Usa el servicio gratuito Microlink: lee el título, el texto y la imagen de la publicación.
// Se busca una sola vez por link y queda guardado en la idea (columna preview).
const PREVIEW_API = 'https://api.microlink.io/?url=';
const previewBusy = new Set();
const igCdn = (u) => /cdninstagram|fbcdn/.test(u || '');
function needsPreview(i) {
  if (!/^https?:\/\//i.test(i.url || '')) return false;
  const p = i.preview;
  if (!p) return true;
  const age = Date.now() - new Date(p.fetched_at || 0).getTime();
  if (p.failed) return age > 2 * 864e5;                 // si falló, reintenta a los 2 días
  return igCdn(p.image) && age > 5 * 864e5;            // las imágenes de Instagram vencen: se renuevan
}
function cleanDesc(d) {
  if (!d) return '';
  const m = /“([\s\S]+?)”?\s*$/.exec(d);                 // Instagram: «usuario on fecha: “texto”»
  return (m ? m[1] : d).replace(/(\s*•\s*)+/g, ' ').trim();
}
async function fetchPreview(i) {
  if (previewBusy.has(i.id)) return;
  previewBusy.add(i.id);
  let preview;
  try {
    const r = await fetch(PREVIEW_API + encodeURIComponent(i.url));
    const j = await r.json();
    if (j.status !== 'success') throw new Error(j.message || 'sin datos');
    const d = j.data || {};
    preview = { title: d.title || '', description: cleanDesc(d.description), image: d.image?.url || d.logo?.url || '',
      author: d.author || '', publisher: d.publisher || '', fetched_at: new Date().toISOString() };
  } catch { preview = { failed: true, fetched_at: new Date().toISOString() }; }
  try {
    const rec = await db.update('ideas', i.id, { preview });
    S.ideas = S.ideas.map((x) => (x.id === i.id ? { ...x, ...rec } : x));
    if (S.route === 'personal' && !document.querySelector('.modal-root')) render();
  } catch (e) { console.warn('No se pudo guardar la vista previa', e); }
  previewBusy.delete(i.id);
}
function loadPreviews() {
  if (S.route !== 'personal') return;
  const todo = S.ideas.filter((i) => (S.ideaFolder ? i.folder_id === S.ideaFolder : true) && needsPreview(i) && !previewBusy.has(i.id)).slice(0, 6);
  (async () => { for (const i of todo) await fetchPreview(i); })();
}

function viewIdeas() {
  const f = S.idea_folders.find((x) => x.id === S.ideaFolder);
  if (f) return viewIdeaFolder(f);
  const folders = [...S.idea_folders].sort((a, b) => a.name.localeCompare(b.name));
  const card = (x) => {
    const its = S.ideas.filter((i) => i.folder_id === x.id);
    const last = its.map((i) => i.created_at || '').sort().pop();
    const mine = x.user_id === S.user.id;
    const thumbs = its.filter((i) => i.preview?.image).sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')).slice(0, 3);
    return `<button class="folder" data-action="open-folder" data-id="${x.id}">
      ${thumbs.length ? `<span class="folder-thumbs">${thumbs.map((i) => `<img src="${esc(i.preview.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">`).join('')}</span>` : `<span class="folder-ico">${icon('folder', 22)}</span>`}
      <strong>${esc(x.name)}</strong>
      <small>${its.length} idea${its.length === 1 ? '' : 's'}${last ? ' · ' + relDay(iso(new Date(last))).toLowerCase() : ''}</small>
      ${x.shared ? `<span class="shared-pill">${icon('users', 13)} ${mine ? 'Compartida' : 'De ' + esc(personName(x.user_id))}</span>` : ''}
    </button>`;
  };
  return `
    <p class="hint">Carpetas para ir juntando ideas: links de Instagram, TikTok, YouTube, Pinterest, Mercado Libre o notas escritas.
      Desde el iPhone podés guardar directo con <b>Compartir → Guardar en Órbita</b> (se configura en Mi perfil).</p>
    <div class="folders">
      <button class="folder new" data-action="new-folder">${icon('plus', 22)}<span>Nueva carpeta</span></button>
      ${folders.map(card).join('')}
    </div>`;
}
function viewIdeaFolder(f) {
  const mine = f.user_id === S.user.id;
  const q = (S.ideaQuery || '').toLowerCase().trim();
  const txt = (i) => [i.title, i.content, i.url, i.preview?.title, i.preview?.description, i.preview?.author].filter(Boolean).join(' ').toLowerCase();
  const all = S.ideas.filter((i) => i.folder_id === f.id).sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  const its = q ? all.filter((i) => txt(i).includes(q)) : all;
  const card = (i) => {
    const li = i.url ? linkInfo(i.url) : null;
    const p = i.preview && !i.preview.failed ? i.preview : null;
    const loading = !p && needsPreview(i);
    const ptitle = p ? (p.title || '').replace(/\s*[•|]\s*(Instagram|X|TikTok|Pinterest|YouTube).*$/i, '').replace(/ on X$/, '') : '';
    return `<article class="idea" style="--plat:${li ? li.color : 'var(--sand)'}">
      <button class="idea-body" data-action="edit-idea" data-id="${i.id}">
        ${p?.image ? `<span class="idea-img"><img src="${esc(p.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentNode.remove()"></span>` : ''}
        <span class="idea-text">
        ${li ? `<span class="plat">${esc(li.name)}</span>` : `<span class="plat note-plat">${icon('note', 13)} Nota</span>`}
        ${i.title ? `<strong>${esc(i.title)}</strong>` : ''}
        ${i.content ? `<p class="mine">${esc(i.content)}</p>` : ''}
        ${p ? `${ptitle && ptitle !== i.title ? `<small class="pv-title">${esc(ptitle)}</small>` : ''}${p.description ? `<p class="pv-desc">${esc(p.description)}</p>` : ''}` : ''}
        ${loading ? '<small class="muted pv-loading">Buscando vista previa…</small>' : ''}
        ${!p && !loading && !i.title && !i.content && li ? `<p class="muted">${esc(li.host)}</p>` : ''}
        </span>
      </button>
      <footer>
        ${f.shared ? `<span class="by" title="Agregada por ${esc(personName(i.user_id))}">${personAvatar(i.user_id)}</span>` : ''}
        <small>${i.created_at ? relDay(iso(new Date(i.created_at))) : ''}</small>
        ${/^https?:\/\//i.test(i.url || '') ? `<a class="btn soft sm" href="${esc(i.url)}" target="_blank" rel="noopener noreferrer">${icon('link', 14)} Abrir</a>` : ''}
      </footer>
    </article>`;
  };
  return `
    <div class="folder-bar">
      <button class="btn ghost sm" data-action="close-folder">${icon('left', 16)} Carpetas</button>
      <h2>${esc(f.name)}</h2>
      ${f.shared ? `<span class="shared-pill">${icon('users', 13)} ${mine ? 'Compartida con M' : 'Carpeta de ' + esc(personName(f.user_id))}</span>` : ''}
      ${mine ? `<button class="icon-btn" data-action="edit-folder" data-id="${f.id}" title="Editar carpeta">${icon('edit', 17)}</button>` : ''}
    </div>
    ${all.length > 3 ? `<div class="idea-search"><input id="ideaSearch" type="search" placeholder="Buscar en esta carpeta…" value="${esc(S.ideaQuery || '')}"></div>` : ''}
    <div class="ideas">${its.length ? its.map(card).join('') : q ? `<p class="empty">Nada coincide con "${esc(S.ideaQuery)}".</p>` : `<div class="card empty-card">${icon('folder', 28)}<p>Carpeta vacía. Agregá un link o una idea.</p>
      <button class="btn soft" data-action="new-idea">Agregar idea</button></div>`}</div>`;
}
function folderForm(f = {}) {
  openModal({
    title: f.id ? 'Editar carpeta' : 'Nueva carpeta', accent: 'var(--c-personal)',
    body: `${field({ name: 'name', label: 'Nombre', value: f.name, required: true, full: true, placeholder: 'Ej: Ideas para el departamento' })}
      ${field({ name: 'shared', label: 'Compartir con M (los dos la ven y pueden agregar ideas)', type: 'checkbox', value: f.shared, full: true })}`,
    onSubmit: async (d) => {
      if (f.id) await save('idea_folders', f.id, d, true);
      else { const rec = await db.insert('idea_folders', d); S.idea_folders.push(rec); S.ideaFolder = rec.id; render(); toast('Carpeta creada'); }
    },
    onDelete: f.id ? async () => { await del('idea_folders', f.id); S.ideas = S.ideas.filter((i) => i.folder_id !== f.id); S.ideaFolder = null; render(); } : null,
  });
}
function ideaForm(i = {}) {
  const folders = [...S.idea_folders].sort((a, b) => a.name.localeCompare(b.name));
  if (!folders.length) { toast('Primero creá una carpeta'); folderForm(); return; }
  openModal({
    title: i.id ? 'Editar idea' : 'Nueva idea', accent: 'var(--c-personal)',
    body: `${field({ name: 'url', label: 'Link (opcional)', type: 'url', value: i.url, full: true, placeholder: 'Pegá el link de Instagram, YouTube, una web…', inputmode: 'url' })}
      ${field({ name: 'title', label: 'Título (opcional)', value: i.title, full: true })}
      ${field({ name: 'content', label: 'Idea / notas', type: 'textarea', value: i.content, full: true })}
      ${field({ name: 'folder_id', label: 'Carpeta', type: 'select', value: i.folder_id || S.ideaFolder || folders[0].id, full: true,
        options: folders.map((f) => [f.id, f.name + (f.shared ? ' (compartida)' : '')]) })}`,
    onSubmit: async (d) => {
      if (d.url && !/^https?:\/\//i.test(d.url)) d.url = 'https://' + d.url;
      if (i.id && d.url !== i.url) d.preview = null;
      if (!d.url && !d.title && !d.content) throw new Error('Poné al menos un link o una idea.');
      if (i.id) await save('ideas', i.id, d, true); else await add('ideas', d);
    },
    onDelete: i.id ? () => del('ideas', i.id) : null,
  });
}

/* ---------- Mis datos: estado de la nube y copia de seguridad ---------- */
const BACKUP_TABLES = ['items', 'notes', 'movements', 'investments', 'recurring', 'workload', 'idea_folders', 'ideas', 'accounts', 'month_closings'];
function dataCard() {
  const n = BACKUP_TABLES.reduce((s, t) => s + S[t].filter((r) => !r.user_id || r.user_id === S.user.id).length, 0);
  return `<div class="card">
    <div class="card-head"><h2>Mis datos</h2></div>
    ${db.DEMO ? `<p class="status bad">Modo prueba: los datos NO se guardan en la nube</p>`
      : `<p><span class="status ok">${icon('check', 14)} Guardado en la nube</span></p>
         <p class="muted small" style="margin-top:8px">${n} registros tuyos en la base de datos. Se ven igual desde cualquier dispositivo.</p>`}
    <button class="btn soft sm" data-action="backup" style="margin-top:10px">${icon('upload', 15)} Descargar copia de mis datos</button>
  </div>`;
}
function downloadBackup() {
  const datos = {};
  BACKUP_TABLES.forEach((t) => { datos[t] = S[t].filter((r) => !r.user_id || r.user_id === S.user.id); });
  const blob = new Blob([JSON.stringify({ app: 'Órbita', usuario: S.user.email, fecha: new Date().toISOString(), datos }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `orbita-${(S.user.email || 'datos').split('@')[0]}-${todayIso()}.json`;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast('Copia descargada');
}

/* ---------- Atajo del iPhone ---------- */
const newToken = () => [...crypto.getRandomValues(new Uint8Array(24))].map((b) => b.toString(16).padStart(2, '0')).join('');
function shortcutCard() {
  const tok = S.share_tokens[0]?.token;
  const copy = (label, val) => `<div class="copy-row"><span>${label}</span><code>${esc(val)}</code>
    <button class="btn soft sm" data-action="copy" data-val="${esc(val)}">Copiar</button></div>`;
  return `<div class="card">
    <div class="card-head"><h2>Guardar desde el iPhone</h2></div>
    <p class="muted small">Para mandar posteos de Instagram, TikTok, YouTube o cualquier link a tus carpetas de ideas con <b>Compartir → Guardar en Órbita</b>.</p>
    ${tok ? `
      ${copy('Tu clave', tok)}
      <button class="btn soft sm" data-action="shortcut-help">${icon('note', 15)} Ver cómo crear el Atajo</button>
      <button class="btn ghost sm" data-action="regen-token">Generar clave nueva</button>`
    : `<button class="btn soft" data-action="regen-token">Activar y generar mi clave</button>`}
  </div>`;
}
function shortcutHelp() {
  const tok = S.share_tokens[0]?.token || '';
  const base = `${CONFIG.supabaseUrl}/rest/v1/rpc/`;
  const c = (v) => `<span class="copy-inline"><code>${esc(v)}</code><button type="button" class="btn soft sm" data-action="copy" data-val="${esc(v)}">Copiar</button></span>`;
  openModal({
    title: 'Crear el Atajo "Guardar en Órbita"', wide: true, accent: 'var(--c-personal)',
    body: `<div class="steps full">
      <p class="muted">Se hace una sola vez en cada iPhone, desde la app <b>Atajos</b> (viene con el iPhone). Tarda unos 5 minutos.</p>
      <ol>
        <li>Abrí <b>Atajos</b> → tocá <b>+</b> (arriba a la derecha). Arriba de todo, tocá el nombre y ponele <b>Guardar en Órbita</b>.</li>
        <li>Tocá la <b>ⓘ</b> (abajo) y activá <b>Mostrar en hoja para compartir</b>. Volvé.</li>
        <li>Agregá la acción <b>Obtener contenido de URL</b>. En URL pegá: ${c(base + 'idea_folders_for_token')}
          Tocá la flechita ▸ para ver más opciones: <b>Método: POST</b>.
          En <b>Encabezados</b> agregá uno: clave <code>apikey</code>, valor: ${c(CONFIG.supabaseKey)}
          En <b>Cuerpo de la solicitud: JSON</b> agregá un campo de <b>Texto</b>: clave <code>p_token</code>, valor: ${c(tok)}</li>
        <li>Agregá <b>Elegir de la lista</b> (usa el resultado anterior). Mensaje: "¿En qué carpeta?".</li>
        <li>Agregá <b>Solicitar entrada</b> (texto). Pregunta: "Nota (opcional)".</li>
        <li>Agregá otra <b>Obtener contenido de URL</b>. URL: ${c(base + 'save_idea')}
          Método <b>POST</b>, mismo encabezado <code>apikey</code>, y en el cuerpo JSON 4 campos de Texto:
          <code>p_token</code> = tu clave · <code>p_url</code> = variable <b>Entrada del atajo</b> ·
          <code>p_folder</code> = variable <b>Elemento elegido</b> · <code>p_note</code> = variable <b>Entrada proporcionada</b>.</li>
        <li>Agregá <b>Mostrar notificación</b> con el texto "Guardado en Órbita". Tocá <b>OK</b>.</li>
      </ol>
      <p class="muted">Listo: en Instagram tocá <b>Compartir</b> (el avioncito) → <b>Más</b> / <b>Compartir en…</b> → <b>Guardar en Órbita</b>. Elegís la carpeta y queda guardado.
        Si en el futuro generás una clave nueva, hay que reemplazarla en los dos pasos del Atajo.</p>
    </div>`,
  });
}

/* ============================== Notas ============================== */
function viewNotes(seg) {
  const ns = S.notes.filter((n) => n.segment === seg)
    .sort((a, b) => (b.pinned - a.pinned) || (b.updated_at || '').localeCompare(a.updated_at || ''));
  return `<div class="notes">
    <button class="note new" data-action="new-note" data-seg="${seg}">${icon('plus', 22)}<span>Nueva nota</span></button>
    ${ns.map((n) => `<button class="note ${n.pinned ? 'pinned' : ''}" data-action="edit-note" data-id="${n.id}">
      ${n.pinned ? `<span class="pin-ico">${icon('star', 14)}</span>` : ''}
      <h4>${esc(n.title)}</h4><p>${esc((n.content || '').slice(0, 220))}</p>
      <small>Editada ${n.updated_at ? relDay(iso(new Date(n.updated_at))).toLowerCase() : ''}</small></button>`).join('')}
  </div>`;
}

/* ============================== Situación mensual (Cuentas) ============================== */
const DEFAULT_ACCOUNTS = [['Santander', 'ARS'], ['Santander FCI', 'ARS'], ['Mercado Pago', 'ARS'], ['Efectivo', 'ARS'], ['Cocos $', 'ARS'],
  ['Plazos fijos', 'ARS'], ['USD efectivo', 'USD'], ['USD Cocos', 'USD'], ['Cocos Cedears', 'USD'], ['USD Santander', 'USD']];
const closingOf = (mk) => S.month_closings.find((c) => c.month === mk);
const accSorted = () => [...S.accounts].sort((a, b) => (a.currency > b.currency) - (a.currency < b.currency) || a.sort - b.sort || a.name.localeCompare(b.name));
const balSum = (cl, cur) => cl ? S.accounts.filter((a) => a.currency === cur).reduce((s, a) => s + Number(cl.balances?.[a.id] || 0), 0) : null;
async function ensureAccounts(list = DEFAULT_ACCOUNTS) {
  const have = new Set(S.accounts.map((a) => a.name.toLowerCase()));
  const rows = list.filter(([n]) => !have.has(n.toLowerCase())).map(([name, currency], i) => ({ name, currency, sort: S.accounts.length + i }));
  if (rows.length) S.accounts.push(...await db.insertMany('accounts', rows));
}
function totals(list) {
  const r = {};
  for (const m of list) { const c = (r[m.currency] ||= { ingreso: 0, gasto: 0 }); c[m.type] += Number(m.amount); }
  return r;
}
function viewSituacion() {
  const mk = S.month;
  const t = todayIso();
  const month = S.movements.filter((m) => m.date.startsWith(mk)).sort((a, b) => b.date.localeCompare(a.date) || (a.type > b.type ? -1 : 1));
  const paid = month.filter((m) => m.paid);
  const tot = totals(paid);
  const cur = closingOf(mk), prev = closingOf(shiftMonth(mk, -1));
  const prevLabel = monthLabel(shiftMonth(mk, -1));
  const openFallback = cur?.extra?.opening ? Object.values(cur.extra.opening).reduce((s, v) => s + Number(v || 0), 0) : null;
  const openArs = prev ? balSum(prev, 'ARS') : openFallback;
  const ingArs = tot.ARS?.ingreso || 0, gasArs = tot.ARS?.gasto || 0;
  const calc = (openArs || 0) + ingArs - gasArs;
  const realArs = cur ? balSum(cur, 'ARS') : null;
  const diff = realArs === null ? null : realArs - calc;
  const okDiff = diff !== null && Math.abs(diff) < 1;
  const status = realArs === null ? `<span class="status warn">Falta cargar la tenencia al cierre</span>`
    : okDiff ? `<span class="status ok">${icon('check', 14)} Cierra</span>` : `<span class="status bad">No cierra: ${money(diff)}</span>`;
  const line = (l, v, cls = '', note = '') => `<div class="money-row ${cls}"><span>${l}${note ? `<small>${note}</small>` : ''}</span><b>${v}</b></div>`;

  // Dólares
  const usdOpen = prev ? balSum(prev, 'USD') : null, usdReal = cur ? balSum(cur, 'USD') : null;
  const fx = Number(cur?.fx) || null;
  const usdCard = (usdReal !== null || tot.USD) ? `<div class="money-card">
      <span class="cur">Dólares</span>
      ${usdOpen !== null ? line('Tenencia inicial', money(usdOpen, 'USD')) : ''}
      ${tot.USD?.ingreso ? line('Ingresos', `<span class="pos">${money(tot.USD.ingreso, 'USD')}</span>`) : ''}
      ${tot.USD?.gasto ? line('Gastos', `<span class="neg">${money(tot.USD.gasto, 'USD')}</span>`) : ''}
      ${usdReal !== null ? line('Tenencia al cierre', money(usdReal, 'USD'), 'total') : ''}
      ${usdReal !== null && usdOpen !== null ? line('Variación del mes', `<span class="${usdReal - usdOpen < 0 ? 'neg' : 'pos'}">${usdReal - usdOpen >= 0 ? '+' : ''}${money(usdReal - usdOpen, 'USD')}</span>`) : ''}
      ${fx && usdReal !== null && realArs !== null ? line('Patrimonio líquido total', money(realArs + usdReal * fx), '', `con dólar a ${money(fx)}`) : ''}
    </div>` : '';

  // Cartera Cocos (si viene del Excel)
  const cc = cur?.extra?.cocos;
  const cocosCard = cc ? (() => {
    const base = (k) => (Number(cc.inicio?.[k]) || 0) + (Number(cc.transf?.[k]) || 0) + (Number(cc.retiros?.[k]) || 0);
    const res = (k) => (Number(cc.cierre?.[k]) || 0) - base(k);
    const pct = base('ars') ? (res('ars') / base('ars')) * 100 : 0;
    return `<div class="money-card"><span class="cur">Cartera Cocos</span>
      ${line('Inicio', `${money(cc.inicio?.ars)}<small> · ${money(cc.inicio?.usd, 'USD')}</small>`)}
      ${cc.transf?.ars ? line('Transferencias', `${money(cc.transf.ars)}<small> · ${money(cc.transf.usd, 'USD')}</small>`) : ''}
      ${cc.retiros?.ars ? line('Retiros', money(cc.retiros.ars)) : ''}
      ${line('Cierre real', `${money(cc.cierre?.ars)}<small> · ${money(cc.cierre?.usd, 'USD')}</small>`, 'total')}
      ${line('Resultado del mes', `<span class="${res('ars') < 0 ? 'neg' : 'pos'}">${money(res('ars'))} · ${pct.toFixed(1).replace('.', ',')}%</span>`)}
    </div>`; })() : '';

  // Tenencia por cuenta
  const accs = accSorted().filter((a) => a.active !== false || Number(cur?.balances?.[a.id]));
  const tenencia = cur ? `${['ARS', 'USD'].map((c) => {
      const l = accs.filter((a) => a.currency === c); if (!l.length) return '';
      return `<div class="cats"><h4>${c === 'ARS' ? 'Pesos' : 'Dólares'}</h4>${l.map((a) => `<div class="money-row"><span>${esc(a.name)}</span><b>${money(cur.balances?.[a.id] || 0, c)}</b></div>`).join('')}
        <div class="money-row total"><span>Total</span><b>${money(balSum(cur, c), c)}</b></div></div>`; }).join('')}`
    : `<p class="empty">Todavía no cargaste cuánto tenés en cada cuenta a fin de ${MESES[Number(mk.slice(5)) - 1]}.</p>`;

  const cats = (type, cur_) => {
    const g = {};
    paid.filter((m) => m.type === type && m.currency === cur_).forEach((m) => { g[m.category || 'Otros'] = (g[m.category || 'Otros'] || 0) + Number(m.amount); });
    const arr = Object.entries(g).sort((a, b) => b[1] - a[1]); const max = arr[0]?.[1] || 1;
    if (!arr.length) return '';
    return `<div class="cats ${type}">${cur_ === 'USD' ? '<h4>En dólares</h4>' : ''}${arr.map(([k, v]) => `
      <div class="cat"><div class="cat-top"><span>${esc(k)}</span><b>${money(v, cur_)}</b></div>
      <div class="bar"><i style="width:${Math.max(3, (v / max) * 100)}%"></i></div></div>`).join('')}</div>`;
  };
  const due = S.movements.filter((m) => !m.paid).sort((a, b) => a.date.localeCompare(b.date));
  const groups = {};
  month.forEach((m) => (groups[m.date] ||= []).push(m));
  const row = (m) => `<button class="mov" data-action="edit-mov" data-id="${m.id}">
      <span class="mov-ico ${m.type}">${icon(m.type === 'ingreso' ? 'trend' : 'wallet', 16)}</span>
      <span class="mov-main"><strong>${esc(m.description || m.category || '—')}</strong><small>${[m.category && m.category !== m.description ? esc(m.category) : '', !m.paid ? '<em>a pagar</em>' : '', m.source ? 'importado del Excel' : ''].filter(Boolean).join(' · ')}</small></span>
      <b class="${m.type === 'ingreso' ? 'pos' : 'neg'}">${m.type === 'ingreso' ? '+' : '−'} ${money(m.amount, m.currency)}</b></button>`;

  return `
    <div class="month-bar">
      <button class="icon-btn" data-action="month" data-n="-1" aria-label="Mes anterior">${icon('left', 18)}</button>
      <strong>${monthLabel(mk)}</strong>
      <button class="icon-btn" data-action="month" data-n="1" aria-label="Mes siguiente">${icon('right', 18)}</button>
      <div class="month-actions">
        <label class="btn soft sm">${icon('upload', 15)} Importar Excel<input type="file" id="xlsInput" accept=".xlsx,.xlsm,.xls" hidden></label>
        <button class="btn soft sm" data-action="closing">${icon('check', 15)} Cargar cierre</button>
      </div>
    </div>
    <div class="money-cards sit-cards">
      <div class="money-card control">
        <div class="control-head"><span class="cur">Control del mes · pesos</span>${status}</div>
        ${line('Saldo inicial', openArs === null ? '—' : money(openArs), '', prev ? `tenencia a fin de ${prevLabel.toLowerCase()}` : openFallback !== null ? 'según el Excel' : `cargá el cierre de ${prevLabel.toLowerCase()}`)}
        ${line('+ Ingresos', `<span class="pos">${money(ingArs)}</span>`)}
        ${line('− Gastos', `<span class="neg">${money(gasArs)}</span>`)}
        ${line('= Saldo calculado', money(calc), 'total')}
        ${line('Tenencia real al cierre', realArs === null ? '—' : money(realArs))}
        ${diff !== null ? line('Diferencia', `<span class="${okDiff ? 'pos' : 'neg'}">${okDiff ? '$ 0,00' : money(diff)}</span>`) : ''}
      </div>
      ${usdCard}${cocosCard}
    </div>
    <div class="grid-main">
      <div class="side-col">
        <div class="card"><div class="card-head"><h2>Ingresos</h2><b class="pos">${money(ingArs)}</b></div>
          ${cats('ingreso', 'ARS') + cats('ingreso', 'USD') || '<p class="empty">Sin ingresos cargados.</p>'}</div>
        <div class="card"><div class="card-head"><h2>Gastos por categoría</h2><b class="neg">${money(gasArs)}</b></div>
          ${cats('gasto', 'ARS') + cats('gasto', 'USD') || '<p class="empty">Sin gastos cargados.</p>'}</div>
        <div class="card">
          <div class="card-head"><h2>Movimientos del mes</h2><small class="muted">${month.length} registros</small></div>
          ${month.length ? Object.entries(groups).map(([d, l]) => `<div class="day-group"><h4>${cap(fmtDate(d, { weekday: 'long', day: 'numeric', month: 'long' }))}</h4>${l.map(row).join('')}</div>`).join('')
            : '<p class="empty">No hay movimientos cargados en este mes.</p>'}
        </div>
      </div>
      <div class="side-col">
        <div class="card"><div class="card-head"><h2>Tenencia al cierre</h2>
          <button class="btn soft sm" data-action="closing">${cur ? 'Editar' : 'Cargar'}</button></div>${tenencia}</div>
        <div class="card">
          <div class="card-head"><h2>Por pagar</h2><small class="muted">aparecen en el calendario</small></div>
          ${due.length ? due.map((m) => `<div class="due-row">
            <button class="due-main" data-action="edit-mov" data-id="${m.id}"><strong>${esc(m.description || m.category)}</strong>
              <small class="${m.date < t ? 'late' : ''}">${relDay(m.date)} · ${money(m.amount, m.currency)}</small></button>
            <button class="btn soft sm" data-action="pay-mov" data-id="${m.id}">${icon('check', 15)} Pagado</button></div>`).join('')
            : '<p class="empty">Nada pendiente de pago.</p>'}
        </div>
      </div>
    </div>`;
}

/* ---------- Cierre del mes: cuánto hay en cada cuenta ---------- */
async function closingForm(mk = S.month) {
  if (!S.accounts.length) { try { await ensureAccounts(); } catch (e) { toast(e.message, true); return; } }
  const cl = closingOf(mk) || {};
  const accs = accSorted().filter((a) => a.active !== false || Number(cl.balances?.[a.id]));
  const grp = (c) => { const l = accs.filter((a) => a.currency === c); return l.length ? `<h4 class="full sub">${c === 'ARS' ? 'Pesos' : 'Dólares'}</h4>
    ${l.map((a) => field({ name: 'b_' + a.id, label: a.name, type: 'number', value: cl.balances?.[a.id] ?? '', step: '0.01', inputmode: 'decimal' })).join('')}` : ''; };
  openModal({
    title: `Tenencia a fin de ${monthLabel(mk).toLowerCase()}`, accent: 'var(--c-cuentas)', wide: true,
    body: `<p class="muted full small">Cuánto había realmente en cada cuenta el último día del mes. Con esto la app controla que cierre.</p>
      ${grp('ARS')}${grp('USD')}
      <h4 class="full sub">Otros</h4>
      ${field({ name: 'fx', label: 'Cotización del dólar (opcional)', type: 'number', value: cl.fx ?? '', step: '0.01', inputmode: 'decimal' })}
      ${field({ name: 'notes', label: 'Notas', value: cl.notes })}
      <div class="full"><button type="button" class="btn ghost sm" data-action="accounts">${icon('edit', 15)} Agregar o renombrar cuentas</button></div>`,
    onSubmit: async (d) => {
      const balances = { ...(cl.balances || {}) };
      for (const a of accs) { const v = d['b_' + a.id]; balances[a.id] = v == null ? 0 : Number(String(v).replace(',', '.')); }
      const row = { user_id: S.user.id, month: mk, balances, fx: d.fx == null ? null : Number(String(d.fx).replace(',', '.')), notes: d.notes, extra: cl.extra || {} };
      const [rec] = await db.upsertMany('month_closings', [row], ['user_id', 'month']);
      S.month_closings = [...S.month_closings.filter((c) => c.month !== mk), rec]; render(); toast('Cierre guardado');
    },
  });
}
function accountsForm() {
  const accs = accSorted();
  const opts = [['ARS', 'Pesos'], ['USD', 'Dólares']];
  openModal({
    title: 'Mis cuentas', accent: 'var(--c-cuentas)', wide: true,
    body: `<p class="muted full small">Bancos, billeteras, efectivo e inversiones. Destildá "Activa" para ocultar una cuenta que ya no usás (no se borra su historia).</p>
      ${accs.map((a) => `<div class="acc-row full">${field({ name: `n_${a.id}`, label: 'Nombre', value: a.name, required: true })}
        ${field({ name: `c_${a.id}`, label: 'Moneda', type: 'select', value: a.currency, options: opts })}
        ${field({ name: `a_${a.id}`, label: 'Activa', type: 'checkbox', value: a.active !== false })}</div>`).join('')}
      <h4 class="full sub">Agregar</h4>
      ${[1, 2].map((i) => `<div class="acc-row full">${field({ name: `nn_${i}`, label: 'Nueva cuenta', placeholder: 'Ej: Brubank' })}
        ${field({ name: `nc_${i}`, label: 'Moneda', type: 'select', value: 'ARS', options: opts })}<span></span></div>`).join('')}`,
    onSubmit: async (d) => {
      for (const a of accs) {
        const patch = { name: d[`n_${a.id}`], currency: d[`c_${a.id}`], active: d[`a_${a.id}`] };
        if (patch.name !== a.name || patch.currency !== a.currency || patch.active !== (a.active !== false)) {
          const rec = await db.update('accounts', a.id, patch); S.accounts = S.accounts.map((x) => (x.id === a.id ? rec : x));
        }
      }
      const nuevos = [1, 2].filter((i) => d[`nn_${i}`]).map((i, k) => ({ name: d[`nn_${i}`], currency: d[`nc_${i}`], sort: S.accounts.length + k }));
      if (nuevos.length) S.accounts.push(...await db.insertMany('accounts', nuevos));
      render(); toast('Cuentas guardadas');
    },
  });
}

/* ---------- Importar el Excel mensual ---------- */
const XLSX_URL = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs';
async function importExcel(file) {
  toast('Leyendo el Excel…');
  let months;
  try {
    const [XLSX, imp] = await Promise.all([import(XLSX_URL), import('./importer.js')]);
    const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true });
    months = imp.parseWorkbook(wb, XLSX);
  } catch (e) { console.error(e); toast('No pude leer el archivo: ' + (e.message || e), true); return; }
  const ok = months.filter((m) => !m.error);
  if (!ok.length) { toast('No encontré hojas de meses con el formato esperado', true); return; }
  const imported = new Set(S.month_closings.filter((c) => c.extra?.source === 'excel').map((c) => c.month));
  const sumA = (l) => l.filter((x) => (x.currency || 'ARS') === 'ARS').reduce((s, x) => s + x.amount, 0);
  const rows = [...ok].reverse().map((m) => {
    const closes = m.sobrante == null || Math.abs(m.calc - m.realArs) < 1;
    return `<label class="imp-row"><input type="checkbox" name="m_${m.month}" checked>
      <span class="imp-m">${monthLabel(m.month)}${imported.has(m.month) ? ' <em>ya importado</em>' : ''}</span>
      <span class="pos">${money(sumA(m.incomes))}</span><span class="neg">${money(sumA(m.expenses))}</span>
      <span>${money(m.realArs)}</span><span class="${closes ? 'pos' : 'neg'}">${closes ? icon('check', 14) : 'Dif. ' + money(m.realArs - m.calc)}</span></label>`;
  }).join('');
  const skipped = months.filter((m) => m.error).length;
  const root = openModal({
    title: 'Importar Excel de cuentas', wide: true, accent: 'var(--c-cuentas)', submitLabel: 'Importar meses elegidos',
    body: `<div class="full imp">
      <p class="muted small">Encontré <b>${ok.length} meses</b>${skipped ? ` (y ${skipped} de formato anterior que no se pueden leer)` : ''}. Por cada mes se cargan
        los ingresos y gastos por categoría, la tenencia de cada cuenta al cierre, la cotización y la cartera Cocos.
        Si un mes ya estaba importado se reemplaza, sin duplicar. Lo que cargaste a mano no se toca.</p>
      <div class="imp-tools"><button type="button" class="btn ghost sm" data-sel="all">Elegir todos</button><button type="button" class="btn ghost sm" data-sel="none">Ninguno</button>
        <button type="button" class="btn ghost sm" data-sel="12">Últimos 12</button></div>
      <div class="imp-head"><span></span><span>Mes</span><span>Ingresos</span><span>Gastos</span><span>Tenencia</span><span>Control</span></div>
      <div class="imp-list">${rows}</div></div>`,
    onSubmit: async (d) => {
      const sel = ok.filter((m) => d['m_' + m.month]);
      if (!sel.length) throw new Error('Elegí al menos un mes.');
      // 1) cuentas que falten
      const names = new Map();
      sel.forEach((m) => Object.entries(m.balances).forEach(([n, b]) => names.set(n, b.currency)));
      await ensureAccounts([...names.entries()]);
      const idOf = (n) => S.accounts.find((a) => a.name.toLowerCase() === n.toLowerCase())?.id;
      // 2) movimientos: borra los importados antes de esos meses y carga los nuevos
      await db.removeWhereIn('movements', 'source', sel.map((m) => 'excel:' + m.month));
      const last = (mk) => iso(new Date(Number(mk.slice(0, 4)), Number(mk.slice(5)), 0));
      const movs = sel.flatMap((m) => [
        ...m.incomes.map((x) => ({ type: 'ingreso', category: x.category, description: x.category, amount: Math.abs(x.amount), currency: 'ARS', date: last(m.month), paid: true, source: 'excel:' + m.month })),
        ...m.expenses.map((x) => ({ type: 'gasto', category: x.category, description: x.category, amount: Math.abs(x.amount), currency: x.currency, date: last(m.month), paid: true, source: 'excel:' + m.month })),
      ].filter((x) => x.amount > 0));
      await db.insertMany('movements', movs);
      // 3) cierres
      const cls = sel.map((m) => {
        const balances = {}; Object.entries(m.balances).forEach(([n, b]) => { const id = idOf(n); if (id) balances[id] = b.amount; });
        return { user_id: S.user.id, month: m.month, balances, fx: m.fx, extra: { source: 'excel', opening: m.opening, cocos: m.cocos } };
      });
      await db.upsertMany('month_closings', cls, ['user_id', 'month']);
      Object.assign(S, await db.loadAll());
      splitShared();
      S.month = sel[sel.length - 1].month;
      render(); toast(`Listo: ${sel.length} mes${sel.length > 1 ? 'es' : ''} importado${sel.length > 1 ? 's' : ''}`);
    },
  });
  root.querySelectorAll('[data-sel]').forEach((b) => b.addEventListener('click', () => {
    const boxes = [...root.querySelectorAll('.imp-list input')];
    boxes.forEach((x, i) => { x.checked = b.dataset.sel === 'all' || (b.dataset.sel === '12' && i < 12); });
  }));
}

function viewInversiones() {
  const act = S.investments.filter((v) => v.active);
  const closed = S.investments.filter((v) => !v.active);
  const curs = [...new Set(act.map((v) => v.currency))].sort();
  const sum = (cur) => {
    const l = act.filter((v) => v.currency === cur);
    const inv = l.reduce((s, v) => s + Number(v.invested || 0), 0);
    const cur_ = l.reduce((s, v) => s + Number(v.current_value ?? v.invested ?? 0), 0);
    const pct = inv ? ((cur_ - inv) / inv) * 100 : 0;
    return `<div class="money-card">
      <span class="cur">${cur === 'ARS' ? 'Pesos' : 'Dólares'}</span>
      <div class="money-row"><span>Invertido</span><b>${money(inv, cur)}</b></div>
      <div class="money-row"><span>Valor actual</span><b>${money(cur_, cur)}</b></div>
      <div class="money-row total"><span>Resultado</span><b class="${cur_ - inv < 0 ? 'neg' : 'pos'}">${money(cur_ - inv, cur)} · ${pct.toFixed(1).replace('.', ',')}%</b></div>
    </div>`;
  };
  const card = (v) => {
    const val = Number(v.current_value ?? v.invested); const res = val - Number(v.invested || 0);
    const pct = v.invested ? (res / v.invested) * 100 : 0;
    return `<button class="inv" data-action="edit-inv" data-id="${v.id}">
      <div class="inv-top"><span class="tag">${esc(v.kind || 'Inversión')}</span><span class="cur-tag">${v.currency}</span></div>
      <h4>${esc(v.name)}</h4>
      <strong class="inv-val">${money(val, v.currency)}</strong>
      <small class="${res < 0 ? 'neg' : 'pos'}">${res >= 0 ? '+' : ''}${money(res, v.currency)} (${pct.toFixed(1).replace('.', ',')}%)</small>
      ${v.maturity_date ? `<small class="muted">${icon('cal', 13)} Vence ${relDay(v.maturity_date).toLowerCase()}</small>` : ''}
    </button>`;
  };
  return `
    ${curs.length ? `<div class="money-cards">${curs.map(sum).join('')}</div>` : ''}
    <div class="invs">${act.map(card).join('') || `<div class="card empty-card">${icon('trend', 28)}<p>Todavía no cargaste inversiones.</p></div>`}</div>
    ${closed.length ? `<h2 class="section-title">Cerradas</h2><div class="invs past">${closed.map(card).join('')}</div>` : ''}`;
}

/* ============================== Formularios ============================== */
function itemForm(seg, item = {}, preset = {}) {
  const s = SEG[seg];
  const kind = item.kind || preset.kind || s.kinds[0];
  const isTurno = kind === 'turno' || kind === 'salud';
  const steps = [['d7', '1 semana'], ['m1', '1 mes'], ['m3', '3 meses'], ['m6', '6 meses'], ['m12', '1 año']];
  const root = openModal({
    title: item.id ? `Editar · ${KIND[kind] || 'Tarea'}` : kind === 'turno' ? 'Nuevo turno médico'
      : kind === 'salud' ? 'Nuevo recordatorio de salud' : `Nuevo en ${s.label}`,
    accent: s.color,
    body: `
      ${field({ name: 'title', label: isTurno ? 'Especialidad / motivo' : 'Título', value: item.title, required: true, full: true,
        placeholder: kind === 'salud' ? 'Ej: Endocrinología — repetir análisis' : isTurno ? 'Ej: Dermatología — control anual' : '' })}
      ${field({ name: 'kind', label: 'Tipo', type: 'select', value: kind, options: s.kinds.map((k) => [k, KIND[k]]) })}
      ${field({ name: 'status', label: 'Columna', type: 'select', value: item.status || preset.status || boardCols(seg)[0][0], options: boardCols(seg) })}
      ${field({ name: 'due_date', label: 'Fecha', type: 'date', value: item.due_date || preset.date })}
      ${field({ name: 'due_time', label: 'Hora', type: 'time', value: hhmm(item.due_time) })}
      <div class="quick-dates full"><span>Fecha rápida, desde hoy:</span>${steps.map(([k, l]) => `<button type="button" class="qd" data-step="${k}">+ ${l}</button>`).join('')}</div>
      ${field({ name: 'priority', label: 'Prioridad', type: 'select', value: item.priority || 'media', options: PRIO })}
      ${field({ name: 'location', label: isTurno ? 'Profesional / lugar' : 'Lugar (opcional)', value: item.location })}
      ${field({ name: 'description', label: 'Notas', type: 'textarea', value: item.description, full: true })}
      ${db.DEMO ? '' : field({ name: 'shared', label: `Compartir con ${otherName()} (lo ve en su calendario, sin poder editarlo)`, type: 'checkbox', value: item.shared, full: true })}`,
    onSubmit: async (d) => {
      const row = { ...d, segment: seg };
      if (item.id) await save('items', item.id, row, true); else await add('items', row);
    },
    onDelete: item.id ? () => del('items', item.id) : null,
  });
  root.querySelectorAll('[data-step]').forEach((b) => b.addEventListener('click', () => {
    const k = b.dataset.step, n = Number(k.slice(1));
    root.querySelector('[name=due_date]').value = iso(k[0] === 'd' ? addDays(today(), n) : addMonths(today(), n));
  }));
}

// Vista de solo lectura de algo que compartió el otro usuario
function sharedModal(x, date, rec = false) {
  openModal({
    title: x.title, accent: SEG[x.segment].color,
    body: `<div class="occ full">
      <p class="shared-pill">${icon('users', 13)} Compartido por ${esc(otherName(x.user_id))}</p>
      <p><strong>${fmtLong(date)}</strong>${x.due_time ? ' · ' + hhmm(x.due_time) : ''}</p>
      <p class="muted">${SEG[x.segment].label} · ${esc(KIND[x.kind] || '')}${rec ? ' · ' + freqText(x) : ''}${x.location ? ' · ' + esc(x.location) : ''}</p>
      ${x.description || x.notes ? `<p class="occ-notes">${esc(x.description || x.notes)}</p>` : ''}
      <p class="muted small">Solo ${esc(otherName(x.user_id))} puede modificarlo.</p>
    </div>`,
  });
}

/* ---------- Recurrentes ---------- */
function recForm(seg, r = {}, preset = {}) {
  const cfg = REC[seg];
  const freq = r.freq || preset.freq || cfg.freq;
  const wrap = (fq, html, full = false) => `<div class="fq ${full ? 'full' : ''}" data-fq="${fq}">${html}</div>`;
  const root = openModal({
    title: r.id ? 'Editar recurrente' : seg === 'cuentas' ? 'Nuevo vencimiento fijo' : seg === 'personal' ? 'Nueva fecha que se repite' : 'Nuevo recurrente',
    accent: SEG[seg].color,
    body: `
      ${field({ name: 'title', label: 'Nombre', value: r.title, required: true, full: true, placeholder: cfg.ph })}
      ${cfg.kinds.length > 1 ? field({ name: 'kind', label: 'Tipo', type: 'select', value: r.kind || preset.kind || cfg.kinds[0], options: cfg.kinds.map((k) => [k, KIND[k]]) })
        : `<input type="hidden" name="kind" value="${cfg.kinds[0]}">`}
      ${field({ name: 'freq', label: 'Se repite', type: 'select', value: freq, options: FREQ, full: cfg.kinds.length === 1 })}
      ${wrap('meses', `<div class="full"><span class="lbl">Meses en que se hace</span>
        <div class="month-pick">${MESES.map((m, i) => `<button type="button" class="mp ${(r.months || []).map(Number).includes(i + 1) ? 'on' : ''}" data-m="${i + 1}">${cap(m.slice(0, 3))}</button>`).join('')}</div>
        <div class="mp-presets"><span>Atajos:</span>${[['Ene·Abr·Jul·Oct', [1, 4, 7, 10]], ['Feb·May·Ago·Nov', [2, 5, 8, 11]], ['Mar·Jun·Sep·Dic', [3, 6, 9, 12]], ['Semestral (Ene·Jul)', [1, 7]]]
          .map(([l, ms]) => `<button type="button" class="qd" data-ms="${ms.join(',')}">${l}</button>`).join('')}</div></div>`, true)}
      ${wrap('mensual anual meses', field({ name: 'day_of_month', label: 'Día', type: 'number', value: r.day_of_month ?? '', inputmode: 'numeric', placeholder: '1 a 31' }))}
      ${wrap('anual', field({ name: 'month', label: 'Mes', type: 'select', value: r.month || today().getMonth() + 1, options: MESES.map((m, i) => [i + 1, cap(m)]) }))}
      ${wrap('semanal', field({ name: 'weekday', label: 'Día de la semana', type: 'select', value: r.weekday ?? 0, options: DIAS_PL.map((d, i) => [i, cap(d)]) }))}
      ${field({ name: 'due_time', label: 'Hora (opcional)', type: 'time', value: hhmm(r.due_time) })}
      ${seg === 'cuentas' ? `
        ${field({ name: 'amount', label: 'Monto aproximado (opcional)', type: 'number', value: r.amount, step: '0.01', inputmode: 'decimal' })}
        ${field({ name: 'currency', label: 'Moneda', type: 'select', value: r.currency || 'ARS', options: [['ARS', 'Pesos (ARS)'], ['USD', 'Dólares (USD)']] })}` : ''}
      ${field({ name: 'start_date', label: 'Desde', type: 'date', value: r.start_date || todayIso() })}
      ${field({ name: 'end_date', label: 'Hasta (opcional)', type: 'date', value: r.end_date })}
      ${field({ name: 'notes', label: 'Notas', type: 'textarea', value: r.notes, full: true })}
      ${r.id ? field({ name: 'active', label: 'Activo (destildalo para pausarlo sin borrarlo)', type: 'checkbox', value: r.active !== false, full: true }) : ''}
      ${db.DEMO || seg === 'cuentas' ? '' : field({ name: 'shared', label: `Compartir con ${otherName()} (lo ve en su calendario)`, type: 'checkbox', value: r.shared, full: true })}`,
    onSubmit: async (d) => {
      const row = { ...d, segment: seg };
      if (row.freq === 'semanal') { row.weekday = Number(row.weekday); row.day_of_month = null; row.month = null; }
      else {
        row.day_of_month = Number(row.day_of_month);
        if (!(row.day_of_month >= 1 && row.day_of_month <= 31)) throw new Error('Poné un día entre 1 y 31.');
        row.month = row.freq === 'anual' ? Number(row.month) : null; row.weekday = null;
      }
      row.months = row.freq === 'meses' ? [...months].sort((a, b) => a - b) : null;
      if (row.freq === 'meses' && !row.months.length) throw new Error('Elegí al menos un mes.');
      if ('amount' in row) row.amount = row.amount == null ? null : Number(String(row.amount).replace(',', '.'));
      if (row.end_date && row.end_date < row.start_date) throw new Error('La fecha "Hasta" es anterior a "Desde".');
      if (!r.id) row.done_dates = [];
      if (r.id) await save('recurring', r.id, row, true); else await add('recurring', row);
    },
    onDelete: r.id ? () => del('recurring', r.id) : null,
  });
  const months = new Set((r.months || []).map(Number));
  const paint = () => root.querySelectorAll('.mp').forEach((b) => b.classList.toggle('on', months.has(Number(b.dataset.m))));
  root.querySelectorAll('.mp').forEach((b) => b.addEventListener('click', () => { const m = Number(b.dataset.m); months.has(m) ? months.delete(m) : months.add(m); paint(); }));
  root.querySelectorAll('[data-ms]').forEach((b) => b.addEventListener('click', () => { months.clear(); b.dataset.ms.split(',').forEach((m) => months.add(Number(m))); paint(); }));
  const sel = root.querySelector('[name=freq]');
  const sync = () => root.querySelectorAll('.fq').forEach((w) => { w.hidden = !w.dataset.fq.split(' ').includes(sel.value); });
  sel.addEventListener('change', sync); sync();
}

// Al tocar un recurrente en el calendario: marcar esa fecha como hecha/pagada o editarlo
function occModal(r, date) {
  const done = isDone(r, date);
  openModal({
    title: r.title, accent: SEG[r.segment].color,
    body: `<div class="occ full">
      <p><strong>${fmtLong(date)}</strong>${r.due_time ? ' · ' + hhmm(r.due_time) : ''}</p>
      <p class="muted">${SEG[r.segment].label} · ${freqText(r)}${r.amount ? ` · aprox. ${money(r.amount, r.currency)}` : ''}</p>
      ${r.notes ? `<p class="occ-notes">${esc(r.notes)}</p>` : ''}
      ${done ? `<p class="ok">${icon('check', 15)} Marcado como ${r.segment === 'cuentas' ? 'pagado' : 'hecho'}</p>` : ''}
      <button type="button" class="btn soft sm" data-action="edit-rec" data-id="${r.id}">Editar recurrente</button>
    </div>`,
    submitLabel: done ? 'Desmarcar' : r.segment === 'cuentas' ? 'Marcar como pagado' : 'Marcar como hecho',
    onSubmit: () => toggleDone(r.id, date),
  });
}
async function toggleDone(id, date) {
  const r = S.recurring.find((x) => x.id === id); if (!r) return;
  const has = isDone(r, date);
  const done_dates = has ? r.done_dates.filter((d) => d !== date) : [...(r.done_dates || []), date].sort().slice(-60);
  await save('recurring', id, { done_dates });
  toast(has ? 'Desmarcado' : r.segment === 'cuentas' ? 'Marcado como pagado' : 'Marcado como hecho');
}

/* ---------- Plan anual ---------- */
function workForm(w = {}) {
  const lv = { ...(w.levels || {}) };
  const root = openModal({
    title: w.id ? 'Editar trabajo anual' : 'Nuevo trabajo anual', accent: 'var(--c-trabajo)',
    body: `
      ${field({ name: 'title', label: 'Cliente / trabajo', value: w.title, required: true, full: true, placeholder: 'Ej: Becha — balance (cierre marzo)' })}
      ${field({ name: 'detail', label: 'Detalle (opcional)', value: w.detail, full: true, placeholder: 'Ej: auditoría + legalización' })}
      <div class="full"><span class="lbl">Meses que te ocupa (tocá para cambiar el nivel)</span>
        <div class="lvl-pick">${MESES.map((m, i) => `<button type="button" class="plan-cell lvl-${Number(lv[i + 1] || 0)}" data-m="${i + 1}">${cap(m.slice(0, 3))}</button>`).join('')}</div>
        <div class="plan-legend">${LVL.map((l, i) => `<span><i class="plan-cell lvl-${i}"></i>${l}</span>`).join('')}</div></div>`,
    onSubmit: async (d) => {
      const row = { title: d.title, detail: d.detail, levels: lv };
      if (w.id) await save('workload', w.id, row, true); else await add('workload', row);
    },
    onDelete: w.id ? () => del('workload', w.id) : null,
  });
  root.querySelectorAll('.lvl-pick [data-m]').forEach((b) => b.addEventListener('click', () => {
    const m = b.dataset.m, v = (Number(lv[m] || 0) + 1) % 4;
    if (v) lv[m] = v; else delete lv[m];
    b.className = `plan-cell lvl-${v}`;
  }));
}

function noteForm(seg, n = {}) {
  openModal({
    title: n.id ? 'Editar nota' : `Nueva nota · ${SEG[seg].label}`, wide: true, accent: SEG[seg].color,
    body: `${field({ name: 'title', label: 'Título', value: n.title, required: true, full: true })}
      ${field({ name: 'content', label: 'Contenido', type: 'textarea', value: n.content, full: 'xl', placeholder: 'Escribí libremente…' })}
      ${field({ name: 'pinned', label: 'Fijar arriba', type: 'checkbox', value: n.pinned })}`,
    onSubmit: async (d) => { const row = { ...d, segment: seg }; if (n.id) await save('notes', n.id, row, true); else await add('notes', row); },
    onDelete: n.id ? () => del('notes', n.id) : null,
  });
}

function movForm(m = {}) {
  const root = openModal({
    title: m.id ? 'Editar movimiento' : 'Nuevo movimiento', accent: 'var(--c-cuentas)',
    body: `
      ${field({ name: 'type', label: 'Tipo', type: 'select', value: m.type || 'gasto', options: [['gasto', 'Gasto'], ['ingreso', 'Ingreso']] })}
      ${field({ name: 'date', label: 'Fecha', type: 'date', value: m.date || todayIso(), required: true })}
      ${field({ name: 'description', label: 'Descripción', value: m.description, required: true, full: true })}
      ${field({ name: 'category', label: 'Categoría', value: m.category, list: 'cats', placeholder: 'Elegí o escribí una nueva' })}
      <datalist id="cats">${catList(m.type || 'gasto').map((c) => `<option value="${esc(c)}">`).join('')}</datalist>
      <div class="full cat-link"><button type="button" class="btn ghost sm" data-action="customize" data-seg="cuentas">${icon('edit', 14)} Editar mis categorías</button></div>
      ${field({ name: 'currency', label: 'Moneda', type: 'select', value: m.currency || 'ARS', options: [['ARS', 'Pesos (ARS)'], ['USD', 'Dólares (USD)']] })}
      ${field({ name: 'amount', label: 'Monto', type: 'number', value: m.amount, required: true, step: '0.01', inputmode: 'decimal' })}
      ${field({ name: 'paid', label: 'Ya está pagado / cobrado (si no, queda como vencimiento en el calendario)', type: 'checkbox', value: m.id ? m.paid : true, full: true })}`,
    onSubmit: async (d) => {
      d.amount = Number(String(d.amount).replace(',', '.'));
      if (!(d.amount > 0)) throw new Error('El monto tiene que ser mayor a cero.');
      if (m.id) await save('movements', m.id, d, true); else await add('movements', d);
      // Una categoría nueva escrita a mano queda guardada en mi lista
      const list = catList(d.type);
      if (d.category && !list.includes(d.category)) {
        try { await savePrefs({ categories: { ...(prefs().categories || {}), [d.type]: [...list, d.category], [d.type === 'gasto' ? 'ingreso' : 'gasto']: catList(d.type === 'gasto' ? 'ingreso' : 'gasto') } }); } catch {}
      }
    },
    onDelete: m.id ? () => del('movements', m.id) : null,
  });
  bindMovType(root);
}

function bindMovType(root) {
  const t = root.querySelector('[name=type]'); const dl = root.querySelector('#cats');
  if (t && dl) t.addEventListener('change', () => { dl.innerHTML = catList(t.value).map((c) => `<option value="${esc(c)}">`).join(''); });
}

/* ---------- Personalizar un segmento (cada usuario el suyo) ---------- */
function customizeForm(seg) {
  const s = SEG[seg];
  const hid = prefs().hiddenTabs?.[seg] || [];
  const hasBoard = s.tabs.some(([k]) => k === 'tablero');
  const C = boardCols(seg);
  const its = S.items.filter((i) => i.segment === seg);
  const cnt = (k) => its.filter((i) => (C.some(([kk]) => kk === i.status) ? i.status : C[0][0]) === k).length;
  const catRows = (type) => catList(type).map((c, i) => `<div class="edit-row">
      <input name="cat_${type}_${i}" value="${esc(c)}" data-old="${esc(c)}">
      <label class="check sm"><input type="checkbox" name="catdel_${type}_${i}"><span>Quitar</span></label></div>`).join('');
  const root = openModal({
    title: `Personalizar ${s.label}`, accent: s.color, wide: true,
    body: `<p class="muted small full">Estos cambios son solo para vos: ${esc(otherName())} no ve ninguna diferencia.</p>
      <div class="full"><h4 class="sub">Pestañas que querés ver</h4>
        <div class="tab-checks">${s.tabs.map(([k, l]) => `<label class="check"><input type="checkbox" name="tab_${k}" ${hid.includes(k) ? '' : 'checked'}><span>${l}</span></label>`).join('')}</div>
        <p class="muted small">Ocultar una pestaña no borra nada: si la volvés a activar, está todo como lo dejaste.</p></div>
      ${hasBoard ? `<div class="full"><h4 class="sub">Columnas del tablero</h4>
        ${C.map(([k, l], i) => `<div class="edit-row"><input name="col_${i}" value="${esc(l)}" data-key="${k}" maxlength="24">
          ${k === 'hecho' ? '<small class="muted">siempre está (marca lo terminado)</small>'
            : cnt(k) ? `<small class="muted">${cnt(k)} tarjeta${cnt(k) > 1 ? 's' : ''}: movelas para poder quitarla</small>`
            : `<label class="check sm"><input type="checkbox" name="coldel_${i}"><span>Quitar</span></label>`}</div>`).join('')}
        <div class="edit-row"><input name="col_new" placeholder="Nueva columna (ej: Fechas)" maxlength="24"><span></span></div></div>` : ''}
      ${seg === 'cuentas' ? ['gasto', 'ingreso'].map((type) => `<div class="full"><h4 class="sub">Categorías de ${type === 'gasto' ? 'gastos' : 'ingresos'}</h4>
        ${catRows(type)}
        <div class="edit-row"><input name="catnew_${type}" placeholder="Nueva categoría"><span></span></div></div>`).join('')
        + '<p class="muted small full">Si renombrás una categoría, también se actualizan tus movimientos que la usan. Quitarla solo la saca de la lista: los movimientos viejos no se tocan.</p>' : ''}`,
    onSubmit: async (d) => {
      const hiddenTabs = { ...(prefs().hiddenTabs || {}) };
      hiddenTabs[seg] = s.tabs.filter(([k]) => !d['tab_' + k]).map(([k]) => k);
      if (hiddenTabs[seg].length === s.tabs.length) throw new Error('Dejá al menos una pestaña visible.');
      const patch = { hiddenTabs };
      if (hasBoard) {
        let cols = C.map(([k], i) => ({ key: k, label: (d['col_' + i] || '').trim() || C[i][1], del: !!d['coldel_' + i] })).filter((c) => !c.del).map(({ key, label }) => ({ key, label }));
        if (d.col_new) {
          const nc = { key: 'c_' + Math.random().toString(36).slice(2, 8), label: d.col_new.trim() };
          const h = cols.findIndex((c) => c.key === 'hecho');
          if (h >= 0) cols.splice(h, 0, nc); else cols.push(nc);
        }
        if (!cols.length) throw new Error('El tablero necesita al menos una columna.');
        patch.boards = { ...(prefs().boards || {}), [seg]: cols };
      }
      const renames = [];
      if (seg === 'cuentas') {
        const categories = {};
        for (const type of ['gasto', 'ingreso']) {
          const list = catList(type); const out = [];
          list.forEach((old, i) => {
            if (d[`catdel_${type}_${i}`]) return;
            const nv = (d[`cat_${type}_${i}`] || '').trim() || old;
            if (nv !== old) renames.push([type, old, nv]);
            if (!out.includes(nv)) out.push(nv);
          });
          const nn = (d['catnew_' + type] || '').trim();
          if (nn && !out.includes(nn)) out.push(nn);
          categories[type] = out;
        }
        patch.categories = categories;
      }
      await savePrefs(patch);
      for (const [type, old, nv] of renames) {
        await db.updateWhere('movements', { type, category: old }, { category: nv });
        S.movements.forEach((m) => { if (m.type === type && m.category === old) m.category = nv; });
      }
      render(); toast('Listo, guardado solo para vos');
    },
  });
  return root;
}

function invForm(v = {}) {
  openModal({
    title: v.id ? 'Editar inversión' : 'Nueva inversión', accent: 'var(--c-cuentas)',
    body: `
      ${field({ name: 'name', label: 'Nombre', value: v.name, required: true, full: true, placeholder: 'Ej: Plazo fijo Banco X' })}
      ${field({ name: 'kind', label: 'Tipo', type: 'select', value: v.kind || 'Plazo fijo', options: INV_KINDS.map((k) => [k, k]) })}
      ${field({ name: 'currency', label: 'Moneda', type: 'select', value: v.currency || 'ARS', options: [['ARS', 'Pesos (ARS)'], ['USD', 'Dólares (USD)']] })}
      ${field({ name: 'invested', label: 'Monto invertido', type: 'number', value: v.invested, required: true, step: '0.01', inputmode: 'decimal' })}
      ${field({ name: 'current_value', label: 'Valor actual', type: 'number', value: v.current_value, step: '0.01', inputmode: 'decimal' })}
      ${field({ name: 'start_date', label: 'Fecha de inicio', type: 'date', value: v.start_date })}
      ${field({ name: 'maturity_date', label: 'Vencimiento (opcional)', type: 'date', value: v.maturity_date })}
      ${field({ name: 'notes', label: 'Notas', type: 'textarea', value: v.notes, full: true })}
      ${field({ name: 'active', label: 'Inversión activa', type: 'checkbox', value: v.id ? v.active : true, full: true })}`,
    onSubmit: async (d) => {
      d.invested = Number(String(d.invested).replace(',', '.'));
      d.current_value = d.current_value == null ? null : Number(String(d.current_value).replace(',', '.'));
      if (v.id) await save('investments', v.id, d, true); else await add('investments', d);
    },
    onDelete: v.id ? () => del('investments', v.id) : null,
  });
}

function quickAdd() {
  const opts = [
    ['trabajo', 'item', 'Tarea de trabajo', 'briefcase'], ['trabajo', 'rec', 'Vencimiento que se repite', 'briefcase'],
    ['academico', 'item', 'Tarea académica', 'cap'], ['personal', 'turno', 'Turno médico', 'heart'],
    ['personal', 'salud', 'Recordatorio de salud', 'clock'], ['personal', 'rec', 'Cumpleaños / fecha anual', 'star'],
    ['personal', 'item', 'Pendiente personal', 'heart'], ['personal', 'idea', 'Idea o link', 'folder'],
    ['cuentas', 'mov', 'Gasto o ingreso', 'wallet'],
    ['cuentas', 'rec', 'Vencimiento fijo mensual', 'cal'], ['cuentas', 'inv', 'Inversión', 'trend'],
  ];
  openModal({
    title: '¿Qué querés agregar?',
    body: `<div class="quick full">${opts.map(([seg, t, l, ic]) => `<button type="button" class="quick-opt" style="--seg:var(--c-${seg})" data-q="${seg}|${t}">
      <span>${icon(ic)}</span>${l}</button>`).join('')}</div>`,
  });
  $$('[data-q]').forEach((b) => b.addEventListener('click', () => {
    const [seg, t] = b.dataset.q.split('|');
    closeModal();
    setTimeout(() => {
      if (t === 'mov') movForm(); else if (t === 'inv') invForm(); else if (t === 'idea') ideaForm();
      else if (t === 'rec') recForm(seg, {}, seg === 'personal' ? { kind: 'cumpleanos' } : {});
      else itemForm(seg, {}, t === 'turno' || t === 'salud' ? { kind: t } : seg === 'personal' ? { kind: 'tramite' } : {});
    }, 190);
  }));
}

/* ============================== Mutaciones ============================== */
async function add(table, row) {
  const rec = await db.insert(table, row);
  S[table].push(rec); render(); toast('Guardado');
}
async function save(table, id, patch, notify = false) {
  try {
    const rec = await db.update(table, id, patch);
    S[table] = S[table].map((r) => (r.id === id ? rec : r)); render();
    if (notify) toast('Cambios guardados');
  } catch (e) { toast(e.message || 'No se pudo guardar', true); if (notify) throw e; }
}
async function del(table, id) {
  await db.remove(table, id);
  S[table] = S[table].filter((r) => r.id !== id); render(); toast('Eliminado');
}

/* ============================== Acciones (delegación) ============================== */
document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || !S.user) return;
  const d = el.dataset;
  const find = (t) => S[t].find((r) => r.id === d.id);
  switch (d.action) {
    case 'tab': S.tabs[S.route] = d.tab; render(); break;
    case 'customize': customizeForm(d.seg || S.route); break;
    case 'quick-add': quickAdd(); break;
    case 'new-item': itemForm(d.seg, {}, { kind: d.kind || (d.seg === 'personal' ? 'tramite' : undefined), status: d.status }); break;
    case 'edit-item': { const it = find('items'); if (it) itemForm(it.segment, it); break; }
    case 'move-item': e.stopPropagation(); save('items', d.id, { status: d.status }); break;
    case 'new-note': noteForm(d.seg); break;
    case 'edit-note': { const n = find('notes'); if (n) noteForm(n.segment, n); break; }
    case 'new-mov': movForm(); break;
    case 'edit-mov': movForm(find('movements')); break;
    case 'pay-mov': save('movements', d.id, { paid: true }, true); break;
    case 'new-inv': invForm(); break;
    case 'edit-inv': invForm(find('investments')); break;
    case 'open-ref': {
      if (d.type === 'item') { const it = S.items.find((r) => r.id === d.id); itemForm(it.segment, it); }
      else if (d.type === 'rec') { const r = S.recurring.find((x) => x.id === d.id); if (r) occModal(r, d.date); }
      else if (d.type === 'shared') { const it = S.sharedItems.find((x) => x.id === d.id); if (it) sharedModal(it, it.due_date); }
      else if (d.type === 'sharedrec') { const r = S.sharedRecs.find((x) => x.id === d.id); if (r) sharedModal(r, d.date, true); }
      else if (d.type === 'mov') movForm(S.movements.find((r) => r.id === d.id));
      else invForm(S.investments.find((r) => r.id === d.id));
      break;
    }
    case 'sel-day': S.selDay = d.date; render(); break;
    case 'cal-month': S.calMonth = shiftMonth(S.calMonth, Number(d.n)); render(); break;
    case 'cal-today': S.calMonth = monthKey(new Date()); S.selDay = todayIso(); render(); break;
    case 'new-rec': recForm(d.seg || S.route); break;
    case 'edit-rec': { const r = find('recurring'); if (r) recForm(r.segment, r); break; }
    case 'done-rec': toggleDone(d.id, d.date); break;
    case 'new-work': workForm(); break;
    case 'open-folder': S.ideaFolder = d.id; S.ideaQuery = ''; render(); window.scrollTo(0, 0); break;
    case 'close-folder': S.ideaFolder = null; render(); break;
    case 'new-folder': folderForm(); break;
    case 'edit-folder': folderForm(find('idea_folders')); break;
    case 'new-idea': ideaForm(); break;
    case 'edit-idea': ideaForm(find('ideas')); break;
    case 'regen-token': {
      if (S.share_tokens.length && !el.classList.contains('confirm')) { el.classList.add('confirm'); el.textContent = '¿Seguro? El Atajo dejará de andar hasta actualizarlo'; break; }
      try { S.share_tokens = [await db.setShareToken(S.user.id, newToken())]; render(); toast('Clave generada'); }
      catch (err) { toast(err.message || 'No se pudo generar', true); }
      break;
    }
    case 'shortcut-help': shortcutHelp(); break;
    case 'backup': downloadBackup(); break;
    case 'closing': closingForm(); break;
    case 'accounts': accountsForm(); break;
    case 'copy':
      try { await navigator.clipboard.writeText(d.val); toast('Copiado'); } catch { toast('No se pudo copiar: mantené apretado y copiá a mano', true); }
      break;
    case 'edit-work': workForm(find('workload')); break;
    case 'cycle-level': {
      const w = find('workload'); if (!w) break;
      const prev = w.levels || {}; const levels = { ...prev }; const v = (Number(levels[d.m] || 0) + 1) % 4;
      if (v) levels[d.m] = v; else delete levels[d.m];
      w.levels = levels; render();                                   // se ve al instante
      try { await db.update('workload', w.id, { levels }); } catch (err) { w.levels = prev; render(); toast('No se pudo guardar', true); }
      break;
    }
    case 'save-profile': {
      const name = $('#pfName').value.trim();
      if (!name) { toast('Escribí un nombre', true); break; }
      try { S.profile = await db.saveProfile(S.user.id, { display_name: name }); render(); toast('Perfil guardado'); }
      catch (err) { toast(err.message || 'No se pudo guardar', true); }
      break;
    }
    case 'remove-avatar':
      try { S.profile = await db.saveProfile(S.user.id, { avatar: null }); render(); toast('Foto quitada'); }
      catch (err) { toast(err.message || 'No se pudo quitar', true); }
      break;
    case 'change-pw': {
      const a = $('#pw1').value, b = $('#pw2').value;
      if (a.length < 6) { toast('Mínimo 6 caracteres', true); break; }
      if (a !== b) { toast('Las contraseñas no coinciden', true); break; }
      el.disabled = true;
      try { await db.changePassword(a); $('#pw1').value = ''; $('#pw2').value = ''; toast('Contraseña actualizada'); }
      catch (err) { toast(err.message || 'No se pudo cambiar', true); }
      el.disabled = false;
      break;
    }
    case 'month': S.month = shiftMonth(S.month, Number(d.n)); render(); break;
    case 'logout': await db.signOut(); S.user = null; location.hash = ''; renderLogin(); break;
  }
});
