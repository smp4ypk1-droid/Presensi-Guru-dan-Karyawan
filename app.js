/* =============================================================
 *  PRESENSI SMP 1 YPK — FRONTEND (PWA)
 *  Verifikasi Wajah (face-api) + GPS + OTP Pulang Cepat
 * ============================================================= */
'use strict';

const CFG = window.APP_CONFIG || {};
const BULAN = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
const HARI = ['Tidak Ada','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];

const state = {
  guru: [], hariIni: '', lokasi: null, cekKedip: true, jadwal: {},
  clockOffset: 0,
  adminToken: sessionStorage.getItem('adminToken') || '',
  piketToken: sessionStorage.getItem('piketToken') || '',
  piketNama: sessionStorage.getItem('piketNama') || '',
  settings: {}, guruAdmin: [], rekap: [], filteredRekap: [], ringkasan: [],
  stempelBaru: '', pendingAbsen: null
};

/* ===================== UTIL ===================== */
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rupiah = (n) => 'Rp ' + Number(n || 0).toLocaleString('id-ID');

function loading(on, text) {
  $('loading').classList.toggle('hidden', !on);
  if (text) $('loadingText').innerText = text;
}

async function api(action, payload = {}, token = '') {
  if (!CFG.API_URL || CFG.API_URL.includes('GANTI_DENGAN')) {
    throw new Error('API_URL belum diatur di config.js');
  }
  const res = await fetch(CFG.API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // hindari CORS preflight
    body: JSON.stringify({ action, token, ...payload }),
    redirect: 'follow'
  });
  if (!res.ok) throw new Error('Server error ' + res.status);
  const j = await res.json();
  if (j.status === 'auth') {
    if (token && token === state.adminToken) { logoutAdmin(true); }
    if (token && token === state.piketToken) { logoutPiket(); }
    throw new Error(j.message);
  }
  return j;
}

function showStatus(msg, type) {
  const wrap = $('statusWrapper'), text = $('statusMsg');
  const map = {
    error: ['bg-red-50', 'border-red-200', 'text-red-700'],
    success: ['bg-green-50', 'border-green-200', 'text-green-700'],
    warning: ['bg-yellow-50', 'border-yellow-200', 'text-yellow-700'],
    process: ['bg-blue-50', 'border-blue-200', 'text-blue-700']
  }[type] || ['bg-blue-50', 'border-blue-200', 'text-blue-700'];
  wrap.className = `p-3 rounded-lg border text-sm ${map[0]} ${map[1]}`;
  text.className = `font-medium whitespace-pre-line ${map[2]}`;
  text.innerText = msg;
}

function setBusy(busy) {
  $('btnMasuk').disabled = busy;
  $('btnPulang').disabled = busy;
}

/* ===================== INIT ===================== */
window.addEventListener('load', () => {
  document.querySelectorAll('.js-sekolah').forEach(el => el.innerText = CFG.NAMA_SEKOLAH || 'SMP 1 YPK');
  setInterval(updateClock, 1000);
  setupDropdownStatis();
  loadInitialData();
  setupInstall();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  $('ingatNama').addEventListener('change', simpanIngatNama);
  $('selectNama').addEventListener('change', simpanIngatNama);
  $('otpInput').addEventListener('keydown', e => { if (e.key === 'Enter') kirimOtp(); });
  $('piketPin').addEventListener('keydown', e => { if (e.key === 'Enter') loginPiket(); });
  if (state.adminToken) { switchView('Admin'); loadAdminAll(); }
});

function setupDropdownStatis() {
  const now = new Date();
  $('filterBulanRingkasan').innerHTML = BULAN.map((b, i) => `<option value="${i}">${b}</option>`).join('');
  $('filterBulanRingkasan').value = now.getMonth();
  let th = '';
  for (let y = now.getFullYear() - 2; y <= now.getFullYear() + 1; y++) th += `<option value="${y}" ${y === now.getFullYear() ? 'selected' : ''}>${y}</option>`;
  $('filterTahunRingkasan').innerHTML = th;
  document.querySelectorAll('.hari-select').forEach(s => s.innerHTML = HARI.map(h => `<option value="${h}">${h}</option>`).join(''));
}

async function loadInitialData() {
  try {
    const r = await api('getInitialData');
    state.guru = r.guru || [];
    state.hariIni = r.hariIni;
    state.lokasi = r.lokasi;
    state.cekKedip = r.cekKedip !== false;
    state.jadwal = r.jadwal || {};
    if (r.serverTime) {
      const server = new Date(r.serverTime + '+07:00').getTime();
      state.clockOffset = server - Date.now();
    }
    $('infoHariIni').innerText = `Hari Ini: ${state.hariIni}`;
    filterDropdownNama();
    isiDropdownPiket();
  } catch (e) {
    $('selectNama').innerHTML = '<option value="">Gagal memuat data</option>';
    showStatus('Gagal terhubung ke server: ' + e.message + '\nPeriksa koneksi internet lalu buka ulang aplikasi.', 'error');
  }
}

function updateClock() {
  const d = new Date(Date.now() + state.clockOffset);
  $('digitalClock').innerText = d.toLocaleTimeString('id-ID', { hour12: false, timeZone: 'Asia/Jakarta' });
}

