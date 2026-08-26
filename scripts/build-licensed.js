#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import readline from 'readline';
import { createCipheriv, randomBytes as cryptoRandomBytes, createHash } from 'crypto';
import JavaScriptObfuscator from 'javascript-obfuscator';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


const ENCRYPTION_KEY = 'bothive-license-key-2024-secur';
const ALGORITHM = 'aes-256-cbc';

function getEncryptionKey() {

  return Buffer.from(ENCRYPTION_KEY, 'utf8');
}

function encryptLicense(licenseData) {
  const iv = cryptoRandomBytes(16);
  const cipher = createCipheriv(ALGORITHM, getEncryptionKey(), iv);
  const licenseJson = JSON.stringify(licenseData);
  let encrypted = cipher.update(licenseJson, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function validateDate(dateString) {
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(dateString)) {
    return { valid: false, error: 'Date must be in YYYY-MM-DD format' };
  }
  
  const date = new Date(dateString);
  if (isNaN(date.getTime())) {
    return { valid: false, error: 'Invalid date' };
  }
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  
  if (date <= today) {
    return { valid: false, error: 'Expiry date must be in the future' };
  }
  
  return { valid: true };
}

function validateIp(ip) {
  const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
  const wildcardRegex = /^(\d{1,3}\.){3}\*$/;
  const singleWildcardRegex = /^(\d{1,3}\.){1,3}\*$/;
  
  if (ipRegex.test(ip)) {
    const parts = ip.split('.');
    for (const part of parts) {
      const num = parseInt(part, 10);
      if (num < 0 || num > 255) {
        return { valid: false, error: `Invalid IP address: ${ip}` };
      }
    }
    return { valid: true };
  }
  
  if (wildcardRegex.test(ip) || singleWildcardRegex.test(ip)) {
    const parts = ip.split('.');
    for (let i = 0; i < parts.length - 1; i++) {
      if (parts[i] !== '*') {
        const num = parseInt(parts[i], 10);
        if (num < 0 || num > 255) {
          return { valid: false, error: `Invalid IP pattern: ${ip}` };
        }
      }
    }
    return { valid: true };
  }
  
  return { valid: false, error: `Invalid IP address or pattern: ${ip}` };
}

function validateIps(ipString) {
  const ips = ipString.split(',').map(ip => ip.trim()).filter(ip => ip.length > 0);
  
  if (ips.length === 0) {
    return { valid: false, error: 'At least one IP address is required' };
  }
  
  for (const ip of ips) {
    const result = validateIp(ip);
    if (!result.valid) {
      return result;
    }
  }
  
  return { valid: true, ips };
}

function createLicenseHash(data) {
  return createHash('sha256').update(JSON.stringify(data)).digest('hex');
}

async function promptUser(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function collectLicenseInfo() {
  let expiryDate, allowedIps;
  
  if (!process.stdin.isTTY) {
    expiryDate = process.env.LICENSE_EXPIRY;
    const ipsEnv = process.env.LICENSE_ALLOWED_IPS;
    
    if (!expiryDate || !ipsEnv) {
      console.error('❌ Non-TTY environment detected. Please set LICENSE_EXPIRY and LICENSE_ALLOWED_IPS environment variables.');
      process.exit(1);
    }
    
    allowedIps = ipsEnv;
  } else {
    console.log('\n📋 License Information Collection\n');
    
    while (true) {
      expiryDate = await promptUser('Enter expiry date (YYYY-MM-DD): ');
      const dateValidation = validateDate(expiryDate);
      if (dateValidation.valid) {
        break;
      }
      console.error(`❌ ${dateValidation.error}`);
    }
    
    while (true) {
      allowedIps = await promptUser('Enter allowed IP addresses (comma-separated, supports wildcards like 192.168.1.*): ');
      const ipValidation = validateIps(allowedIps);
      if (ipValidation.valid) {
        allowedIps = ipValidation.ips.join(',');
        break;
      }
      console.error(`❌ ${ipValidation.error}`);
    }
    
    console.log('\n📝 License Summary:');
    console.log(`   Expiry Date: ${expiryDate}`);
    console.log(`   Allowed IPs: ${allowedIps.split(',').map(ip => ip.trim()).join(', ')}`);
    
    const confirm = await promptUser('\nConfirm license information (yes/no): ');
    if (confirm.toLowerCase() !== 'yes' && confirm.toLowerCase() !== 'y') {
      console.log('❌ Build cancelled');
      process.exit(1);
    }
  }
  
  return { expiryDate, allowedIps };
}

async function obfuscateFile(filePath, isServer = false) {
  try {
    const code = fs.readFileSync(filePath, 'utf8');
    
    if (isServer) {

      const obfuscationOptions = {
        compact: true,
        controlFlowFlattening: true,
        deadCodeInjection: true,
        stringArray: true,
        stringArrayEncoding: ['base64'],
        splitStrings: true,
        target: 'node',
        renameGlobals: false,
        selfDefending: false,
        debugProtection: false,
        disableConsoleOutput: false
      };
      
      const obfuscationResult = JavaScriptObfuscator.obfuscate(code, obfuscationOptions);
      const obfuscatedCode = obfuscationResult.getObfuscatedCode();
      fs.writeFileSync(filePath, obfuscatedCode, 'utf8');
    } else {

      const obfuscationOptions = {
        compact: true,
        controlFlowFlattening: false,
        deadCodeInjection: false,
        stringArray: false,
        stringArrayEncoding: [],
        splitStrings: false,
        target: 'browser',
        renameGlobals: false,
        selfDefending: false,
        debugProtection: false,
        disableConsoleOutput: false,
        simplify: true,
        identifierNamesGenerator: 'hexadecimal'
      };
      
      const obfuscationResult = JavaScriptObfuscator.obfuscate(code, obfuscationOptions);
      const obfuscatedCode = obfuscationResult.getObfuscatedCode();
      fs.writeFileSync(filePath, obfuscatedCode, 'utf8');
    }
    
    return true;
  } catch (error) {
    console.error(`⚠️  Failed to obfuscate ${filePath}:`, error.message);
    return false;
  }
}

async function buildLicensed() {
  try {
    console.log('🔐 Starting licensed build process...\n');
    
    const { expiryDate, allowedIps } = await collectLicenseInfo();
    
    const ips = allowedIps.split(',').map(ip => ip.trim());
    const generatedAt = new Date().toISOString();
    
    const licenseData = {
      expiryDate,
      allowedIps: ips,
      generatedAt
    };
    
    const signature = createLicenseHash(licenseData);
    licenseData.signature = signature;
    
    console.log('\n🔨 Starting build process...');
    
    execSync('npm run build:production', { stdio: 'inherit' });
    
    console.log('\n🔒 Encrypting license data...');
    const encryptedLicense = encryptLicense(licenseData);
    

    const licenseFilePath = path.join(__dirname, '../dist/license');
    fs.writeFileSync(licenseFilePath, encryptedLicense, 'utf8');
    console.log('✅ License file written to dist/license');
    


    const licensedMarkerPath = path.join(__dirname, '../dist/.licensed');
    fs.writeFileSync(licensedMarkerPath, 'licensed', 'utf8');
    console.log('✅ Licensed build marker created');
    
    console.log('\n🔐 Applying code obfuscation...');
    
    const serverBundlePath = path.join(__dirname, '../dist/index.js');
    if (fs.existsSync(serverBundlePath)) {
      console.log('   Obfuscating server bundle...');
      await obfuscateFile(serverBundlePath, true);
      console.log('   ✅ Server bundle obfuscated');
    }
    
    const clientAssetsPath = path.join(__dirname, '../dist/public/assets');
    if (fs.existsSync(clientAssetsPath)) {
      const files = fs.readdirSync(clientAssetsPath);
      const jsFiles = files.filter(file => file.endsWith('.js'));
      if (jsFiles.length > 0) {
        console.log(`   Obfuscating ${jsFiles.length} client bundle(s)...`);
        for (const file of jsFiles) {
          const filePath = path.join(clientAssetsPath, file);
          await obfuscateFile(filePath, false);
        }
        console.log('   ✅ Client bundles obfuscated');
      }
    }
    
    console.log('\n✅ Licensed build completed successfully!');
    console.log('\n📋 Build Summary:');
    console.log(`   Expiry Date: ${expiryDate}`);
    console.log(`   Allowed IPs: ${ips.map(ip => {
      if (ip.includes('*')) {
        return ip;
      }
      const parts = ip.split('.');
      return `${parts[0]}.${parts[1]}.${parts[2]}.***`;
    }).join(', ')}`);
    console.log(`   License File: dist/license`);
    console.log(`   Obfuscation: Applied to server and client bundles`);
    
  } catch (error) {
    console.error('❌ Build failed:', error.message);
    process.exit(1);
  }
}

buildLicensed().catch(error => {
  console.error('❌ Build failed:', error);
  process.exit(1);
});

