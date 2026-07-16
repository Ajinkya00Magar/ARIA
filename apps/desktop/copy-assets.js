const fs = require('fs');
const path = require('path');

function copyFolderSync(from, to) {
  if (!fs.existsSync(from)) {
    throw new Error(`Source directory not found: ${from}\nRun the full build first (turbo run build).`);
  }
  if (!fs.existsSync(to)) {
    fs.mkdirSync(to, { recursive: true });
  }

  const entries = fs.readdirSync(from, { withFileTypes: true });
  for (let entry of entries) {
    const srcPath = path.join(from, entry.name);
    const destPath = path.join(to, entry.name);
    if (entry.isDirectory()) {
      copyFolderSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// Ensure bundle dir exists and is empty
const bundleDir = path.join(__dirname, 'bundle');
if (fs.existsSync(bundleDir)) {
  fs.rmSync(bundleDir, { recursive: true, force: true });
}
fs.mkdirSync(bundleDir);

// Copy API dist
copyFolderSync(path.join(__dirname, '../api/dist'), path.join(bundleDir, 'api/dist'));

const apiPkg = path.join(__dirname, '../api/package.json');
if (!fs.existsSync(apiPkg)) throw new Error(`Missing: ${apiPkg}`);
fs.copyFileSync(apiPkg, path.join(bundleDir, 'api/package.json'));

// Copy WEB out
copyFolderSync(path.join(__dirname, '../web/out'), path.join(bundleDir, 'web/out'));

// Copy .env so the bundled app has access to the keys
const rootEnv = path.join(__dirname, '../../.env');
if (fs.existsSync(rootEnv)) {
  fs.copyFileSync(rootEnv, path.join(bundleDir, '.env'));
}

console.log('Assets copied to bundle directory successfully.');