function filterDropdownNama() {
  const role = $('selectRole').value;
  const sel = $('selectNama');
  const tersimpan = localStorage.getItem('namaSaya') || '';
  let html = '<option value="">-- Pilih Nama Anda --</option>';
  state.guru.forEach(g => {
    const show = role === 'Semua' || (role === 'Piket' && g.piketHariIni) || (role === 'Tidak Piket' && !g.piketHariIni);
    if (!show) return;
    let label = g.nama + (g.piketHariIni ? ' (Piket Hari Ini)' : '') + (g.wajahTerdaftar ? '' : ' ⚠ wajah belum terdaftar');
    html += `<option value="${esc(g.nama)}">${esc(label)}</option>`;
  });
  sel.innerHTML = html;
  if (tersimpan && state.guru.some(g => g.nama === tersimpan)) {
    sel.value = tersimpan;
    $('ingatNama').checked = true;
  }
}

function simpanIngatNama() {
  if ($('ingatNama').checked && $('selectNama').value) localStorage.setItem('namaSaya', $('selectNama').value);
  else if (!$('ingatNama').checked) localStorage.removeItem('namaSaya');
}

/* ===================== INSTALL PWA ===================== */
let deferredPrompt = null;
function setupInstall() {
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (standalone) return;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); deferredPrompt = e; $('btnInstall').classList.remove('hidden');
  });
  if (/iphone|ipad|ipod/i.test(navigator.userAgent)) $('iosHint').classList.remove('hidden');
}
async function installApp() {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  $('btnInstall').classList.add('hidden');
}

/* ===================== GPS ===================== */
function ambilLokasi() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Perangkat tidak mendukung GPS.'));
    navigator.geolocation.getCurrentPosition(
      p => resolve({ lat: p.coords.latitude, lon: p.coords.longitude, akurasi: p.coords.accuracy }),
      err => reject(new Error(err.code === 1 ? 'Izin lokasi ditolak. Aktifkan izin Lokasi untuk aplikasi ini.' : 'Gagal membaca GPS. Pastikan GPS aktif lalu coba lagi.')),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  });
}

function hitungJarak(lat1, lon1, lat2, lon2) {
  const R = 6371e3, toRad = x => x * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/* ===================== FACE ENGINE ===================== */
const face = { loaded: false, loading: null, stream: null, running: false, resolve: null, reject: null };

function loadFaceModels() {
  if (face.loaded) return Promise.resolve();
  if (face.loading) return face.loading;
  face.loading = (async () => {
    let tunggu = 0;
    while (typeof faceapi === 'undefined' && tunggu < 100) { await new Promise(r => setTimeout(r, 100)); tunggu++; }
    if (typeof faceapi === 'undefined') throw new Error('Library pengenal wajah gagal dimuat. Periksa internet.');
    const url = CFG.MODEL_URL;
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(url),
      faceapi.nets.faceLandmark68Net.loadFromUri(url),
      faceapi.nets.faceRecognitionNet.loadFromUri(url)
    ]);
    face.loaded = true;
  })();
  face.loading.catch(() => { face.loading = null; });
  return face.loading;
}

async function bukaKameraStream() {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Kamera tidak didukung. Gunakan Chrome/Safari terbaru dan alamat https.');
  try {
    face.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
  } catch (e) {
    throw new Error(e.name === 'NotAllowedError' ? 'Izin kamera ditolak. Aktifkan izin Kamera untuk aplikasi ini.' : 'Kamera tidak bisa dibuka: ' + e.message);
  }
  const v = $('camVideo');
  v.srcObject = face.stream;
  await v.play();
  await new Promise(r => { if (v.videoWidth) r(); else v.onloadedmetadata = () => r(); });
}

function tutupKamera() {
  face.running = false;
  if (face.stream) { face.stream.getTracks().forEach(t => t.stop()); face.stream = null; }
  $('camVideo').srcObject = null;
  $('modalKamera').classList.add('hidden');
  $('camAksi').classList.add('hidden');
  if (face.reject) { const rj = face.reject; face.reject = face.resolve = null; rj(new Error('dibatalkan')); }
}

function camStatus(msg, ring) {
  $('camStatus').innerText = msg;
  const r = $('faceRing');
  r.classList.remove('ok', 'bad');
  if (ring) r.classList.add(ring);
}

function eyeAspectRatio(pts) {
  const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  return (d(pts[1], pts[5]) + d(pts[2], pts[4])) / (2 * d(pts[0], pts[3]));
}

function ambilFoto(video) {
  const w = 320, h = Math.round(video.videoHeight * (w / video.videoWidth));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d').drawImage(video, 0, 0, w, h);
  return c.toDataURL('image/jpeg', 0.7);
}

async function deteksi(video) {
  return faceapi
    .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }))
    .withFaceLandmarks()
    .withFaceDescriptor();
}

/**
 * mode 'verifikasi' -> resolve { descriptor:number[128], foto:dataURL }
 * mode 'daftar'     -> resolve { descriptors: number[3][128] }
 */
