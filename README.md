# 🛒 PriceShift — Allegro to Amazon Price Comparator

> Chrome extension that compares Allegro products with Amazon.pl using AI-powered semantic matching. Shows you whether buying on Amazon would be cheaper or more expensive — in one click.

![Status](https://img.shields.io/badge/status-active-brightgreen)
![Manifest](https://img.shields.io/badge/manifest-v3-blue)
![AI](https://img.shields.io/badge/AI-Claude%20Haiku%204.5-orange)

---

## ✨ What it does

Adds a premium "Compare with Amazon" button on every Allegro product page. When clicked:

1. **🤖 AI Extractor** cleans up the messy Allegro title (removes marketing fluff, extracts brand + model)
2. **🔍 Searches Amazon.pl** for the top 5 matching products
3. **🧠 AI Title-Matcher** rates how well each result matches (semantic comparison, not just keywords)
4. **⚙️ AI Params-Matcher** boosts confidence using product parameters (size, color, version) when the title alone isn't enough
5. **💰 Compares prices** — shows green if Amazon is cheaper, red if more expensive
6. **📊 Confidence scoring** — hover the ℹ️ icon to see exactly how the AI scored the match

A two-stage agentic pipeline with graceful fallbacks — designed for production reliability.

---

## 📸 Demo

> [Add a GIF or screenshot here once published]

---

## 🚀 Installation

### 1. Download this repository
Click the green **"Code"** button → **"Download ZIP"** → extract somewhere on your computer.

### 2. Get your Anthropic API key
This extension uses Claude AI for intelligent product matching. You'll need your own API key:

1. Sign up at [console.anthropic.com](https://console.anthropic.com)
2. Go to **API Keys** → **Create Key**
3. Add at least **$5 credit** in **Plans & Billing** (enough for ~2,500 uses)
4. **⚠️ Recommended:** Set a monthly spending limit in **Settings → Limits**

### 3. Add your key to the extension
Open `background.js` in any text editor. Find this line at the top:

```javascript
const ANTHROPIC_API_KEY = "WKLEJ_TUTAJ_SWOJ_KLUCZ";
```

Replace `WKLEJ_TUTAJ_SWOJ_KLUCZ` with your actual key (keep the quotes):

```javascript
const ANTHROPIC_API_KEY = "sk-ant-api03-XXXXX...";
```

Save the file (use **UTF-8 encoding**).

### 4. Load into Chrome
1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer mode** (top right toggle)
3. Click **Load unpacked**
4. Select the folder where you extracted the files
5. Done! Visit any Allegro product page to see the button.

---

## 🏗️ Architecture

```
[ Allegro page ]
       ↓
  Content script scrapes title + parameters
       ↓
  ┌────────────────────────────┐
  │  Service Worker (background)│
  │                             │
  │  Agent 1: EXTRACTOR         │
  │    → cleans Allegro title   │
  │       into search query     │
  │                             │
  │  Fetch TOP 5 from Amazon.pl │
  │                             │
  │  Agent 2: TITLE-MATCHER     │
  │    → rates each result      │
  │                             │
  │  If confidence 60-84%:      │
  │  Agent 3: PARAMS-MATCHER    │
  │    → boosts using specs     │
  └────────────────────────────┘
       ↓
  Slide-down panel with result
  + price comparison (🟢 / 🔴)
```

### Tech stack
- **Vanilla JavaScript** (no frameworks)
- **Chrome Extensions Manifest V3**
- **Service Worker** for CORS bypass
- **Anthropic Claude Haiku 4.5** for semantic matching
- **Regex parsing** for service worker (no DOMParser available there)
- **Cascade fallback pattern** — each agent independently failsafe

---

## 💸 Cost

Using Claude Haiku 4.5 (cheapest model):
- ~$0.001 per click (1-2 API calls depending on confidence)
- **$5 = ~2,500–5,000 uses**

No subscription, no auto-renewal. Pay-as-you-go.

---

## 🔒 Security & Privacy

- ✅ Your API key stays **on your machine only** (never transmitted to any third party)
- ✅ No data collection, no analytics, no tracking
- ✅ All scraping happens in your browser
- ✅ Open source — audit the code yourself

⚠️ **Never share your `background.js` with the API key filled in.** Always keep the placeholder version for sharing.

---

## 🐛 Troubleshooting

**Button doesn't appear**
- Refresh the Allegro page (F5)
- Make sure you're on a product page (URL contains `/oferta/` or `/produkt/`)
- Check `chrome://extensions` — is the extension enabled?

**"Brak klucza API" message**
- You didn't paste your API key in `background.js`
- Or you pasted it but didn't save the file
- Or you saved but didn't reload the extension (click 🔄 in `chrome://extensions`)

**"Brak dopasowania" for products that exist on Amazon**
- The AI might not be sure enough (below 60% confidence threshold)
- Click "Przeszukaj kategorię" to see all results on Amazon manually
- Some products from niche Polish sellers genuinely don't exist on Amazon.pl

---

## 🛠️ Development

```
priceshift/
├── manifest.json       # Extension config
├── background.js       # Service worker + AI agents
├── content.js          # Allegro page integration
├── style.css           # Premium button + slide-down panel
├── icon.png            # Extension icon
└── README.md           # This file
```

---

## 📝 License

MIT — feel free to fork, modify, learn from it.

---

## 🤝 Built by

**[@backloghero-lang](https://github.com/backloghero-lang)** — Business Analyst exploring the intersection of AI and e-commerce.

If you have ideas for improvements or want to discuss the architecture, feel free to open an issue or reach out on LinkedIn.

---

## 🎯 Roadmap (ideas)

- [ ] Cloudflare Worker backend (no key required for users)
- [ ] Support for Amazon.com (US) fallback
- [ ] Price history tracking
- [ ] Browser action popup with stats
- [ ] Firefox port
