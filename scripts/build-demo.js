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

console.log('Bundling application using next-single-file...');
try {
  execSync('npx next-single-file', {
    stdio: 'inherit',
    cwd: rootDir
  });
} catch (error) {
  console.error('Failed to bundle the project with next-single-file.', error);
  process.exit(1);
}

const distHtml = path.join(rootDir, 'dist', 'index.html');
const demoHtml = path.join(rootDir, 'demo.html');

if (fs.existsSync(distHtml)) {
  fs.copyFileSync(distHtml, demoHtml);
  console.log(`Successfully created standalone demo at: ${demoHtml}`);
} else {
  console.error("Could not find the bundled output at dist/index.html");
  process.exit(1);
}