async function scanWajah(mode, judul, nama) {
  $('camJudul').innerText = judul;
  $('camNama').innerText = nama || '';
  $('modalKamera').classList.remove('hidden');
  camStatus('Memuat model pengenal wajah...\n(pertama kali bisa ±10 detik)');

  await loadFaceModels();
  await bukaKameraStream();

  return new Promise((resolve, reject) => {
    face.resolve = resolve; face.reject = reject; face.running = true;
    const v = $('camVideo');
    const perluKedip = mode === 'verifikasi' && state.cekKedip;
    let stabil = 0, earBuka = 0, sudahTutup = false, sudahKedip = !perluKedip;
    const sampel = []; let terakhirSampel = 0;

    const selesai = (hasil) => {
      face.running = false;
      face.resolve = face.reject = null;
      if (face.stream) { face.stream.getTracks().forEach(t => t.stop()); face.stream = null; }
      $('modalKamera').classList.add('hidden');
      resolve(hasil);
    };

    const loop = async () => {
      if (!face.running) return;
      let det = null;
      try { det = await deteksi(v); } catch (e) { /* frame gagal, lanjut */ }
      if (!face.running) return;

      if (!det) { stabil = 0; camStatus('Wajah tidak terdeteksi.\nPosisikan wajah di dalam lingkaran.', 'bad'); return setTimeout(loop, 120); }
      const lebar = det.detection.box.width / v.videoWidth;
      if (lebar < 0.25) { stabil = 0; camStatus('Dekatkan wajah ke kamera.', 'bad'); return setTimeout(loop, 120); }
      if (det.detection.score < 0.6) { stabil = 0; camStatus('Pencahayaan kurang / wajah kurang jelas.', 'bad'); return setTimeout(loop, 120); }

      const ear = (eyeAspectRatio(det.landmarks.getLeftEye()) + eyeAspectRatio(det.landmarks.getRightEye())) / 2;

      if (mode === 'daftar') {
        const now = Date.now();
        if (now - terakhirSampel > 700 && ear > 0.22) {
          sampel.push(Array.from(det.descriptor));
          terakhirSampel = now;
        }
        camStatus(`Mengambil sampel wajah ${sampel.length}/3...\nGerakkan kepala sedikit ke kiri/kanan.`, 'ok');
        if (sampel.length >= 3) return selesai({ descriptors: sampel });
        return setTimeout(loop, 150);
      }

      // --- mode verifikasi ---
      if (!sudahKedip) {
        if (ear > earBuka) earBuka = earBuka ? earBuka * 0.9 + ear * 0.1 : ear;
        if (earBuka && ear < Math.min(0.2, earBuka * 0.72)) sudahTutup = true;
        if (sudahTutup && ear > Math.max(0.22, earBuka * 0.85)) sudahKedip = true;
        camStatus(sudahTutup ? 'Buka mata...' : '👁 Silakan BERKEDIP sekali', 'ok');
        return setTimeout(loop, 60);
      }
      if (ear < 0.2) { camStatus('Buka mata Anda...', 'ok'); return setTimeout(loop, 80); }
      stabil++;
      camStatus('Tahan posisi... ' + '●'.repeat(stabil), 'ok');
      if (stabil >= 2) return selesai({ descriptor: Array.from(det.descriptor), foto: ambilFoto(v) });
      setTimeout(loop, 120);
    };
    loop();
  });
}

/* ===================== PRESENSI ===================== */
async function jalankanPresensi(tipe) {
  const nama = $('selectNama').value;
  if (!nama) return alert('Pilih nama Anda terlebih dahulu!');
  const g = state.guru.find(x => x.nama === nama);
  if (g && !g.wajahTerdaftar) return showStatus('Wajah Anda belum terdaftar. Minta admin mendaftarkan wajah Anda terlebih dahulu.', 'error');

  setBusy(true);
  try {
    showStatus('Memeriksa lokasi GPS...', 'process');
    const loc = await ambilLokasi();
    if (state.lokasi) {
      const jarak = hitungJarak(loc.lat, loc.lon, state.lokasi.lat, state.lokasi.lon);
      if (jarak > state.lokasi.radius) {
        throw new Error(`Di luar area sekolah (${Math.round(jarak)} m). Maksimal ${state.lokasi.radius} m.` +
          (loc.akurasi > 30 ? `\nAkurasi GPS rendah (±${Math.round(loc.akurasi)} m) — coba di tempat terbuka.` : ''));
      }
    }

    showStatus('Lokasi sesuai. Membuka kamera untuk verifikasi wajah...', 'process');
    const scan = await scanWajah('verifikasi', `Presensi ${tipe}`, nama);

    state.pendingAbsen = { nama, tipe, lat: loc.lat, lon: loc.lon, descriptor: scan.descriptor, foto: scan.foto };
    await kirimAbsen();
  } catch (e) {
    if (e.message === 'dibatalkan') showStatus('Presensi dibatalkan.', 'warning');
    else showStatus(e.message, 'error');
  } finally {
    setBusy(false);
  }
}

