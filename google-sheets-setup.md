# Cara Mendapatkan Google Sheets API Credentials

Ikuti langkah-langkah di bawah ini untuk mendapatkan file JSON Service Account dan menghubungkannya dengan Google Sheets Anda:

---

### Langkah 1: Buat Project di Google Cloud Console
1. Buka [Google Cloud Console](https://console.cloud.google.com/).
2. Login menggunakan akun Google Anda.
3. Klik dropdown project di bagian kiri atas (di sebelah logo Google Cloud) lalu klik **New Project**.
4. Beri nama project Anda (misalnya: `CV-Blaster-Bot`) lalu klik **Create**. Tunggu beberapa detik sampai project selesai dibuat dan pastikan Anda telah memilih project tersebut.

---

### Langkah 2: Aktifkan Google Sheets API
1. Pada menu navigasi di sebelah kiri (klik ikon tiga baris di kiri atas), pilih **APIs & Services** > **Library**.
2. Di kolom pencarian, ketik **"Google Sheets API"**.
3. Klik pada pilihan **Google Sheets API**, lalu klik tombol **Enable**.

---

### Langkah 3: Buat Service Account (Kredensial Akun)
1. Setelah API aktif, masuk ke menu navigasi kiri: **APIs & Services** > **Credentials**.
2. Klik tombol **+ Create Credentials** di bagian atas, lalu pilih **Service Account**.
3. Isi informasi Service Account:
   * **Service account name**: misal `sheet-editor`
   * **Service account ID**: akan terisi otomatis.
4. Klik **Create and Continue**.
5. Untuk bagian *Role* (peran), Anda bisa melewati ini (opsional) atau berikan akses editor, lalu klik **Done** di bagian bawah.

---

### Langkah 4: Unduh Kunci JSON (Credentials JSON)
1. Di halaman **Credentials**, cari bagian **Service Accounts** di bagian bawah. Klik pada email Service Account yang baru saja dibuat.
2. Buka tab **Keys** (Kunci) di bagian atas.
3. Klik tombol **Add Key** > **Create new key**.
4. Pilih format **JSON** (ini adalah pilihan default), lalu klik **Create**.
5. Sebuah file `.json` akan otomatis terunduh ke komputer Anda. **Buka file tersebut menggunakan text editor, lalu copy seluruh isinya** untuk dimasukkan ke form konfigurasi dashboard CV Blaster.

---

### Langkah 5: Bagikan Akses Google Sheet ke Service Account
1. Buka file Google Sheets yang ingin Anda gunakan sebagai database lamaran.
2. Salin **Email Service Account** yang Anda buat di Langkah 3 (contoh email: `sheet-editor@cv-blaster-bot.iam.gserviceaccount.com`).
3. Di Google Sheets Anda, klik tombol **Share (Bagikan)** di pojok kanan atas.
4. Paste email Service Account tersebut ke kolom undang pengguna, ubah perannya menjadi **Editor**, hilangkan centang "Notify people" agar tidak mengirim email, lalu klik **Share (Bagikan)**.
5. Salin **Spreadsheet ID** dari URL Google Sheets Anda:
   * URL format: `https://docs.google.com/spreadsheets/d/MASUKKAN_ID_DI_SINI/edit`
   * Masukkan ID ini ke form konfigurasi dashboard.
