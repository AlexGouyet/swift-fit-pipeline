#!/usr/bin/env node
/**
 * Signal Webhook Server
 *
 * Listens for Linkt signal webhooks (or simulated ones) and triggers
 * the Swift Fit proposal pipeline automatically.
 *
 * Usage:
 *   node signal-webhook.js              # Start webhook server on port 3456
 *   node signal-webhook.js --simulate   # Fire a simulated Base Power signal
 */

const http = require('http');
const https = require('https');
const { execSync } = require('child_process');
const path = require('path');
const { generateProposal } = require('./generate');
const { deployToVercel } = require('./deploy');
const { lookupLead } = require('./linkt');
const { formatCurrency } = require('./pricing-engine');

const PORT = process.env.WEBHOOK_PORT || 3456;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '1938613407';

const SCRIPTS_DIR = path.join(__dirname);

// ===== Telegram Messaging =====
function sendTelegram(chatId, text) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' });
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(body);
          if (result.ok) {
            console.log(`✅ Telegram message sent successfully (chat ${chatId})`);
          } else {
            console.error(`❌ Telegram API error: ${result.description}`);
            // Retry without Markdown if parse fails
            if (result.description && result.description.includes("parse")) {
              console.log('🔄 Retrying without Markdown formatting...');
              const plainData = JSON.stringify({ chat_id: chatId, text: text.replace(/[*_`]/g, '') });
              const retryReq = https.request({
                hostname: 'api.telegram.org',
                path: `/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(plainData) },
              }, (retryRes) => {
                let retryBody = '';
                retryRes.on('data', chunk => retryBody += chunk);
                retryRes.on('end', () => {
                  const retryResult = JSON.parse(retryBody);
                  if (retryResult.ok) {
                    console.log('✅ Telegram retry succeeded (plain text)');
                  } else {
                    console.error('❌ Telegram retry also failed:', retryResult.description);
                  }
                  resolve(retryResult);
                });
              });
              retryReq.on('error', reject);
              retryReq.write(plainData);
              retryReq.end();
              return;
            }
          }
          resolve(result);
        } catch (e) {
          console.error('❌ Failed to parse Telegram response:', body);
          resolve({ ok: false });
        }
      });
    });
    req.on('error', (err) => {
      console.error('❌ Telegram request error:', err.message);
      reject(err);
    });
    req.write(data);
    req.end();
  });
}

