// ServiceNow REST helper. OAuth Bearer token from the now-sdk credential store. Node 18+.
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const envPath = new URL('../.env', import.meta.url);
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

export const BASE = (process.env.SN_INSTANCE || '').replace(/\/+$/, '');
export const SCOPE = process.env.SN_SCOPE || '';
export const APP_ID = process.env.SN_APP_ID || '';
if (!BASE) throw new Error('Missing SN_INSTANCE in .env');

function readToken() {
  const ps1 = fileURLToPath(new URL('./get-sn-token.ps1', import.meta.url));
  const raw = execFileSync('powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1], { encoding: 'utf8' });
  // Blob shape (see get-sn-token.ps1 header comment): a JSON object keyed by
  // auth-profile alias, with the token nested under `<alias>.creds.access_token`.
  // A plain regex scan still finds it regardless of nesting/profile name.
  const m = raw.match(/"access_token"\s*:\s*"([^"]+)"/);
  if (!m) throw new Error('No access_token in now-sdk credential blob. Run a now-sdk command to refresh, or re-auth with `now-sdk auth`.');
  return m[1];
}
const AUTH = 'Bearer ' + readToken();

export async function sn(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { Authorization: AUTH, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${text.slice(0, 800)}`);
  return text ? JSON.parse(text) : null;
}

export const list = (table, query = '', fields = '') =>
  sn('GET', `/api/now/table/${table}?sysparm_query=${encodeURIComponent(query)}` +
            `&sysparm_fields=${fields}&sysparm_limit=2000&sysparm_display_value=false`)
    .then(r => r.result);

export const insert = (table, data) =>
  sn('POST', `/api/now/table/${table}`, data).then(r => r.result);

export const update = (table, sysId, data) =>
  sn('PATCH', `/api/now/table/${table}/${sysId}`, data).then(r => r.result);

export const del = (table, sysId) => sn('DELETE', `/api/now/table/${table}/${sysId}`);

// Find by encoded query; PATCH the first hit or POST a new record. Returns the record.
export async function ensure(table, query, data) {
  const found = await list(table, query, 'sys_id');
  return found.length ? update(table, found[0].sys_id, data) : insert(table, data);
}
