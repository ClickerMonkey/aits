const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

// Build the browser client
esbuild.build({
  entryPoints: ['src/browser/app.tsx'],
  bundle: true,
  platform: 'browser',
  target: 'es2020',
  outfile: 'dist-browser/app.js',
  format: 'esm',
  minify: true,
  sourcemap: true,
  logLevel: 'info',
  define: {
    'process.env.NODE_ENV': '"production"'
  },
  loader: {
    '.css': 'css',
  },
}).then(() => {
  // Copy static files
  const distDir = path.join(__dirname, 'dist-browser');
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }

  // Copy HTML file
  fs.copyFileSync(
    path.join(__dirname, 'src/browser/index.html'),
    path.join(distDir, 'index.html')
  );

  // Copy CSS file (it's imported in app.tsx but needs to be available)
  fs.copyFileSync(
    path.join(__dirname, 'src/browser/styles.css'),
    path.join(distDir, 'styles.css')
  );

  console.log('✓ Browser client built successfully');
}).catch((error) => {
  console.error('Browser build failed:', error);
  process.exit(1);
});