// Get the chat ID from recent messages
async function getChatId() {
  return new Promise((resolve, reject) => {
    https.get(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates?limit=5`, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const data = JSON.parse(body);
          if (data.result && data.result.length > 0) {
            // Find the most recent DM chat
            for (const update of data.result.reverse()) {
              const chat = update.message?.chat || update.edited_message?.chat;
              if (chat && chat.type === 'private') {
                resolve(chat.id);
                return;
              }
            }
            // Fallback to any chat
            const chat = data.result[0].message?.chat || data.result[0].edited_message?.chat;
            resolve(chat?.id);
          } else {
            reject(new Error('No Telegram updates found'));
          }
        } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

// ===== Pipeline Execution =====
async function handleSignal(signal) {
  const { company, signal_type, summary, size, event_type } = signal;

  console.log(`\n🔔 SIGNAL RECEIVED: ${signal_type}`);
  console.log(`   Company: ${company}`);
  console.log(`   Summary: ${summary}`);

  // Get Telegram chat ID
  let chatId = TELEGRAM_CHAT_ID;
  if (!chatId) {
    try {
      chatId = await getChatId();
    } catch (e) {
      console.error('Could not get Telegram chat ID:', e.message);
      return;
    }
  }

  // Step 1: Notify on Telegram
  await sendTelegram(chatId,
    `🔥 *New Lead Signal Detected from Linkt.ai*\n\n` +
    `📊 *Signal:* ${signal_type}\n` +
    `🏢 *Company:* ${company}\n` +
    `📝 ${summary}\n\n` +
    `⚡ Generating proposal automatically...`
  );

  // Step 2: Run the proposal pipeline directly (no subprocess)
  try {
    const groupSize = size || 50;
    const eventType = event_type || 'half-day team building';

    console.log(`\n🏗️ Running pipeline: ${company}, ${groupSize} people, ${eventType}`);

    // Build lead data
    const leadData = {
      companyName: company,
      contactName: '',
      contactTitle: '',
      groupSize,
      eventType,
      hours: 2,
    };

    // Linkt enrichment
    try {
      const linktData = await lookupLead(company);
      if (linktData) {
        if (linktData.contacts && linktData.contacts.length > 0) {
          leadData.contactName = linktData.contacts[0].name;
          leadData.contactTitle = linktData.contacts[0].title || '';
        }
        leadData.companyIndustry = linktData.industry;
        leadData.companyEmployees = linktData.employees;
        leadData.companyHQ = linktData.headquarters;
        // Use Google favicon V2 API — reliable, no auth needed
        if (linktData.domain) {
          leadData.companyLogo = `https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${linktData.domain}&size=128`;
        }
        console.log(`✅ Linkt enrichment complete`);
      }
    } catch (err) {
      console.log(`⚠️ Linkt lookup failed: ${err.message}`);
    }

    if (!leadData.contactName) {
      leadData.contactName = 'Team';
    }

    // Generate proposal
    const result = generateProposal(leadData);
    const { proposal, templateData, slug } = result;

    // Deploy to Vercel
    let url = 'URL not captured';
    try {
      url = deployToVercel(slug) || `https://${slug}.vercel.app`;
    } catch (deployErr) {
      console.error('Deploy warning:', deployErr.message);
      url = `https://${slug}.vercel.app`;
    }

    // Build activation list for Telegram
    const coreItems = proposal.lineItems.filter(i => i.tier === 'core');
    const addonItems = proposal.lineItems.filter(i => i.tier === 'addon');
    const optionalItems = proposal.lineItems.filter(i => i.tier === 'optional');

    let activationList = '*📋 Included Activations:*\n';
    coreItems.forEach(item => {
      activationList += `  ✅ ${item.name} — ${formatCurrency(item.lineTotal)}\n`;
    });

    if (addonItems.length > 0) {
      activationList += '\n*🎁 Add-Ons Included:*\n';
      addonItems.forEach(item => {
        activationList += `  🎁 ${item.name} — ${formatCurrency(item.lineTotal)}\n`;
      });
    }

    if (optionalItems.length > 0) {
      activationList += '\n*🚀 Available Upgrades:*\n';
      optionalItems.forEach(item => {
        activationList += `  ⭐ ${item.name} — ${formatCurrency(item.lineTotal)}\n`;
      });
    }

    const total = formatCurrency(proposal.grandTotal);
    const upgrades = optionalItems.length > 0 ? formatCurrency(proposal.grandTotalWithUpgrades) : null;

    // Step 3: Send result to Telegram with full activation breakdown
    await sendTelegram(chatId,
      `✅ *Proposal Ready for ${company}!*\n\n` +
      `👥 ${groupSize} people | ${eventType}\n\n` +
      activationList + `\n` +
      `💰 *Subtotal:* ${formatCurrency(proposal.subtotal)}\n` +
      `📋 *Coordination Fee (15%):* ${formatCurrency(proposal.coordFee)}\n` +
      `💰 *Total Investment:* ${total}` + (upgrades ? `\n🚀 *With All Upgrades:* ${upgrades}` : '') + `\n\n` +
      `🔗 ${url}\n\n` +
      `_Interactive pricing — they can customize the package themselves._`
    );

    return { success: true, url, total };

  } catch (err) {
    console.error('Pipeline failed:', err.message);
    await sendTelegram(chatId,
      `❌ *Pipeline failed for ${company}*\n\n${err.message.substring(0, 200)}`
    );
    return { success: false, error: err.message };
  }
}

// ===== Webhook Server =====
function startServer() {
  const server = http.createServer(async (req, res) => {
    if (req.method === 'POST' && req.url === '/signal') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', async () => {
        try {
          const signal = JSON.parse(body);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'processing', company: signal.company }));

          // Process async (don't block the response)
          handleSignal(signal).catch(console.error);
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid JSON' }));
        }
      });
    } else if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', service: 'swift-fit-signal-webhook' }));
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  });

  server.listen(PORT, () => {
    console.log(`\n🎯 Swift Fit Signal Webhook Server`);
    console.log(`   Listening on port ${PORT}`);
    console.log(`   POST /signal — Receive a Linkt signal`);
    console.log(`   GET  /health — Health check`);
    console.log(`\n   Demo trigger:`);
    console.log(`   curl -X POST http://localhost:${PORT}/signal \\`);
    console.log(`     -H "Content-Type: application/json" \\`);
    console.log(`     -d '{"company":"Base Power","signal_type":"funding","summary":"Base Power closed a $1B Series C led by Andreessen Horowitz, expanding their Austin HQ.","size":50,"event_type":"half-day team building"}'`);
    console.log('');
  });
}

// ===== Simulate Mode =====
async function simulate() {
  console.log('🎭 Simulating Linkt signal for Base Power...\n');

  const signal = {
    company: 'Base Power',
    signal_type: 'funding',
    summary: 'Base Power closed a $1B Series C led by Andreessen Horowitz, expanding their Austin HQ at 205 E Riverside Dr.',
    size: 50,
    event_type: 'half-day team building',
  };

  const result = await handleSignal(signal);
  console.log('\n✅ Simulation complete:', result);
}

// ===== CLI =====
const args = process.argv.slice(2);
if (args.includes('--simulate')) {
  simulate().catch(console.error);
} else {
  startServer();
}
