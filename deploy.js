#!/usr/bin/env node
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, 'output');
const VERCEL_SCOPE = 'alexanders-projects-f99ad7d6';

function deployToVercel(slug) {
  const htmlPath = path.join(OUTPUT_DIR, `${slug}.html`);

  if (!fs.existsSync(htmlPath)) {
    console.error(`❌ No proposal found at: ${htmlPath}`);
    console.error(`   Run: node generate.js --company "Company Name" --contact "Name" --size 50 --type "half-day team building"`);
    process.exit(1);
  }

  // Create a deploy directory structure for Vercel
  const deployDir = path.join(__dirname, '.deploy', slug);
  const publicDir = path.join(deployDir, 'public');

  // Clean and create
  if (fs.existsSync(deployDir)) fs.rmSync(deployDir, { recursive: true });
  fs.mkdirSync(publicDir, { recursive: true });

  // Copy HTML as index.html
  fs.copyFileSync(htmlPath, path.join(publicDir, 'index.html'));

  // Copy assets (logos, images)
  const assetsDir = path.join(__dirname, 'assets');
  if (fs.existsSync(assetsDir)) {
    const destAssets = path.join(publicDir, 'assets');
    fs.mkdirSync(destAssets, { recursive: true });
    for (const file of fs.readdirSync(assetsDir)) {
      fs.copyFileSync(path.join(assetsDir, file), path.join(destAssets, file));
    }
  }

  // Create vercel.json for static hosting
  const vercelConfig = {
    buildCommand: null,
    outputDirectory: 'public',
    framework: null,
  };
  fs.writeFileSync(path.join(deployDir, 'vercel.json'), JSON.stringify(vercelConfig, null, 2));

  console.log(`\n🚀 Deploying ${slug} to Vercel...`);

  // Use VERCEL_TOKEN env var if available, otherwise fall back to expect
  const vercelToken = process.env.VERCEL_TOKEN;
  const tokenFlag = vercelToken ? ` --token ${vercelToken}` : '';
  const useExpect = !vercelToken;

  try {
    if (useExpect) {
      // Fallback: use expect for TTY (local dev)
      execSync(
        `cd "${deployDir}" && expect -c 'spawn npx vercel link --scope ${VERCEL_SCOPE} --yes; expect eof' 2>&1`,
        { encoding: 'utf-8', timeout: 60000 }
      );
    } else {
      // Token mode: no TTY needed
      execSync(
        `cd "${deployDir}" && npx vercel link --scope ${VERCEL_SCOPE} --yes${tokenFlag} 2>&1`,
        { encoding: 'utf-8', timeout: 60000 }
      );
    }

    // Deploy to production
    const result = useExpect
      ? execSync(
          `cd "${deployDir}" && expect -c 'spawn npx vercel --yes --prod; expect eof' 2>&1`,
          { encoding: 'utf-8', timeout: 120000 }
        )
      : execSync(
          `cd "${deployDir}" && npx vercel --yes --prod${tokenFlag} 2>&1`,
          { encoding: 'utf-8', timeout: 120000 }
        );

    // Extract URLs from output (strip ANSI codes)
    const clean = result.replace(/\x1b\[[0-9;]*[a-zA-Z]|\[[\d;]*[GHK]|\x1b\[\?25[hl]/g, '');

    // Look for the aliased URL first (cleaner), then production URL
    const aliasMatch = clean.match(/Aliased:\s*(https:\/\/[^\s]+\.vercel\.app)/);
    const prodMatch = clean.match(/Production:\s*(https:\/\/[^\s]+\.vercel\.app)/);
    const deployUrl = aliasMatch ? aliasMatch[1] : (prodMatch ? prodMatch[1] : null);

    console.log(`✅ Deployed successfully!`);
    if (deployUrl) {
      console.log(`🔗 URL: ${deployUrl}`);
    }

    // Clean up deploy dir
    fs.rmSync(deployDir, { recursive: true });

    return deployUrl;
  } catch (err) {
    console.error(`❌ Deployment failed: ${err.message}`);
    if (err.stdout) console.error(err.stdout);
    process.exit(1);
  }
}

function deployAll() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    console.error('❌ No output directory found. Generate proposals first.');
    process.exit(1);
  }

  const files = fs.readdirSync(OUTPUT_DIR).filter(f => f.endsWith('.html'));
  if (files.length === 0) {
    console.error('❌ No proposals found in output directory.');
    process.exit(1);
  }

  console.log(`\n📦 Found ${files.length} proposals to deploy:\n`);
  const results = [];

  for (const file of files) {
    const slug = file.replace('.html', '');
    console.log(`\n━━━ Deploying: ${slug} ━━━`);
    const url = deployToVercel(slug);
    results.push({ slug, url });
  }

  console.log(`\n\n✅ All deployments complete!\n`);
  console.log('━━━ Deployment Summary ━━━');
  for (const r of results) {
    console.log(`  ${r.slug}: ${r.url || 'URL not captured'}`);
  }
}

// CLI
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args[0] === '--all') {
    deployAll();
  } else if (args[0]) {
    deployToVercel(args[0]);
  } else {
    console.log('Usage:');
    console.log('  node deploy.js <slug>      Deploy a single proposal');
    console.log('  node deploy.js --all       Deploy all proposals');
    console.log('');
    console.log('Example:');
    console.log('  node deploy.js base-power');
  }
}

module.exports = { deployToVercel };
