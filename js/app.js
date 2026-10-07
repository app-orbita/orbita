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
               tabs: [['tablero', 'Tablero'], ['notas', 'Notas']], blurb: 'Tareas, reuniones y vencimientos laborales' },
  academico: { label: 'Académico', icon: 'cap',       color: 'var(--c-academico)', kinds: ['tarea', 'entrega', 'examen', 'clase'],
               tabs: [['tablero', 'Tablero'], ['notas', 'Notas']], blurb: 'Entregas, exámenes y clases' },
  personal:  { label: 'Personal',  icon: 'heart',     color: 'var(--c-personal)',  kinds: ['turno', 'tramite', 'evento', 'tarea'],
               tabs: [['turnos', 'Turnos médicos'], ['tablero', 'Pendientes'], ['notas', 'Notas']], blurb: 'Turnos, trámites y cosas tuyas' },
  cuentas:   { label: 'Cuentas',   icon: 'wallet',    color: 'var(--c-cuentas)',
               tabs: [['movimientos', 'Movimientos'], ['inversiones', 'Inversiones'], ['notas', 'Notas']], blurb: 'Gastos, ingresos e inversiones' },
};
const KIND = { tarea: 'Tarea', reunion: 'Reunión', vencimiento: 'Vencimiento', entrega: 'Entrega', examen: 'Examen',
  clase: 'Clase', turno: 'Turno médico', tramite: 'Trámite', evento: 'Evento' };
const STATUS = [['pendiente', 'Pendiente'], ['en_curso', 'En curso'], ['hecho', 'Hecho']];
const PRIO = [['alta', 'Alta'], ['media', 'Media'], ['baja', 'Baja']];
const CATS = ['Vivienda', 'Servicios', 'Supermercado', 'Transporte', 'Salud', 'Educación', 'Ocio', 'Ropa',
  'Suscripciones', 'Impuestos', 'Tarjeta de crédito', 'Regalos', 'Sueldo', 'Honorarios', 'Otros'];
const INV_KINDS = ['Plazo fijo', 'FCI', 'Acciones', 'CEDEARs', 'Bonos', 'Cripto', 'Dólares', 'Otro'];

/* ============================== Estado ============================== */
const S = {
  user: null, items: [], notes: [], movements: [], investments: [],
  route: 'resumen', tabs: {}, calStart: startOfWeek(today()), selDay: todayIso(), month: monthKey(new Date()),
};
const app = $('#app');

/* ============================== Arranque ============================== */
(async function boot() {
  try {
    await db.init();
    S.user = await db.currentUser();
    if (S.user) await enter(); else renderLogin();
  } catch (e) { console.error(e); renderLogin(e.message); }
  window.addEventListener('hashchange', () => { if (S.user) { readRoute(); render(); } });
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(() => {});
})();