async function kirimAbsen(otp) {
  const data = { ...state.pendingAbsen };
  if (otp) data.otp = otp;
  loading(true, 'Mengirim presensi...');
  try {
    const res = await api('prosesAbsensi', { data });
    if (res.status === 'need_otp') {
      bukaOtp(res.message, !!otp);
      return;
    }
    tutupOtp();
    state.pendingAbsen = null;
    if (res.status === 'success' || res.status === 'warning') {
      showStatus(res.message, res.status);
      if (navigator.vibrate) navigator.vibrate(res.status === 'success' ? 120 : [100, 60, 100]);
      if (res.status === 'warning') alert('PEMBERITAHUAN:\n\n' + res.message);
    } else {
      showStatus(res.message, 'error');
    }
  } catch (e) {
    showStatus('Gagal mengirim: ' + e.message, 'error');
  } finally {
    loading(false);
  }
}

/* ===================== OTP (PEGAWAI) ===================== */
function bukaOtp(pesan, ulang) {
  $('otpPesan').innerText = pesan;
  $('otpPesan').className = 'text-sm mb-4 ' + (ulang ? 'text-red-600 font-semibold' : 'text-slate-600');
  $('otpInput').value = '';
  $('modalOtp').classList.remove('hidden');
  setTimeout(() => $('otpInput').focus(), 100);
}
function tutupOtp() { $('modalOtp').classList.add('hidden'); }
function batalOtp() {
  tutupOtp();
  state.pendingAbsen = null;
  showStatus('Presensi pulang dibatalkan (tanpa OTP).', 'warning');
}
function kirimOtp() {
  const kode = $('otpInput').value.replace(/\D/g, '');
  if (kode.length !== 6) return alert('Kode OTP terdiri dari 6 angka.');
  if (!state.pendingAbsen) return tutupOtp();
  kirimAbsen(kode);
}

/* ===================== PANEL GURU PIKET ===================== */
function isiDropdownPiket() {
  const piket = state.guru.filter(g => g.piketHariIni);
  $('piketNama').innerHTML = piket.length
    ? '<option value="">-- Nama Guru Piket --</option>' + piket.map(g => `<option value="${esc(g.nama)}">${esc(g.nama)}</option>`).join('')
    : '<option value="">Tidak ada guru piket hari ini</option>';
  const opsi = '<option value="">-- Pilih Pegawai --</option>' + state.guru.map(g => `<option value="${esc(g.nama)}">${esc(g.nama)}</option>`).join('');
  $('otpPiketNama').innerHTML = opsi;
  $('otpAdminNama').innerHTML = opsi;
}

function bukaPanelPiket() {
  $('modalPiket').classList.remove('hidden');
  const masuk = !!state.piketToken;
  $('piketLogin').classList.toggle('hidden', masuk);
  $('piketPanel').classList.toggle('hidden', !masuk);
  if (masuk) { $('piketSiapa').innerText = state.piketNama; loadOTPList('otpListPiket'); }
}
function tutupPanelPiket() { $('modalPiket').classList.add('hidden'); }

async function loginPiket() {
  const nama = $('piketNama').value, pin = $('piketPin').value;
  if (!nama || !pin) return alert('Pilih nama dan isi PIN.');
  const btn = $('btnLoginPiket'); btn.disabled = true; btn.innerText = 'Memeriksa...';
  try {
    const r = await api('loginPiket', { nama, pin });
    if (r.status !== 'success') return alert(r.message);
    state.piketToken = r.token; state.piketNama = r.nama;
    sessionStorage.setItem('piketToken', r.token); sessionStorage.setItem('piketNama', r.nama);
    $('piketPin').value = '';
    bukaPanelPiket();
  } catch (e) { alert(e.message); }
  finally { btn.disabled = false; btn.innerText = 'Masuk'; }
}

function logoutPiket() {
  state.piketToken = ''; state.piketNama = '';
  sessionStorage.removeItem('piketToken'); sessionStorage.removeItem('piketNama');
  $('piketLogin').classList.remove('hidden'); $('piketPanel').classList.add('hidden');
  $('otpPiketHasil').innerHTML = '';
}

async function generateOTP(sumber) {
  const isAdmin = sumber === 'admin';
  const nama = $(isAdmin ? 'otpAdminNama' : 'otpPiketNama').value;
  const out = $(isAdmin ? 'otpAdminHasil' : 'otpPiketHasil');
  if (!nama) return alert('Pilih pegawai yang akan pulang lebih awal.');
  if (!confirm(`Buat kode izin pulang lebih awal untuk ${nama}?`)) return;
  loading(true, 'Membuat OTP...');
  try {
    const r = await api('buatOTP', { untukNama: nama }, isAdmin ? state.adminToken : state.piketToken);
    if (r.status !== 'success') return alert(r.message);
    const pesanWA = `Kode OTP izin pulang ${r.untukNama}: *${r.kode}* (berlaku s.d. ${r.berlakuSampai} WIB, sekali pakai).`;
    out.innerHTML = `
      <div class="bg-orange-50 border-2 border-orange-300 rounded-xl p-4 text-center">
        <p class="text-xs text-slate-500">Kode OTP untuk <b>${esc(r.untukNama)}</b></p>
        <p class="text-4xl font-mono font-bold tracking-[.3em] text-orange-700 my-2 select-all">${esc(r.kode)}</p>
        <p class="text-xs text-slate-500">Berlaku sampai ${esc(r.berlakuSampai)} WIB • sekali pakai</p>
        <a href="https://wa.me/?text=${encodeURIComponent(pesanWA)}" target="_blank" rel="noopener"
           class="inline-block mt-3 bg-green-600 hover:bg-green-700 text-white text-sm font-bold px-4 py-2 rounded-lg">Kirim via WhatsApp</a>
      </div>`;
    loadOTPList(isAdmin ? 'otpListAdmin' : 'otpListPiket');
  } catch (e) { alert(e.message); }
  finally { loading(false); }
}

