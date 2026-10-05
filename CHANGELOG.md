# Changelog

Semua perubahan penting pada proyek CV Blaster akan dicatat dalam berkas ini.

## [v2.0.0] - 2026-10-05

### Fitur Utama & Peningkatan Besar (Major Changes)

#### 1. Penyimpanan Lokal Mandiri (Offline-First / Zero Google Sheets)
- **Database Mandiri**: Menghilangkan sepenuhnya dependensi terhadap Google Sheets API dan Google Cloud Service Account.
- **Penyimpanan Lokal Cepat**: Riwayat lamaran dan bank pertanyaan kini disimpan langsung di disk lokal dalam format JSON terstruktur (`applied-jobs.json` & `screening-questions.json`).
- **Export & Import CSV**: Memungkinkan pencadangan (*backup*) dan pemulihan (*restore*) riwayat lamaran kapan saja langsung melalui file CSV.
- **Privasi Terjaga**: Folder data lokal (`data/`) otomatis diabaikan oleh Git (`.gitignore`) untuk melindungi data pribadi pelamar.

#### 2. Redesain Antarmuka Total (UI/UX Pro Max Standard)
- **Tema Light Mode Modern**: Beralih penuh dari tema gelap ke palet Light Slate bersih (`bg-slate-50`, kartu `bg-white`, teks berkontras tinggi `text-slate-900`/`slate-700`).
- **Bebas Emoji Dekoratif**: Menghilangkan emoji yang tidak perlu di tombol, header, kartu, dan pesan status, digantikan oleh icon SVG semantik yang rapi.
- **Tipografi & Hirarki Komponen**: Penataan ulang kartu informasi (*data-dense*), penataan badge status lamaran, dan kontrol segmented modern.
- **Desain Modal Baru**: Modal dialog dilengkapi backdrop blur modern (`bg-slate-900/40`), transisi halus, dan formulir yang nyaman diisi.

#### 3. Optimasi Eksekusi Bot & Reliabilitas
- **Tombol Eksekusi Bersih**: Menyederhanakan kontrol menjadi satu tombol utama: **Jalankan Bot** (mode browser interaktif otomatis).
- **Penanganan Mode Debug**: Hasil uji coba simulasi (*Debug Mode*) tidak lagi mencatat status palsu ke riwayat lamaran, mencegah data terblokir saat dijalankan sungguhan.
- **Stabilisasi Portal Lowongan**:
  - Menyembunyikan checklist Indeed sementara untuk menjaga reliabilitas eksekusi bot karena sering terjadi perubahan struktur/anti-bot pada Indeed.
  - Fokus otomasi prima pada 3 platform utama: **Glints**, **Jobstreet**, dan **LinkedIn**.

---

## [v0.1.3] - Versi Sebelumnya
- Dukungan awal multi-arsitektur Electron build (Windows .exe & macOS .dmg).
- Integrasi bot Glints, Jobstreet, LinkedIn, dan Indeed.
- Penyimpanan riwayat via Google Sheets API.
