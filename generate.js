#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const Handlebars = require('handlebars');
const { loadPricing, recommendActivations, calculateProposal, formatCurrency } = require('./pricing-engine');

// ===== Company Logo Resolution =====

// Known domain map for your target leads + common Austin companies
const KNOWN_DOMAINS = {
  'base power': 'basepowercompany.com',
  'cesiumastro': 'cesiumastro.com',
  'cesium astro': 'cesiumastro.com',
  'apptronik': 'apptronik.com',
  'arm': 'arm.com',
  'arm inc': 'arm.com',
  'arm inc.': 'arm.com',
  'neurophos': 'neurophos.com',
  'compal electronics': 'compal.com',
  'compal': 'compal.com',
  // Add more as needed
};

function guessDomain(companyName) {
  const lower = companyName.toLowerCase().trim();

  // Check known domains first
  if (KNOWN_DOMAINS[lower]) return KNOWN_DOMAINS[lower];

  // Smart domain guessing: strip common suffixes and build .com
  const cleaned = lower
    .replace(/\s*(inc\.?|llc\.?|corp\.?|co\.?|ltd\.?|group|holdings|technologies|technology|tech)\s*$/i, '')
    .trim()
    .replace(/[^a-z0-9]/g, '');

  return `${cleaned}.com`;
}

function getCompanyLogoUrl(companyName, providedLogo) {
  if (providedLogo) return providedLogo;

  const domain = guessDomain(companyName);

  // Use Google's favicon V2 API — reliable, no auth needed, returns real favicons at 128px
  // Falls back via onerror in template to clean initials avatar
  return `https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${domain}&size=128`;
}

function getCompanyLogoWithFallback(companyName, providedLogo) {
  // Returns the logo URL plus a CSS fallback approach in the template
  // The template will use onerror to fall back to initials
  return getCompanyLogoUrl(companyName, providedLogo);
}

