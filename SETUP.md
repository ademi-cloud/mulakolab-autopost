# Auto-post Mula Kolab: Panduan Setup

Sistem ini post ke **Instagram + Threads setiap hari pukul 8:30 malam**, tapi **hanya** hari yang berstatus `Lulus` dalam `kalendar.csv`.

```
Claude tunjuk post hari tu  →  awak balas "lulus"  →  Status = Lulus (kalendar.csv di GitHub)
                                                          ↓
                              GitHub Actions, 8:30 malam  →  Instagram + Threads
```

Setup sekali sahaja, lebih kurang **30–45 minit**. Ada 4 bahagian.

---

## Bahagian 1: Instagram jadi akaun Professional

1. Instagram → Profile → ☰ → **Settings and privacy** → **Account type and tools**
2. **Switch to professional account** → pilih **Business** (atau Creator)
3. Kategori: *Marketing Agency* atau *Business Service*

> Kalau dah Professional, langkau bahagian ini.

---

## Bahagian 2: Buat Meta App dan dapatkan token

### 2a. Akaun developer dan app

1. Buka **developers.facebook.com** → Log in → **Get Started** (daftar sebagai developer, percuma)
2. **My Apps** → **Create App**
3. Nama app: `Mula Kolab Autopost`
4. Use case: pilih **Manage messaging & content on Instagram**
5. Siapkan app

### 2b. Token Instagram

1. Dalam app → **Instagram** → **API setup with Instagram business login**
2. Bahagian **Generate access tokens** → **Add account** → log masuk @mulakolab → benarkan
3. Tekan **Generate token** bersebelahan @mulakolab → salin token
4. Simpan sementara dalam Notepad sebagai **IG_TOKEN**

> Token ini sah 60 hari. Sistem akan perbaharuinya sendiri setiap minggu.
> Untuk post ke akaun sendiri, app **tak perlu** lulus App Review.

### 2c. Token Threads

1. Dalam app yang sama → **Use cases** → **Add use case** → **Access the Threads API**
   - Kalau Meta tak benarkan tambah ke app yang sama, buat **app kedua** khas untuk Threads.
2. Use case Threads → **Customize** → pastikan permission `threads_basic` dan `threads_content_publish` ditanda
3. **App roles** → **Roles** → **Add People** → **Threads Tester** → masukkan username Threads Mula Kolab
4. Dalam app **Threads** di telefon: Settings → Account → **Website permissions** → **Invites** → **Accept**
5. Kembali ke use case Threads → **Settings** → salin **Threads App Secret**
6. Gunakan **User Token Generator** (dalam use case Threads) → Generate token → salin (ini token jangka pendek, 1 jam)
7. Tukar ke token 60 hari. Dalam folder projek ni, buat fail `.env` (salin dari `.env.example`) dan isi:
   ```
   THREADS_APP_SECRET=xxxxx
   THREADS_SHORT_TOKEN=xxxxx
   ```
   kemudian jalankan:
   ```
   node scripts/token.mjs tukar-threads
   ```
   Salin token yang keluar sebagai **THREADS_TOKEN**.

### 2d. Semak kedua-dua token

Isi `IG_TOKEN` dan `THREADS_TOKEN` dalam `.env`, kemudian jalankan:
```
node scripts/token.mjs semak
```
Mesti keluar `Instagram: OK, @mulakolab` dan `Threads: OK, @…`.

> 🔒 **Jangan tampal token dalam chat, email atau WhatsApp.** Token ni macam kunci akaun.

---

## Bahagian 3: GitHub

1. Daftar / log masuk **github.com**
2. **New repository** → nama `mulakolab-autopost` → **Public**
   - Mesti *Public* supaya Meta boleh ambil gambar dari link GitHub.
   - Gambar dan caption yang akan datang boleh dilihat orang yang tahu link repo. Token **tidak** didedahkan.
3. Upload folder projek ni ke repo. Claude boleh buat langkah ni kalau `gh` dah log masuk di komputer awak.
4. Repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**, tambah 3:

| Nama secret | Nilai |
|---|---|
| `IG_TOKEN` | token Instagram (2b) |
| `THREADS_TOKEN` | token Threads 60 hari (2c) |
| `GH_PAT` | lihat bawah |

**Cara buat `GH_PAT`** (untuk sistem perbaharui token sendiri):
GitHub → avatar → **Settings** → **Developer settings** → **Personal access tokens** → **Fine-grained tokens** → **Generate new token**
- Repository access: **Only select repositories** → `mulakolab-autopost`
- Permissions → Repository → **Secrets: Read and write**
- Expiration: 1 tahun → Generate → salin

5. Repo → **Actions** → kalau ada butang hijau *I understand my workflows, go ahead and enable them*, tekan.

---

## Bahagian 4: Uji

1. Repo → **Actions** → **Auto-post harian** → **Run workflow**
2. `hari`: `2`, `dry_run`: ✅ (ditanda)
3. Tekan **Run workflow** → tunggu ~1 minit → buka hasilnya
4. Semua link gambar mesti tunjuk `OK 200 image/jpeg`

Bila dry run lulus, sistem dah sedia. Mulai sekarang ia akan post sendiri setiap 8:30 malam untuk hari yang `Lulus`.

---

## Rutin harian

| Bila | Siapa | Apa |
|---|---|---|
| Siang | Claude | Tunjuk post hari tu untuk disemak |
| Bila sedia | Awak | Balas "lulus" atau minta edit |
| Selepas lulus | Claude | Tukar Status = Lulus dalam `kalendar.csv` dan push ke GitHub |
| 8:30 malam | GitHub Actions | Post ke IG + Threads, rekod dalam `log/posted.json` |

- **Tak lulus = tak post.** Selamat untuk dibiarkan.
- **Post gagal?** GitHub hantar email "Run failed". Buka log untuk tengok sebabnya, atau tanya Claude.
- **Reel** (Hari 3, 8, 16, 26): letak video `reel.mp4` dalam `media/hari-XX/`. Tanpa video, IG hari tu tak dipost, tapi Threads tetap dipost.
- **Post semula / post lewat:** Actions → Run workflow → isi `hari`, buang tanda `dry_run`.

## Fail dalam projek ini

| Fail | Fungsi |
|---|---|
| `kalendar.csv` | 30 hari: caption, teks Threads, **Status** |
| `media/hari-XX/*.jpg` | Gambar setiap hari (dijana dari folder carousel) |
| `log/posted.json` | Rekod apa yang dah dipost, supaya tak post dua kali |
| `scripts/post.mjs` | Skrip post |
| `scripts/token.mjs` | Semak / tukar / perbaharui token |
| `segerak.ps1` | Salin kalendar + tukar PNG ke JPEG selepas edit gambar |
| `.github/workflows/` | Jadual harian + perbaharui token mingguan |
