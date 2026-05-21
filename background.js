// ===========================================
// Service Worker v3.0 - Pipeline 2 agentów
// ===========================================

// ⚠️ WKLEJ SWÓJ KLUCZ ANTHROPIC API ⚠️
const ANTHROPIC_API_KEY = "TUTAJ WKLEJ KLUCZ";

// ===========================================

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "szukajNaAmazon") {
    obsluzZapytanie(msg.danePolskie).then(sendResponse);
    return true;
  }
});

async function obsluzZapytanie(daneAllegro) {
  console.log("[Pipeline] 📦 Otrzymano dane z Allegro:", daneAllegro);

  if (!ANTHROPIC_API_KEY || ANTHROPIC_API_KEY === "WKLEJ_TUTAJ_SWOJ_KLUCZ") {
    console.log("[Pipeline] ❌ Brak klucza API");
    return { ok: false, blad: "Brak klucza API" };
  }

  try {
    // === KROK 1: EXTRACTOR ===
    console.log("[Pipeline] 🤖 KROK 1: Extractor analizuje produkt...");
    const fingerprint = await agentExtractor(daneAllegro);
    console.log("[Pipeline] 🎯 Fingerprint:", fingerprint);

    // === KROK 2: SZUKAJ TOP 5 NA AMAZON ===
    console.log("[Pipeline] 🔍 KROK 2: Pobieram TOP 5 z Amazon...");
    const top5 = await pobierzTop5Amazon(fingerprint.search_query);
    console.log("[Pipeline] 📋 Znaleziono na Amazon:", top5.length, "produktów");

    if (top5.length === 0) {
      return {
        ok: true,
        znaleziono: false,
        urlWyszukiwania: `https://www.amazon.pl/s?k=${encodeURIComponent(fingerprint.search_query)}`,
        zapytanie: fingerprint.search_query,
        uzytoAgenta: true,
        powod: "Brak wyników na Amazon",
      };
    }

    // === KROK 3: MATCHER OCENIA ===
    console.log("[Pipeline] 🧠 KROK 3: Matcher porównuje semantycznie...");
    const ocena = await agentMatcher(fingerprint, top5);
    console.log("[Pipeline] ⚖️ Ocena:", ocena);

    // === KROK 4: ZWRACAMY WYNIK ===
    if (ocena.confidence >= 0.6 && ocena.best_match_index >= 0) {
      const wybrany = top5[ocena.best_match_index];
      console.log("[Pipeline] ✅ Dopasowanie z confidence:", ocena.confidence);
      return {
        ok: true,
        znaleziono: true,
        tytul: wybrany.tytul,
        link: wybrany.link,
        obraz: wybrany.obraz,
        cena: wybrany.cena,
        urlWyszukiwania: `https://www.amazon.pl/s?k=${encodeURIComponent(fingerprint.search_query)}`,
        zapytanie: fingerprint.search_query,
        uzytoAgenta: true,
        confidence: ocena.confidence,
        reasoning: ocena.reasoning,
      };
    } else {
      console.log("[Pipeline] ⚠️ Niska pewność:", ocena.confidence);
      return {
        ok: true,
        znaleziono: false,
        urlWyszukiwania: `https://www.amazon.pl/s?k=${encodeURIComponent(fingerprint.search_query)}`,
        zapytanie: fingerprint.search_query,
        uzytoAgenta: true,
        confidence: ocena.confidence,
        powod: ocena.reasoning || "Brak wystarczającego dopasowania",
      };
    }
  } catch (err) {
    console.error("[Pipeline] 💥 Błąd:", err);
    return { ok: false, blad: err.message };
  }
}

