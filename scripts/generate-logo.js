const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const svgLogo = `<svg width="400" height="100" viewBox="0 0 400 100" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="redGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#dc2626"/>
      <stop offset="100%" stop-color="#991b1b"/>
    </linearGradient>
  </defs>
  
  <!-- Emblem Badge -->
  <rect x="10" y="12" width="76" height="76" rx="14" fill="url(#redGrad)"/>
  <circle cx="48" cy="50" r="26" fill="none" stroke="#ffffff" stroke-width="3" stroke-dasharray="4,2"/>
  <text x="48" y="58" font-family="Arial, sans-serif" font-size="22" font-weight="900" fill="#ffffff" text-anchor="middle" letter-spacing="1">LPU</text>
  
  <!-- University Typography -->
  <text x="100" y="42" font-family="Arial, sans-serif" font-size="22" font-weight="900" fill="#b91c1c" letter-spacing="0.5">LOVELY</text>
  <text x="100" y="65" font-family="Arial, sans-serif" font-size="16" font-weight="800" fill="#1e293b" letter-spacing="1.5">PROFESSIONAL</text>
  <text x="100" y="82" font-family="Arial, sans-serif" font-size="13" font-weight="700" fill="#475569" letter-spacing="2">UNIVERSITY</text>
  
  <!-- Subtle divider and tagline -->
  <line x1="255" y1="25" x2="255" y2="75" stroke="#cbd5e1" stroke-width="1.5"/>
  <text x="268" y="46" font-family="Arial, sans-serif" font-size="11" font-weight="600" fill="#b91c1c" letter-spacing="0.5">Transforming Education</text>
  <text x="268" y="62" font-family="Arial, sans-serif" font-size="11" font-weight="600" fill="#64748b" letter-spacing="0.5">Transforming India</text>
</svg>`;

const outputPath = path.resolve(__dirname, '../apps/web/public/images/lpu-logo.png');

async function buildLogo() {
  await sharp(Buffer.from(svgLogo))
    .png()
    .toFile(outputPath);
  console.log('✅ Successfully generated official LPU logo at:', outputPath);
}

buildLogo().catch(console.error);
