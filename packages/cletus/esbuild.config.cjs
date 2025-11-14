const esbuild = require('esbuild');

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

esbuild.build({
  entryPoints: ['src/index.tsx'],
  bundle: true,
  platform: 'node',
  target: 'node18',
  outfile: 'dist/index.js',
  packages: 'external',
  format: 'esm', 
  plugins: [
    stubPlugin
  ],
  external: [
    'assert',
    'buffer',
    'child_process',
    'crypto',
    'events',
    'fs',
    'http',
    'https',
    'net',
    'os',
    'path',
    'stream',
    'tty',
    'url',
    'util',
    'zlib',
  ],
  define: {
    'process.env.NODE_ENV': '"production"'  // This disables devtools
  },
  minify: false,
  sourcemap: false,
  logLevel: 'info',
}).catch(() => process.exit(1));