// === AGENT 1: EXTRACTOR ===
async function agentExtractor(daneAllegro) {
  const prompt = `Jesteś ekspertem od e-commerce. Analizujesz produkt z polskiego Allegro i przygotowujesz strategię wyszukiwania na Amazon.pl.

DANE Z ALLEGRO:
Tytuł: ${daneAllegro.tytul}
Kategoria: ${daneAllegro.kategoria || "nieznana"}
Parametry:
${daneAllegro.parametry.map(p => `- ${p}`).join("\n")}

ZADANIE:
1. Wymyśl optymalne search_query do Amazon.pl (krótkie, kluczowe słowa)
2. Określ "must_match" - cechy które MUSZĄ się zgadzać (np. marka, model, rozmiar, smak)
3. Określ "must_not_match" - czego unikać (np. etui zamiast telefonu, książka zamiast filmu)
4. Określ "category" - typ produktu (np. smartphone, food, book, bike)

WAŻNE:
- search_query: 3-7 słów po polsku
- must_match: tylko niezbędne, definiujące cechy (max 5)
- Kolory tłumacz na ang. jeśli marka tak ich używa (np. Apple "niebieski" = "Blue Titanium")
- Pomijaj słowa marketingowe (NOWY, HIT, PROMOCJA)

Odpowiedz TYLKO w formacie JSON, bez markdown, bez komentarzy:
{
  "search_query": "...",
  "must_match": ["...", "..."],
  "must_not_match": ["...", "..."],
  "category": "..."
}`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 400,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Extractor: ${response.status} ${await response.text()}`);
  }

  const dane = await response.json();
  const tekst = dane.content[0].text.trim().replace(/```json|```/g, "").trim();
  return JSON.parse(tekst);
}

// === AGENT 2: MATCHER ===
async function agentMatcher(fingerprint, top5) {
  const wynikiTekstem = top5.map((w, i) => `${i}: ${w.tytul} (cena: ${w.cena || "?"})`).join("\n");

  const prompt = `Jesteś ekspertem od dopasowywania produktów. Porównaj produkt szukany z 5 wynikami z Amazon.pl.

PRODUKT SZUKANY:
- Search query: ${fingerprint.search_query}
- MUSI mieć: ${(fingerprint.must_match || []).join(", ")}
- NIE może mieć: ${(fingerprint.must_not_match || []).join(", ")}
- Kategoria: ${fingerprint.category}

WYNIKI Z AMAZON:
${wynikiTekstem}

ZADANIE:
Wybierz NAJLEPSZY wynik który spełnia kryteria. Oceń:
- Czy wszystkie "must_match" są w tytule wyniku?
- Czy żaden "must_not_match" nie występuje?
- Czy kategoria się zgadza? (np. nie etui zamiast telefonu)

WAŻNE:
- Bądź SUROWY: jeśli żaden nie pasuje dobrze, wybierz -1 i daj niski confidence
- Confidence 0.0-1.0 (1.0 = identyczny produkt, 0.5 = podobny, 0.0 = nie pasuje)
- Wynik #0 to nie zawsze najlepszy! Patrz na cały tytuł.

Odpowiedz TYLKO w formacie JSON:
{
  "best_match_index": 0,
  "confidence": 0.85,
  "reasoning": "krótkie uzasadnienie po polsku"
}`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Matcher: ${response.status} ${await response.text()}`);
  }

  const dane = await response.json();
  const tekst = dane.content[0].text.trim().replace(/```json|```/g, "").trim();
  return JSON.parse(tekst);
}

// === POBIERANIE TOP 5 Z AMAZON ===
async function pobierzTop5Amazon(zapytanie) {
  const url = `https://www.amazon.pl/s?k=${encodeURIComponent(zapytanie)}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Accept-Language": "pl-PL,pl;q=0.9",
    },
  });
  const html = await res.text();
  return parsujTop5(html);
}

function parsujTop5(html) {
  const wyniki = [];
  // Regex globalny - znajduje wszystkie listitemy z ASIN
  const regex = /<div[^>]*role="listitem"[^>]*data-asin="([^"]+)"[\s\S]*?(?=<div[^>]*role="listitem"|<\/body>)/g;
  let match;
  let licznik = 0;

  while ((match = regex.exec(html)) !== null && licznik < 5) {
    const asin = match[1];
    const tresc = match[0];

    // Pomiń puste asiny (Amazon czasem wstawia placeholdery)
    if (!asin || asin.length < 5) continue;

    // Tytuł - próbujemy kilku miejsc bo Amazon zmienia strukturę
    // 1. Najpewniejsze - alt obrazka produktu
    // 2. h2 > span (stara struktura)
    // 3. aria-label na linku
    let tytul = null;
    const altMatch = tresc.match(/<img[^>]*data-image-latency="s-product-image"[^>]*alt="([^"]+)"/)
      || tresc.match(/<img[^>]*alt="([^"]+)"[^>]*data-image-latency="s-product-image"/)
      || tresc.match(/<img[^>]*class="[^"]*s-image[^"]*"[^>]*alt="([^"]+)"/);
    if (altMatch) tytul = altMatch[1].trim();

    if (!tytul) {
      const h2match = tresc.match(/<h2[^>]*>[\s\S]*?<span[^>]*>([^<]+)<\/span>/);
      if (h2match) tytul = h2match[1].trim();
    }

    if (!tytul) {
      const ariaMatch = tresc.match(/<a[^>]*aria-label="([^"]+)"/);
      if (ariaMatch) tytul = ariaMatch[1].trim();
    }

    const obrazMatch = tresc.match(/<img[^>]*data-image-latency="s-product-image"[^>]*src="([^"]+)"/)
      || tresc.match(/<img[^>]*src="([^"]+)"[^>]*data-image-latency="s-product-image"/)
      || tresc.match(/<img[^>]*class="[^"]*s-image[^"]*"[^>]*src="([^"]+)"/);
    const cenaMatch = tresc.match(/<span[^>]*class="a-offscreen"[^>]*>([^<]+)<\/span>/);

    if (tytul && obrazMatch) {
      wyniki.push({
        asin,
        tytul,
        link: `https://www.amazon.pl/dp/${asin}`,
        obraz: obrazMatch[1],
        cena: cenaMatch ? cenaMatch[1].trim() : null,
      });
      licznik++;
    }
  }

  return wyniki;
}