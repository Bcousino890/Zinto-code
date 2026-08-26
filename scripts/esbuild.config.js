#!/usr/bin/env node

import esbuild from 'esbuild';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


const mode = process.env.NODE_ENV || process.argv[2] || 'development';
const isProduction = mode === 'production';




const config = {
  entryPoints: [path.resolve(__dirname, '../server/index.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outdir: path.resolve(__dirname, '../dist'),
  packages: 'external',
  sourcemap: !isProduction,
  minify: isProduction,
  target: 'node18',



  drop: isProduction ? ['debugger'] : [],

  define: {
    'process.env.NODE_ENV': JSON.stringify(mode),
  },

  banner: {
    js: isProduction
      ? '// Production build - console logs preserved for server debugging'
      : '// Development build - console logs preserved for debugging'
  },

  logLevel: 'info',

  color: true,
  


};


config.plugins = [];


async function build() {
  try {






    
    const result = await esbuild.build(config);
    
    if (result.errors.length > 0) {
      console.error('❌ Build errors:', result.errors);
      process.exit(1);
    }
    
    if (result.warnings.length > 0) {
      console.warn('⚠️ Build warnings:', result.warnings);
    }

    
  } catch (error) {
    console.error('❌ Build failed:', error);
    process.exit(1);
  }
}


build();