// ===== Image mapping for experience categories (Unsplash placeholders) =====
const IMAGE_MAP = {
  // Activations
  'BBQ Spice Dry Rub Bar': 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=600&h=400&fit=crop',
  'Essential Oil Blending Bar': 'https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?w=600&h=400&fit=crop',
  'Cold Therapy Plunge': 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=600&h=400&fit=crop',
  'Chair Massage': 'https://images.unsplash.com/photo-1600334089648-b0d9d3028eb2?w=600&h=400&fit=crop',
  'Compression Therapy': 'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=600&h=400&fit=crop',
  'Ear Seeding': 'https://images.unsplash.com/photo-1552693673-1bf958298935?w=600&h=400&fit=crop',
  'Tarot Card': 'https://images.unsplash.com/photo-1591696331111-ef9586a5b17a?w=600&h=400&fit=crop',
  'Mocktail': 'https://images.unsplash.com/photo-1536935338788-846bb9981813?w=600&h=400&fit=crop',
  'Herbal Tea': 'https://images.unsplash.com/photo-1571934811356-5cc061b6821f?w=600&h=400&fit=crop',
  'Blender Bike': 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=600&h=400&fit=crop',
  'Aura Photography': 'https://images.unsplash.com/photo-1518531933037-91b2f5f229cc?w=600&h=400&fit=crop',
  'Crystal': 'https://images.unsplash.com/photo-1615486511484-92e172cc4fe0?w=600&h=400&fit=crop',

  // Movement
  'Group Fit': 'https://images.unsplash.com/photo-1534258936925-c58bed479fcb?w=600&h=400&fit=crop',
  'Line Dancing': 'https://images.unsplash.com/photo-1504609813442-a8924e83f76e?w=600&h=400&fit=crop',
  'Yoga': 'https://images.unsplash.com/photo-1599901860904-17e6ed7083a0?w=600&h=400&fit=crop',
  'Conference Wellness Break': 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=600&h=400&fit=crop',

  // Excursions & Tours
  'Barton Springs': 'https://images.unsplash.com/photo-1530549387789-4c1017266635?w=600&h=400&fit=crop',
  'Hike': 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=600&h=400&fit=crop',
  'Kayak': 'https://images.unsplash.com/photo-1570710891163-6d3b5c47248b?w=600&h=400&fit=crop',
  'Paddleboard': 'https://images.unsplash.com/photo-1526188717906-ab4a2f949f1d?w=600&h=400&fit=crop',
  'Bike Tour': 'https://images.unsplash.com/photo-1541625602330-2277a4c46182?w=600&h=400&fit=crop',
  'Running': 'https://images.unsplash.com/photo-1552674605-db6ffd4facb5?w=600&h=400&fit=crop',
  'Walking Tour': 'https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?w=600&h=400&fit=crop',
  'Run Club': 'https://images.unsplash.com/photo-1552674605-db6ffd4facb5?w=600&h=400&fit=crop',

  // Fun Runs
  'Fun Run': 'https://images.unsplash.com/photo-1594882645126-14020914d58d?w=600&h=400&fit=crop',
  'Competitive Race': 'https://images.unsplash.com/photo-1594882645126-14020914d58d?w=600&h=400&fit=crop',
  'Speed Networking': 'https://images.unsplash.com/photo-1515187029135-18ee286d815b?w=600&h=400&fit=crop',

  // Add-ons
  'Smoothie': 'https://images.unsplash.com/photo-1505252585461-04db1eb84625?w=600&h=400&fit=crop',
  'Grab & Go': 'https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=600&h=400&fit=crop',
  'Hydration': 'https://images.unsplash.com/photo-1548839140-29a749e1cf4d?w=600&h=400&fit=crop',
  'Towel': 'https://images.unsplash.com/photo-1600334089648-b0d9d3028eb2?w=600&h=400&fit=crop',
  'Eye Pillow': 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=600&h=400&fit=crop',
  'Medals': 'https://images.unsplash.com/photo-1569517282132-25d22f4573e6?w=600&h=400&fit=crop',
  'DJ': 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=600&h=400&fit=crop',
  'Breakfast': 'https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=600&h=400&fit=crop',
  'Snack': 'https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=600&h=400&fit=crop',
  'Juice': 'https://images.unsplash.com/photo-1622597467836-f3285f2131b8?w=600&h=400&fit=crop',

  // Workshops
  'Essential Oil Masterclass': 'https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?w=600&h=400&fit=crop',
  'Gua Sha': 'https://images.unsplash.com/photo-1552693673-1bf958298935?w=600&h=400&fit=crop',
  'Body Scrub': 'https://images.unsplash.com/photo-1552693673-1bf958298935?w=600&h=400&fit=crop',
  'Lip Scrub': 'https://images.unsplash.com/photo-1552693673-1bf958298935?w=600&h=400&fit=crop',

  // Default
  'default': 'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=600&h=400&fit=crop',
};

// Description map for experience cards
const DESC_MAP = {
  'BBQ Spice Dry Rub Bar': 'Craft custom BBQ spice blends in an interactive bar — a quintessential Austin experience your team will love.',
  'Essential Oil Blending Bar': 'Create personalized aromatherapy roller bottles or diffusers with premium essential oils and expert guidance.',
  'Cold Therapy Plunge': 'Invigorating cold plunge experience with guided breathwork — the ultimate team bonding challenge.',
  'Chair Massage': 'Professional chair massage stations for deep relaxation between activities.',
  'Compression Therapy': 'Recovery-focused compression therapy chairs to refresh and rejuvenate your team.',
  'Ear Seeding': 'Ancient acupressure technique applied with modern style — therapeutic and Instagram-worthy.',
  'Group Fit': 'High-energy group fitness class tailored to all levels — from HIIT to yoga to dance.',
  'Running': 'Guided running tour through Austin\'s most scenic routes — connecting teammates mile by mile.',
  'Walking Tour': 'Explore Austin\'s hidden gems on a guided walking experience designed for connection.',
  'Barton Springs': 'Hike through the greenbelt and plunge into Barton Springs\' legendary 68-degree waters.',
  'Kayak': 'Paddle Lady Bird Lake together as a team with expert guides leading the way.',
  'Paddleboard': 'Stand-up paddleboard adventure on Lady Bird Lake with options for yoga or sound bath.',
  'Fun Run': 'A fully-produced 5K fun run experience with route, bibs, hydration stations, and finish line energy.',
  'Grab & Go Hydration': 'Premium hydration station with electrolytes and refreshments to keep your team fueled.',
  'Grab & Go Breakfast': 'Nourishing grab-and-go breakfast spread to kick off your experience right.',
  'Smoothie': 'Fresh, made-to-order smoothies blended on-site for a healthy, delicious refuel.',
  'Towel': 'Chilled essential oil-infused towels for a refreshing cool-down.',
  'Eye Pillow': 'Lavender-infused eye pillows for guided meditation and deep relaxation moments.',
  'Herbal Tea': 'Artisan herbal tea blending bar where your team crafts custom loose-leaf blends.',
  'Mocktail': 'Craft mocktail pop-up bar with mixologist service — wellness meets celebration.',
  'Line Dancing': 'Get your boots movin\' with a high-energy line dancing or two-step class — pure Austin fun.',
  'Essential Oil Masterclass': 'Deep-dive masterclass into essential oils — learn blending, benefits, and take home custom creations.',
  'Gua Sha': 'Expert-led facial skincare and gua sha masterclass — self-care your team won\'t forget.',
  'Bike Tour': 'Cruise Austin on two wheels with a guided bike tour hitting the best spots in the city.',
  'Speed Networking': 'Structured speed networking that turns strangers into connections in minutes.',
  'default': 'A curated wellness activation designed to energize and connect your team.',
};

