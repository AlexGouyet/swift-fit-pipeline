const fs = require('fs');
const path = require('path');

// Parse the CSV pricing data
function parsePricingCSV(csvPath) {
  const raw = fs.readFileSync(csvPath, 'utf-8');
  const lines = raw.split('\n');
  const header = lines[0].split(',');

  const items = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    // Parse CSV respecting quoted fields
    const fields = parseCSVLine(line);
    const active = fields[0] === 'TRUE';
    if (!active) continue;

    const item = {
      sku: (fields[4] || '').trim(),
      department: (fields[5] || '').trim(),
      category: (fields[6] || '').trim(),
      name: (fields[7] || '').trim(),
      unit: (fields[8] || '').trim(),
      baseMinimums: (fields[9] || '').trim(),
      baseCost: parseMoney(fields[10]),
      clientPrice: parseMoney(fields[13]),
      notes: (fields[15] || '').trim(),
      clientPrice2026: parseMoney(fields[16]),
    };

    // Use 2026 price if available, otherwise fall back to client price
    item.price = item.clientPrice2026 || item.clientPrice || 0;

    if (item.name) items.push(item);
  }

  return items;
}

function parseCSVLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      fields.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

function parseMoney(str) {
  if (!str) return 0;
  const cleaned = str.replace(/[$,"]/g, '').trim();
  const val = parseFloat(cleaned);
  return isNaN(val) ? 0 : val;
}

// Categorize items for easier recommendation
function categorizeItems(items) {
  const categories = {};
  for (const item of items) {
    if (!categories[item.category]) {
      categories[item.category] = [];
    }
    categories[item.category].push(item);
  }
  return categories;
}

// Find the right tier for a tiered item based on group size
function findTieredItem(items, baseName, groupSize) {
  // Filter items that match the base name pattern
  const matching = items.filter(i => i.name.startsWith(baseName));
  if (matching.length === 0) return null;

  // Sort by base minimums (descending) and find the right tier
  const tiered = matching
    .map(i => ({
      ...i,
      minSize: parseInt(i.baseMinimums) || 0
    }))
    .sort((a, b) => b.minSize - a.minSize);

  // Find the tier where groupSize >= minSize
  for (const tier of tiered) {
    if (groupSize >= tier.minSize) return tier;
  }

  // If group is smaller than all tiers, return smallest tier
  return tiered[tiered.length - 1];
}

// Recommend activations based on event type and group size
function recommendActivations(items, groupSize, eventType) {
  const recommendations = [];

  // Event type presets
  const presets = {
    'half-day team building': {
      core: [
        { search: 'Group Fit Class', category: 'Onsite & Offsite Movement' },
        { search: 'Essential Oil Blending Bar', category: 'Onsite & Offsite Activations' },
        { search: 'BBQ Spice Dry Rub Bar', category: 'Onsite & Offsite Activations' },
      ],
      addons: [
        { search: 'Grab & Go Hydration', category: 'Add-ons & Enhancements' },
        { search: 'Chilled Essential Oil Towel', category: 'Add-ons & Enhancements' },
      ],
      optional: [
        { search: 'Cold Therapy Plunge', category: 'Onsite & Offsite Activations' },
        { search: 'Chair Massage', category: 'Onsite & Offsite Activations' },
      ]
    },
    'full-day team building': {
      core: [
        { search: 'Group Fit Class', category: 'Onsite & Offsite Movement' },
        { search: 'Running & Walking Tour', category: 'Excursions & Tours' },
        { search: 'Essential Oil Blending Bar', category: 'Onsite & Offsite Activations' },
        { search: 'BBQ Spice Dry Rub Bar', category: 'Onsite & Offsite Activations' },
      ],
      addons: [
        { search: 'Grab & Go Breakfast', category: 'Add-ons & Enhancements' },
        { search: 'Grab & Go Hydration', category: 'Add-ons & Enhancements' },
        { search: 'Fresh Smoothie', category: 'Add-ons & Enhancements' },
      ],
      optional: [
        { search: 'Cold Therapy Plunge', category: 'Onsite & Offsite Activations' },
        { search: 'Chair Massage', category: 'Onsite & Offsite Activations' },
        { search: 'Mocktail Pop-Up', category: 'Onsite & Offsite Activations' },
      ]
    },
    'wellness day': {
      core: [
        { search: 'Chair Massage', category: 'Onsite & Offsite Activations' },
        { search: 'Essential Oil Blending Bar', category: 'Onsite & Offsite Activations' },
        { search: 'Compression Therapy', category: 'Onsite & Offsite Activations' },
      ],
      addons: [
        { search: 'Grab & Go Hydration', category: 'Add-ons & Enhancements' },
        { search: 'Lavender Eye Pillows', category: 'Add-ons & Enhancements' },
        { search: 'Chilled Essential Oil Towel', category: 'Add-ons & Enhancements' },
      ],
      optional: [
        { search: 'Cold Therapy Plunge', category: 'Onsite & Offsite Activations' },
        { search: 'Ear Seeding', category: 'Onsite & Offsite Activations' },
        { search: 'Tarot Card', category: 'Onsite & Offsite Activations' },
      ]
    },
    'fun run': {
      core: [
        { search: 'Fun Run & Walk 5K', category: 'Fun Runs & Walks' },
      ],
      addons: [
        { search: 'Bibs (Customized)', category: 'Add-ons & Enhancements' },
        { search: 'Medals', category: 'Add-ons & Enhancements' },
        { search: 'Grab & Go Hydration', category: 'Add-ons & Enhancements' },
      ],
      optional: [
        { search: 'Post- Race Recovery', category: 'Add-ons & Enhancements' },
        { search: 'Start/Finish Truss', category: 'Add-ons & Enhancements' },
        { search: 'DJ / Live Music', category: 'Add-ons & Enhancements' },
      ]
    },
    'outdoor adventure': {
      core: [
        { search: 'Barton Springs Hike & Plunge', category: 'Excursions & Tours' },
        { search: 'Kayak', category: 'Excursions & Tours' },
      ],
      addons: [
        { search: 'Grab & Go Hydration', category: 'Add-ons & Enhancements' },
        { search: 'Grab & Go Nourishing Snack', category: 'Add-ons & Enhancements' },
      ],
      optional: [
        { search: 'Running & Walking Tour', category: 'Excursions & Tours' },
        { search: 'Electric Bike Tour', category: 'Excursions & Tours' },
      ]
    },
    'workshop': {
      core: [
        { search: 'Essential Oil Masterclass', category: 'Workshops & Masterclasses' },
      ],
      addons: [
        { search: 'Herbal Tea Blending Bar', category: 'Onsite & Offsite Activations' },
        { search: 'Grab & Go Hydration', category: 'Add-ons & Enhancements' },
      ],
      optional: [
        { search: 'Gua Sha', category: 'Workshops & Masterclasses' },
        { search: 'Chair Massage', category: 'Onsite & Offsite Activations' },
      ]
    },
  };

  // Normalize event type
  const normalizedType = eventType.toLowerCase().trim();
  let preset = null;
  for (const [key, val] of Object.entries(presets)) {
    if (normalizedType.includes(key) || key.includes(normalizedType)) {
      preset = val;
      break;
    }
  }

  // Default to half-day team building if no match
  if (!preset) preset = presets['half-day team building'];

  // Find matching items for each recommendation
  function findBestMatch(searchTerm, items, groupSize) {
    // First try to find tiered items
    const matching = items.filter(i =>
      i.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (matching.length === 0) return null;

    // For tiered items, find the right size bracket
    if (matching.length > 1) {
      // Sort by min size descending
      const tiered = matching
        .map(i => ({ ...i, minSize: parseInt(i.baseMinimums) || 0 }))
        .sort((a, b) => b.minSize - a.minSize);

      for (const tier of tiered) {
        if (groupSize >= tier.minSize) return tier;
      }
      return tiered[tiered.length - 1];
    }

    return matching[0];
  }

  // Build recommendations
  for (const spec of preset.core) {
    const match = findBestMatch(spec.search, items, groupSize);
    if (match) {
      recommendations.push({
        ...match,
        tier: 'core',
        tierLabel: 'Recommended',
      });
    }
  }

  for (const spec of preset.addons) {
    const match = findBestMatch(spec.search, items, groupSize);
    if (match) {
      recommendations.push({
        ...match,
        tier: 'addon',
        tierLabel: 'Included Add-on',
      });
    }
  }

  for (const spec of preset.optional) {
    const match = findBestMatch(spec.search, items, groupSize);
    if (match) {
      recommendations.push({
        ...match,
        tier: 'optional',
        tierLabel: 'Premium Upgrade',
      });
    }
  }

  return recommendations;
}

// Calculate total pricing for a proposal
function calculateProposal(recommendations, groupSize, hours = 2) {
  let coreTotal = 0;
  let addonTotal = 0;
  let optionalTotal = 0;

  const lineItems = recommendations.map(item => {
    let quantity, lineTotal, displayUnit;

    if (item.unit === 'Per Person') {
      quantity = groupSize;
      lineTotal = item.price * groupSize;
      displayUnit = `${groupSize} people × $${item.price.toFixed(2)}`;
    } else if (item.unit === 'Per Hour') {
      quantity = hours;
      lineTotal = item.price * hours;
      displayUnit = `${hours} hours × $${item.price.toFixed(2)}`;
    } else {
      // Flat fee
      quantity = 1;
      lineTotal = item.price;
      displayUnit = 'Flat fee';
    }

    if (item.tier === 'core') coreTotal += lineTotal;
    else if (item.tier === 'addon') addonTotal += lineTotal;
    else optionalTotal += lineTotal;

    return {
      name: item.name,
      category: item.category,
      unit: item.unit,
      price: item.price,
      quantity,
      lineTotal,
      displayUnit,
      tier: item.tier,
      tierLabel: item.tierLabel,
      notes: item.notes,
    };
  });

  // Add event coordination fee
  const coordFee = calculateCoordinationFee(coreTotal + addonTotal);

  return {
    lineItems,
    coreTotal,
    addonTotal,
    optionalTotal,
    coordFee,
    subtotal: coreTotal + addonTotal,
    grandTotal: coreTotal + addonTotal + coordFee,
    grandTotalWithUpgrades: coreTotal + addonTotal + optionalTotal + coordFee,
    groupSize,
    hours,
  };
}

function calculateCoordinationFee(subtotal) {
  // 15% event coordination fee
  return Math.round(subtotal * 0.15);
}

// Format currency
function formatCurrency(amount) {
  return '$' + amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

// Main export
function loadPricing() {
  const csvPath = path.join(__dirname, 'pricing.csv');
  return parsePricingCSV(csvPath);
}

module.exports = {
  loadPricing,
  parsePricingCSV,
  categorizeItems,
  recommendActivations,
  calculateProposal,
  formatCurrency,
  findTieredItem,
};