async function loadOTPList(targetId) {
  const el = $(targetId);
  const token = targetId === 'otpListAdmin' ? state.adminToken : state.piketToken;
  el.innerHTML = '<p class="text-slate-400">Memuat...</p>';
  try {
    const r = await api('daftarOTPHariIni', {}, token);
    if (!r.data.length) { el.innerHTML = '<p class="text-slate-400">Belum ada OTP hari ini.</p>'; return; }
    el.innerHTML = r.data.map(o => {
      const warna = o.status === 'Aktif' ? 'text-green-700 bg-green-50' : o.status.startsWith('Dipakai') ? 'text-blue-700 bg-blue-50' : 'text-slate-500 bg-slate-100';
      return `<div class="flex justify-between items-center border-b py-2 gap-2">
        <div><p class="font-semibold">${esc(o.untuk)}</p><p class="text-xs text-slate-500">${esc(o.dibuat)}–${esc(o.kadaluarsa)} • oleh ${esc(o.oleh)}</p></div>
        <div class="text-right"><p class="font-mono font-bold">${o.status === 'Aktif' ? esc(o.kode) : '••••••'}</p><span class="text-[11px] px-2 py-0.5 rounded ${warna}">${esc(o.status)}</span></div>
      </div>`;
    }).join('');
  } catch (e) { el.innerHTML = `<p class="text-red-500">${esc(e.message)}</p>`; }
}

/* ===================== ADMIN: NAVIGASI ===================== */
async function promptAdmin() {
  if (state.adminToken) { switchView('Admin'); loadAdminAll(); return; }
  const pass = prompt('Sandi Admin:');
  if (!pass) return;
  loading(true, 'Memeriksa sandi...');
  try {
    const r = await api('loginAdmin', { password: pass });
    if (r.status !== 'success') return alert(r.message);
    state.adminToken = r.token;
    sessionStorage.setItem('adminToken', r.token);
    switchView('Admin');
    loadAdminAll();
  } catch (e) { alert(e.message); }
  finally { loading(false); }
}

function logoutAdmin(expired) {
  state.adminToken = '';
  sessionStorage.removeItem('adminToken');
  switchView('User');
  if (expired) alert('Sesi admin berakhir. Silakan login ulang.');
}

function switchView(view) {
  ['User', 'Admin'].forEach(v => { $('view' + v).classList.add('hidden'); $('view' + v).classList.remove('flex'); });
  $('view' + view).classList.remove('hidden'); $('view' + view).classList.add('flex');
  window.scrollTo(0, 0);
}

function switchTab(tabId) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.tab-btn').forEach(el => { el.classList.remove('text-primary', 'border-b-2', 'border-primary'); el.classList.add('text-slate-500'); });
  $(tabId).classList.remove('hidden');
  const btn = $('btn' + tabId.charAt(0).toUpperCase() + tabId.slice(1));
  btn.classList.add('text-primary', 'border-b-2', 'border-primary'); btn.classList.remove('text-slate-500');
  if (tabId === 'tabOtp') loadOTPList('otpListAdmin');
}

async function loadAdminAll() {
  $('tabelRekapBody').innerHTML = '<tr><td colspan="5" class="text-center py-4">Memuat data...</td></tr>';
  try {
    const [s, r] = await Promise.all([
      api('getSettingsAdmin', {}, state.adminToken),
      api('getRekapan', {}, state.adminToken)
    ]);
    if (s.status === 'success') {
      state.settings = s.settings; state.guruAdmin = s.guru;
      populateSettingsForm(); renderPegawai();
      state.guru = s.guru.map(g => ({ ...g, piketHariIni: g.hariPiket === state.hariIni }));
      isiDropdownPiket(); filterDropdownNama();
      $('filterNama').innerHTML = '<option value="Semua">Semua Guru & Karyawan</option>' + s.guru.map(g => `<option value="${esc(g.nama)}">${esc(g.nama)}</option>`).join('');
    }
    if (r.status === 'success') { state.rekap = r.data; terapkanFilterRekap(); kalkulasiRingkasan(); }
  } catch (e) {
    $('tabelRekapBody').innerHTML = `<tr><td colspan="5" class="text-center py-4 text-red-500 font-bold">Gagal memuat: ${esc(e.message)}</td></tr>`;
  }
}

