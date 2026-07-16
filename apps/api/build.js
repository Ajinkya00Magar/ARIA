const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');
const JavaScriptObfuscator = require('javascript-obfuscator');

async function build() {
  console.log('Starting API build process...');

  // 1. Read .env file
  const envPath = path.resolve(__dirname, '../../.env');
  const defineEnv = {
    'process.env.NODE_ENV': JSON.stringify('production'),
    'process.env.PORT': JSON.stringify('3001'),
  };

  if (fs.existsSync(envPath)) {
    console.log('Found root .env file, embedding keys into bundle...');
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match && !line.startsWith('#')) {
        const key = match[1].trim();
        let value = match[2].trim();
        // Remove quotes if present
        if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
        if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
        
        // We do NOT want to overwrite NODE_ENV or PORT as they are fixed for the desktop bundle
        if (key !== 'NODE_ENV' && key !== 'PORT') {
          defineEnv[`process.env.${key}`] = JSON.stringify(value);
        }
      }
    });
  } else {
    console.warn('WARNING: No .env file found at root, keys will be missing!');
  }

  // 2. Build with esbuild
  const outPath = path.join(__dirname, 'dist', 'index.js');
  
  const isVercel = process.env.VERCEL === '1';

  const externalModules = [
    'node-pty',
    'electron'
  ];
  
  if (isVercel) {
    // Vercel needs to find require('express') in the final bundle to recognize it as a serverless function
    externalModules.push('express');
  }

  await esbuild.build({
    entryPoints: ['src/index.ts'],
    bundle: true,
    platform: 'node',
    target: 'node20',
    outfile: outPath,
    define: defineEnv,
    external: externalModules,
    minify: true, // initial minify
  });

  console.log('esbuild bundling completed.');

  // 3. Obfuscate the bundled output (Skip on Vercel)
  if (isVercel) {
    console.log('Skipping obfuscation for Vercel deployment...');
  } else {
    console.log('Obfuscating the API bundle to hide keys and endpoints...');
    const bundledCode = fs.readFileSync(outPath, 'utf8');
    
    const obfuscationResult = JavaScriptObfuscator.obfuscate(bundledCode, {
      compact: true,
      controlFlowFlattening: true,
      controlFlowFlatteningThreshold: 0.5,
      deadCodeInjection: false,
      debugProtection: false,
      disableConsoleOutput: false,
      identifierNamesGenerator: 'hexadecimal',
      log: false,
      numbersToExpressions: true,
      renameGlobals: false,
      selfDefending: false,
      simplify: true,
      splitStrings: true,
      splitStringsChunkLength: 10,
      stringArray: true,
      stringArrayCallsTransform: true,
      stringArrayCallsTransformThreshold: 0.5,
      stringArrayEncoding: ['base64'],
      stringArrayIndexShift: true,
      stringArrayRotate: true,
      stringArrayShuffle: true,
      stringArrayWrappersCount: 1,
      stringArrayWrappersChainedCalls: true,
      stringArrayWrappersParametersMaxCount: 2,
      stringArrayWrappersType: 'variable',
      stringArrayThreshold: 0.75,
      unicodeEscapeSequence: false
    });

    fs.writeFileSync(outPath, obfuscationResult.getObfuscatedCode());
    console.log('API obfuscation complete!');
  }
  
  console.log('API build complete!');
}

build().catch(err => {
  console.error('Build failed:', err);
  process.exit(1);
});
