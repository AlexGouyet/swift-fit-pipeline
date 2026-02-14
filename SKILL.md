---
name: swift-fit-proposals
description: Generate and deploy personalized corporate wellness proposals for Swift Fit Events. Use when the user asks to build, create, or send a proposal for a company. Extracts company name, contact info, group size, and event type from the message, generates a co-branded landing page with pricing, and deploys it to Vercel.
---

# Swift Fit Proposals

Generate personalized corporate wellness proposals for Swift Fit Events and deploy them as live landing pages.

## When to use this skill

Use this skill when the user says things like:
- "Build a proposal for Base Power, 50 people, half-day team building"
- "Send something to Jordan at Base Power for 50 people"
- "Create a proposal for Arm Inc, 100 people, full-day wellness"
- "Make a landing page for [company]"

## How it works

1. Parse the user's message to extract: **company name**, **contact name** (optional), **contact title** (optional), **group size**, and **event type**
2. The pipeline automatically enriches the lead via **Linkt AI** (company info, industry, HQ, employee count, revenue)
3. Matches the group to recommended activations from the Swift Fit pricing catalog (146 SKUs)
4. Generates a beautiful co-branded landing page with personalized intro, experience cards, investment summary, social proof, and CTA
5. Deploys to Vercel at a unique URL (e.g. `base-power.vercel.app`)

## Running the pipeline

```bash
cd /data/.openclaw/workspace/skills/swift-fit-proposals/scripts
node proposal.js \
  --company "Company Name" \
  --contact "Contact Name" \
  --title "Their Title" \
  --size 50 \
  --type "half-day team building"
```

> The VERCEL_TOKEN and LINKT_API_KEY environment variables are already set in the container.

### Required parameters
- `--company` — Company name (e.g. "Base Power")
- `--size` — Number of people (e.g. 50)
- `--type` — Event type preset. One of:
  - `"half-day team building"` — 3-4 hour team building session
  - `"full-day team building"` — Full 6-8 hour experience
  - `"wellness day"` — Mindfulness, yoga, breathwork focus
  - `"fun run"` — Running/fitness event
  - `"outdoor adventure"` — Outdoor activities and excursions
  - `"workshop"` — Educational wellness workshop

### Optional parameters
- `--contact` — Contact person's name (default: "Team")
- `--title` — Contact's job title (default: "")
- `--no-deploy` — Generate only, don't deploy to Vercel
- `--no-linkt` — Skip Linkt enrichment
- `--json` — Output result as JSON

## What to reply to the user

IMPORTANT: After running the pipeline, relay the ENTIRE output from the "TELEGRAM REPLY" section back to the user. This includes every single activation, add-on, and upgrade with pricing. Do NOT summarize — copy the full output verbatim. The output will contain:

1. Company name, contact, team size, event type
2. ALL included activations with individual prices
3. ALL add-ons with individual prices
4. ALL available upgrades with individual prices
5. Subtotal, coordination fee, total investment, and total with upgrades
6. The Vercel URL
7. The note about interactive pricing

Just relay everything from the pipeline output after "TELEGRAM REPLY:" back to the user exactly as printed. Do not shorten or summarize it.

## Defaults and assumptions

- If the user doesn't specify group size, ask them
- If the user doesn't specify event type, default to `"half-day team building"`
- If the user doesn't give a contact name, use `"Team"` as the contact
- Company logos are auto-resolved via Google Favicon V2 API (no auth required)
- Linkt enrichment happens automatically (pulls industry, HQ, employee count, etc.)

## Files

- `scripts/proposal.js` — Main pipeline (Linkt enrich -> generate -> deploy)
- `scripts/generate.js` — HTML proposal generator
- `scripts/deploy.js` — Vercel deployment
- `scripts/linkt.js` — Linkt AI integration
- `scripts/pricing-engine.js` — Pricing catalog and recommendation engine
- `scripts/template.html` — Handlebars HTML template
- `scripts/pricing.csv` — 146-SKU pricing catalog