async function enter() {
  if (db.DEMO) db.setDemoUser(S.user.id);
  app.innerHTML = '<div class="loading"><div class="sun"></div></div>';
  Object.assign(S, await db.loadAll());
  readRoute();
  render();
}
function readRoute() {
  const r = location.hash.replace('#/', '');
  S.route = SEG[r] ? r : 'resumen';
}
const userName = () => CONFIG.nombres?.[S.user?.email?.toLowerCase()] ||
  cap((S.user?.email || '').split('@')[0].split(/[._]/)[0] || 'vos');

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
        <span class="avatar">${esc(userName()[0])}</span>
        <div><strong>${esc(userName())}</strong><small>${esc(S.user.email)}</small></div>
        <button class="icon-btn" data-action="logout" title="Cerrar sesión">${icon('logout', 18)}</button>
      </div>
    </aside>
    <header class="topbar">
      <div class="brand"><span class="logo"></span>Órbita</div>
      <div class="top-actions">
        <button class="icon-btn" data-action="logout" title="Cerrar sesión">${icon('logout', 19)}</button>
        <button class="fab" data-action="quick-add" aria-label="Nuevo">${icon('plus', 22)}</button>
      </div>
    </header>
    <main class="main" id="main">${view()}</main>
    <nav class="bottom-nav">${nav}</nav>
  </div>`;
  bindDnD();
}

function view() {
  if (S.route === 'resumen') return viewResumen();
  const s = SEG[S.route];
  const tab = S.tabs[S.route] || s.tabs[0][0];
  const tabs = s.tabs.map(([k, l]) => `<button class="tab ${tab === k ? 'active' : ''}" data-action="tab" data-tab="${k}">${l}</button>`).join('');
  let body = '';
  if (tab === 'tablero') body = viewBoard(S.route);
  else if (tab === 'notas') body = viewNotes(S.route);
  else if (tab === 'turnos') body = viewTurnos();
  else if (tab === 'movimientos') body = viewMovimientos();
  else if (tab === 'inversiones') body = viewInversiones();
  return `
  <section class="page" style="--seg:${s.color}">
    <header class="page-head">
      <div><p class="eyebrow"><span class="seg-dot"></span>${s.blurb}</p><h1>${s.label}</h1></div>
      ${primaryButton(S.route, tab)}
    </header>
    <div class="tabs">${tabs}</div>
    ${body}
  </section>`;
}
function primaryButton(seg, tab) {
  const b = (a, l, extra = '') => `<button class="btn primary" data-action="${a}" data-seg="${seg}" ${extra}>${icon('plus', 18)}<span>${l}</span></button>`;
  if (tab === 'notas') return b('new-note', 'Nueva nota');
  if (tab === 'turnos') return b('new-item', 'Nuevo turno', 'data-kind="turno"');
  if (tab === 'movimientos') return b('new-mov', 'Movimiento');
  if (tab === 'inversiones') return b('new-inv', 'Inversión');
  return b('new-item', seg === 'personal' ? 'Nuevo pendiente' : 'Nueva tarea');
}

/* ============================== Eventos (calendario) ============================== */
function allEvents() {
  const ev = [];
  for (const it of S.items) if (it.due_date) ev.push({
    date: it.due_date, time: hhmm(it.due_time), title: it.title, seg: it.segment, tag: KIND[it.kind] || '',
    done: it.status === 'hecho', type: 'item', id: it.id });
  for (const m of S.movements) if (!m.paid) ev.push({
    date: m.date, title: `Pagar: ${m.description || m.category || 'gasto'}`, sub: money(m.amount, m.currency),
    seg: 'cuentas', tag: 'Vencimiento', type: 'mov', id: m.id });
  for (const v of S.investments) if (v.active && v.maturity_date) ev.push({
    date: v.maturity_date, title: `Vence: ${v.name}`, sub: money(v.current_value ?? v.invested, v.currency),
    seg: 'cuentas', tag: 'Inversión', type: 'inv', id: v.id });
  return ev.sort((a, b) => (a.date + (a.time || '99')).localeCompare(b.date + (b.time || '99')));
}
const evRow = (e) => `
  <button class="ev-row ${e.done ? 'done' : ''}" style="--seg:var(--c-${e.seg})" data-action="open-ref" data-type="${e.type}" data-id="${e.id}">
    <span class="ev-bar"></span>
    <span class="ev-main"><strong>${esc(e.title)}</strong>
      <small>${esc(SEG[e.seg].label)}${e.tag ? ' · ' + esc(e.tag) : ''}${e.sub ? ' · ' + esc(e.sub) : ''}</small></span>
    ${e.time ? `<span class="ev-time">${e.time}</span>` : ''}
  </button>`;

/* ============================== Resumen ============================== */
function viewResumen() {
  const ev = allEvents();
  const t = todayIso();
  const open = S.items.filter((i) => i.status !== 'hecho');
  const overdue = open.filter((i) => i.due_date && i.due_date < t).length;
  const week = ev.filter((e) => !e.done && e.date >= t && diffDays(e.date) < 7).length;
  const nextTurno = S.items.filter((i) => i.kind === 'turno' && i.status !== 'hecho' && i.due_date >= t)
    .sort((a, b) => (a.due_date + (a.due_time || '')).localeCompare(b.due_date + (b.due_time || '')))[0];
  const mk = monthKey(new Date());
  const spent = (cur) => S.movements.filter((m) => m.paid && m.type === 'gasto' && m.currency === cur && m.date.startsWith(mk))
    .reduce((s, m) => s + Number(m.amount), 0);
  const usd = spent('USD');

  // Calendario: 4 semanas
  const days = Array.from({ length: 28 }, (_, i) => addDays(S.calStart, i));
  const byDay = {};
  ev.forEach((e) => (byDay[e.date] ||= []).push(e));
  const end = days[27];
  const range = `${days[0].getDate()} ${MESES[days[0].getMonth()].slice(0, 3)} – ${end.getDate()} ${MESES[end.getMonth()].slice(0, 3)}`;
  const cells = days.map((d) => {
    const k = iso(d); const list = byDay[k] || [];
    const cls = [k === t && 'today', k < t && 'past', k === S.selDay && 'sel'].filter(Boolean).join(' ');
    const label = d.getDate() === 1 ? `${d.getDate()} ${MESES[d.getMonth()].slice(0, 3)}` : d.getDate();
    return `<button class="cal-cell ${cls}" data-action="sel-day" data-date="${k}">
      <span class="cal-num">${label}</span>
      <span class="chips">${list.slice(0, 3).map((e) => `<span class="chip ${e.done ? 'done' : ''}" style="--seg:var(--c-${e.seg})">${esc(e.title)}</span>`).join('')}
        ${list.length > 3 ? `<span class="more">+${list.length - 3} más</span>` : ''}</span>
      <span class="dots">${list.slice(0, 4).map((e) => `<i style="--seg:var(--c-${e.seg})"></i>`).join('')}</span>
    </button>`;
  }).join('');
  const sel = byDay[S.selDay] || [];
  const upcoming = ev.filter((e) => !e.done && e.date >= t && diffDays(e.date) <= 14);
  const groups = {};
  upcoming.forEach((e) => (groups[e.date] ||= []).push(e));

  const segCard = (k) => {
    const s = SEG[k];
    let l1, l2;
    if (k === 'cuentas') {
      const due = S.movements.filter((m) => !m.paid);
      l1 = `<b>${due.length}</b> por pagar`;
      const nx = due.sort((a, b) => a.date.localeCompare(b.date))[0];
      l2 = nx ? `Próximo: ${esc(nx.description || nx.category)} · ${relDay(nx.date)}` : 'Sin vencimientos cargados';
    } else {
      const its = S.items.filter((i) => i.segment === k);
      const p = its.filter((i) => i.status === 'pendiente').length; const c = its.filter((i) => i.status === 'en_curso').length;
      l1 = `<b>${p}</b> pendientes · <b>${c}</b> en curso`;
      const nx = its.filter((i) => i.status !== 'hecho' && i.due_date >= t).sort((a, b) => a.due_date.localeCompare(b.due_date))[0];
      l2 = nx ? `Próximo: ${esc(nx.title)} · ${relDay(nx.due_date)}` : 'Nada próximo';
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
      <div class="stat s-rust"><span>Próximo turno</span><strong class="sm">${nextTurno ? relDay(nextTurno.due_date) + (nextTurno.due_time ? ' · ' + hhmm(nextTurno.due_time) : '') : '—'}</strong>
        <small>${nextTurno ? esc(nextTurno.title) : 'Sin turnos cargados'}</small></div>
      <div class="stat s-sand"><span>Gastos de ${MESES[new Date().getMonth()]}</span><strong class="sm">${money(spent('ARS'))}</strong>
        <small>${usd ? money(usd, 'USD') + ' en dólares' : 'pagados en el mes'}</small></div>
    </div>
    <div class="grid-main">
      <div class="card cal-card">
        <div class="card-head">
          <div><h2>Próximas semanas</h2><small class="muted">${range}</small></div>
          <div class="btn-group">
            <button class="icon-btn" data-action="cal-move" data-n="-7" aria-label="Semana anterior">${icon('left', 18)}</button>
            <button class="btn soft sm" data-action="cal-today">Hoy</button>
            <button class="icon-btn" data-action="cal-move" data-n="7" aria-label="Semana siguiente">${icon('right', 18)}</button>
          </div>
        </div>
        <div class="legend">${['trabajo', 'academico', 'personal', 'cuentas'].map((k) => `<span style="--seg:var(--c-${k})"><i></i>${SEG[k].label}</span>`).join('')}</div>
        <div class="cal">${DIAS.map((d) => `<span class="cal-dow">${d}</span>`).join('')}${cells}</div>
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
  const its = S.items.filter((i) => i.segment === seg && !(seg === 'personal' && i.kind === 'turno'));
  const t = todayIso();
  const cols = STATUS.map(([st, label]) => {
    const list = its.filter((i) => i.status === st).sort((a, b) =>
      (a.due_date || '9999').localeCompare(b.due_date || '9999') || prioRank[a.priority] - prioRank[b.priority]);
    const cards = list.map((i) => {
      const late = i.due_date && i.due_date < t && st !== 'hecho';
      const next = st === 'pendiente' ? ['en_curso', 'arrow', 'Pasar a En curso'] : st === 'en_curso' ? ['hecho', 'check', 'Marcar hecho'] : ['pendiente', 'undo', 'Reabrir'];
      return `<article class="task prio-${i.priority}" draggable="true" data-id="${i.id}" data-action="edit-item">
        <div class="task-top"><span class="tag">${esc(KIND[i.kind] || 'Tarea')}</span><span class="prio" title="Prioridad ${i.priority}"></span></div>
        <h4>${esc(i.title)}</h4>
        ${i.description ? `<p class="desc">${esc(i.description.slice(0, 110))}</p>` : ''}
        <div class="task-foot">
          ${i.due_date ? `<span class="due ${late ? 'late' : ''}">${icon('cal', 14)}${relDay(i.due_date)}${i.due_time ? ' · ' + hhmm(i.due_time) : ''}</span>` : '<span></span>'}
          <button class="icon-btn sm" data-action="move-item" data-id="${i.id}" data-status="${next[0]}" title="${next[2]}">${icon(next[1], 16)}</button>
        </div>
      </article>`;
    }).join('');
    return `<div class="col" data-status="${st}">
      <div class="col-head"><span class="st st-${st}"></span>${label}<span class="count">${list.length}</span></div>
      <div class="col-body">${cards || '<p class="empty sm">Arrastrá tarjetas acá</p>'}</div>
      ${st !== 'hecho' ? `<button class="add-inline" data-action="new-item" data-seg="${seg}" data-status="${st}">${icon('plus', 16)} Agregar</button>` : ''}
    </div>`;
  }).join('');
  return `<div class="board">${cols}</div>`;
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

/* ============================== Turnos ============================== */
function viewTurnos() {
  const t = todayIso();
  const all = S.items.filter((i) => i.segment === 'personal' && i.kind === 'turno');
  const up = all.filter((i) => i.status !== 'hecho' && (!i.due_date || i.due_date >= t))
    .sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999'));
  const past = all.filter((i) => !up.includes(i)).sort((a, b) => (b.due_date || '').localeCompare(a.due_date || '')).slice(0, 12);
  const card = (i) => {
    const d = i.due_date ? parse(i.due_date) : null;
    return `<button class="turno" data-action="edit-item" data-id="${i.id}">
      <span class="date-block">${d ? `<small>${DIAS[(d.getDay() + 6) % 7]}</small><b>${d.getDate()}</b><small>${MESES[d.getMonth()].slice(0, 3)}</small>` : '<b>—</b>'}</span>
      <span class="turno-main"><strong>${esc(i.title)}</strong>
        ${i.location ? `<small>${icon('pin', 14)}${esc(i.location)}</small>` : ''}
        ${i.description ? `<small class="muted">${esc(i.description.slice(0, 80))}</small>` : ''}</span>
      <span class="turno-side">${i.due_time ? `<span class="pill">${icon('clock', 14)}${hhmm(i.due_time)}</span>` : ''}
        ${i.due_date ? `<small>${relDay(i.due_date)}</small>` : ''}</span>
    </button>`;
  };
  return `
    <div class="turnos">${up.length ? up.map(card).join('') : `<div class="card empty-card">${icon('heart', 28)}<p>No tenés turnos próximos.</p>
      <button class="btn soft" data-action="new-item" data-seg="personal" data-kind="turno">Cargar un turno</button></div>`}</div>
    ${past.length ? `<h2 class="section-title">Anteriores</h2><div class="turnos past">${past.map(card).join('')}</div>` : ''}`;
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

/* ============================== Cuentas ============================== */
function totals(list) {
  const r = {};
  for (const m of list) {
    const c = (r[m.currency] ||= { ingreso: 0, gasto: 0 });
    c[m.type] += Number(m.amount);
  }
  return r;
}
function viewMovimientos() {
  const mk = S.month;
  const month = S.movements.filter((m) => m.date.startsWith(mk)).sort((a, b) => b.date.localeCompare(a.date));
  const tot = totals(month.filter((m) => m.paid));
  const curs = ['ARS', ...(S.movements.some((m) => m.currency === 'USD') ? ['USD'] : [])];
  const due = S.movements.filter((m) => !m.paid).sort((a, b) => a.date.localeCompare(b.date));
  const stat = (cur) => {
    const c = tot[cur] || { ingreso: 0, gasto: 0 }; const bal = c.ingreso - c.gasto;
    return `<div class="money-card">
      <span class="cur">${cur === 'ARS' ? 'Pesos' : 'Dólares'}</span>
      <div class="money-row"><span>Ingresos</span><b class="pos">${money(c.ingreso, cur)}</b></div>
      <div class="money-row"><span>Gastos</span><b class="neg">${money(c.gasto, cur)}</b></div>
      <div class="money-row total"><span>Balance</span><b class="${bal < 0 ? 'neg' : ''}">${money(bal, cur)}</b></div>
    </div>`;
  };
  const cats = (cur) => {
    const g = {};
    month.filter((m) => m.paid && m.type === 'gasto' && m.currency === cur).forEach((m) => { g[m.category || 'Otros'] = (g[m.category || 'Otros'] || 0) + Number(m.amount); });
    const arr = Object.entries(g).sort((a, b) => b[1] - a[1]); const max = arr[0]?.[1] || 1;
    if (!arr.length) return '';
    return `<div class="cats"><h4>${cur === 'ARS' ? 'En pesos' : 'En dólares'}</h4>${arr.map(([k, v]) => `
      <div class="cat"><div class="cat-top"><span>${esc(k)}</span><b>${money(v, cur)}</b></div>
      <div class="bar"><i style="width:${Math.max(4, (v / max) * 100)}%"></i></div></div>`).join('')}</div>`;
  };
  const groups = {};
  month.forEach((m) => (groups[m.date] ||= []).push(m));
  const row = (m) => `<button class="mov" data-action="edit-mov" data-id="${m.id}">
      <span class="mov-ico ${m.type}">${icon(m.type === 'ingreso' ? 'trend' : 'wallet', 16)}</span>
      <span class="mov-main"><strong>${esc(m.description || m.category || '—')}</strong><small>${esc(m.category || '')}${!m.paid ? ' · <em>a pagar</em>' : ''}</small></span>
      <b class="${m.type === 'ingreso' ? 'pos' : 'neg'}">${m.type === 'ingreso' ? '+' : '−'} ${money(m.amount, m.currency)}</b></button>`;
  const catsHtml = curs.map(cats).join('');
  return `
    <div class="month-bar">
      <button class="icon-btn" data-action="month" data-n="-1" aria-label="Mes anterior">${icon('left', 18)}</button>
      <strong>${monthLabel(mk)}</strong>
      <button class="icon-btn" data-action="month" data-n="1" aria-label="Mes siguiente">${icon('right', 18)}</button>
    </div>
    <div class="money-cards">${curs.map(stat).join('')}</div>
    <div class="grid-main">
      <div class="card">
        <div class="card-head"><h2>Movimientos del mes</h2><small class="muted">${month.length} registros</small></div>
        ${month.length ? Object.entries(groups).map(([d, l]) => `<div class="day-group"><h4>${cap(fmtDate(d, { weekday: 'long', day: 'numeric', month: 'long' }))}</h4>${l.map(row).join('')}</div>`).join('')
          : '<p class="empty">No hay movimientos cargados en este mes.</p>'}
      </div>
      <div class="side-col">
        <div class="card">
          <div class="card-head"><h2>Por pagar</h2><small class="muted">aparecen en el calendario</small></div>
          ${due.length ? due.map((m) => `<div class="due-row">
            <button class="due-main" data-action="edit-mov" data-id="${m.id}"><strong>${esc(m.description || m.category)}</strong>
              <small class="${m.date < todayIso() ? 'late' : ''}">${relDay(m.date)} · ${money(m.amount, m.currency)}</small></button>
            <button class="btn soft sm" data-action="pay-mov" data-id="${m.id}">${icon('check', 15)} Pagado</button></div>`).join('')
            : '<p class="empty">Nada pendiente de pago.</p>'}
        </div>
        <div class="card">
          <div class="card-head"><h2>Gastos por categoría</h2></div>
          ${catsHtml || '<p class="empty">Sin gastos pagados en el mes.</p>'}
        </div>
      </div>
    </div>`;
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
  const isTurno = kind === 'turno';
  openModal({
    title: item.id ? `Editar · ${KIND[kind] || 'Tarea'}` : (isTurno ? 'Nuevo turno médico' : `Nuevo en ${s.label}`),
    accent: s.color,
    body: `
      ${field({ name: 'title', label: isTurno ? 'Especialidad / motivo' : 'Título', value: item.title, required: true, full: true,
        placeholder: isTurno ? 'Ej: Dermatología — control anual' : '' })}
      ${field({ name: 'kind', label: 'Tipo', type: 'select', value: kind, options: s.kinds.map((k) => [k, KIND[k]]) })}
      ${field({ name: 'status', label: 'Estado', type: 'select', value: item.status || preset.status || 'pendiente', options: STATUS })}
      ${field({ name: 'due_date', label: 'Fecha', type: 'date', value: item.due_date || preset.date })}
      ${field({ name: 'due_time', label: 'Hora', type: 'time', value: hhmm(item.due_time) })}
      ${field({ name: 'priority', label: 'Prioridad', type: 'select', value: item.priority || 'media', options: PRIO })}
      ${field({ name: 'location', label: isTurno ? 'Profesional / lugar' : 'Lugar (opcional)', value: item.location })}
      ${field({ name: 'description', label: 'Notas', type: 'textarea', value: item.description, full: true })}`,
    onSubmit: async (d) => {
      const row = { ...d, segment: seg };
      if (item.id) await save('items', item.id, row, true); else await add('items', row);
    },
    onDelete: item.id ? () => del('items', item.id) : null,
  });
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
  openModal({
    title: m.id ? 'Editar movimiento' : 'Nuevo movimiento', accent: 'var(--c-cuentas)',
    body: `
      ${field({ name: 'type', label: 'Tipo', type: 'select', value: m.type || 'gasto', options: [['gasto', 'Gasto'], ['ingreso', 'Ingreso']] })}
      ${field({ name: 'date', label: 'Fecha', type: 'date', value: m.date || todayIso(), required: true })}
      ${field({ name: 'description', label: 'Descripción', value: m.description, required: true, full: true })}
      ${field({ name: 'category', label: 'Categoría', value: m.category, list: 'cats' })}
      <datalist id="cats">${[...new Set([...CATS, ...S.movements.map((x) => x.category).filter(Boolean)])].map((c) => `<option value="${esc(c)}">`).join('')}</datalist>
      ${field({ name: 'currency', label: 'Moneda', type: 'select', value: m.currency || 'ARS', options: [['ARS', 'Pesos (ARS)'], ['USD', 'Dólares (USD)']] })}
      ${field({ name: 'amount', label: 'Monto', type: 'number', value: m.amount, required: true, step: '0.01', inputmode: 'decimal' })}
      ${field({ name: 'paid', label: 'Ya está pagado / cobrado (si no, queda como vencimiento en el calendario)', type: 'checkbox', value: m.id ? m.paid : true, full: true })}`,
    onSubmit: async (d) => {
      d.amount = Number(String(d.amount).replace(',', '.'));
      if (!(d.amount > 0)) throw new Error('El monto tiene que ser mayor a cero.');
      if (m.id) await save('movements', m.id, d, true); else await add('movements', d);
    },
    onDelete: m.id ? () => del('movements', m.id) : null,
  });
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
    ['trabajo', 'item', 'Tarea de trabajo', 'briefcase'], ['academico', 'item', 'Tarea académica', 'cap'],
    ['personal', 'turno', 'Turno médico', 'heart'], ['personal', 'item', 'Pendiente personal', 'heart'],
    ['cuentas', 'mov', 'Gasto o ingreso', 'wallet'], ['cuentas', 'inv', 'Inversión', 'trend'],
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
      if (t === 'mov') movForm(); else if (t === 'inv') invForm();
      else itemForm(seg, {}, t === 'turno' ? { kind: 'turno' } : seg === 'personal' ? { kind: 'tramite' } : {});
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
      else if (d.type === 'mov') movForm(S.movements.find((r) => r.id === d.id));
      else invForm(S.investments.find((r) => r.id === d.id));
      break;
    }
    case 'sel-day': S.selDay = d.date; render(); break;
    case 'cal-move': S.calStart = addDays(S.calStart, Number(d.n)); render(); break;
    case 'cal-today': S.calStart = startOfWeek(today()); S.selDay = todayIso(); render(); break;
    case 'month': S.month = shiftMonth(S.month, Number(d.n)); render(); break;
    case 'logout': await db.signOut(); S.user = null; location.hash = ''; renderLogin(); break;
  }
});
