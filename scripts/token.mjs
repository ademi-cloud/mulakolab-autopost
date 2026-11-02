// Alat token Meta.
//
//   node scripts/token.mjs semak
//       Semak IG_TOKEN dan THREADS_TOKEN masih sah, dan tunjuk akaun mana yang disambung.
//
//   node scripts/token.mjs tukar-threads
//       Tukar token Threads jangka pendek (THREADS_SHORT_TOKEN) kepada token 60 hari.
//       Perlu THREADS_APP_SECRET.
//
//   node scripts/token.mjs refresh <folder>
//       Perbaharui kedua-dua token (tambah 60 hari). Token baru ditulis ke <folder>/IG_TOKEN dan
//       <folder>/THREADS_TOKEN, untuk dikemas kini ke GitHub Secrets oleh workflow.
//
// Token dibaca dari env atau fail .env (jangan commit fail .env).

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const envFile = join(ROOT, '.env');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

async function get(url) {
  const res = await fetch(url);
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) throw new Error(json.error?.message || `HTTP ${res.status}`);
  return json;
}

const [cmd, folder] = process.argv.slice(2);

if (cmd === 'semak') {
  for (const [nama, url] of [
    ['Instagram', `https://graph.instagram.com/me?fields=user_id,username&access_token=${process.env.IG_TOKEN}`],
    ['Threads', `https://graph.threads.com/v1.0/me?fields=id,username&access_token=${process.env.THREADS_TOKEN}`],
  ]) {
    try { const j = await get(url); console.log(`${nama}: OK, @${j.username}`); }
    catch (e) { console.log(`${nama}: GAGAL, ${e.message}`); process.exitCode = 1; }
  }
} else if (cmd === 'tukar-threads') {
  const j = await get(`https://graph.threads.com/access_token?grant_type=th_exchange_token&client_secret=${process.env.THREADS_APP_SECRET}&access_token=${process.env.THREADS_SHORT_TOKEN}`);
  console.log(`Token Threads 60 hari (tamat dalam ${Math.round(j.expires_in / 86400)} hari).`);
  console.log('Salin baris di bawah ke .env dan ke GitHub Secret THREADS_TOKEN:\n');
  console.log(j.access_token);
} else if (cmd === 'refresh') {
  if (!folder) throw new Error('Guna: node scripts/token.mjs refresh <folder>');
  mkdirSync(folder, { recursive: true });
  const ig = await get(`https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${process.env.IG_TOKEN}`);
  const th = await get(`https://graph.threads.com/refresh_access_token?grant_type=th_refresh_token&access_token=${process.env.THREADS_TOKEN}`);
  writeFileSync(join(folder, 'IG_TOKEN'), ig.access_token);
  writeFileSync(join(folder, 'THREADS_TOKEN'), th.access_token);
  console.log(`Token diperbaharui. IG: ${Math.round(ig.expires_in / 86400)} hari, Threads: ${Math.round(th.expires_in / 86400)} hari.`);
} else {
  console.log('Guna: node scripts/token.mjs semak | tukar-threads | refresh <folder>');
}
