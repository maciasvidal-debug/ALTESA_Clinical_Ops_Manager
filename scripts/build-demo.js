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

// Function to get a file as base64
const getFileAsBase64 = (relativePath, mimeType) => {
  let localPath = relativePath;
  if (localPath.startsWith('/')) {
    localPath = localPath.substring(1);
  }
  const decodedPath = decodeURIComponent(localPath.split('?')[0]);
  const filePath = path.join(outDir, decodedPath);

  if (fs.existsSync(filePath)) {
    const base64 = fs.readFileSync(filePath).toString('base64');
    return `data:${mimeType};base64,${base64}`;
  }
  console.warn(`Could not find file: ${filePath}`);
  return null;
};

// Replace file URLs in a string (e.g., CSS background-image, @font-face)
const replaceUrlsInContent = (content, basePath) => {
  const urlRegex = /url\(['"]?(.*?)['"]?\)/g;
  return content.replace(urlRegex, (match, url) => {
    if (url.startsWith('data:') || url.startsWith('http')) {
      return match;
    }

    // Resolve relative URLs in CSS back to absolute from root
    let resolvedUrl = url;
    if (!resolvedUrl.startsWith('/')) {
       // Typically Next.js outputs absolute paths (/_next/...) in its CSS,
       // but just in case, we keep the original url if we can't easily resolve it.
    }

    // Attempt to determine MIME type roughly
    let mimeType = 'application/octet-stream';
    if (url.endsWith('.woff2')) mimeType = 'font/woff2';
    else if (url.endsWith('.woff')) mimeType = 'font/woff';
    else if (url.endsWith('.png')) mimeType = 'image/png';
    else if (url.endsWith('.jpg') || url.endsWith('.jpeg')) mimeType = 'image/jpeg';
    else if (url.endsWith('.svg')) mimeType = 'image/svg+xml';

    const dataUri = getFileAsBase64(resolvedUrl, mimeType);
    if (dataUri) {
      return `url("${dataUri}")`;
    }
    return match;
  });
};

// Inline CSS and Fonts
console.log('Inlining CSS and Fonts...');
const cssRegex = /<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/gi;
html = html.replace(cssRegex, (match, href) => {
  let relativePath = href;
  if (relativePath.startsWith('/')) {
    relativePath = relativePath.substring(1);
  }
  const filePath = path.join(outDir, relativePath);
  if (fs.existsSync(filePath)) {
    let css = fs.readFileSync(filePath, 'utf8');
    // Replace font and image URLs inside the CSS
    css = replaceUrlsInContent(css, path.dirname(relativePath));
    const base64Css = Buffer.from(css).toString('base64');
    return match.replace(href, `data:text/css;base64,${base64Css}`);
  }
  console.warn(`Could not find CSS file: ${filePath}`);
  return match;
});

// Remove preload links for fonts to avoid 404s (as they are inlined in CSS now)
// We also replace script preload links with data URIs if possible.
console.log('Fixing preload tags...');
const preloadRegex = /<link[^>]*rel="preload"[^>]*href="([^"]+)"[^>]*>/gi;
html = html.replace(preloadRegex, (match, href) => {
  if (match.includes('as="font"')) {
    return ''; // Remove font preloads
  }
  if (match.includes('as="script"')) {
    const dataUri = getFileAsBase64(href, 'application/javascript');
    if (dataUri) {
      return match.replace(href, dataUri);
    }
  }
  return match;
});

// Inline JS
console.log('Inlining JS (as Data URIs)...');
const jsRegex = /<script[^>]*src="([^"]+)"[^>]*><\/script>/gi;
html = html.replace(jsRegex, (match, src) => {
  const dataUri = getFileAsBase64(src, 'application/javascript');
  if (dataUri) {
    return match.replace(src, dataUri);
  }
  return match;
});

// Extra step: Catch any inline scripts Next.js puts that might mention chunk files (like self.__next_f.push)
// Next.js uses stringified JSON inside scripts that might contain paths to missing chunks.
// We'll replace occurrences of "static/chunks/..." with the base64 content if we can safely do it,
// though usually just replacing the <script src="..."> is enough for hydration to work.

// Inline images
console.log('Inlining Images...');
const imgRegex = /<img[^>]*src="([^"]+)"[^>]*>/gi;
html = html.replace(imgRegex, (match, src) => {
  if (src.startsWith('data:') || src.startsWith('http')) {
    return match; // Already data URI or absolute URL
  }
  const ext = src.split('.').pop().split('?')[0] || 'png';
  let mimeType = `image/${ext === 'svg' ? 'svg+xml' : ext}`;

  const dataUri = getFileAsBase64(src, mimeType);
  if (dataUri) {
    return match.replace(src, dataUri);
  }
  return match;
});

const outputPath = path.join(rootDir, 'demo.html');
fs.writeFileSync(outputPath, html);
console.log(`Successfully created standalone demo at: ${outputPath}`);
