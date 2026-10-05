# Migration Plan: Remove Google Sheets API & Implement Local Storage (No-Database Architecture)

**Branch:** `feat/remove-google-sheets-local-storage`  
**Target:** Menghapus 100% integrasi Google Sheets API & Google Cloud Service Account, menggantikannya dengan penyimpanan file lokal yang andal, cepat, dan offline-first tanpa memerlukan server database.

---

## 1. Latar Belakang & Tujuan

Saat ini, **CV Blaster** menggunakan Google Sheets API untuk dua fungsi utama:
1. **Riwayat Lamaran (*Applied Jobs*)**: Mencatat pekerjaan yang sudah dilamar beserta platform, tanggal, status, match score, dan note.
2. **Bank Pertanyaan Screening (*Screening Questions*)**: Menyimpan pertanyaan formulir dan jawaban AI/manual untuk dijawab otomatis oleh bot.

### Masalah dengan Google Sheets API:
* **Kompleksitas Setup Pengguna**: User harus membuat Google Cloud Project, mengaktifkan Sheets & Drive API, membuat Service Account, mengunduh file credentials JSON, dan memberikan akses edit ke spreadsheet.
* **Rate Limit & Kuota API**: Google membatasi 60 requests/menit/user. Hal ini memaksa aplikasi menggunakan antrean penulisan (*queue*) dan delay buatan (`MIN_WRITE_INTERVAL_MS = 600ms`), yang memperlambat bot.
* **Ukuran Paket Aplikasi**: Dependency `googleapis` berukuran sangat besar (~40MB+ di `node_modules`), memperberat download installer aplikasi.
* **Ketergantungan Jaringan**: Jika koneksi internet ke Google API terganggu, pencatatan lamaran bisa gagal atau tertunda.

### Target Setelah Migrasi:
* **Zero Configuration**: User tidak perlu akun Google Cloud, Service Account, atau Spreadsheet ID. Aplikasi langsung siap pakai setelah di-install.
* **100% Offline-First**: Riwayat lamaran dan pertanyaan disimpan langsung di disk lokal komputer user.
* **Sub-millisecond Speed**: Pengecekan lamaran (*isJobAlreadyApplied*) instan tanpa round-trip API network.
* **Fitur Export & Import CSV**: User tetap bisa mengekspor data ke format `.csv` kapan saja untuk dibuka di Microsoft Excel atau Google Sheets secara mandiri.
* **Ukuran Aplikasi Lebih Ramping**: Menghapus `googleapis` dari `package.json`.

---

## 2. Cara Kerja Penyimpanan Data di Electron Tanpa Database

Untuk aplikasi desktop seperti CV Blaster, **kita tidak memerlukan database server (seperti MySQL atau PostgreSQL)** ataupun SQLite native binding yang rumit. 

### Pendekatan yang Dipilih: **Local JSON File Store (Atomic File System)**
Electron dan Node.js sudah memiliki semua fitur yang dibutuhkan untuk penyimpanan data berbasis file JSON:

```
[ Electron Runtime ]
         │
         ▼
app.getPath('userData')
         │
         ├── config.json                 (Konfigurasi user & profil pelamar)
         ├── applied-jobs.json           (Riwayat lamaran: jobUrl, status, skor, dll.)
         └── screening-questions.json    (Bank tanya-jawab screening otomatis)
```

### Mengapa Pendekatan Ini Paling Tepat?
1. **Lokasi Standar Sistem Operasi (`app.getPath('userData')`)**:
   - Diatur otomatis oleh Electron:
     - **Windows**: `C:\Users\<User>\AppData\Roaming\CV Blaster`
     - **macOS**: `~/Library/Application Support/CV Blaster`
     - **Linux**: `~/.config/CV Blaster`
   - File tersimpan aman di direktori aplikasi pengguna, tidak akan terhapus saat aplikasi di-update.
2. **Pola Atomic Write (Mencegah Korupsi Data)**:
   - Saat menyimpan perubahan, data ditulis ke file sementara (`applied-jobs.json.tmp`), lalu di-*rename* secara atomik (`fs.promises.rename`) ke `applied-jobs.json`.
   - Jika komputer mendadak mati atau aplikasi ditutup saat proses simpan, file asli tidak akan korup/rusak.
