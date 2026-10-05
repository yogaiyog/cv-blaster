const fs = require('fs');
const path = require('path');

const packageJsonPath = path.join(process.cwd(), 'package.json');
const changelogPath = path.join(process.cwd(), 'CHANGELOG.md');
const outputPath = path.join(process.cwd(), 'release_notes.md');

let version = '2.0.0';
try {
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  if (pkg.version) version = pkg.version;
} catch (e) {
  console.warn('Could not read package.json version:', e.message);
}

let releaseNotes = `Release v${version}\n`;

if (fs.existsSync(changelogPath)) {
  try {
    const changelog = fs.readFileSync(changelogPath, 'utf8');
    const escapedVersion = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Match e.g. "## [v2.0.0] - ..." or "## [2.0.0] - ..." until the next "## [" or end of file
    const regex = new RegExp(`(## \\[(?:v)?${escapedVersion}\\][\\s\\S]*?)(?=\\n## \\[|$)`);
    const match = changelog.match(regex);
    if (match && match[1]) {
      releaseNotes = match[1].trim() + '\n';
      console.log(`Found release notes for version v${version} in CHANGELOG.md`);
    } else {
      console.log(`No specific entry found for version v${version} in CHANGELOG.md, using default fallback.`);
    }
  } catch (e) {
    console.warn('Error reading CHANGELOG.md:', e.message);
  }
} else {
  console.log('CHANGELOG.md not found, using default release notes.');
}

fs.writeFileSync(outputPath, releaseNotes, 'utf8');
console.log(`Wrote release notes to ${outputPath}`);
