// Lee el Excel mensual de cuentas (una hoja por mes, nombre "MM.AAAA") y devuelve,
// para cada mes: saldos iniciales, ingresos y gastos por categoría, tenencia real al
// cierre por cuenta (pesos y dólares), cotización y evolución de la cartera Cocos.
// Busca los datos por sus títulos (no por celdas fijas), así tolera que las columnas se muevan.

const num = (v) => {
  if (typeof v === 'number' && isFinite(v)) return v;
  if (typeof v === 'string') {
    const t = v.replace(/[\s $]/g, '');
    if (/^-?[\d.]+,\d+$/.test(t)) return Number(t.replace(/\./g, '').replace(',', '.'));
    if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  }
  return null;
};
const txt = (v) => (typeof v === 'string' ? v.replace(/ /g, ' ').trim() : '');
const clean = (s) => txt(s).replace(/:$/, '').replace(/\s+/g, ' ').trim();

// Nombres prolijos para las cuentas
const ACCOUNT_NAMES = {
  'santander': 'Santander', 'sant fci': 'Santander FCI', 'mp': 'Mercado Pago', 'efectivo': 'Efectivo',
  'cocos $': 'Cocos $', 'cocos': 'Cocos $', 'efvo': 'Efectivo', 'plazos fijos': 'Plazos fijos', 'usd efvo': 'USD efectivo', 'usd cocos': 'USD Cocos',
  'cocos cedears': 'Cocos Cedears', 'cocos cryp': 'Cocos Cripto', 'usd santander': 'USD Santander',
};
export const accountName = (raw) => ACCOUNT_NAMES[clean(raw).toLowerCase()] || clean(raw);
const INCOME_NAMES = {
  'cobro total mes estudio': 'Sueldo Estudio', 'intereses varios ganados': 'Rendimientos financieros',
  'cobros extra': 'Cobros extra', 'extra estudio': 'Extra Estudio',
};
const incomeName = (raw) => INCOME_NAMES[clean(raw).toLowerCase()] || clean(raw);

export function parseWorkbook(wb, XLSX) {
  const out = [];
  for (const name of wb.SheetNames) {
    const m = /^(\d{2})\.(\d{4})$/.exec(name.trim());
    if (!m) continue;
    const month = `${m[2]}-${m[1]}`;
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: null, blankrows: true });
    try { out.push({ month, sheet: name, ...parseSheet(rows) }); }
    catch (e) { out.push({ month, sheet: name, error: e.message }); }
  }
  return out.sort((a, b) => a.month.localeCompare(b.month));
}