function getImageForItem(itemName) {
  for (const [key, url] of Object.entries(IMAGE_MAP)) {
    if (itemName.toLowerCase().includes(key.toLowerCase())) return url;
  }
  return IMAGE_MAP['default'];
}

function getDescForItem(itemName) {
  for (const [key, desc] of Object.entries(DESC_MAP)) {
    if (itemName.toLowerCase().includes(key.toLowerCase())) return desc;
  }
  return DESC_MAP['default'];
}

// ===== Swift Fit Logo (embedded as data URI for reliable loading) =====
function getSwiftLogoDataUri() {
  const svgPath = path.join(__dirname, 'assets', 'swift-logo.svg');
  if (fs.existsSync(svgPath)) {
    const svg = fs.readFileSync(svgPath);
    return 'data:image/svg+xml;base64,' + svg.toString('base64');
  }
  // Fallback to text avatar
  return 'https://ui-avatars.com/api/?name=Swift+Fit&size=200&background=E8652D&color=fff&bold=true&format=png';
}

// Cache it once at module load
const SWIFT_LOGO_DATA_URI = getSwiftLogoDataUri();

// ===== Handlebars Helpers =====
Handlebars.registerHelper('if', function(conditional, options) {
  if (conditional) return options.fn(this);
  return options.inverse(this);
});

