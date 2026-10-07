// Capa de datos: Supabase en producción, localStorage en modo demo.
import { CONFIG } from './config.js';

export const DEMO = !CONFIG.supabaseUrl;
const TABLES = ['items', 'notes', 'movements', 'investments'];
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
  res.forEach((r, i) => { if (r.error) throw r.error; out[TABLES[i]] = r.data; });
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
    { segment: 'personal', kind: 'evento', title: 'Cumpleaños de mamá', status: 'pendiente', priority: 'alta', due_date: d(8) },
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
  writeDemo('investments', [
    { name: 'Plazo fijo Banco X', kind: 'Plazo fijo', currency: 'ARS', invested: 1000000, current_value: 1032000, start_date: d(-15), maturity_date: d(15), active: true },
    { name: 'FCI Money Market', kind: 'FCI', currency: 'ARS', invested: 500000, current_value: 511400, start_date: d(-40), active: true },
    { name: 'CEDEARs', kind: 'CEDEARs', currency: 'USD', invested: 1200, current_value: 1315, start_date: d(-120), active: true },
  ].map(mk));
}
