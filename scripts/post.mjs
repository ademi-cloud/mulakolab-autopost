// Auto-post Mula Kolab ke Instagram + Threads.
// Hanya post baris kalendar yang Status = "Lulus". Setiap platform dipost sekali sahaja (lihat log/posted.json).
//
// Guna:
//   node scripts/post.mjs                 post hari ini (ikut waktu Malaysia)
//   node scripts/post.mjs --hari 2        post hari tertentu
//   node scripts/post.mjs --dry-run       semak sahaja, tiada apa dipost
//
// Env: IG_TOKEN, THREADS_TOKEN, MEDIA_BASE_URL (atau GITHUB_REPOSITORY + GITHUB_REF_NAME)

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// Token "EAA…" (System User dari Unified login) guna graph.facebook.com; token "IG…" guna graph.instagram.com
const IG_FB = (process.env.IG_TOKEN || '').startsWith('EAA');
const IG_HOST = IG_FB
  ? 'https://graph.facebook.com/' + (process.env.IG_API_VERSION || 'v24.0')
  : 'https://graph.instagram.com/' + (process.env.IG_API_VERSION || 'v26.0');
const TH_HOST = 'https://graph.threads.com/' + (process.env.THREADS_API_VERSION || 'v1.0');
const LOG_FILE = join(ROOT, 'log', 'posted.json');

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run') || process.env.DRY_RUN === 'true';
const hariArg = args.includes('--hari') ? args[args.indexOf('--hari') + 1] : process.env.HARI;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...m) => console.log(...m);

