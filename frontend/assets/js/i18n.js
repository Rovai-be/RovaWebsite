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

  function translateText(node) {
    if (!node.nodeValue.trim()) return;
    if (!originalText.has(node)) originalText.set(node, node.nodeValue);

    const source = originalText.get(node);
    const translated = translate(source);
    // Keep the surrounding whitespace so inline elements stay spaced correctly
    const next = translated === source ? source : source.match(/^\s*/)[0] + translated + source.match(/\s*$/)[0];
    if (node.nodeValue !== next) node.nodeValue = next;
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
    if (element.innerHTML !== next) element.innerHTML = next;
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
    document.querySelectorAll("[data-lang-option]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.langOption === lang));
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
    document.dispatchEvent(new CustomEvent("rovai:languagechange", { detail: { lang } }));
  }

  document.querySelectorAll("[data-lang-option]").forEach((button) => {
    button.addEventListener("click", () => setLanguage(button.dataset.langOption));
  });

  if (lang === "en") applyLanguage();
  else syncSwitches();
  document.documentElement.classList.remove("lang-pending");

  // Used by script.js and chat.js for text they generate themselves
  window.t = translate;
})();