3. **In-Memory Cache & Set O(1)**:
   - Saat aplikasi berjalan, daftar `jobUrl` yang sudah dilamar disimpan dalam `Set<string>` di memory.
   - Pengecekan `isJobAlreadyApplied(url)` memakan waktu **0.01 ms**, bukan ratusan milidetik panggilan API.
4. **Export & Import Mandiri**:
   - Disediakan tombol satu-klik di UI untuk Export CSV dan Import CSV.

---

## 3. Struktur Data Baru

### A. `applied-jobs.json`
```json
[
  {
    "id": "job_1727546400000_abc12",
    "dateApplied": "2026-09-29 10:30:00",
    "platform": "glints",
    "jobTitle": "Fullstack Developer",
    "company": "Tech Corp",
    "jobUrl": "https://glints.com/id/opportunities/jobs/...",
    "matchScore": "85%",
    "matchReason": "Strong match with React and Node.js skills",
    "status": "Applied",
    "note": ""
  }
]
```

### B. `screening-questions.json`
```json
[
  {
    "id": "sq_1727546400000_xyz89",
    "question": "Berapa tahun pengalaman Anda menggunakan React?",
    "type": "text",
    "options": "",
    "answer": "3 tahun",
    "updatedAt": "2026-09-29 10:30:00"
  }
]
```

---

## 4. Tahapan Rencana Kerja (Implementation Phases)

### Phase 1: Pembuatan Modul Storage Lokal (`src/lib/storage.ts`)
Buat modul pengganti `googleSheets.ts` yang mengelola pembacaan dan penulisan file JSON lokal:
- [ ] Implementasi helper path data: `getDataDir()`, `getAppliedJobsFilePath()`, `getQuestionsFilePath()`.
- [ ] Implementasi atomic write (`safeWriteJsonFile`).
- [ ] Implementasi fungsi riwayat lamaran:
  - `getAppliedJobs()`: Membaca daftar riwayat dari `applied-jobs.json`.
  - `addAppliedJob(job)`: Menambahkan lamaran baru dan memperbarui memory index.
  - `isJobAlreadyApplied(url)`: Cek apakah URL lowongan sudah pernah dilamar (dengan normalisasi URL).
  - `updateGlintsApplicationStatuses(batch)`: Memperbarui status lamaran dari hasil sinkronisasi Glints.
  - `updateJobstreetApplicationStatuses(batch)`: Memperbarui status lamaran dari hasil sinkronisasi Jobstreet.
- [ ] Implementasi fungsi bank pertanyaan:
  - `getQuestionsFromStorage()`: Membaca pertanyaan dari `screening-questions.json` (fallback seed ke `imploye-question.csv` jika kosong).
  - `saveAllQuestionsToStorage(questions)`: Menyimpan seluruh array pertanyaan.
  - `appendQuestionToStorage(question, type, options, answer)`: Menambahkan pertanyaan baru jika belum ada.
  - `cleanQuestionsInStorage()`: Menghapus duplikat pertanyaan.
- [ ] Implementasi utilitas export/import:
  - `exportAppliedJobsToCsv()`: Mengonversi data JSON ke format CSV.
  - `importAppliedJobsFromCsv(csvContent)`: Mengimpor data CSV ke `applied-jobs.json` tanpa duplikasi URL.

---

### Phase 2: Refactor API Routes
Sesuaikan semua API route agar menggunakan `src/lib/storage.ts`:
- [ ] **`src/app/api/applied/route.ts`**:
  - Ganti `getAppliedJobs` dari `googleSheets` ke `storage.ts`.
  - Hapus parsing konfigurasi Google Sheets.
- [ ] **`src/app/api/questions/route.ts`**:
  - Ganti seluruh pemanggilan `googleSheets` ke `storage.ts`.
  - Sederhanakan endpoint (tidak perlu lagi membedakan mode `google_sheets` vs `local_csv`, semuanya tersimpan di file lokal).
