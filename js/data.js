// Capa de datos: Supabase en producción, localStorage en modo demo.
import { CONFIG } from './config.js';

// El modo demo SOLO funciona en la compu de desarrollo (localhost) o con ?demo en la dirección.
// Publicada, si falta la configuración la app se frena y avisa, en vez de guardar datos solo en el navegador.
const LOCAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) || /[?&]demo\b/.test(location.search);
export const DEMO = !CONFIG.supabaseUrl && LOCAL;
export const MISCONFIG = !CONFIG.supabaseUrl && !LOCAL;
const TABLES = ['items', 'notes', 'movements', 'investments', 'recurring', 'workload', 'profiles', 'idea_folders', 'ideas', 'share_tokens', 'accounts', 'month_closings', 'user_settings'];
const NEW_V2 = ['recurring', 'workload', 'profiles', 'idea_folders', 'ideas', 'share_tokens', 'accounts', 'month_closings', 'user_settings']; // si todavía no se corrió el SQL v2, no rompen la app
let sb = null;

export async function init() {
  if (DEMO) return;
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm');
  sb = createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
}

/* ------------------------------ Sesión ------------------------------ */
export async function currentUser() {
  if (DEMO) {
    try { return JSON.parse(localStorage.getItem('orbita_demo_user')); } catch { return null; }
  }
  const { data } = await sb.auth.getSession();
  return data.session?.user ?? null;
}

export async function signIn(email, password) {
  if (DEMO) {
    const user = { id: 'demo-' + email.toLowerCase(), email };
    localStorage.setItem('orbita_demo_user', JSON.stringify(user));
    seedDemo(user.id);
    return user;
  }
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message === 'Invalid login credentials'
    ? 'Mail o contraseña incorrectos.' : error.message);
  return data.user;
}

export async function signOut() {
  if (DEMO) { localStorage.removeItem('orbita_demo_user'); return; }
  await sb.auth.signOut();
}

/* ------------------------------ CRUD ------------------------------ */
let demoUid = null;
export function setDemoUser(uid) { demoUid = uid; }
const key = (t) => `orbita_demo_${demoUid}_${t}`;
const readDemo = (t) => { try { return JSON.parse(localStorage.getItem(key(t))) || []; } catch { return []; } };
const writeDemo = (t, rows) => localStorage.setItem(key(t), JSON.stringify(rows));

export async function loadAll() {
  const out = {};
  if (DEMO) { for (const t of TABLES) out[t] = readDemo(t); return out; }
  const res = await Promise.all(TABLES.map((t) => sb.from(t).select('*')));
  res.forEach((r, i) => {
    const t = TABLES[i];
    if (r.error) {
      if (NEW_V2.includes(t)) { console.warn(`Falta la tabla ${t}: corré supabase/v2-actualizacion.sql`); out[t] = []; return; }
      throw r.error;
    }
    out[t] = r.data;
  });
  return out;
}

export async function insert(table, row) {
  if (DEMO) {
    const now = new Date().toISOString();
    const rec = { id: crypto.randomUUID(), created_at: now, updated_at: now, ...row };
    writeDemo(table, [...readDemo(table), rec]);
    return rec;
  }
  const { data, error } = await sb.from(table).insert(row).select().single();
  if (error) throw error;
  return data;
}