/* ===================== ADMIN: PEGAWAI & WAJAH ===================== */
function renderPegawai() {
  const tb = $('tabelPegawaiBody');
  if (!state.guruAdmin.length) { tb.innerHTML = '<tr><td colspan="5" class="px-4 py-3 text-center">Belum ada data</td></tr>'; return; }
  tb.innerHTML = state.guruAdmin.map(g => `
    <tr class="border-b align-top" data-nama="${esc(g.nama)}">
      <td class="px-3 py-2 font-medium text-slate-700">${esc(g.nama)}</td>
      <td class="px-3 py-2">
        <select class="border rounded p-1 text-xs" data-act="hari">${HARI.map(h => `<option ${h === g.hariPiket ? 'selected' : ''}>${h}</option>`).join('')}</select>
      </td>
      <td class="px-3 py-2">${g.wajahTerdaftar
        ? `<span class="bg-green-100 text-green-800 text-xs px-2 py-1 rounded">✓ ${esc(g.tglWajah)}</span>`
        : '<span class="bg-red-100 text-red-700 text-xs px-2 py-1 rounded">Belum</span>'}</td>
      <td class="px-3 py-2 text-xs">${g.punyaPin ? '✓' : '-'}</td>
      <td class="px-3 py-2 space-x-1 whitespace-nowrap">
        <button data-act="wajah" class="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-2 py-1 rounded">${g.wajahTerdaftar ? 'Ulang Wajah' : 'Daftar Wajah'}</button>
        ${g.wajahTerdaftar ? '<button data-act="resetwajah" class="text-orange-600 text-xs font-bold">Reset</button>' : ''}
        <button data-act="pin" class="text-slate-600 text-xs font-bold">PIN</button>
        <button data-act="hapus" class="text-red-500 text-xs font-bold">Hapus</button>
      </td>
    </tr>`).join('');
}

document.addEventListener('click', (e) => {
  const btn = e.target.closest('#tabelPegawaiBody button[data-act]');
  if (!btn) return;
  const nama = btn.closest('tr').dataset.nama;
  ({ wajah: daftarWajahPegawai, resetwajah: resetWajah, pin: aturPin, hapus: hapusDataGuru })[btn.dataset.act]?.(nama);
});
document.addEventListener('change', async (e) => {
  const sel = e.target.closest('#tabelPegawaiBody select[data-act="hari"]');
  if (!sel) return;
  const nama = sel.closest('tr').dataset.nama;
  try {
    const r = await api('updateGuru', { nama, hariPiket: sel.value, pin: null }, state.adminToken);
    if (r.status !== 'success') throw new Error(r.message);
    const g = state.guruAdmin.find(x => x.nama === nama); if (g) g.hariPiket = sel.value;
  } catch (err) { alert(err.message); }
});

async function simpanGuruBaru() {
  const nama = $('addNamaGuru').value.trim(), hariPiket = $('addHariPiket').value, pin = $('addPin').value.trim();
  if (!nama) return alert('Nama tidak boleh kosong');
  if (pin && !/^\d{4,6}$/.test(pin)) return alert('PIN harus 4–6 angka.');
  loading(true, 'Menyimpan...');
  try {
    const r = await api('tambahGuru', { nama, hariPiket, pin }, state.adminToken);
    if (r.status !== 'success') return alert(r.message);
    $('addNamaGuru').value = ''; $('addPin').value = '';
    await loadAdminAll();
    if (confirm(`${nama} ditambahkan. Daftarkan wajahnya sekarang?`)) daftarWajahPegawai(nama);
  } catch (e) { alert(e.message); }
  finally { loading(false); }
}

async function daftarWajahPegawai(nama) {
  try {
    const hasil = await scanWajah('daftar', 'Pendaftaran Wajah', nama);
    loading(true, 'Menyimpan data wajah...');
    const r = await api('daftarWajah', { nama, descriptor: hasil.descriptors }, state.adminToken);
    loading(false);
    if (r.status !== 'success') return alert(r.message);
    alert(`Wajah ${nama} berhasil didaftarkan (${r.jumlahSampel} sampel).`);
    loadAdminAll();
  } catch (e) {
    loading(false);
    if (e.message !== 'dibatalkan') alert(e.message);
  }
}

async function resetWajah(nama) {
  if (!confirm(`Hapus data wajah ${nama}? Pegawai tidak bisa presensi sampai wajah didaftarkan ulang.`)) return;
  try { await api('hapusWajah', { nama }, state.adminToken); loadAdminAll(); } catch (e) { alert(e.message); }
}

async function aturPin(nama) {
  const pin = prompt(`PIN Piket baru untuk ${nama} (4–6 angka). Kosongkan untuk menghapus PIN:`);
  if (pin === null) return;
  if (pin && !/^\d{4,6}$/.test(pin)) return alert('PIN harus 4–6 angka.');
  const g = state.guruAdmin.find(x => x.nama === nama);
  try {
    const r = await api('updateGuru', { nama, hariPiket: g ? g.hariPiket : 'Tidak Ada', pin }, state.adminToken);
    if (r.status !== 'success') return alert(r.message);
    alert('PIN disimpan.'); loadAdminAll();
  } catch (e) { alert(e.message); }
}

async function hapusDataGuru(nama) {
  if (!confirm(`Hapus data ${nama}?`)) return;
  try { await api('hapusGuru', { nama }, state.adminToken); loadAdminAll(); } catch (e) { alert(e.message); }
}

/* ===================== ADMIN: PENGATURAN ===================== */
function populateSettingsForm() {
  document.querySelectorAll('[data-set]').forEach(el => {
    const v = state.settings[el.dataset.set];
    if (v !== undefined) el.value = v;
  });
  state.stempelBaru = '';
  adjustStempel();
  const s = state.settings;
  $('infoInsentif').innerText = `Insentif Piket bulanan dasar ${rupiah(s.insentifDasar)}, dipotong ${rupiah(s.potonganTelat)} per keterlambatan piket.`;
}

