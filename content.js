// ===========================================
// Allegro → Amazon Porównywarka v3.1
// ===========================================

(function () {
  "use strict";

  function pobierzNazweProduktu() {
    const selektory = ['h1[data-box-name="title"]', 'h1.mgn2_14', 'h1[class*="m7er_"]', 'h1'];
    for (const selektor of selektory) {
      const el = document.querySelector(selektor);
      if (el && el.textContent.trim().length > 5) return el.textContent.trim();
    }
    return null;
  }

  function pobierzParametry() {
    const elementy = document.querySelectorAll(
      '[data-box-name="Parameters"] li, ' +
      '[data-box-name="Parameters"] tr, ' +
      '[data-box-name="Container Parameters"] li, ' +
      '[data-box-name="Container Parameters"] tr, ' +
      '[data-box-name="Parameters Card"] li'
    );

    const parametry = [];
    const widziane = new Set();

    for (const el of elementy) {
      const tekst = el.textContent.trim().replace(/\s+/g, " ");
      if (tekst.length > 150 || tekst.length < 3) continue;
      if (tekst.toLowerCase().includes("oznacza towar")) continue;
      if (tekst.toLowerCase().includes("wystawiam fakture")) continue;
      if (widziane.has(tekst)) continue;
      widziane.add(tekst);
      parametry.push(tekst);
    }

    return parametry.slice(0, 20);
  }

  function pobierzCeneAllegro() {
    // Allegro ma cenę w różnych miejscach - próbujemy kilku
    const selektory = [
      'meta[itemprop="price"]',
      '[data-box-name="Price"] meta',
      '[itemprop="price"]',
    ];
    for (const selektor of selektory) {
      const el = document.querySelector(selektor);
      if (el) {
        const cena = el.getAttribute("content") || el.getAttribute("value");
        if (cena) {
          const num = parseFloat(cena.replace(",", "."));
          if (!isNaN(num) && num > 0) return num;
        }
      }
    }

    // Fallback - szukamy po wzorcu w widocznych elementach
    const wszystkie = document.querySelectorAll("span, div");
    for (const el of wszystkie) {
      const tekst = el.textContent.trim();
      // Szukamy wzorca typu "159,00 zł" lub "1 299,00 zł"
      const match = tekst.match(/^(\d{1,3}(?:[\s ]\d{3})*[,.]?\d{0,2})\s*zł$/);
      if (match) {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          const num = parseFloat(match[1].replace(/\s/g, "").replace(",", "."));
          if (!isNaN(num) && num > 0 && num < 999999) return num;
        }
      }
    }

    return null;
  }

  function pobierzDaneAllegro() {
    return {
      tytul: pobierzNazweProduktu(),
      parametry: pobierzParametry(),
      cenaAllegro: pobierzCeneAllegro(),
    };
  }

  function znajdzWidocznyElement(selektor) {
    const elementy = document.querySelectorAll(selektor);
    for (const el of [...elementy].reverse()) {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) return el;
    }
    return null;
  }

  function znajdzMiejsceNaPrzycisk() {
    const sellerInfo = znajdzWidocznyElement('[data-box-name="showoffer.sellerInfoHeader"]');
    if (sellerInfo) return { element: sellerInfo, pozycja: "afterend" };

    const sellerContainer = znajdzWidocznyElement('[data-box-name="Seller summary container"]');
    if (sellerContainer) return { element: sellerContainer, pozycja: "afterend" };

    const kupIZaplac = znajdzWidocznyElement('[data-box-name="allegro.transaction.buyAndPayButton.web"]');
    if (kupIZaplac) return { element: kupIZaplac, pozycja: "beforebegin" };

    return null;
  }

  async function szukajNaAmazon(danePolskie) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: "szukajNaAmazon", danePolskie }, (response) => resolve(response));
    });
  }

  function parseCenaNumber(cenaStr) {
    if (!cenaStr) return null;
    // Wyciąga liczbę z formatów: "159,90 zł", "1 299,00 zł", "PLN 159.90"
    const match = cenaStr.match(/(\d{1,3}(?:[\s ]\d{3})*[,.]?\d{0,2})/);
    if (!match) return null;
    const num = parseFloat(match[1].replace(/\s/g, "").replace(",", "."));
    return !isNaN(num) && num > 0 ? num : null;
  }

  function generujTooltipScoring(dane) {
    if (!dane.confidence_final && !dane.title_score) return "";

    const final = Math.round((dane.confidence_final || 0) * 100);
    const title = Math.round((dane.title_score || 0) * 100);
    const params = Math.round((dane.params_boost || 0) * 100);

    let html = `
      <div class="amz-tooltip-row"><strong>Pewność: ${final}%</strong></div>
      <div class="amz-tooltip-row">📝 Tytuł: ${title}%</div>
    `;
    if (params > 0) {
      html += `<div class="amz-tooltip-row">⚙️ Parametry: +${params}%</div>`;
    }
    if (dane.sciezka === "A") {
      html += `<div class="amz-tooltip-row amz-tooltip-meta">Ścieżka: tylko tytuł</div>`;
    } else if (dane.sciezka === "B") {
      html += `<div class="amz-tooltip-row amz-tooltip-meta">Ścieżka: tytuł + parametry</div>`;
    }
    if (dane.reasoning_title) {
      html += `<div class="amz-tooltip-row amz-tooltip-reason">💭 ${dane.reasoning_title}</div>`;
    }
    if (dane.reasoning_params) {
      html += `<div class="amz-tooltip-row amz-tooltip-reason">⚙️ ${dane.reasoning_params}</div>`;
    }
    if (dane.zapytanie) {
      html += `<div class="amz-tooltip-row amz-tooltip-meta">🔍 Query: "${dane.zapytanie}"</div>`;
    }
    return html;
  }

  function pokazPopup(przycisk, dane) {
    const stary = document.getElementById("amz-popup");
    if (stary) stary.remove();

    const popup = document.createElement("div");
    popup.id = "amz-popup";

    const tooltipHtml = generujTooltipScoring(dane);
    const infoIcon = tooltipHtml ? `
      <span class="amz-info-wrapper">
        <span class="amz-info-icon">ℹ️</span>
        <span class="amz-info-tooltip">${tooltipHtml}</span>
      </span>
    ` : "";

    if (dane.blad) {
      popup.innerHTML = `
        <div class="amz-popup-header">
          <span>⚠️ Błąd</span>
          <button class="amz-popup-close">×</button>
        </div>
        <div class="amz-popup-body">
          <p style="margin: 0; font-size: 12px; color: #fff;">${dane.blad}</p>
        </div>`;
    } else if (dane.znaleziono) {
      // === PORÓWNANIE CEN ===
      const cenaAmazonStr = dane.cena || "";
      const cenaAmazonNum = parseCenaNumber(cenaAmazonStr);
      const cenaAllegroNum = dane.cenaAllegro || null;

      let porownanieHtml = "";
      let klasaCenowa = "";

      if (cenaAmazonNum && cenaAllegroNum) {
        const roznica = cenaAmazonNum - cenaAllegroNum;
        const procent = Math.abs(Math.round((roznica / cenaAllegroNum) * 100));

        if (roznica < -0.5) {
          // Amazon TAŃSZY
          klasaCenowa = "amz-cena-tansza";
          porownanieHtml = `
            <div class="amz-porownanie amz-porownanie-tansza">
              <span class="amz-porownanie-icon">🟢</span>
              <span>Amazon tańszy o <strong>${Math.abs(roznica).toFixed(2)} zł (-${procent}%)</strong></span>
            </div>`;
        } else if (roznica > 0.5) {
          // Amazon DROŻSZY
          klasaCenowa = "amz-cena-drozsza";
          porownanieHtml = `
            <div class="amz-porownanie amz-porownanie-drozsza">
              <span class="amz-porownanie-icon">🔴</span>
              <span>Amazon droższy o <strong>${roznica.toFixed(2)} zł (+${procent}%)</strong></span>
            </div>`;
        } else {
          // Taka sama
          klasaCenowa = "amz-cena-rowna";
          porownanieHtml = `
            <div class="amz-porownanie amz-porownanie-rowna">
              <span class="amz-porownanie-icon">⚪</span>
              <span>Cena identyczna</span>
            </div>`;
        }
      }

      popup.innerHTML = `
        <div class="amz-popup-header">
          <span>✅ Znaleziono dopasowanie ${infoIcon}</span>
          <button class="amz-popup-close">×</button>
        </div>
        <div class="amz-popup-body">
          <a href="${dane.link}" target="_blank" class="amz-popup-product">
            <img src="${dane.obraz}" alt="" class="amz-popup-img">
            <div class="amz-popup-info">
              <div class="amz-popup-title">${dane.tytul.substring(0, 90)}${dane.tytul.length > 90 ? "..." : ""}</div>
              ${dane.cena ? `<div class="amz-popup-cena ${klasaCenowa}">${dane.cena}</div>` : ""}
            </div>
          </a>
          ${porownanieHtml}
          <a href="${dane.urlWyszukiwania}" target="_blank" class="amz-popup-link">Zobacz więcej wyników →</a>
        </div>`;
    } else {
      popup.innerHTML = `
        <div class="amz-popup-header">
          <span>🔍 Brak dopasowania ${infoIcon}</span>
          <button class="amz-popup-close">×</button>
        </div>
        <div class="amz-popup-body">
          ${dane.powod ? `<p style="margin: 0 0 10px; font-size: 12px; color: #d8e0e8;">${dane.powod}</p>` : ""}
          <a href="${dane.urlWyszukiwania}" target="_blank" class="amz-popup-btn">Przeszukaj kategorię</a>
        </div>`;
    }

    // === Wstawiamy panel jako dziecko WRAPPERA przycisku ===
    // Dzięki temu panel scrolluje się razem z przyciskiem
    const wrapper = document.getElementById("amz-compare-wrapper");
    if (wrapper) {
      wrapper.appendChild(popup);
    } else {
      document.body.appendChild(popup);
    }

    // === ZWIJANIE/ROZWIJANIE PANELU PRZEZ CHEVRON ===
    const obsluzChevron = (e) => {
      const istniejacy = document.getElementById("amz-popup");
      if (istniejacy) {
        e.stopPropagation();
        e.preventDefault();
        istniejacy.classList.toggle("amz-collapsed");
        const chevron = przycisk.querySelector(".amazon-compare-btn__arrow");
        if (chevron) {
          chevron.textContent = istniejacy.classList.contains("amz-collapsed") ? "›" : "⌄";
        }
      }
    };
    const chevronEl = przycisk.querySelector(".amazon-compare-btn__arrow");
    if (chevronEl) {
      chevronEl.textContent = "⌄";
      chevronEl.style.cursor = "pointer";
      // Usuń stare event listenery (na wypadek wielokrotnego klikania)
      const nowyChevron = chevronEl.cloneNode(true);
      chevronEl.parentNode.replaceChild(nowyChevron, chevronEl);
      nowyChevron.addEventListener("click", obsluzChevron, true);
    }

    popup.querySelector(".amz-popup-close").addEventListener("click", () => {
      popup.remove();
      const chevronEl2 = przycisk.querySelector(".amazon-compare-btn__arrow");
      if (chevronEl2) chevronEl2.textContent = "›";
    });

    setTimeout(() => {
      document.addEventListener("click", function zamknij(e) {
        if (!popup.contains(e.target) && e.target !== przycisk && !przycisk.contains(e.target)) {
          popup.remove();
          const chevronEl2 = przycisk.querySelector(".amazon-compare-btn__arrow");
          if (chevronEl2) chevronEl2.textContent = "›";
          document.removeEventListener("click", zamknij);
        }
      });
    }, 100);
  }

  function dodajPrzycisk() {
    if (document.getElementById("amz-compare-btn")) return;
    const nazwa = pobierzNazweProduktu();
    if (!nazwa) return;

    const miejsce = znajdzMiejsceNaPrzycisk();
    if (!miejsce) {
      console.log("[Allegro->Amazon] ❌ Nie znaleziono miejsca");
      return;
    }

    const wrapper = document.createElement("div");
    wrapper.id = "amz-compare-wrapper";

    const przycisk = document.createElement("button");
    przycisk.id = "amz-compare-btn";
    przycisk.className = "amazon-compare-btn";
    przycisk.innerHTML = `
      <span class="amazon-compare-btn__icon">
        <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
          <text x="100" y="135" font-family="Arial, sans-serif" font-size="150" font-weight="800" fill="#131a22" text-anchor="middle">a</text>
          <path d="M 35 165 Q 100 200 165 165" stroke="#ff9900" stroke-width="14" fill="none" stroke-linecap="round"/>
          <polygon points="158,155 175,165 162,178" fill="#ff9900"/>
        </svg>
      </span>
      <span class="amazon-compare-btn__text">
        Porównaj z <span class="amazon-compare-btn__brand">Amazon</span>
      </span>
      <span class="amazon-compare-btn__arrow">›</span>
    `;

    przycisk.addEventListener("click", async () => {
      przycisk.classList.add("amz-loading");

      const daneAllegro = pobierzDaneAllegro();
      console.log("[Allegro->Amazon] 📊 Zebrane dane:", daneAllegro);

      const odpowiedz = await szukajNaAmazon(daneAllegro);
      przycisk.classList.remove("amz-loading");

      // Dolepiamy cenę z Allegro do odpowiedzi przed pokazaniem popupu
      if (odpowiedz) {
        odpowiedz.cenaAllegro = daneAllegro.cenaAllegro;
      }

      pokazPopup(przycisk, odpowiedz || { blad: "Brak odpowiedzi" });
    });

    wrapper.appendChild(przycisk);
    miejsce.element.insertAdjacentElement(miejsce.pozycja, wrapper);
    console.log("[Allegro->Amazon] ✅ Premium CTA dodany");
  }

  setTimeout(dodajPrzycisk, 1500);

  let ostatniURL = location.href;
  new MutationObserver(() => {
    if (location.href !== ostatniURL) {
      ostatniURL = location.href;
      setTimeout(dodajPrzycisk, 2000);
    }
  }).observe(document.body, { childList: true, subtree: true });

})();
