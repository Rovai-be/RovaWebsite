// NL/EN language switch. The Dutch HTML is the source text; i18n-en.js maps it to English.
// Text without an entry in i18n-en.js simply stays Dutch.
(() => {
  const STORAGE_KEY = "rovai-lang";
  const LANGUAGES = ["nl", "en"];
  const ATTRIBUTES = ["aria-label", "placeholder", "alt", "title", "data-step-label"];
  const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "svg"]);

  const normalize = (text) => text.replace(/\s+/g, " ").trim();
  const english = new Map(
    Object.entries(window.ROVAI_TRANSLATIONS_EN || {}).map(([dutch, translation]) => [normalize(dutch), translation])
  );

  // Dutch originals, so switching back to NL restores the exact source
  const originalText = new WeakMap();
  const originalHtml = new WeakMap();
  const originalAttributes = new WeakMap();
  const originalTitle = document.title;

  function storeLanguage(value) {
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch {
      // Without storage the choice only lasts for this page
    }
  }

  function readStoredLanguage() {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  }

  const requested = new URLSearchParams(window.location.search).get("lang");
  let lang = LANGUAGES.includes(requested) ? requested : readStoredLanguage();
  if (!LANGUAGES.includes(lang)) lang = "nl";
  if (LANGUAGES.includes(requested)) storeLanguage(requested);

  function translate(dutch) {
    return (lang === "en" && english.get(normalize(dutch))) || dutch;
  }

  // Elements whose text changed during the current switch, so they can animate in
  const changedElements = new Set();

  function translateText(node) {
    if (!node.nodeValue.trim()) return;
    if (!originalText.has(node)) originalText.set(node, node.nodeValue);

    const source = originalText.get(node);
    const translated = translate(source);
    // Keep the surrounding whitespace so inline elements stay spaced correctly
    const next = translated === source ? source : source.match(/^\s*/)[0] + translated + source.match(/\s*$/)[0];
    if (node.nodeValue !== next) {
      node.nodeValue = next;
      if (node.parentElement) changedElements.add(node.parentElement);
    }
  }

  const hasTextAndElements = (element) =>
    element.children.length > 0 &&
    [...element.childNodes].some((child) => child.nodeType === Node.TEXT_NODE && child.nodeValue.trim());

  // Sentences that wrap inline markup (like an accent span) can be translated as a whole
  function translateHtml(element) {
    if (!originalHtml.has(element)) {
      if (!hasTextAndElements(element) || !english.has(normalize(element.innerHTML))) return false;
      originalHtml.set(element, element.innerHTML);
    }

    const next = translate(originalHtml.get(element));
    if (element.innerHTML !== next) {
      element.innerHTML = next;
      changedElements.add(element);
    }
    return true;
  }

  function translateAttributes(element) {
    for (const name of ATTRIBUTES) {
      if (!element.hasAttribute(name)) continue;

      let originals = originalAttributes.get(element);
      if (!originals) originalAttributes.set(element, (originals = {}));
      if (!(name in originals)) originals[name] = element.getAttribute(name);

      const next = translate(originals[name]);
      if (element.getAttribute(name) !== next) element.setAttribute(name, next);
    }
  }

  function translateTree(root) {
    for (const node of root.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        translateText(node);
      } else if (node.nodeType === Node.ELEMENT_NODE && !SKIP_TAGS.has(node.tagName) && !node.hasAttribute("data-i18n-skip")) {
        translateAttributes(node);
        if (!translateHtml(node)) translateTree(node);
      }
    }
  }

  function syncSwitches() {
    document.querySelectorAll("[data-lang-toggle]").forEach((button) => {
      button.dataset.lang = lang;
      button.setAttribute("aria-label", lang === "en" ? "Switch language to Dutch" : "Taal wisselen naar Engels");
    });
  }

  // New text blurs in as a wave from the top of the screen down
  function animateChangedText() {
    const elements = [...changedElements];
    changedElements.clear();
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !Element.prototype.animate) return;

    const viewportHeight = window.innerHeight;
    const visible = elements
      .map((element) => ({ element, rect: element.getBoundingClientRect() }))
      .filter(({ rect }) => rect.width > 0 && rect.bottom > 0 && rect.top < viewportHeight);

    visible.forEach(({ element, rect }) => {
      // A parent that animates already carries this element along
      if (visible.some((other) => other.element !== element && other.element.contains(element))) return;
      element.animate(
        [
          { opacity: 0, filter: "blur(8px)" },
          { opacity: 1, filter: "blur(0)" },
        ],
        {
          duration: 520,
          delay: Math.max(rect.top, 0) / viewportHeight * 220,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
          fill: "backwards",
        }
      );
    });
  }

  function applyLanguage() {
    document.documentElement.lang = lang;
    document.title = translate(originalTitle);
    translateTree(document.body);
    document.querySelectorAll("[data-lang-only]").forEach((element) => {
      element.hidden = element.dataset.langOnly !== lang;
    });
    syncSwitches();
  }

  function setLanguage(next) {
    if (!LANGUAGES.includes(next) || next === lang) return;
    lang = next;
    storeLanguage(lang);
    applyLanguage();
    animateChangedText();
    document.dispatchEvent(new CustomEvent("rovai:languagechange", { detail: { lang } }));
  }

  document.querySelectorAll("[data-lang-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      // Restart the stretch animation, also on quick repeated clicks
      button.classList.remove("is-switching");
      void button.offsetWidth;
      button.classList.add("is-switching");
      setLanguage(lang === "en" ? "nl" : "en");
    });
    button.addEventListener("animationend", () => button.classList.remove("is-switching"));
  });

  if (lang === "en") applyLanguage();
  else syncSwitches();
  changedElements.clear();
  document.documentElement.classList.remove("lang-pending");
  requestAnimationFrame(() => {
    document.querySelectorAll("[data-lang-toggle]").forEach((button) => button.classList.add("is-ready"));
  });

  // Used by script.js and chat.js for text they generate themselves
  window.t = translate;
})();
