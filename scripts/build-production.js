#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Must stay aligned with `BUNDLED_NOTO_FIXED_FILES` in `server/services/erp-invoice-pdf-fonts.ts`. */
const REQUIRED_NOTO_FIXED_FONTS = [
  'NotoSans-Regular.ttf',
  'NotoSansArabic-Regular.ttf',
  'NotoSansDevanagari-Regular.ttf',
  'NotoSansHebrew-Regular.ttf',
];

async function buildProduction() {

  if (fs.existsSync('dist')) {
    fs.rmSync('dist', { recursive: true, force: true });
  }


  try {
    execSync('npm run build:production', { stdio: 'inherit' });
  } catch (error) {
    console.error('❌ Build failed:', error.message);
    process.exit(1);
  }

  try {
    const translationsSource = path.join(__dirname, '../translations');
    const translationsDest = path.join(__dirname, '../dist/translations');
    if (fs.existsSync(translationsSource)) {
      fs.cpSync(translationsSource, translationsDest, { recursive: true });
      console.log('✅ Locale JSON assets copied to dist/translations');
    } else {
      console.warn('⚠️ translations directory not found:', translationsSource);
    }
  } catch (error) {
    console.error('❌ Failed to copy translation assets:', error.message);
    process.exit(1);
  }

  try {
    const notoSource = path.join(__dirname, '../server/fonts/noto');
    const notoDest = path.join(__dirname, '../dist/fonts/noto');
    if (!fs.existsSync(notoSource)) {
      console.error('❌ Bundled Noto fonts directory not found:', notoSource);
      process.exit(1);
    }
    fs.cpSync(notoSource, notoDest, { recursive: true });
    console.log('✅ Noto PDF fonts copied to dist/fonts/noto');
    for (const file of REQUIRED_NOTO_FIXED_FONTS) {
      const filePath = path.join(notoDest, file);
      if (!fs.existsSync(filePath)) {
        console.error(`❌ Required Noto font missing after copy: ${filePath}`);
        process.exit(1);
      }
    }
    console.log('✅ All required fixed Noto fonts verified under dist/fonts/noto');
  } catch (error) {
    console.error('❌ Failed to copy or verify Noto PDF fonts:', error.message);
    process.exit(1);
  }

  const serverFile = path.join(__dirname, '../dist/index.js');
  if (!fs.existsSync(serverFile)) {
    console.error('❌ Server file not found:', serverFile);
    process.exit(1);
  }

  const bundledEn = path.join(__dirname, '../dist/translations/en.json');
  if (!fs.existsSync(bundledEn)) {
    console.error('❌ Bundled English locale missing:', bundledEn);
    process.exit(1);
  }


  const publicDir = path.join(__dirname, '../dist/public');
  if (fs.existsSync(publicDir)) {
    const files = fs.readdirSync(publicDir, { recursive: true });
    files.forEach(file => {
      if (typeof file === 'string' && file.endsWith('.map')) {
        const mapFile = path.join(publicDir, file);
        if (fs.existsSync(mapFile)) {
          fs.unlinkSync(mapFile);
        }
      }
    });
  }


  try {
    const widgetsSource = path.join(__dirname, '../server/widgets');
    const widgetsDest = path.join(__dirname, '../dist/widgets');
    if (fs.existsSync(widgetsSource)) {
      fs.cpSync(widgetsSource, widgetsDest, { recursive: true });
      console.log('✅ Widget assets copied to dist/widgets');
    } else {
      console.warn('⚠️ Widget source directory not found:', widgetsSource);
    }
  } catch (error) {
    console.error('❌ Failed to copy widget assets:', error.message);
    process.exit(1);
  }


  try {
    const cssSource = path.join(__dirname, '../server/widgets/webchat-widget.css');
    const cssDestDir = path.join(__dirname, '../dist/public/webchat');
    const cssDest = path.join(cssDestDir, 'widget.css');
    if (fs.existsSync(cssSource)) {
      if (!fs.existsSync(cssDestDir)) {
        fs.mkdirSync(cssDestDir, { recursive: true });
      }
      fs.cpSync(cssSource, cssDest);
      console.log('✅ Widget CSS copied to dist/public/webchat/widget.css');
    } else {
      console.warn('⚠️ Widget CSS source not found:', cssSource);
    }
  } catch (error) {
    console.error('❌ Failed to copy widget CSS to public:', error.message);
    process.exit(1);
  }




  const requiredWidgetFiles = [
    'webchat-linkify.js',
    'webchat-widget.js',
    'webchat-widget.html',
    'webchat-widget.css'
  ];
  const widgetsDest = path.join(__dirname, '../dist/widgets');
  for (const file of requiredWidgetFiles) {
    const filePath = path.join(widgetsDest, file);
    if (!fs.existsSync(filePath)) {
      console.error(`❌ Required widget file not found after copy: ${filePath}`);
      process.exit(1);
    }
  }
  console.log('✅ All required widget files verified');

  console.log('✅ Production build completed successfully');
}

buildProduction().catch(error => {
  console.error('❌ Build failed:', error);
  process.exit(1);
});