function bacaFormSetting() {
  const o = {};
  document.querySelectorAll('[data-set]').forEach(el => o[el.dataset.set] = el.value);
  return o;
}

async function simpanPengaturan() {
  const btn = $('btnSimpanSetting'); btn.disabled = true; btn.innerText = 'Menyimpan...';
  try {
    const settings = bacaFormSetting();
    if (state.stempelBaru) settings.stempelBaru = state.stempelBaru;
    const r = await api('saveSettings', { settings }, state.adminToken);
    if (r.status !== 'success') throw new Error(r.message);
    Object.assign(state.settings, settings);
    if (state.stempelBaru) state.settings.stempelUrl = state.stempelBaru;
    state.stempelBaru = '';
    alert('Pengaturan disimpan!');
    loadInitialData();
  } catch (e) { alert(e.message); }
  finally { btn.disabled = false; btn.innerText = 'Simpan Pengaturan Sistem'; }
}

function previewStempel(event) {
  const file = event.target.files[0]; if (!file) return;
  const img = new Image();
  img.onload = () => {   // kecilkan agar ringan (maks 400px)
    const sc = Math.min(1, 400 / Math.max(img.width, img.height));
    const c = document.createElement('canvas'); c.width = img.width * sc; c.height = img.height * sc;
    const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    state.stempelBaru = c.toDataURL('image/jpeg', 0.9);
    adjustStempel();
  };
  img.src = URL.createObjectURL(file);
}

function adjustStempel() {
  const src = state.stempelBaru || state.settings.stempelUrl;
  const img = $('printStempel'), prev = $('stempelPreview');
  if (!src) { img.style.display = 'none'; prev.classList.add('hidden'); return; }
  const f = bacaFormSetting();
  img.src = src; img.style.display = 'block';
  img.style.transform = `scale(${f.stempelScale || 1})`;
  img.style.top = `${f.stempelTop || 0}px`; img.style.left = `${f.stempelLeft || 0}px`;
  prev.src = src; prev.classList.remove('hidden');
}

async function pakaiLokasiSaya() {
  loading(true, 'Membaca GPS...');
  try {
    const l = await ambilLokasi();
    document.querySelector('[data-set="lokasiLat"]').value = l.lat.toFixed(7);
    document.querySelector('[data-set="lokasiLon"]').value = l.lon.toFixed(7);
    alert(`Lokasi diisi (akurasi ±${Math.round(l.akurasi)} m). Tekan "Simpan Pengaturan Sistem".`);
  } catch (e) { alert(e.message); }
  finally { loading(false); }
}

async function gantiSandi() {
  const baru = $('sandiBaru').value;
  if (baru.length < 6) return alert('Sandi minimal 6 karakter.');
  try {
    const r = await api('gantiPasswordAdmin', { passwordBaru: baru }, state.adminToken);
    if (r.status !== 'success') return alert(r.message);
    $('sandiBaru').value = ''; alert('Sandi admin diganti.');
  } catch (e) { alert(e.message); }
}

/* ===================== ADMIN: REKAP & RINGKASAN ===================== */
function terapkanFilterRekap() {
  const vNama = $('filterNama').value, vTipe = $('filterTipe').value, vTgl = $('filterTanggal').value;
  let tglFmt = '';
  if (vTgl) { const [y, m, d] = vTgl.split('-'); tglFmt = `${d}/${m}/${y}`; }
  state.filteredRekap = state.rekap.filter(r =>
    (vNama === 'Semua' || r.nama === vNama) && (vTipe === 'Semua' || r.tipe === vTipe) && (!tglFmt || r.tanggal.startsWith(tglFmt)));

  const tb = $('tabelRekapBody');
  if (!state.filteredRekap.length) { tb.innerHTML = '<tr><td colspan="5" class="text-center py-4">Tidak ada data sesuai filter</td></tr>'; return; }
  tb.innerHTML = state.filteredRekap.map(r => {
    const ket = String(r.keterangan);
    const st = (ket.includes('Cepat') || ket.includes('Terlambat')) ? 'text-orange-600 font-bold' : ket.includes('Piket') ? 'text-blue-600 font-bold' : 'text-slate-500';
    const wajah = r.foto ? `<a href="${esc(r.foto)}" target="_blank" rel="noopener" class="text-primary underline">foto</a>` : '';
    return `<tr class="border-b hover:bg-slate-50">
      <td class="px-4 py-2 whitespace-nowrap">${esc(r.tanggal)}</td><td class="px-4 py-2 font-medium">${esc(r.nama)}</td>
      <td class="px-4 py-2">${esc(r.tipe)}</td><td class="px-4 py-2 ${st}">${esc(ket)}</td>
      <td class="px-4 py-2 text-center text-xs">${r.skor !== '' ? esc(r.skor) : '-'} ${wajah}</td></tr>`;
  }).join('');
}

