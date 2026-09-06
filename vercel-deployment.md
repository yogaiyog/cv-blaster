# Panduan Deploy CV Blaster ke Vercel (Tanpa Database)

Aplikasi **CV Blaster** dirancang 100% **database-free** dan **stateless**:
- **Penyimpanan Data**: Semua riwayat lamaran dan knowledge base pertanyaan tersimpan langsung di **Google Sheets**.
- **Konfigurasi Pengguna**: Tersimpan di **LocalStorage** browser pengguna (lengkap dengan fitur *Export & Import JSON*).
- **Kecerdasan Buatan (AI)**: Ditenagai oleh **Google Gemini AI API** untuk menjawab pertanyaan kuisioner dinamis.

---

## 🚀 Langkah 1: Push Repository ke GitHub

Pastikan semua perubahan sudah di-commit dan di-push ke GitHub:
```bash
git push -u origin feat/vercel-stateless-sheets
```
*(Atau merge ke branch `main` jika ingin deploy branch utama).*

---

## 🚀 Langkah 2: Import Proyek di Vercel

1. Buka [Vercel Dashboard](https://vercel.com/dashboard) dan klik **Add New... > Project**.
2. Pilih repository GitHub **`cv-blaster`** Anda.
3. Di bagian **Framework Preset**, Vercel akan otomatis mendeteksi **Next.js**.

---

## 🔑 Langkah 3: Atur Environment Variables di Vercel

Di menu konfigurasi project Vercel sebelum klik Deploy:
1. Buka bagian **Environment Variables**.
2. Tambahkan variable berikut:
   * **Key**: `GEMINI_API_KEY`
   * **Value**: *(API Key Google Gemini Anda)*
3. Klik **Deploy** dan tunggu hingga proses build selesai.

---

## ⚙️ Langkah 4: Setup Pertama Kali di Dashboard

Setelah web aktif di URL Vercel (misalnya `https://cv-blaster.vercel.app`):

1. Buka tab **⚙️ Konfigurasi Bot**:
   * Masukkan **Google Spreadsheet ID**.
   * Masukkan **Google Credentials JSON** (dari Service Account Google Cloud).
   * Klik **💾 Simpan Konfigurasi**.
2. Buka tab **📋 Database Pertanyaan (Google Sheets)**:
   * Jika tab spreadsheet masih kosong, klik tombol **📥 Migrasi 200+ CSV ke Sheets** untuk otomatis menyalin semua 200+ pertanyaan & jawaban bawaan.
3. Anda dapat menggunakan tombol **📤 Export JSON** untuk mengunduh cadangan profil dan konfigurasi Anda kapan saja.

---

## 💡 Tips & Keamanan
- Anda tidak memerlukan database SQL atau NoSQL apa pun.
- Kredensial dan data profil Anda aman tersimpan di browser Anda sendiri.
