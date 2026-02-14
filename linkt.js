#!/usr/bin/env node
/**
 * Linkt AI Integration for Swift Fit Events
 * Pulls lead data (company info, contacts) from Linkt API
 */

const https = require('https');
const http = require('http');

const LINKT_API_KEY = process.env.LINKT_API_KEY;
const LINKT_BASE = 'https://api.linkt.ai';

// Generic Linkt API request
function linktRequest(path, params = {}) {
  return new Promise((resolve, reject) => {
    const query = new URLSearchParams(params).toString();
    const url = `${LINKT_BASE}${path}${query ? '?' + query : ''}`;
    const urlObj = new URL(url);

    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: {
        'x-api-key': LINKT_API_KEY,
        'Accept': 'application/json',
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse response: ${data.substring(0, 200)}`));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    req.end();
  });
}

// Search for a company entity in Linkt
async function searchCompany(companyName) {
  const result = await linktRequest('/v1/entity/search', {
    q: companyName,
    entity_type: 'company',
    page_size: 5,
  });

  if (!result.entities || result.entities.length === 0) {
    // Try without entity_type filter
    const fallback = await linktRequest('/v1/entity/search', {
      q: companyName,
      page_size: 5,
    });
    return fallback.entities || [];
  }

  return result.entities;
}

// Extract useful lead data from a Linkt entity
function extractLeadData(entity) {
  const d = entity.data || {};

  // Helper to get display value from Linkt's field format
  const getVal = (field) => {
    if (!field) return null;
    if (typeof field === 'string') return field;
    if (field.display && typeof field.display === 'string') return field.display;
    if (field.value && typeof field.value === 'string') return field.value;
    return null;
  };

  const getObj = (field) => {
    if (!field) return null;
    if (field.value && typeof field.value === 'object') return field.value;
    return null;
  };

  const website = getVal(d.website);
  const domain = website ? new URL(website.startsWith('http') ? website : `https://${website}`).hostname.replace('www.', '') : null;

  // Build logo URL from website domain
  const logoUrl = domain
    ? `https://www.google.com/s2/favicons?domain=${domain}&sz=128`
    : null;

  const hq = getObj(d.headquarters);

  return {
    // Company info
    companyName: getVal(d.name),
    website,
    domain,
    logoUrl,
    industry: getVal(d.industry),
    employees: getVal(d.employees),
    headquarters: hq ? `${hq.city || ''}, ${hq.state || ''}`.trim() : null,
    fullAddress: getVal(d.headquarters),
    linkedin: getObj(d.linkedin)?.url || null,

    // Revenue
    revenue: getObj(d.revenue)?.amount || getVal(d.revenue),

    // Linkt metadata
    entityId: entity.id,
    sheetId: entity.sheet_id,
    status: entity.status,

    // All raw data for debugging
    _raw: d,
  };
}

// Get contacts for a company (child entities)
async function getCompanyContacts(companyEntityId) {
  // Search for entities that are children of this company
  const result = await linktRequest('/v1/entity/search', {
    entity_type: 'person',
    page_size: 10,
  });

  // Filter for contacts that might be linked to this company
  // (Linkt uses parent_id for linking)
  return (result.entities || [])
    .filter(e => e.parent_id === companyEntityId)
    .map(e => {
      const d = e.data || {};
      const getVal = (field) => {
        if (!field) return null;
        if (typeof field === 'string') return field;
        if (field.display && typeof field.display === 'string') return field.display;
        if (field.value && typeof field.value === 'string') return field.value;
        return null;
      };
      return {
        name: getVal(d.name) || getVal(d.full_name),
        title: getVal(d.title) || getVal(d.job_title),
        email: getVal(d.email),
        linkedin: getVal(d.linkedin),
      };
    });
}

// Main function: look up a company and return proposal-ready lead data
async function lookupLead(companyName) {
  console.log(`🔍 Searching Linkt for "${companyName}"...`);

  const entities = await searchCompany(companyName);

  if (entities.length === 0) {
    console.log(`⚠️  No results found in Linkt for "${companyName}"`);
    return null;
  }

  // Find best match (exact or closest name match)
  const bestMatch = entities.find(e =>
    (e.data?.name?.display || '').toLowerCase() === companyName.toLowerCase()
  ) || entities[0];

  const lead = extractLeadData(bestMatch);

  console.log(`✅ Found: ${lead.companyName}`);
  console.log(`   Website:   ${lead.website || 'N/A'}`);
  console.log(`   Industry:  ${lead.industry || 'N/A'}`);
  console.log(`   Employees: ${lead.employees || 'N/A'}`);
  console.log(`   HQ:        ${lead.headquarters || 'N/A'}`);
  console.log(`   Logo:      ${lead.logoUrl || 'N/A'}`);

  // Try to find contacts
  try {
    const contacts = await getCompanyContacts(bestMatch.id);
    if (contacts.length > 0) {
      lead.contacts = contacts;
      console.log(`   Contacts:  ${contacts.length} found`);
      contacts.forEach(c => console.log(`     - ${c.name} (${c.title || 'N/A'})`));
    }
  } catch (e) {
    // Contacts lookup is optional
  }

  return lead;
}

// List all sheets
async function listSheets() {
  const result = await linktRequest('/v1/sheet');
  return result;
}

// CLI
if (require.main === module) {
  const args = process.argv.slice(2);
  const company = args.join(' ') || 'Base Power';

  lookupLead(company).then(lead => {
    if (lead) {
      console.log('\n📋 Full lead data:');
      console.log(JSON.stringify(lead, null, 2));
    }
  }).catch(err => {
    console.error('❌ Error:', err.message);
  });
}

module.exports = { lookupLead, searchCompany, extractLeadData, listSheets };
