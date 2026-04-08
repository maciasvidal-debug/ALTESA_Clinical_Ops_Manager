const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = path.join(__dirname, '..');

console.log('Building Next.js application for export...');
try {
  execSync('npx next build', {
    stdio: 'inherit',
    cwd: rootDir,
    env: { ...process.env, BUILD_DEMO: 'true' }
  });
} catch (error) {
  console.error('Failed to build the project.', error);
  process.exit(1);
}

const outDir = path.join(rootDir, 'out');
if (!fs.existsSync(outDir)) {
  console.error("No 'out' directory found after build.");
  process.exit(1);
}

let html = fs.readFileSync(path.join(outDir, 'index.html'), 'utf8');

// Inline CSS
console.log('Inlining CSS...');
const cssRegex = /<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/gi;
html = html.replace(cssRegex, (match, href) => {
  let relativePath = href;
  if (relativePath.startsWith('/')) {
    relativePath = relativePath.substring(1);
  }
  const filePath = path.join(outDir, relativePath);
  if (fs.existsSync(filePath)) {
    const css = fs.readFileSync(filePath, 'utf8');
    return `<style>${css}</style>`;
  }
  console.warn(`Could not find CSS file: ${filePath}`);
  return match;
});

// Inline JS
console.log('Inlining JS...');
let scriptsToAppend = '';
const jsRegex = /<script[^>]*src="([^"]+)"[^>]*><\/script>/gi;
html = html.replace(jsRegex, (match, src) => {
  let relativePath = src;
  if (relativePath.startsWith('/')) {
    relativePath = relativePath.substring(1);
  }
  const filePath = path.join(outDir, relativePath);
  if (fs.existsSync(filePath)) {
    const js = fs.readFileSync(filePath, 'utf8');
    scriptsToAppend += `\n<script>${js}</script>`;
  } else {
    console.warn(`Could not find JS file: ${filePath}`);
  }
  return ''; // Remove script tags from head
});

// Inline images
console.log('Inlining Images...');
const imgRegex = /<img[^>]*src="([^"]+)"[^>]*>/gi;
html = html.replace(imgRegex, (match, src) => {
  if (src.startsWith('data:') || src.startsWith('http')) {
    return match; // Already data URI or absolute URL
  }
  let relativePath = src;
  if (relativePath.startsWith('/')) {
    relativePath = relativePath.substring(1);
  }
  // Basic Next.js image paths handling might require some decoding if using next/image with specific loaders,
  // assuming these are simple static exports here.
  const decodedPath = decodeURIComponent(relativePath.split('?')[0]);
  const filePath = path.join(outDir, decodedPath);

  if (fs.existsSync(filePath)) {
    const ext = path.extname(filePath).substring(1) || 'png';
    const base64 = fs.readFileSync(filePath).toString('base64');
    const dataUri = `data:image/${ext};base64,${base64}`;
    return match.replace(src, dataUri);
  }
  console.warn(`Could not find Image file: ${filePath}`);
  return match;
});

// Append scripts before closing body
if (html.includes('</body>')) {
  html = html.replace('</body>', `${scriptsToAppend}\n</body>`);
} else {
  html += scriptsToAppend;
}

const outputPath = path.join(rootDir, 'demo.html');
fs.writeFileSync(outputPath, html);
console.log(`Successfully created standalone demo at: ${outputPath}`);
