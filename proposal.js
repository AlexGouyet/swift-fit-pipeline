#!/usr/bin/env node
/**
 * Swift Fit Events — Proposal Pipeline
 *
 * All-in-one: Linkt lookup + generate proposal + deploy to Vercel
 *
 * Usage:
 *   node proposal.js --company "Base Power" --contact "Jordan Mitchell" --title "CPO" --size 50 --type "half-day team building"
 *
 *   # Auto-enriches from Linkt — contact/title are optional if Linkt has them
 *   node proposal.js --company "Base Power" --size 50 --type "half-day team building"
 *
 *   echo '{"companyName":"Base Power","groupSize":50,"eventType":"half-day team building"}' | node proposal.js --json -
 */

const { generateProposal } = require('./generate');
const { deployToVercel } = require('./deploy');
const { lookupLead } = require('./linkt');

async function run() {
  const args = process.argv.slice(2);
  let leadData;

  if (args[0] === '--json') {
    // JSON input (from stdin or arg)
    const fs = require('fs');
    const input = args[1] === '-'
      ? fs.readFileSync('/dev/stdin', 'utf-8')
      : args[1];
    leadData = JSON.parse(input);
  } else {
    // Parse named args
    const parsed = {};
    for (let i = 0; i < args.length; i += 2) {
      const key = args[i].replace('--', '');
      const val = args[i + 1];
      parsed[key] = val;
    }

    leadData = {
      companyName: parsed.company,
      contactName: parsed.contact || '',
      contactTitle: parsed.title || '',
      groupSize: parseInt(parsed.size) || 50,
      eventType: parsed.type || 'Half-Day Team Building',
      hours: parseInt(parsed.hours) || 2,
      companyLogo: parsed.logo || undefined,
    };
  }

  if (!leadData.companyName) {
    console.error('❌ Required: --company (or JSON with companyName)');
    process.exit(1);
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🏃 SWIFT FIT EVENTS — PROPOSAL PIPELINE');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Step 0: Enrich from Linkt
  const skipLinkt = args.includes('--no-linkt');
  if (!skipLinkt) {
    console.log('━━━ LINKT ENRICHMENT ━━━\n');
    try {
      const linktData = await lookupLead(leadData.companyName);
      if (linktData) {
        // Merge Linkt data — user-provided values take precedence
        if (!leadData.companyLogo && linktData.logoUrl) {
          leadData.companyLogo = linktData.logoUrl;
        }
        if (!leadData.contactName && linktData.contacts && linktData.contacts.length > 0) {
          leadData.contactName = linktData.contacts[0].name;
          leadData.contactTitle = leadData.contactTitle || linktData.contacts[0].title || '';
        }
        // Store enriched company info for the template
        leadData.companyIndustry = linktData.industry;
        leadData.companyEmployees = linktData.employees;
        leadData.companyHQ = linktData.headquarters;
        leadData.companyWebsite = linktData.website;
        leadData.companyLinkedin = linktData.linkedin;
        leadData.companyRevenue = linktData.revenue;
        // Use Google favicon V2 API — reliable, no auth needed
        if (!leadData.companyLogo && linktData.domain) {
          leadData.companyLogo = `https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${linktData.domain}&size=128`;
        }
        console.log('');
      }
    } catch (err) {
      console.log(`⚠️  Linkt lookup failed: ${err.message}. Proceeding without enrichment.\n`);
    }
  }

  // Ensure we have a contact name (required for the template)
  if (!leadData.contactName) {
    leadData.contactName = 'Team';
    leadData.contactTitle = leadData.contactTitle || '';
  }

  // Step 1: Generate
  console.log('━━━ GENERATING PROPOSAL ━━━\n');
  const result = generateProposal(leadData);

  // Step 2: Deploy (if --deploy flag or --no-deploy not set)
  const shouldDeploy = !args.includes('--no-deploy');

  if (shouldDeploy) {
    console.log('\n━━━ DEPLOYING TO VERCEL ━━━\n');
    try {
      const url = deployToVercel(result.slug);

      const { formatCurrency } = require('./pricing-engine');

      // Build full activation breakdown
      const coreItems = result.proposal.lineItems.filter(i => i.tier === 'core');
      const addonItems = result.proposal.lineItems.filter(i => i.tier === 'addon');
      const optionalItems = result.proposal.lineItems.filter(i => i.tier === 'optional');

      // Final summary for Telegram response
      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📱 TELEGRAM REPLY:');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`\n✅ Proposal ready for ${leadData.companyName}!`);
      console.log(`👤 ${leadData.contactName} (${leadData.contactTitle})`);
      console.log(`👥 ${leadData.groupSize} people | ${leadData.eventType}`);
      console.log('');
      console.log('📋 Included Activations:');
      coreItems.forEach(item => {
        console.log(`  ✅ ${item.name} — ${formatCurrency(item.lineTotal)}`);
      });
      if (addonItems.length > 0) {
        console.log('');
        console.log('🎁 Add-Ons Included:');
        addonItems.forEach(item => {
          console.log(`  🎁 ${item.name} — ${formatCurrency(item.lineTotal)}`);
        });
      }
      if (optionalItems.length > 0) {
        console.log('');
        console.log('🚀 Available Upgrades:');
        optionalItems.forEach(item => {
          console.log(`  ⭐ ${item.name} — ${formatCurrency(item.lineTotal)}`);
        });
      }
      console.log('');
      console.log(`💰 Subtotal: ${formatCurrency(result.proposal.subtotal)}`);
      console.log(`📋 Coordination Fee (15%): ${formatCurrency(result.proposal.coordFee)}`);
      console.log(`💰 Total Investment: ${formatCurrency(result.proposal.grandTotal)}`);
      if (optionalItems.length > 0) {
        console.log(`🚀 With All Upgrades: ${formatCurrency(result.proposal.grandTotalWithUpgrades)}`);
      }
      console.log(`🔗 ${url || `https://${result.slug}.vercel.app`}`);
      console.log(`\n_Interactive pricing — they can customize the package themselves._`);
    } catch (err) {
      console.log(`\n⚠️  Deploy skipped (Vercel CLI not configured). HTML saved locally.`);
      console.log(`📄 File: ${result.outputPath}`);
    }
  } else {
    console.log(`\n📄 Proposal saved: ${result.outputPath}`);
    console.log(`   To deploy: node deploy.js ${result.slug}`);
  }

  return result;
}

run().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
