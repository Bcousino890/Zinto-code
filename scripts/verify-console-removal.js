#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Verify that console logs have been removed from production builds
 */
async function verifyConsoleRemoval() {


  const distDir = path.resolve(__dirname, '../dist');
  const publicDir = path.resolve(distDir, 'public');
  const serverFile = path.resolve(distDir, 'index.js');

  let totalFiles = 0;
  let filesWithConsole = 0;
  let consoleStatements = [];


  function checkFile(filePath, relativePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      totalFiles++;


      const consolePatterns = [
        /console\.(log|info|debug|warn|trace|error)\s*\(/g,
        /console\[['"](?:log|info|debug|warn|trace|error)['"]\]\s*\(/g,
      ];

      let hasConsole = false;
      let matches = [];

      consolePatterns.forEach(pattern => {
        let match;
        while ((match = pattern.exec(content)) !== null) {
          hasConsole = true;
          const lineNumber = content.substring(0, match.index).split('\n').length;
          matches.push({
            type: match[1] || 'unknown',
            line: lineNumber,
            context: content.substring(
              Math.max(0, match.index - 50),
              Math.min(content.length, match.index + 100)
            ).replace(/\n/g, ' ').trim()
          });
        }
      });

      if (hasConsole) {
        filesWithConsole++;
        consoleStatements.push({
          file: relativePath,
          matches: matches
        });
      }

      return { hasConsole, matchCount: matches.length };
    } catch (error) {
      console.warn(`⚠️ Could not read file: ${relativePath} - ${error.message}`);
      return { hasConsole: false, matchCount: 0 };
    }
  }


  function scanDirectory(dir, baseDir = dir) {
    const items = fs.readdirSync(dir);
    
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const relativePath = path.relative(baseDir, fullPath);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {

        if (!['node_modules', '.git', '.vscode'].includes(item)) {
          scanDirectory(fullPath, baseDir);
        }
      } else if (stat.isFile()) {

        if (/\.(js|ts|jsx|tsx|mjs|cjs)$/.test(item)) {
          checkFile(fullPath, relativePath);
        }
      }
    }
  }


  if (!fs.existsSync(distDir)) {
    console.error('❌ Dist directory not found. Please run a build first.');

    process.exit(1);
  }




  if (fs.existsSync(publicDir)) {

    scanDirectory(publicDir);
  }


  if (fs.existsSync(serverFile)) {

    checkFile(serverFile, 'index.js');
  }






  
  if (filesWithConsole === 0) {


  } else {


    
    consoleStatements.forEach(({ file, matches }) => {

      matches.forEach(({ type, line, context }) => {

      });
    });






  }


  const totalConsoleStatements = consoleStatements.reduce(
    (sum, file) => sum + file.matches.length, 0
  );
  






  if (filesWithConsole > 0) {

    const onlyErrors = consoleStatements.every(file => 
      file.matches.every(match => match.type === 'error')
    );
    
    if (onlyErrors) {

      process.exit(0);
    } else {

      process.exit(1);
    }
  } else {
    process.exit(0);
  }
}


verifyConsoleRemoval().catch(error => {
  console.error('❌ Verification failed:', error);
  process.exit(1);
});
