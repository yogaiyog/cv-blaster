# Panduan Menjalankan & Mem-Build CV Blaster Desktop App (Electron)

Dengan Electron, **CV Blaster** dapat dijalankan sebagai aplikasi Desktop mandiri (.dmg / .app di macOS, .exe di Windows) tanpa perlu menginstal Node.js atau membuka terminal bagi pengguna akhir.

---

## 💻 1. Menjalankan di Mode Development (Testing)

Untuk mencoba membuka aplikasi desktop di laptop Anda saat coding/pengembangan:

```bash
npm run electron:dev
```
Perintah ini akan otomatis:
1. Memulai server Next.js di background (`localhost:3000`).
2. Membuka jendela aplikasi desktop Electron dengan tampilan dashboard CV Blaster.

---

## 📦 2. Mem-Build File Installer (.dmg untuk Mac / .exe untuk Windows)

Untuk membuat file installer yang siap dibagikan ke pengguna lain:

### Untuk macOS (Apple Silicon / Intel):
```bash
npm run electron:build:mac
```
Output installer `.dmg` dan `.zip` akan tersimpan di folder:
`dist-electron/`

### Untuk Windows:
```bash
npm run electron:build:win
```
Output installer `.exe` (*setup wizard*) akan tersimpan di folder:
`dist-electron/`

---

## ✨ 3. Pengalaman Pengguna Akhir (End User)

Pengguna yang menerima installer:
1. **Zero Setup:** Tidak perlu install Node.js, Git, atau Terminal.
2. **Tinggal Buka:** Dobel klik aplikasi untuk membuka dashboard.
3. **Otomatisasi Penuh:** Puppeteer langsung berjalan native di komputer pengguna.
4. **Data Aman:** Konfigurasi tersimpan di storage laptop masing-masing dan tersinkronisasi ke Google Sheets mereka.
