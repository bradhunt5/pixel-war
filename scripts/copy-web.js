// Copy the web game into www/, the folder Capacitor and Electron package.
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const out = path.join(root, 'www');
const items = ['index.html', 'style.css', 'game.js', 'sound.js', 'localnet.js', 'sw.js', 'manifest.webmanifest', 'icons', 'maps', 'vendor'];

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out);
for (const item of items) {
  fs.cpSync(path.join(root, item), path.join(out, item), { recursive: true });
}
console.log(`Copied ${items.length} items to www/`);
