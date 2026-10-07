export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const pad = (n) => String(n).padStart(2, '0');
export const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
export const todayIso = () => iso(today());
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const startOfWeek = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
export const diffDays = (s) => Math.round((parse(s) - today()) / 86400000);

export const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
export const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export const fmtDate = (s, o = { weekday: 'short', day: 'numeric', month: 'short' }) =>
  parse(s).toLocaleDateString('es-AR', o).replace(/\./g, '');
export const fmtLong = (s) => cap(parse(s).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }));
export const hhmm = (t) => (t ? t.slice(0, 5) : '');

export function relDay(s) {
  const n = diffDays(s);
  if (n === 0) return 'Hoy';
  if (n === 1) return 'Mañana';
  if (n === -1) return 'Ayer';
  if (n < 0) return `Hace ${-n} días`;
  if (n < 7) return `En ${n} días`;
  return cap(fmtDate(s));
}

export const money = (n, cur = 'ARS') =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: cur, minimumFractionDigits: 2 }).format(Number(n) || 0);

export const monthKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
export const monthLabel = (k) => { const [y, m] = k.split('-').map(Number); return `${cap(MESES[m - 1])} ${y}`; };
export const shiftMonth = (k, n) => { const [y, m] = k.split('-').map(Number); return monthKey(new Date(y, m - 1 + n, 1)); };