// ---------- CSV ----------
function parseCsv(text) {
  text = text.replace(/^﻿/, '');
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((f) => f !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const [head, ...data] = rows;
  return data.map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').replace(/\r\n/g, '\n')])));
}

// "Isn 2/11/2026" -> "2026-11-02"
function tarikhIso(tarikh) {
  const [d, m, y] = tarikh.trim().split(' ').pop().split('/').map(Number);
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function hariIniKL() {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date()).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

// ---------- HTTP ----------
async function api(method, url, params = {}) {
  const u = new URL(url);
  let body;
  if (method === 'GET') Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
  else body = new URLSearchParams(params);
  const res = await fetch(u, { method, body });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) {
    const e = json.error || {};
    throw new Error(`${method} ${u.pathname} gagal (${res.status}): ${e.message || JSON.stringify(json)}`);
  }
  return json;
}

// ---------- Instagram ----------
async function igTunggu(id, token) {
  for (let i = 0; i < 30; i++) {
    const { status_code } = await api('GET', `${IG_HOST}/${id}`, { fields: 'status_code', access_token: token });
    if (status_code === 'FINISHED') return;
    if (status_code === 'ERROR' || status_code === 'EXPIRED') throw new Error(`Container ${id} status ${status_code}`);
    await sleep(10_000);
  }
  throw new Error(`Container ${id} tak siap selepas 5 minit`);
}

// ID akaun IG: IG_USER_ID jika diset; jika tidak, cari sendiri ikut jenis token
async function igUserId(token) {
  if (process.env.IG_USER_ID) return process.env.IG_USER_ID;
  if (!IG_FB) return (await api('GET', `${IG_HOST}/me`, { fields: 'user_id', access_token: token })).user_id;
  const { data } = await api('GET', `${IG_HOST}/me/assigned_instagram_accounts`, { access_token: token });
  if (!data?.length) throw new Error('Tiada akaun Instagram di-assign kepada System User (Business Settings → System users → Assign assets)');
  return data[0].id;
}

async function postInstagram(post, token) {
  const user_id = await igUserId(token);
  const media = () => `${IG_HOST}/${user_id}/media`;
  let containerId;

  if (post.jenis === 'reel') {
    const c = await api('POST', media(), { media_type: 'REELS', video_url: post.video, ...(post.cover && { cover_url: post.cover }), caption: post.caption, access_token: token });
    containerId = c.id;
  } else if (post.gambar.length === 1) {
    const c = await api('POST', media(), { image_url: post.gambar[0], caption: post.caption, access_token: token });
    containerId = c.id;
  } else {
    const anak = [];
    for (const url of post.gambar) {
      const c = await api('POST', media(), { image_url: url, is_carousel_item: 'true', access_token: token });
      anak.push(c.id);
    }
    for (const id of anak) await igTunggu(id, token);
    const c = await api('POST', media(), { media_type: 'CAROUSEL', children: anak.join(','), caption: post.caption, access_token: token });
    containerId = c.id;
  }
  await igTunggu(containerId, token);
  const { id } = await api('POST', `${IG_HOST}/${user_id}/media_publish`, { creation_id: containerId, access_token: token });
  return id;
}

// ---------- Threads ----------
async function postThreads(post, token) {
  const { id: userId } = await api('GET', `${TH_HOST}/me`, { fields: 'id,username', access_token: token });
  const c = await api('POST', `${TH_HOST}/${userId}/threads`, { media_type: 'TEXT', text: post.threads, access_token: token });
  await sleep(30_000); // Meta cadangkan tunggu ~30 saat sebelum publish
  const { id } = await api('POST', `${TH_HOST}/${userId}/threads_publish`, { creation_id: c.id, access_token: token });
  return id;
}

// ---------- Utama ----------
function baseUrl() {
  if (process.env.MEDIA_BASE_URL) return process.env.MEDIA_BASE_URL.replace(/\/$/, '');
  const repo = process.env.GITHUB_REPOSITORY;
  if (!repo) throw new Error('Set MEDIA_BASE_URL atau GITHUB_REPOSITORY supaya Meta boleh ambil gambar');
  return `https://raw.githubusercontent.com/${repo}/${process.env.GITHUB_REF_NAME || 'main'}`;
}

function bina(row) {
  const n = Number(row.Hari);
  const folder = `media/hari-${String(n).padStart(2, '0')}`;
  const fail = existsSync(join(ROOT, folder)) ? readdirSync(join(ROOT, folder)).sort() : [];
  const base = baseUrl();
  const reel = /^Reel/i.test(row['Format IG']);
  const video = fail.find((f) => f.endsWith('.mp4'));
  return {
    hari: n,
    tarikh: tarikhIso(row.Tarikh),
    format: row['Format IG'],
    jenis: reel ? 'reel' : 'gambar',
    gambar: fail.filter((f) => f.endsWith('.jpg') && !f.startsWith('cover')).map((f) => `${base}/${folder}/${f}`),
    cover: fail.includes('cover-reel.jpg') ? `${base}/${folder}/cover-reel.jpg` : null,
    video: video ? `${base}/${folder}/${video}` : null,
    caption: row['Caption IG'].trim(),
    threads: row['Post Threads'].trim(),
    status: row.Status.trim(),
  };
}

function semak(post) {
  const masalah = [];
  if (post.jenis === 'gambar' && post.gambar.length === 0) masalah.push('Tiada gambar .jpg');
  if (post.gambar.length > 20) masalah.push('Carousel lebih 20 gambar');
  if (post.caption.length > 2200) masalah.push(`Caption IG ${post.caption.length} aksara (had 2200)`);
  if ((post.caption.match(/#/g) || []).length > 30) masalah.push('Lebih 30 hashtag');
  if (panjangThreads(post.threads) > 500) masalah.push(`Teks Threads ${panjangThreads(post.threads)} aksara (had 500)`);
  return masalah;
}

// Threads kira emoji ikut bilangan bait UTF-8, huruf biasa = 1
function panjangThreads(teks) {
  return [...teks].reduce((n, ch) => n + (/\p{Extended_Pictographic}/u.test(ch) ? Buffer.byteLength(ch) : 1), 0);
}

async function main() {
  const rows = parseCsv(readFileSync(process.env.KALENDAR || join(ROOT, 'kalendar.csv'), 'utf8'));
  const sasaran = hariArg
    ? rows.find((r) => Number(r.Hari) === Number(hariArg))
    : rows.find((r) => tarikhIso(r.Tarikh) === hariIniKL());
  if (!sasaran) { log(`Tiada post dijadualkan untuk ${hariArg ? 'Hari ' + hariArg : hariIniKL()}.`); return; }

  const post = bina(sasaran);
  log(`Hari ${post.hari} (${post.tarikh}) · ${post.format} · Status: ${post.status}`);

  if (post.status !== 'Lulus') { log('Belum diluluskan. Tiada apa dipost.'); return; }

  const masalah = semak(post);
  if (masalah.length) throw new Error('Tak boleh post:\n- ' + masalah.join('\n- '));

  const logData = existsSync(LOG_FILE) ? JSON.parse(readFileSync(LOG_FILE, 'utf8')) : {};
  const rekod = (logData[post.hari] ||= {});
  // Reel tanpa video: IG dilangkau (dan dilaporkan), Threads tetap dipost
  const tiadaVideo = post.jenis === 'reel' && !post.video
    ? `instagram: Reel tapi tiada video .mp4 dalam media/hari-${String(post.hari).padStart(2, '0')}/`
    : null;

  if (DRY) {
    if (tiadaVideo) log(`AMARAN ${tiadaVideo} (IG akan dilangkau)`);
    log('\n[DRY RUN] Tiada apa dipost. Ini yang akan dihantar:');
    log('Gambar:', post.jenis === 'reel' ? post.video : post.gambar);
    for (const url of [...post.gambar, post.video].filter(Boolean)) {
      try {
        const r = await fetch(url, { method: 'HEAD' });
        log(`  ${r.ok ? 'OK ' : 'XX '} ${r.status} ${r.headers.get('content-type')} ${url}`);
      } catch (e) {
        log(`  XX  tak dapat dicapai (${e.cause?.code || e.message}) ${url}`);
      }
    }
    log(`\nCaption IG (${post.caption.length} aksara):\n${post.caption}`);
    log(`\nThreads (${panjangThreads(post.threads)}/500 aksara):\n${post.threads}`);
    log('\nSudah dipost sebelum ni:', JSON.stringify(rekod));
    return;
  }

  const ralat = [];
  for (const [platform, fn, token] of [
    ['instagram', postInstagram, process.env.IG_TOKEN],
    ['threads', postThreads, process.env.THREADS_TOKEN],
  ]) {
    if (rekod[platform]) { log(`${platform}: dah dipost (${rekod[platform].id}), langkau.`); continue; }
    if (platform === 'instagram' && tiadaVideo) { ralat.push(tiadaVideo); continue; }
    if (!token) { ralat.push(`${platform}: token tiada`); continue; }
    try {
      const id = await fn(post, token);
      rekod[platform] = { id, masa: new Date().toISOString() };
      log(`${platform}: BERJAYA, id ${id}`);
    } catch (e) {
      ralat.push(`${platform}: ${e.message}`);
      console.error(`${platform}: GAGAL, ${e.message}`);
    }
  }

  mkdirSync(dirname(LOG_FILE), { recursive: true });
  writeFileSync(LOG_FILE, JSON.stringify(logData, null, 2) + '\n');
  if (ralat.length) throw new Error('Sebahagian post gagal:\n- ' + ralat.join('\n- '));
}

main().catch((e) => { console.error(e.message); process.exit(1); });