function kalkulasiRingkasan() {
  const bln = parseInt($('filterBulanRingkasan').value, 10), thn = parseInt($('filterTahunRingkasan').value, 10);
  const dasar = Number(state.settings.insentifDasar || 50000), pot = Number(state.settings.potonganTelat || 5000);
  const hit = {};
  state.guruAdmin.forEach(g => hit[g.nama] = { hadir: 0, telat: 0, cepat: 0, piket: g.hariPiket !== 'Tidak Ada' });
  state.rekap.forEach(r => {
    if (!hit[r.nama] || r.bulan !== bln || r.tahun !== thn) return;
    if (r.tipe === 'Masuk') { hit[r.nama].hadir++; if (r.keterangan === 'Piket - Terlambat') hit[r.nama].telat++; }
    if (r.tipe === 'Pulang' && String(r.keterangan).includes('Pulang Cepat')) hit[r.nama].cepat++;
  });
  state.ringkasan = Object.entries(hit).map(([nama, d]) => {
    let ins = null, potongan = 0;
    if (d.piket) { potongan = d.telat * pot; ins = Math.max(0, dasar - potongan); }
    return { nama, ...d, ins, potongan };
  });
  $('tabelRingkasanBody').innerHTML = state.ringkasan.map(r => `
    <tr class="border-b hover:bg-slate-50">
      <td class="px-4 py-3 font-medium">${esc(r.nama)}</td>
      <td class="px-4 py-3 text-center text-blue-700 font-bold">${r.hadir} Hari</td>
      <td class="px-4 py-3 text-center text-orange-600 font-bold">${r.telat}x</td>
      <td class="px-4 py-3 text-center">${r.cepat}x</td>
      <td class="px-4 py-3 text-right">${r.ins === null ? '<span class="text-slate-400">-</span>'
        : `<b class="text-slate-700">${rupiah(r.ins)}</b>${r.potongan ? `<br><span class="text-red-500 text-xs">(-${rupiah(r.potongan)})</span>` : ''}`}</td>
    </tr>`).join('') || '<tr><td colspan="5" class="text-center py-4">Belum ada data</td></tr>';
}

/* ===================== CETAK ===================== */
const th = (t, extra = '') => `<th class="border border-black p-2 ${extra}">${t}</th>`;
const td = (t, extra = '') => `<td class="border border-black p-1 ${extra}">${t}</td>`;

function siapkanCetakRekap() {
  $('printJudulLaporan').innerText = `Laporan Presensi ${CFG.NAMA_SEKOLAH || 'SMP 1 YPK'}`;
  $('printTabelHead').innerHTML = `<tr>${th('No')}${th('Waktu')}${th('Nama Pegawai')}${th('Tipe')}${th('Keterangan')}</tr>`;
  $('printTabelBody').innerHTML = state.filteredRekap.map((r, i) =>
    `<tr>${td(i + 1, 'text-center')}${td(esc(r.tanggal))}${td(esc(r.nama))}${td(esc(r.tipe), 'text-center')}${td(esc(r.keterangan))}</tr>`).join('');
  const vN = $('filterNama').value, vT = $('filterTipe').value, vD = $('filterTanggal').value;
  const info = $('printFilterInfo');
  if (vN !== 'Semua' || vT !== 'Semua' || vD) {
    info.innerText = `[ Pegawai: ${vN === 'Semua' ? 'Seluruh Pegawai' : vN} | Tipe: ${vT === 'Semua' ? 'Masuk & Pulang' : vT}${vD ? ' | Tanggal: ' + vD.split('-').reverse().join('/') : ''} ]`;
    info.classList.remove('hidden');
  } else info.classList.add('hidden');
  jalankanPrint();
}

function siapkanCetakRingkasan() {
  const el = $('filterBulanRingkasan');
  $('printJudulLaporan').innerText = `Laporan Statistik & Insentif Piket ${CFG.NAMA_SEKOLAH || 'SMP 1 YPK'}`;
  $('printTabelHead').innerHTML = `<tr>${th('No')}${th('Nama Pegawai')}${th('Kehadiran')}${th('Telat Piket')}${th('Pulang Cepat')}${th('Insentif', 'text-right')}</tr>`;
  $('printTabelBody').innerHTML = state.ringkasan.map((r, i) =>
    `<tr>${td(i + 1, 'text-center')}${td(esc(r.nama))}${td(r.hadir + ' Hari', 'text-center font-bold')}${td(r.telat ? r.telat + 'x' : '-', 'text-center')}${td(r.cepat ? r.cepat + 'x' : '-', 'text-center')}${td(r.ins === null ? '-' : rupiah(r.ins), 'text-right font-bold')}</tr>`).join('');
  $('printFilterInfo').innerText = `[ Periode: ${el.options[el.selectedIndex].text} ${$('filterTahunRingkasan').value} ]`;
  $('printFilterInfo').classList.remove('hidden');
  jalankanPrint();
}

function jalankanPrint() {
  const s = state.settings;
  $('printTempatTanggal').innerText = `${s.tempatCetak || ''}, ${new Date().toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' })}`;
  $('printNamaKS').innerText = s.namaKS || ''; $('printNipKS').innerText = s.nipKS || '';
  adjustStempel();
  $('printArea').classList.remove('hidden');
  setTimeout(() => { window.print(); $('printArea').classList.add('hidden'); }, 300);
}
