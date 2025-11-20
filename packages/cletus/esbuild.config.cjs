const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const stubPlugin = {
  name: 'stub',
  setup(build) {
    build.onResolve({ filter: /^react-devtools-core$/ }, () => ({
      path: 'react-devtools-core',
      namespace: 'stub',
    }));
    build.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
      contents: 'export default null;',
      loader: 'js',
    }));
  },
};

const markdownPlugin = {
  name: 'markdown',
  setup(build) {
    build.onResolve({ filter: /\.md$/ }, args => {
      return {
        path: path.resolve(args.resolveDir, args.path),
        namespace: 'markdown',
      };
    });
    build.onLoad({ filter: /.*/, namespace: 'markdown' }, args => {
      const content = fs.readFileSync(args.path, 'utf8');
      return {
        contents: `export default ${JSON.stringify(content)};`,
        loader: 'js',
      };
    });
  },
};

const shebangPlugin = {
  name: 'shebang',
  setup(build) {
    build.onEnd(() => {
      // Ensure shebang is at the top of the output file
      const outfile = 'dist/index.js';
      let content = fs.readFileSync(outfile, 'utf8');

      // Remove any existing shebang
      content = content.replace(/^#!.*\n/, '');

      // Add shebang at the top
      content = '#!/usr/bin/env node\n' + content;

      fs.writeFileSync(outfile, content);

      // Make executable on Unix-like systems
      try {
        fs.chmodSync(outfile, 0o755);
      } catch (e) {
        // Windows doesn't need chmod
      }
    });
  },
};

esbuild.build({
  entryPoints: ['src/index.tsx'],
  bundle: true,
  platform: 'node',
  target: 'node18',
  outfile: 'dist/index.js',
  // Bundle most dependencies to avoid version conflicts
  // Only externalize heavy binary dependencies that need native builds or assets
  external: [
    // Heavy dependencies with native bindings
    'sharp',
    'puppeteer',
    'mic',
    // Dependencies with assets (fonts, etc)
    'ink-big-text',
    'ink-gradient',
    // React ecosystem (must be shared between bundled code and external ink)
    'react',
    'react-dom',
    'ink',
    'ink-select-input',
    'ink-text-input',
    'ink-syntax-highlight',
  ],
  format: 'esm',
  plugins: [
    stubPlugin,
    markdownPlugin,
    shebangPlugin  // Must run last to add shebang after banner
  ],
  banner: {
    js: `
import { createRequire as __createRequire } from 'module';
import { fileURLToPath as __fileURLToPath } from 'url';
import { dirname as __dirname_func } from 'path';
const __filename = __fileURLToPath(import.meta.url);
const __dirname = __dirname_func(__filename);
const require = __createRequire(import.meta.url);
`
  },
  define: {
    'process.env.NODE_ENV': '"production"'  // This disables devtools
  },
  minify: false,
  sourcemap: false,
  logLevel: 'info',
}).catch(() => process.exit(1));