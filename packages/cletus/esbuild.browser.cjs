const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');
const postcss = require('postcss');
const tailwindcss = require('@tailwindcss/postcss');
const autoprefixer = require('autoprefixer');

async function build() {
  try {
    const distDir = path.join(__dirname, 'dist-browser');
    if (!fs.existsSync(distDir)) {
      fs.mkdirSync(distDir, { recursive: true });
    }

    // Build Tailwind CSS using PostCSS
    console.log('Building Tailwind CSS...');
    const inputCss = fs.readFileSync(path.join(__dirname, 'src/browser/styles.css'), 'utf8');
    const configPath = path.join(__dirname, 'tailwind.config.cjs');

    const result = await postcss([
      tailwindcss,
      autoprefixer,
    ]).process(inputCss, {
      from: path.join(__dirname, 'src/browser/styles.css'),
      to: path.join(distDir, 'styles.css'),
    });

    fs.writeFileSync(path.join(distDir, 'styles.css'), result.css);
    console.log('✓ Tailwind CSS built successfully');

    // Build the browser client
    console.log('Building browser client...');
    await esbuild.build({
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
      external: ['*.css'],
    });

    // Copy HTML file and update it to include the styles
    const htmlContent = fs.readFileSync(
      path.join(__dirname, 'src/browser/index.html'),
      'utf-8'
    );

    // Inject the CSS link into the HTML with absolute path
    const updatedHtml = htmlContent.replace(
      '</head>',
      '  <link rel="stylesheet" href="/styles.css">\n</head>'
    );

    fs.writeFileSync(
      path.join(distDir, 'index.html'),
      updatedHtml
    );

    console.log('✓ Browser client built successfully');
  } catch (error) {
    console.error('Browser build failed:', error);
    process.exit(1);
  }
}

build();