// ===== Main Generator =====
function generateProposal(leadData) {
  // Load pricing and generate recommendations
  const items = loadPricing();
  const recommendations = recommendActivations(items, leadData.groupSize, leadData.eventType);
  const proposal = calculateProposal(recommendations, leadData.groupSize, leadData.hours || 2);

  // Enhance line items with images and descriptions
  const enrichedItems = proposal.lineItems.map(item => ({
    ...item,
    image: getImageForItem(item.name),
    description: getDescForItem(item.name),
    formattedTotal: formatCurrency(item.lineTotal),
    unitPrice: item.price,
    qty: item.quantity,
  }));

  // Split by tier
  const coreItems = enrichedItems.filter(i => i.tier === 'core');
  const addonItems = enrichedItems.filter(i => i.tier === 'addon');
  const optionalItems = enrichedItems.filter(i => i.tier === 'optional');

  // Template data
  const templateData = {
    // Company info
    companyName: leadData.companyName,
    companyLogo: getCompanyLogoUrl(leadData.companyName, leadData.companyLogo),
    companyLogoFallback: `https://ui-avatars.com/api/?name=${encodeURIComponent(leadData.companyName)}&size=200&background=1A1A2E&color=fff&bold=true&format=png`,
    swiftLogo: leadData.swiftLogo || SWIFT_LOGO_DATA_URI,

    // Contact info
    contactName: leadData.contactName,
    contactFirstName: leadData.contactName.split(' ')[0],
    contactTitle: leadData.contactTitle || '',

    // Event info
    groupSize: leadData.groupSize,
    eventType: leadData.eventType,
    proposalDate: leadData.proposalDate || new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),

    // Hero image
    heroImage: leadData.heroImage || 'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=1600&h=900&fit=crop',

    // Experience cards
    coreItems,
    addonItems,
    optionalItems,

    // Line items for investment section
    coreLineItems: coreItems,
    addonLineItems: addonItems,
    optionalLineItems: optionalItems,

    // Totals
    subtotal: formatCurrency(proposal.subtotal),
    coordFee: formatCurrency(proposal.coordFee),
    grandTotal: formatCurrency(proposal.grandTotal),
    grandTotalWithUpgrades: formatCurrency(proposal.grandTotalWithUpgrades),
    hasOptional: optionalItems.length > 0,
  };

  // Compile and render template
  const templatePath = path.join(__dirname, 'template.html');
  const templateSource = fs.readFileSync(templatePath, 'utf-8');
  const template = Handlebars.compile(templateSource);
  const html = template(templateData);

  // Write output
  const slug = leadData.companyName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '');
  const outputDir = path.join(__dirname, 'output');
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const outputPath = path.join(outputDir, `${slug}.html`);
  fs.writeFileSync(outputPath, html, 'utf-8');

  console.log(`\n✅ Proposal generated: ${outputPath}`);
  console.log(`\n📊 Summary:`);
  console.log(`   Company:    ${leadData.companyName}`);
  console.log(`   Contact:    ${leadData.contactName} (${leadData.contactTitle || 'N/A'})`);
  console.log(`   Team Size:  ${leadData.groupSize} people`);
  console.log(`   Event Type: ${leadData.eventType}`);
  console.log(`   Core:       ${formatCurrency(proposal.coreTotal)} (${coreItems.length} activations)`);
  console.log(`   Add-ons:    ${formatCurrency(proposal.addonTotal)} (${addonItems.length} items)`);
  console.log(`   Upgrades:   ${formatCurrency(proposal.optionalTotal)} (${optionalItems.length} optional)`);
  console.log(`   Coord Fee:  ${formatCurrency(proposal.coordFee)} (15%)`);
  console.log(`   ─────────────────────────`);
  console.log(`   💰 TOTAL:   ${formatCurrency(proposal.grandTotal)}`);
  if (optionalItems.length > 0) {
    console.log(`   🚀 W/ Upgrades: ${formatCurrency(proposal.grandTotalWithUpgrades)}`);
  }
  console.log(`\n🔗 Deploy URL: swiftfit.vercel.app/${slug}`);
  console.log('');

  return {
    html,
    outputPath,
    slug,
    proposal,
    templateData,
  };
}

// ===== CLI Interface =====
if (require.main === module) {
  // Parse CLI args or use defaults for testing
  const args = process.argv.slice(2);

  if (args.length === 0) {
    // Demo mode — generate Base Power proposal
    console.log('🚀 Swift Fit Events — Proposal Generator');
    console.log('   Running in demo mode (Base Power)\n');

    generateProposal({
      companyName: 'Base Power',
      contactName: 'Jordan Mitchell',
      contactTitle: 'Chief People Officer',
      groupSize: 50,
      eventType: 'Half-Day Team Building',
      hours: 2,
    });
  } else if (args[0] === '--json') {
    // JSON input mode
    const input = JSON.parse(args[1] || fs.readFileSync('/dev/stdin', 'utf-8'));
    const result = generateProposal(input);
    // Output result as JSON for programmatic use
    console.log(JSON.stringify({
      slug: result.slug,
      outputPath: result.outputPath,
      grandTotal: result.proposal.grandTotal,
      summary: result.templateData,
    }));
  } else {
    // Named args mode: --company "Base Power" --contact "Jane Doe" --title "CPO" --size 50 --type "half-day team building"
    const parsed = {};
    for (let i = 0; i < args.length; i += 2) {
      const key = args[i].replace('--', '');
      const val = args[i + 1];
      parsed[key] = val;
    }

    generateProposal({
      companyName: parsed.company || 'Demo Company',
      contactName: parsed.contact || 'Jane Doe',
      contactTitle: parsed.title || '',
      groupSize: parseInt(parsed.size) || 50,
      eventType: parsed.type || 'Half-Day Team Building',
      hours: parseInt(parsed.hours) || 2,
    });
  }
}

module.exports = { generateProposal };
