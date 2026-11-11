# Presensi SMP 1 YPK — v2.0 (PWA)

Aplikasi presensi guru & karyawan yang bisa **dipasang di HP** (Android & iPhone) lewat GitHub Pages.

**Fitur baru**
- 🙂 **Verifikasi wajah** saat Masuk/Pulang (face-api, berjalan di HP) + **wajib berkedip** agar tidak bisa pakai foto.
- 🔑 **OTP pulang cepat**: jika absen Pulang sebelum jam pulang, wajib memasukkan kode 6 angka dari **Guru Piket hari ini** atau **Admin**. Kode sekali pakai, khusus untuk nama tersebut, berlaku 15 menit (bisa diatur).
- 📍 GPS kini dicek ulang di server, koordinat & radius bisa diatur dari panel admin.
- 📷 Foto bukti presensi tersimpan di Google Drive (bisa dimatikan).
- 🔒 Sandi admin tidak lagi tertulis di kode HTML (disimpan di server, bisa diganti).
- 📲 Bisa dipasang ke layar utama HP, terbuka seperti aplikasi.

```
presensi-smp1ypk/
├── backend/Code.gs        ← tempel ke Google Apps Script (BUKAN untuk GitHub Pages)
├── index.html  app.js  config.js  sw.js  manifest.json  icons/   ← frontend (GitHub Pages)
└── .github/workflows/deploy.yml   ← deploy otomatis
```

---

## LANGKAH 1 — Backend (Google Apps Script)

1. Buka Google Sheet presensi yang lama (data **Data Guru** & **Presensi** tetap dipakai).
2. **Extensions → Apps Script**. Ganti seluruh isi `Code.gs` dengan isi `backend/Code.gs`.
   File `Index.html` lama di Apps Script boleh dihapus (tampilan kini di GitHub).
3. Pilih fungsi **`setupSheets`** → klik **Run** → izinkan akses (Sheets & Drive).
   Ini menambah kolom baru (PIN, Data Wajah, Skor Wajah, Foto, OTP Oleh) dan sheet **OTP**.
   Data lama tidak dihapus.
4. **Deploy → New deployment → ⚙ Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
5. Salin **Web app URL** (berakhiran `/exec`).

> Setiap kali `Code.gs` diubah: **Deploy → Manage deployments → ✏ Edit → Version: New version → Deploy** (URL tetap sama).

Sandi admin awal: `Proypk1*` — **segera ganti** di menu Pengaturan.

## LANGKAH 2 — Frontend (GitHub Pages)

1. Buka `config.js`, ganti `API_URL` dengan URL `/exec` dari langkah 1.
2. Buat repository baru di GitHub, misal `presensi-ypk` (boleh **Public**).
3. Upload semua isi folder ini (termasuk folder `.github`, `icons`, dan `backend`).
   - Lewat web: **Add file → Upload files**, seret semua file/folder.
   - Lewat git:
     ```bash
     git init && git add . && git commit -m "Presensi v2"
     git branch -M main
     git remote add origin https://github.com/USERNAME/presensi-ypk.git
     git push -u origin main
     ```
   > Folder `.github` kadang tidak ikut saat seret-lepas di Windows. Bila begitu, buat manual:
   > **Add file → Create new file**, nama `.github/workflows/deploy.yml`, tempel isinya.
4. Di repo: **Settings → Pages → Source: GitHub Actions**.
5. Buka tab **Actions**, tunggu proses "Deploy ke GitHub Pages" hijau ✅.
6. Aplikasi tersedia di `https://USERNAME.github.io/presensi-ypk/`

## LANGKAH 3 — Pasang di HP

- **Android (Chrome):** buka alamat di atas → tombol **📲 Pasang Aplikasi** (atau menu ⋮ → *Install app / Tambahkan ke layar utama*).
- **iPhone (Safari):** tombol **Bagikan** → **Tambah ke Layar Utama**.
- Saat pertama kali, izinkan **Lokasi** dan **Kamera**.

## LANGKAH 4 — Persiapan data di Panel Admin (ikon ⚙)

1. **Pengaturan** → isi koordinat sekolah (atau tekan *📍 Pakai lokasi saya* saat berada di sekolah), radius, jam, lalu **Simpan**.
2. **Pegawai & Wajah** → untuk tiap pegawai:
   - **Daftar Wajah**: pegawai menghadap kamera, sistem mengambil 3 sampel otomatis.
   - **PIN**: isi PIN 4–6 angka untuk guru yang punya jadwal piket (dipakai login Panel Guru Piket).
   - Hari piket bisa diubah langsung dari dropdown.

## Alur OTP Pulang Cepat

1. Guru menekan **Pulang** sebelum jam pulang → wajah diverifikasi → muncul kotak **OTP**.
2. Guru menemui **Guru Piket** → piket membuka **🔑 Panel Guru Piket** (login nama + PIN) → pilih nama guru → **Buat Kode OTP** (bisa dikirim via WhatsApp).
   Admin juga bisa membuat OTP dari tab **OTP Pulang**.
3. Guru memasukkan kode → tercatat `Pulang Cepat (Izin: Piket: Nama)`.

## Catatan penting

- Pengenalan wajah berbasis browser cukup untuk mencegah titip absen sehari-hari, tetapi **bukan setingkat sistem biometrik bank**. Atur "Ketatnya Wajah" (default 0.5; turunkan ke 0.45 bila ada yang tertukar, naikkan ke 0.55 bila sering gagal).
- Pemuatan pertama model wajah ±6 MB; setelah itu disimpan di HP.
- Bila mengubah file frontend, naikkan `VERSION` di `sw.js` agar HP mengambil versi baru.
- Kamera & GPS hanya jalan di **https** — GitHub Pages sudah https.