function parseSheet(R) {
  const at = (r, c) => (R[r] && R[r][c] !== undefined ? R[r][c] : null);
  const find = (test, maxRow = R.length) => {
    for (let r = 0; r < Math.min(R.length, maxRow); r++) for (let c = 0; c < (R[r] || []).length; c++) if (test(txt(at(r, c)), r, c)) return { r, c };
    return null;
  };
  const firstNum = (r, c1, c2) => { for (let c = c1; c <= c2; c++) { const n = num(at(r, c)); if (n !== null) return n; } return null; };

  const ten = find((s) => /^tenencia \d/i.test(s));
  if (!ten) throw new Error('Formato anterior (sin "Tenencia" al cierre): no se importa');
  const ing = find((s) => s === 'INGRESOS', 8);
  if (!ing) throw new Error('No encontré el título INGRESOS');
  const gas = find((s, r) => s === 'GASTOS' && r === ing.r, 8);
  if (!gas) throw new Error('No encontré el título GASTOS');

  // ---------- Ingresos
  const ingTot = find((s, r, c) => s === 'INGRESOS' && r > ing.r && c >= ing.c && c <= ing.c + 2);
  const sob = find((s) => /^SOBRANTE PARA MES/i.test(s));
  const opening = {}; const upper = []; let sueldo = null;
  const lastUpper = ingTot ? ingTot.r : ing.r + 12;
  for (let r = ing.r + 1; r < lastUpper; r++) {
    const label = clean(at(r, ing.c)); if (!label) continue;
    const v = firstNum(r, ing.c + 1, ing.c + 3);
    if (v === null) continue;
    const mm = /^sobrante mes pasado(?: \((.+)\))?/i.exec(label);
    if (mm) { opening[mm[1] ? accountName(mm[1]) : 'Saldo inicial'] = v; continue; }
    if (/^sueldo$/i.test(label)) { sueldo = v; continue; }
    upper.push({ category: incomeName(label), amount: v });
  }
  const lower = [];
  const endLower = sob ? sob.r : (ingTot ? ingTot.r + 22 : R.length);
  for (let r = (ingTot ? ingTot.r + 1 : lastUpper); r < endLower; r++) {
    const label = clean(at(r, ing.c)); if (!label) continue;
    const v = firstNum(r, ing.c + 1, ing.c + 3);
    if (v) lower.push({ category: incomeName(label), amount: v });
  }
  const lowerSum = lower.reduce((s, x) => s + x.amount, 0);
  let incomes;
  if (sueldo === null) incomes = [...upper, ...lower];
  else if (Math.abs(lowerSum - sueldo) < 0.5) incomes = [...lower, ...upper];
  else incomes = [{ category: 'Sueldo', amount: sueldo }, ...upper];
  incomes = incomes.filter((x) => x.amount);

  // ---------- Gastos (en pesos y en dólares), hasta la fila "TOTAL GASTOS"
  const gEnd = find((s, r, c) => /^TOTAL GASTOS/i.test(s) && r > gas.r && c >= gas.c && c <= gas.c + 3);
  const expenses = [];
  for (let r = gas.r + 1; r < (gEnd ? gEnd.r : gas.r + 25); r++) {
    const label = clean(at(r, gas.c)); if (!label) continue;
    const v = firstNum(r, gas.c + 1, gas.c + 3);
    if (!v) continue;
    let usd = false; for (let c = gas.c + 1; c <= gas.c + 5; c++) if (/^usd$/i.test(txt(at(r, c)))) usd = true;
    expenses.push({ category: label, amount: v, currency: usd ? 'USD' : 'ARS' });
  }

  // ---------- Tenencia real al cierre
  const balances = {}; let r = ten.r + 1;
  for (; r < ten.r + 12; r++) {
    const label = clean(at(r, ten.c)); if (!label) break;
    balances[accountName(label)] = { currency: 'ARS', amount: num(at(r, ten.c + 1)) || 0 };
  }
  const evo = find((s) => /^evoluci[oó]n/i.test(s));
  for (let rr = r; rr < (evo ? evo.r : r + 20); rr++) {
    const label = clean(at(rr, ten.c));
    if (!label || /tenencia|total|cotiz|increm|aumento/i.test(label)) continue;
    if (!/usd|cedear|cryp/i.test(label)) continue;
    const v = num(at(rr, ten.c + 1));
    if (v !== null) balances[accountName(label)] = { currency: 'USD', amount: v };
  }

  // ---------- Cotización y cartera Cocos
  const cz = find((s) => /^cotiz/i.test(s));
  let fx = cz ? firstNum(cz.r, cz.c + 1, cz.c + 2) : null;
  if (!(fx > 1 && fx < 100000)) fx = null;   // descarta cotizaciones mal calculadas en la hoja
  const pick = (re) => { const p = find((s) => re.test(s)); return p ? { ars: num(at(p.r, p.c + 1)), usd: num(at(p.r, p.c + 2)) } : null; };
  const ini = pick(/^inicio$/i), tr = pick(/^transf$/i), ret = pick(/^retiros$/i), cie = pick(/^cierre real$/i);
  const cocos = ini && cie ? { inicio: ini, transf: tr, retiros: ret, cierre: cie } : null;

  // ---------- Controles del propio Excel
  const sobrante = sob ? firstNum(sob.r, sob.c + 1, sob.c + 8) : null;
  const ars = (l) => l.filter((x) => (x.currency || 'ARS') === 'ARS').reduce((s, x) => s + x.amount, 0);
  const openSum = Object.values(opening).reduce((s, v) => s + v, 0);
  const calc = openSum + ars(incomes) - ars(expenses);
  const realArs = Object.values(balances).filter((b) => b.currency === 'ARS').reduce((s, b) => s + b.amount, 0);
  return { opening, incomes, expenses, balances, fx, cocos, sobrante, calc, realArs };
}