- [ ] **`src/app/api/sync-glints/route.ts`** & **`src/app/api/sync-jobstreet/route.ts`**:
  - Arahkan pembaruan status ke `storage.ts`.
- [ ] **`src/app/api/storage/export/route.ts`** & **`src/app/api/storage/import/route.ts`** (Baru):
  - Endpoint untuk download file CSV riwayat lamaran.
  - Endpoint untuk upload file CSV riwayat lamaran.
- [ ] **`src/app/api/test-sheets/route.ts`**:
  - Hapus atau ubah menjadi `src/app/api/storage/info/route.ts` (mengembalikan path file, jumlah data, dan ukuran file).

---

### Phase 3: Refactor Bot Automation & Knowledge Base
- [ ] **`src/lib/automation.ts`**:
  - Hapus pengecekan `testSheetsConnection` pada saat bot mulai.
  - Ganti impor `updateGlintsApplicationStatuses` & `updateJobstreetApplicationStatuses` ke `storage.ts`.
- [ ] **`src/lib/bots/glints.ts`**, **`jobstreet.ts`**, **`linkedin.ts`**, **`indeed.ts`**:
  - Ganti impor `isJobAlreadyApplied` dan `addAppliedJob` dari `googleSheets` ke `storage.ts`.
  - Hapus log atau penanganan kuota Google Sheets.
- [ ] **`src/lib/questionAnswer.ts`**:
  - Ubah pemanggilan `getQuestionsFromSheet` & `appendQuestionToSheet` menjadi fungsi lokal di `storage.ts`.

---

### Phase 4: Pembersihan Config & Tampilan UI (`src/app/page.tsx`)
- [ ] **`src/lib/config.ts`**:
  - Hapus field: `spreadsheetId`, `sheetName`, `questionsSheetName`, `googleCredentialsJson`.
  - Hapus nilai default-nya dari `DEFAULT_CONFIG`.
- [ ] **`src/app/page.tsx`**:
  - Hapus tab/form input:
    - Input Google Spreadsheet ID
    - Input Sheet Names (Sheet1, Sheet2)
    - Input Service Account JSON
    - Tombol "Test Connection Sheets"
    - Modal panduan "Google Sheets Setup Tutorial"
    - Peringatan kuota Google Sheets
  - Tambahkan panel **Manajemen Data Lokal**:
    - Informasi status penyimpanan: *"Data tersimpan lokal di: %APPDATA%\CV Blaster"*
    - Indikator total lamaran tercatat & total pertanyaan screening
    - Tombol **Export ke CSV** (langsung download file `.csv`)
    - Tombol **Import dari CSV** (upload file CSV lama)
    - Tombol **Buka Folder Data** (membuka direktori di File Explorer pengguna)

---

### Phase 5: Hapus File Google Sheets & Dependency
- [ ] Hapus file lama `src/lib/googleSheets.ts` (1300+ baris kode eliminasi).
- [ ] Jalankan `npm uninstall googleapis` untuk membuang library Google Cloud.
- [ ] Verifikasi build Next.js: `npm run build`.
- [ ] Verifikasi packaging Electron: `npm run electron:build:win` / linting.

---

## 5. Rencana Pengujian (Testing & Verification)

1. **Pengujian Penyimpanan Data**:
   - Jalankan bot mode dry-run / live apply, pastikan data tersimpan ke `applied-jobs.json`.
   - Tutup aplikasi dan buka kembali; pastikan data di tabel riwayat lamaran tetap muncul lengkap.
2. **Pengujian Deteksi Duplikat**:
   - Pastikan bot melewati (*skip*) lowongan yang URL-nya sudah tercatat di `applied-jobs.json`.
3. **Pengujian Bank Pertanyaan**:
   - Coba simpan pertanyaan baru di menu screening questions; pastikan tersimpan di `screening-questions.json`.
4. **Pengujian Export & Import**:
   - Klik Export CSV; buka hasilnya di Excel / Text Editor.
   - Hapus data atau tes import CSV; pastikan data terisi kembali dengan rapi.
5. **Pengujian Build & Packaging**:
   - Pastikan `npm run build` sukses tanpa ada error import lama.
   - Pastikan GitHub Actions dapat membuild tanpa error.
