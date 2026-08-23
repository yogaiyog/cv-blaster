# Cara Mendapatkan Google Gemini API Key

Ikuti langkah-langkah di bawah ini untuk mendapatkan Google Gemini API Key secara gratis dari Google AI Studio dan mengkonfigurasikannya di bot CV Blaster Anda:

---

### Langkah 1: Masuk ke Google AI Studio
1. Buka halaman [Google AI Studio](https://aistudio.google.com/).
2. Login menggunakan akun Google Anda.
3. Setujui ketentuan layanan (Terms of Service) jika ini adalah pertama kali Anda membukanya.

---

### Langkah 2: Buat API Key Baru
1. Di halaman dashboard Google AI Studio, klik tombol **Get API key** di sebelah kiri atas atau tengah layar.
2. Klik tombol **Create API key** (Buat kunci API).
3. Anda akan melihat dua opsi pembuatan:
   * **Create API key in new project**: Membuat project Google Cloud baru secara otomatis dan memberikan kunci API (Disarankan).
   * **Create API key in existing project**: Menghubungkan ke project Google Cloud yang sudah ada.
4. Pilih **Create API key in new project**.
5. Tunggu proses pembuatan selama beberapa detik hingga kunci API Anda muncul di layar.

---

### Langkah 3: Salin API Key
1. Setelah kunci API berhasil dibuat, salin (copy) kode kunci API tersebut yang berawalan `AIzaSy...`.
2. Simpan kunci API ini dengan aman. **Jangan membagikan kunci API Anda kepada orang lain atau mengunggahnya ke repositori publik (seperti GitHub)**.

---

### Langkah 4: Setel API Key di CV Blaster
Agar mesin AI CV Blaster dapat membaca kunci API Anda secara otomatis saat menjalankan bot, Anda dapat menyetelnya di environment terminal Anda:

#### Pengguna Mac / Linux:
1. Buka Terminal.
2. Jalankan perintah berikut untuk mengekspor kunci API Anda:
   ```bash
   export GEMINI_API_KEY="MASUKKAN_API_KEY_GEMINI_ANDA"
   ```
3. Setelah disetel, jalankan server development bot Anda di terminal yang sama:
   ```bash
   npm run dev
   ```

#### Pengguna Windows (Command Prompt / CMD):
1. Buka CMD.
2. Jalankan perintah berikut:
   ```cmd
   set GEMINI_API_KEY=MASUKKAN_API_KEY_GEMINI_ANDA
   ```
3. Jalankan server development:
   ```cmd
   npm run dev
   ```

#### Pengguna Windows (PowerShell):
1. Buka PowerShell.
2. Jalankan perintah berikut:
   ```powershell
   $env:GEMINI_API_KEY="MASUKKAN_API_KEY_GEMINI_ANDA"
   ```
3. Jalankan server development:
   ```powershell
   npm run dev
   ```