export async function update(table, id, patch) {
  if (DEMO) {
    let rec;
    writeDemo(table, readDemo(table).map((r) => r.id === id
      ? (rec = { ...r, ...patch, updated_at: new Date().toISOString() }) : r));
    return rec;
  }
  const { data, error } = await sb.from(table).update(patch).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function remove(table, id) {
  if (DEMO) { writeDemo(table, readDemo(table).filter((r) => r.id !== id)); return; }
  const { error } = await sb.from(table).delete().eq('id', id);
  if (error) throw error;
}

/* ------------------------- Operaciones en lote ------------------------- */
export async function insertMany(table, rows) {
  if (!rows.length) return [];
  if (DEMO) {
    const now = new Date().toISOString();
    const recs = rows.map((r) => ({ id: crypto.randomUUID(), created_at: now, updated_at: now, ...r }));
    writeDemo(table, [...readDemo(table), ...recs]);
    return recs;
  }
  const out = [];
  for (let i = 0; i < rows.length; i += 500) {
    const { data, error } = await sb.from(table).insert(rows.slice(i, i + 500)).select();
    if (error) throw error;
    out.push(...data);
  }
  return out;
}
// Actualiza todas las filas propias que coinciden (ej. renombrar una categoría)
export async function updateWhere(table, match, patch) {
  if (DEMO) { writeDemo(table, readDemo(table).map((r) => (Object.entries(match).every(([k, v]) => r[k] === v) ? { ...r, ...patch } : r))); return; }
  const { error } = await sb.from(table).update(patch).match(match);
  if (error) throw error;
}
export async function removeWhereIn(table, col, values) {
  if (!values.length) return;
  if (DEMO) { writeDemo(table, readDemo(table).filter((r) => !values.includes(r[col]))); return; }
  const { error } = await sb.from(table).delete().in(col, values);
  if (error) throw error;
}
// Inserta o reemplaza según las columnas "keys" (ej. user_id + month)
export async function upsertMany(table, rows, keys) {
  if (!rows.length) return [];
  if (DEMO) {
    const now = new Date().toISOString();
    let all = readDemo(table); const out = [];
    for (const r of rows) {
      const i = all.findIndex((x) => keys.every((k) => x[k] === r[k]));
      const rec = i >= 0 ? { ...all[i], ...r, updated_at: now } : { id: crypto.randomUUID(), created_at: now, updated_at: now, ...r };
      if (i >= 0) all[i] = rec; else all.push(rec);
      out.push(rec);
    }
    writeDemo(table, all);
    return out;
  }
  const { data, error } = await sb.from(table).upsert(rows, { onConflict: keys.join(',') }).select();
  if (error) throw error;
  return data;
}

/* ------------------------------ Perfil ------------------------------ */
export async function saveProfile(uid, patch) {
  if (DEMO) {
    const p = { ...(readDemo('profiles')[0] || { user_id: uid }), ...patch, updated_at: new Date().toISOString() };
    writeDemo('profiles', [p]);
    return p;
  }
  const { data, error } = await sb.from('profiles').upsert({ user_id: uid, ...patch }).select().single();
  if (error) throw error;
  return data;
}

// Clave personal para el Atajo del iPhone
export async function setShareToken(uid, token) {
  if (DEMO) { const r = { user_id: uid, token }; writeDemo('share_tokens', [r]); return r; }
  const { data, error } = await sb.from('share_tokens').upsert({ user_id: uid, token }).select().single();
  if (error) throw error;
  return data;
}

export async function changePassword(password) {
  if (DEMO) throw new Error('En modo demo no hay contraseñas.');
  const { error } = await sb.auth.updateUser({ password });
  if (error) {
    if (/different from the old/i.test(error.message)) throw new Error('La contraseña nueva tiene que ser distinta de la actual.');
    if (/at least/i.test(error.message)) throw new Error('La contraseña es demasiado corta.');
    if (/reauthentication|recent/i.test(error.message)) throw new Error('Por seguridad, cerrá sesión, volvé a entrar y probá de nuevo.');
    throw error;
  }
}

/* --------------------------- Datos de ejemplo --------------------------- */
function seedDemo(uid) {
  setDemoUser(uid);
  if (localStorage.getItem(key('seeded'))) return;
  localStorage.setItem(key('seeded'), '1');
  const d = (n) => { const x = new Date(); x.setDate(x.getDate() + n);
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
  const now = new Date().toISOString();
  const mk = (r) => ({ id: crypto.randomUUID(), created_at: now, updated_at: now, ...r });
  writeDemo('items', [
    { segment: 'trabajo', kind: 'tarea', title: 'Cierre de balance — cliente A', status: 'en_curso', priority: 'alta', due_date: d(3) },
    { segment: 'trabajo', kind: 'reunion', title: 'Reunión de directorio', status: 'pendiente', priority: 'media', due_date: d(6), due_time: '10:00', location: 'Oficina del cliente' },
    { segment: 'trabajo', kind: 'vencimiento', title: 'Legalización CPCE', status: 'pendiente', priority: 'alta', due_date: d(10) },
    { segment: 'trabajo', kind: 'tarea', title: 'Armar propuesta de gestión financiera', status: 'pendiente', priority: 'media', due_date: d(14) },
    { segment: 'trabajo', kind: 'tarea', title: 'Revisar papeles de trabajo IVA', status: 'hecho', priority: 'baja', due_date: d(-2) },
    { segment: 'academico', kind: 'examen', title: 'Parcial de Finanzas', status: 'pendiente', priority: 'alta', due_date: d(9), due_time: '18:30' },
    { segment: 'academico', kind: 'entrega', title: 'TP Valuación de empresas', status: 'en_curso', priority: 'media', due_date: d(5) },
    { segment: 'academico', kind: 'clase', title: 'Clase de consulta', status: 'pendiente', priority: 'baja', due_date: d(2), due_time: '19:00' },
    { segment: 'personal', kind: 'turno', title: 'Odontólogo — control', status: 'pendiente', priority: 'media', due_date: d(4), due_time: '17:15', location: 'Dra. Pérez · Av. Santa Fe 1234' },
    { segment: 'personal', kind: 'turno', title: 'Clínico — análisis de sangre', status: 'pendiente', priority: 'media', due_date: d(12), due_time: '08:00', location: 'Laboratorio Central' },
    { segment: 'personal', kind: 'tramite', title: 'Renovar registro de conducir', status: 'pendiente', priority: 'media', due_date: d(18) },
    { segment: 'personal', kind: 'salud', title: 'Endocrinología — estudios de control', status: 'pendiente', priority: 'media', due_date: d(150), description: 'Indicados en la consulta: repetir análisis a los 6 meses.' },
  ].map(mk));
  writeDemo('notes', [
    { segment: 'trabajo', title: 'Ideas área de gestión', content: '• Reportes de gestión mensuales\n• Valuación de empresas\n• Upsell a la cartera actual', pinned: true },
    { segment: 'academico', title: 'Bibliografía Finanzas', content: 'Capítulos 4 a 7 para el parcial.', pinned: false },
    { segment: 'personal', title: 'Lista de regalos', content: 'Mamá: libro / perfume', pinned: false },
  ].map(mk));
  writeDemo('movements', [
    { date: d(-6), type: 'ingreso', category: 'Sueldo', description: 'Sueldo', amount: 1850000, currency: 'ARS', paid: true },
    { date: d(-5), type: 'gasto', category: 'Vivienda', description: 'Expensas', amount: 145000, currency: 'ARS', paid: true },
    { date: d(-4), type: 'gasto', category: 'Supermercado', description: 'Compra mensual', amount: 212500, currency: 'ARS', paid: true },
    { date: d(-3), type: 'gasto', category: 'Servicios', description: 'Internet + celular', amount: 48900, currency: 'ARS', paid: true },
    { date: d(-1), type: 'gasto', category: 'Ocio', description: 'Cena', amount: 62000, currency: 'ARS', paid: true },
    { date: d(-2), type: 'gasto', category: 'Suscripciones', description: 'Streaming', amount: 12.99, currency: 'USD', paid: true },
    { date: d(7), type: 'gasto', category: 'Impuestos', description: 'ABL / Inmobiliario', amount: 38700, currency: 'ARS', paid: false },
    { date: d(11), type: 'gasto', category: 'Servicios', description: 'Tarjeta de crédito', amount: 395000, currency: 'ARS', paid: false },
  ].map(mk));
  const t0 = new Date();
  writeDemo('recurring', [
    { segment: 'cuentas', kind: 'vencimiento', title: 'Expensas', freq: 'mensual', day_of_month: 10, amount: 145000, currency: 'ARS', start_date: d(-60), done_dates: [], active: true },
    { segment: 'cuentas', kind: 'vencimiento', title: 'Luz (Edesur)', freq: 'mensual', day_of_month: 15, amount: 32000, currency: 'ARS', start_date: d(-60), done_dates: [], active: true },
    { segment: 'cuentas', kind: 'vencimiento', title: 'Monotributo', freq: 'mensual', day_of_month: 20, amount: 68000, currency: 'ARS', start_date: d(-60), done_dates: [], active: true },
    { segment: 'trabajo', kind: 'vencimiento', title: 'IVA — Cliente A', freq: 'mensual', day_of_month: 18, start_date: d(-60), done_dates: [], active: true, currency: 'ARS' },
    { segment: 'trabajo', kind: 'reunion', title: 'Reunión de equipo', freq: 'semanal', weekday: 0, due_time: '09:30', start_date: d(-60), done_dates: [], active: true, currency: 'ARS' },
    { segment: 'personal', kind: 'cumpleanos', title: 'Cumpleaños de mamá', freq: 'anual', month: t0.getMonth() + 1, day_of_month: Math.min(28, t0.getDate() + 8), start_date: d(-60), done_dates: [], active: true, currency: 'ARS' },
    { segment: 'personal', kind: 'cumpleanos', title: 'Cumpleaños de Juan', freq: 'anual', month: 1, day_of_month: 2, start_date: d(-60), done_dates: [], active: true, currency: 'ARS' },
  ].map(mk));
  writeDemo('workload', [
    { title: 'Becha — balance (cierre marzo)', levels: { 4: 3, 5: 3, 6: 2 } },
    { title: 'Ventachap — balance (cierre junio)', levels: { 7: 2, 8: 3, 9: 3 } },
    { title: 'Markarian — balance (cierre junio)', levels: { 8: 2, 9: 2 } },
    { title: 'Cliente B — balance (cierre diciembre)', levels: { 1: 1, 2: 3, 3: 3, 4: 1 } },
  ].map(mk));
  const f1 = mk({ name: 'Ideas para el departamento', shared: true, user_id: uid });
  const f2 = mk({ name: 'Regalos', shared: false, user_id: uid });
  writeDemo('idea_folders', [f1, f2]);
  writeDemo('ideas', [
    { folder_id: f1.id, user_id: uid, url: 'https://www.instagram.com/p/ejemplo/', content: 'Estantería flotante para el living' },
    { folder_id: f1.id, user_id: uid, url: 'https://www.pinterest.com/pin/123/', title: 'Lámpara colgante', content: 'Ver en madera clara' },
    { folder_id: f1.id, user_id: uid, title: 'Medidas del balcón', content: '3,20 m × 1,10 m\nIdea: plantas colgantes + banco angosto' },
    { folder_id: f2.id, user_id: uid, url: 'https://articulo.mercadolibre.com.ar/MLA-1', title: 'Auriculares para Juan' },
  ].map(mk));
  writeDemo('investments', [
    { name: 'Plazo fijo Banco X', kind: 'Plazo fijo', currency: 'ARS', invested: 1000000, current_value: 1032000, start_date: d(-15), maturity_date: d(15), active: true },
    { name: 'FCI Money Market', kind: 'FCI', currency: 'ARS', invested: 500000, current_value: 511400, start_date: d(-40), active: true },
    { name: 'CEDEARs', kind: 'CEDEARs', currency: 'USD', invested: 1200, current_value: 1315, start_date: d(-120), active: true },
  ].map(mk));
}
