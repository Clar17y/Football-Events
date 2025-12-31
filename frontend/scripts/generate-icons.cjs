const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const iconsDir = path.join(__dirname, '../public/icons');

// Ensure icons directory exists
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

// Football-themed SVG icon with the app's theme color
const createIconSVG = (size) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#4a9fff;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#3880ff;stop-opacity:1" />
    </linearGradient>
  </defs>
  <!-- Background circle -->
  <circle cx="${size/2}" cy="${size/2}" r="${size/2}" fill="url(#bgGrad)"/>
  <!-- Football/Soccer ball -->
  <g transform="translate(${size*0.2}, ${size*0.2}) scale(${size/100 * 0.6})">
    <!-- Ball base -->
    <circle cx="50" cy="50" r="45" fill="white" stroke="#e0e0e0" stroke-width="2"/>
    <!-- Pentagon pattern -->
    <path d="M50 15 L65 35 L58 55 L42 55 L35 35 Z" fill="#333"/>
    <path d="M20 45 L35 35 L42 55 L30 70 L15 60 Z" fill="#333"/>
    <path d="M80 45 L85 60 L70 70 L58 55 L65 35 Z" fill="#333"/>
    <path d="M30 70 L42 55 L58 55 L70 70 L60 85 L40 85 Z" fill="#333"/>
    <!-- Stitching lines -->
    <path d="M50 15 L50 5" stroke="#ccc" stroke-width="1.5" fill="none"/>
    <path d="M35 35 L25 25" stroke="#ccc" stroke-width="1.5" fill="none"/>
    <path d="M65 35 L75 25" stroke="#ccc" stroke-width="1.5" fill="none"/>
    <path d="M15 60 L5 55" stroke="#ccc" stroke-width="1.5" fill="none"/>
    <path d="M85 60 L95 55" stroke="#ccc" stroke-width="1.5" fill="none"/>
    <path d="M40 85 L35 95" stroke="#ccc" stroke-width="1.5" fill="none"/>
    <path d="M60 85 L65 95" stroke="#ccc" stroke-width="1.5" fill="none"/>
  </g>
</svg>
`;

const sizes = [
  { name: 'icon-192.png', size: 192 },
  { name: 'icon-512.png', size: 512 },
  { name: 'apple-touch-icon.png', size: 180 },
  { name: 'favicon-32.png', size: 32 },
  { name: 'favicon-16.png', size: 16 },
];

async function generateIcons() {
  console.log('Generating PWA icons...');

  for (const { name, size } of sizes) {
    const svg = createIconSVG(size);
    const outputPath = path.join(iconsDir, name);

    await sharp(Buffer.from(svg))
      .png()
      .toFile(outputPath);

    console.log(`✓ Generated ${name} (${size}x${size})`);
  }

  // Also create an SVG version for the favicon
  const svgPath = path.join(iconsDir, 'icon.svg');
  fs.writeFileSync(svgPath, createIconSVG(512));
  console.log('✓ Generated icon.svg');

  console.log('\nAll icons generated successfully!');
}

generateIcons().catch(console.error);
