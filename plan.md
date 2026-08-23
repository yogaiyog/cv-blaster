# Rencana Proyek: CV Blaster (Next.js + Puppeteer)

Proyek ini bertujuan untuk membuat aplikasi automasi pengiriman CV secara massal (*blasting*) ke beberapa platform pencarian kerja, dengan target awal **Glints** dan **Jobstreet**. Aplikasi ini menggunakan **Next.js** untuk antarmuka pengguna (Dashboard & Konfigurasi) dan **Puppeteer** sebagai mesin automasi di backend.

---

## 🛠️ Arsitektur & Teknologi

| Komponen | Teknologi | Keterangan |
| :--- | :--- | :--- |
| **Frontend** | Next.js (App Router) + Tailwind CSS + shadcn/ui | Dashboard manajemen CV, status aplikasi, log real-time, dan input kredensial. |
| **Backend/API** | Next.js Route Handlers / Server Actions | Mengontrol jalannya worker Puppeteer. |
| **Automation Engine** | Puppeteer / `puppeteer-extra` + `puppeteer-extra-plugin-stealth` | Menjalankan browser secara headless/headful untuk login dan apply lowongan. |
| **Integrasi Data** | Google Sheets API (`googleapis`) | Menyimpan riwayat lowongan kerja yang dilamar langsung ke Google Sheets pengguna sebagai database & logs. |
| **Penyimpanan CV** | Lokal filesystem (`/public/uploads/`) | Menyimpan file PDF CV yang akan diunggah oleh bot. |

---

## 🚀 Tahapan Pengembangan (Roadmap)

### Fase 1: Inisialisasi Proyek & UI Dashboard
* [ ] Setup Next.js project dengan TypeScript dan Tailwind CSS.
* [ ] Desain Halaman Konfigurasi:
  * Form input kredensial Glints & Jobstreet (Email, Password, Cookie token alternatif).
  * Form input konfigurasi Google Sheets (Spreadsheet ID, Sheet Name, dan JSON Service Account Key).
  * Upload file CV (PDF).
  * Filter pencarian (Kata kunci pekerjaan, Lokasi, Gaji minimal).
* [ ] Desain Dashboard Monitoring:
  * Status bot (Idle, Running, Paused, Error).
  * Live log terminal untuk melihat aktivitas bot secara real-time.
  * Tabel pratinjau data langsung dari Google Sheets (Nama perusahaan, Posisi, Platform, Status, Tanggal melamar).

### Fase 2: Puppeteer Core & Stealth Setup
* [ ] Setup script Puppeteer dasar di backend Next.js.
* [ ] Integrasi `puppeteer-extra-plugin-stealth` untuk menghindari deteksi bot (Cloudflare/Akamai proteksi di Jobstreet & Glints).
* [ ] Mekanisme penyimpanan session (Cookies/Local Storage) agar tidak perlu login ulang setiap kali bot dijalankan.
* [ ] Fitur screenshot otomatis jika terjadi error untuk memudahkan debugging.

### Fase 3: Integrasi Platform Starter
#### A. Glints Bot
* [ ] **Login Flow**: Input kredensial atau muat session cookie.
* [ ] **Search Flow**: Membuka halaman pencarian sesuai dengan kata kunci dan filter dari dashboard.
* [ ] **Apply Flow**:
  * Melakukan iterasi pada daftar lowongan yang muncul.
  * Memeriksa apakah lowongan sudah pernah dilamar (berdasarkan data di Google Sheets).
  * Klik tombol "Apply" / "Lamar Cepat".
  * Menangani kuesioner singkat jika ada (opsional/skip jika terlalu kompleks di awal).

#### B. Jobstreet Bot
* [ ] **Login Flow**: Input kredensial / bypass verifikasi jika diperlukan.
* [ ] **Search Flow**: Masuk ke pencarian Jobstreet dengan parameter yang ditentukan.
* [ ] **Apply Flow**:
  * Membuka detail lowongan.
  * Klik "Apply Now" / "Lamar Sekarang".
  * Memilih CV yang diupload oleh bot jika opsi tersebut muncul.

### Fase 4: Live Logging & Google Sheets Sync
* [ ] Implementasi **Server-Sent Events (SSE)** di Next.js untuk mengirim log progres dari Puppeteer ke browser user secara real-time.
* [ ] Integrasi Google Sheets API untuk membaca data lama (menghindari duplikasi) dan menulis data baru setiap kali lamaran berhasil dikirim.

### Fase 5: Keamanan & Human-Behavior Simulation
* [ ] Enkripsi/amankan kredensial akun dan Google Sheets key yang disimpan secara lokal di file `.env.local` atau `.json` terenkripsi.
* [ ] Penambahan delay acak (*random delay*) di setiap aksi klik/ketik agar menyerupai perilaku manusia (mengurangi risiko akun diblokir).
* [ ] Penanganan limitasi lamaran harian.

---

## ⚠️ Tantangan & Mitigasi Risiko

1. **Proteksi Anti-Bot (Cloudflare / CAPTCHA):**
   * *Mitigasi:* Gunakan `puppeteer-extra-stealth`. Jika tetap terdeteksi, tambahkan opsi untuk menjalankan browser secara **headful** (non-headless) agar user bisa menyelesaikan CAPTCHA secara manual pada login pertama, lalu bot melanjutkan setelah session tersimpan.
2. **Perubahan Struktur HTML (Selectors):**
   * *Mitigasi:* Buat modul selector terpisah (misalnya `selectors.ts`) untuk Glints dan Jobstreet agar mudah di-update jika kelas atau elemen HTML dari platform tersebut berubah.
3. **Akun Terblokir (Spamming):**
   * *Mitigasi:* Batasi jumlah lamaran per hari (misal maksimal 30-50 per platform) dan berikan interval waktu (cooldown) antar lamaran.
