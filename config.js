// =============================================================
//  KONFIGURASI — ganti API_URL dengan URL Web App Apps Script Anda
//  (Deploy > New deployment > Web app > Execute as: Me,
//   Who has access: Anyone)  -> salin URL yang berakhiran /exec
// =============================================================
window.APP_CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbypFFpPbJr-s3k8RzgIUgBjuBL9aTGcMS9sPUOBChH0Dg9zAIsydROhoPZ-EfoiI3VWnQ/exec',
  NAMA_SEKOLAH: 'SMP 1 YPK',
  // Lokasi model AI pengenal wajah (face-api). Biarkan default.
  MODEL_URL: 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1/model/'
};
