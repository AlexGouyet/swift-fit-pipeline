# Swift Fit AI Sales Pipeline — 🏆 Moltathon ATX 2025

**Winner, Sales Molty Award** — Best AI-powered sales tool at Moltathon ATX 2025.

## Demo

[![Automated Proposal Creation for Corporate Wellness Events](https://cdn.loom.com/sessions/thumbnails/770f552c35b645fd87a88579e30f035e-800c0b9d8afd4035.gif)](https://www.loom.com/share/770f552c35b645fd87a88579e30f035e)

*Full pipeline demo: lead signal detected → enrichment → pricing → interactive proposal deployed → Telegram alert. 13 seconds end-to-end.*

---

An end-to-end AI-powered sales pipeline that detects corporate lead signals, auto-generates personalized proposals with interactive pricing, and delivers them via Telegram -- all in under 30 seconds.

Built for [Swift Fit Events](https://swiftfitevents.com), an Austin-based corporate wellness company. Built solo in ~6 hours.

---

## The Problem

Corporate wellness sales is slow. A rep spots a funding round or office expansion on LinkedIn, manually researches the company, builds a proposal in Canva, emails it as a PDF, and hopes for the best. The whole cycle takes days and the proposal is static -- no way for the prospect to explore pricing or customize their package.

## The Solution

We replaced that entire workflow with an AI pipeline that runs autonomously:

```
Linkt AI Signal  -->  Webhook  -->  Enrich + Price  -->  Deploy Landing Page  -->  Telegram Alert
    (2 sec)           (instant)       (3 sec)              (8 sec)                  (instant)
```

A corporate lead signal fires. 13 seconds later, the sales rep has a Telegram message with a live URL to a fully personalized, interactive proposal.

---

## Architecture

```
                         +------------------+
                         |   Linkt AI API   |
                         |  (Lead Signals)  |
                         +--------+---------+
                                  |
                          webhook POST /signal
                                  |
                                  v
+------------------+    +-------------------+    +------------------+
|   Telegram Bot   |<---|  Signal Webhook   |--->|  Linkt Enrichment|
|  (Notifications) |    |  (Node.js HTTP)   |    |  (Company Intel) |
+------------------+    +--------+----------+    +------------------+
                                  |
                                  v
                        +-------------------+
                        |  Pricing Engine   |
                        | (146-SKU Catalog) |
                        +--------+----------+
                                  |
                                  v
                        +-------------------+
                        | Proposal Generator|
                        | (Handlebars HTML) |
                        +--------+----------+
                                  |
                                  v
                        +-------------------+    +------------------+
                        |   Vercel Deploy   |--->|  Live Landing    |
                        |   (Vercel CLI)    |    |  Page (HTTPS)    |
                        +-------------------+    +------------------+
```

### Dual Trigger Paths

| Path | Trigger | Flow |
|------|---------|------|
| **Webhook (Automated)** | Linkt AI detects a signal (funding round, hiring surge, office move) | Signal webhook receives POST --> runs full pipeline --> sends Telegram alert with proposal URL |
| **Conversational (On-Demand)** | Sales rep messages Telegram bot: *"Build a proposal for Tesla, 80 people"* | OpenClaw AI agent parses intent --> runs proposal.js --> relays full activation breakdown in chat |

---

## Tech Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **Lead Intelligence** | [Linkt AI](https://linkt.ai) API | Entity search, company enrichment (industry, HQ, employees, revenue, contacts) |
| **AI Agent** | [OpenClaw](https://github.com/AlexGouyet/openclaw) | Personal AI OS — always-on autonomous agent that parses natural language, executes skills, and relays results via Telegram. *See repo.* |
| **Pricing Catalog** | Custom CSV engine (146 SKUs) | Maps group size + event type to recommended activations with tiered pricing |
| **Proposal Generator** | Handlebars + inline HTML/CSS/JS | Single-file landing pages with interactive pricing (qty controls, toggle upgrades, live recalculation) |
| **Deployment** | Vercel CLI (headless) | Instant deploys to unique URLs (e.g. `base-power.vercel.app`) |
| **Notifications** | Telegram Bot API | Real-time alerts with full pricing breakdown |
| **Infrastructure** | Docker on VPS | OpenClaw container with all env vars, webhook server, and skill scripts |

---

## Key Features

### Interactive Proposal Pages
- Co-branded hero with client logo (auto-resolved via Google Favicon API)
- Personalized intro referencing company industry, HQ, and team size
- Experience cards with quantity controls (+/- buttons, live price updates)
- Toggle switches for optional upgrades
- Real-time total recalculation (subtotal, 15% coordination fee, grand total)
- Professional social proof section with client testimonials
- Mobile-responsive design

### Intelligent Pricing Engine
- 146-SKU catalog covering fitness, wellness, nutrition, team building, and entertainment
- Automatic activation recommendations based on group size and event type
- Three tiers: Core activations, Add-ons, and Optional upgrades
- Dynamic unit pricing (per person, per hour, flat rate) with quantity scaling
- 15% coordination fee auto-calculated

### Linkt AI Enrichment
- Company lookup by name (entity search + enrichment)
- Pulls: industry, headquarters, employee count, revenue, website, LinkedIn, key contacts
- Contact name and title auto-populated in proposals
- Fallback handling when Linkt data is unavailable

---

## File Structure

```
.
|-- proposal.js          # Main pipeline orchestrator (enrich -> generate -> deploy)
|-- generate.js          # HTML proposal generator (Handlebars templating)
|-- deploy.js            # Vercel CLI deployment module
|-- linkt.js             # Linkt AI API integration
|-- pricing-engine.js    # 146-SKU pricing catalog and recommendation engine
|-- signal-webhook.js    # HTTP webhook server + Telegram messaging
|-- template.html        # Handlebars HTML template (interactive landing page)
|-- pricing.csv          # Full pricing catalog (146 active SKUs)
|-- SKILL.md             # OpenClaw skill definition (AI agent instructions)
|-- assets/              # Swift Fit logos and brand assets
|-- output/              # Generated HTML proposals (pre-deploy)
```

---

## Usage

### Automated (Webhook Signal)
```bash
# Start the webhook server
node signal-webhook.js

# Simulate a lead signal
curl -X POST http://localhost:3456/signal \
  -H "Content-Type: application/json" \
  -d '{
    "company": "Base Power",
    "signal_type": "funding",
    "summary": "Base Power closed a $1B Series C, expanding their Austin HQ.",
    "size": 50,
    "event_type": "half-day team building"
  }'
```

### Manual (CLI)
```bash
node proposal.js \
  --company "Apptronik" \
  --contact "Jeff Cardenas" \
  --title "CEO" \
  --size 60 \
  --type "half-day team building"
```

### Conversational (Telegram Bot)
Message the bot: *"Build a proposal for Yeti Coolers, 75 people, half-day team building"*

The OpenClaw agent parses the request, runs the pipeline, and replies with the full activation breakdown and live URL.

---

## Live Examples

| Company | People | Total | URL |
|---------|--------|-------|-----|
| Base Power | 50 | $7,475 | [base-power.vercel.app](https://base-power.vercel.app) |
| Apptronik | 60 | $7,475 | [apptronik.vercel.app](https://apptronik.vercel.app) |
| Yeti Coolers | 75 | $7,648 | [yeti-coolers.vercel.app](https://yeti-coolers.vercel.app) |
| CesiumAstro | 50 | $7,475 | [cesiumastro.vercel.app](https://cesiumastro.vercel.app) |

---

## How It Was Built

Won the Sales Molty award at Moltathon ATX 2025. Built solo in ~6 hours. Zero external frameworks -- pure Node.js with only three npm dependencies (Handlebars for templating, csv-parse for the pricing catalog, minimist for CLI args). The landing pages are single-file HTML with inline CSS and JavaScript for maximum deployment simplicity.

The hardest parts:
1. **Interactive pricing** -- Client-side JS that recalculates totals across 3 tiers with dynamic unit text (per person / per hour / flat) as quantities change
2. **Telegram message encoding** -- Multi-byte emoji characters (`Buffer.byteLength` vs `string.length` for HTTP Content-Length) caused silent message truncation
3. **Logo reliability** -- Migrated from logo.dev (expired token) to Google Favicon V2 API (no auth, 100% uptime)

---

## Team

**Alexander Gouyet** -- Solo builder

Built with [Claude Code](https://claude.ai/code) as the AI pair programmer.

