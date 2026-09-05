import fs from 'fs';
import path from 'path';
import { getConfig } from './config';

/**
 * Generates a personalized cover letter by loading `src/lib/cover_letter.md`
 * and replacing dynamic placeholders with candidate profile data and job specifics.
 */
export function generateCoverLetter(companyName: string, jobTitle: string): string {
  const config = getConfig();
  const templatePath = path.join(process.cwd(), 'src', 'lib', 'cover_letter.md');

  let template = '';
  if (fs.existsSync(templatePath)) {
    template = fs.readFileSync(templatePath, 'utf8');
  } else {
    // Fallback template if file not found
    template = `Yth. Tim Rekrutmen [Nama Perusahaan],

Melalui surat ini, saya ingin mengajukan diri untuk posisi [Job Title] di [Nama Perusahaan]. Saya memiliki latar belakang dan pengalaman yang relevan dalam pengembangan perangkat lunak dan siap memberikan kontribusi terbaik bagi perusahaan.

Terima kasih atas waktu dan perhatian Bapak/Ibu.

Hormat saya,
[Nama Anda]`;
  }

  // Format today's date in Indonesian (e.g. "26 Agustus 2026")
  const today = new Date();
  const dateFormatted = today.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  const cleanCompany = (companyName || 'Perusahaan').trim();
  const cleanTitle = (jobTitle || 'Software Engineer').trim();
  const cleanFullName = (config.fullName || 'Yoga Adi Saputra').trim();
  const cleanDomicile = (config.domicile || config.location || 'Jakarta Selatan, DKI Jakarta').trim();
  const cleanPhone = (config.phoneNumber || '081234567890').trim();
  const cleanLinkedIn = (config.linkedinUrl || 'https://www.linkedin.com').trim();
  const cleanPortfolio = (config.githubUrl || config.portfolioUrl || 'https://github.com/yogaadi').trim();

  let letter = template
    .replace(/\[Nama Anda\]/g, cleanFullName)
    .replace(/\[Kota, Wilayah\]/g, cleanDomicile)
    .replace(/\[Nomor Telepon\]/g, cleanPhone)
    .replace(/\[Alamat Email\]/g, 'yogaadisaputra@gmail.com')
    .replace(/\[Link LinkedIn\]/g, cleanLinkedIn)
    .replace(/\[Link GitHub \/ Portfolio\]/g, cleanPortfolio)
    .replace(/\[Tanggal Hari Ini\]/g, dateFormatted)
    .replace(/\[Nama Manajer Perekrut \/ Tim HRD\]/g, `Tim Rekrutmen ${cleanCompany}`)
    .replace(/\[Nama Perusahaan\]/g, cleanCompany)
    .replace(/\[Job Title\]/g, cleanTitle)
    .replace(/\[sebutkan 1 hal menarik tentang produk\/teknologi perusahaan tersebut\]/g, 'pengembangan produk dan ekosistem teknologi perusahaan');

  return letter.trim();
}
