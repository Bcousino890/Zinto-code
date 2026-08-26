#!/usr/bin/env node


import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { config } from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);


config({ path: join(__dirname, '..', '.env') });


import('../server/init-translations.js').then(async (module) => {
  try {

    await module.initializeTranslations();

    process.exit(0);
  } catch (error) {
    console.error('❌ Error updating translations:', error);
    process.exit(1);
  }
}).catch((error) => {
  console.error('❌ Error importing translation module:', error);
  process.exit(1);
});
