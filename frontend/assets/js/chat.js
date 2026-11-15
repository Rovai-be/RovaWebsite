const isLocalhost = ["localhost", "127.0.0.1"].includes(window.location.hostname);
const BACKEND_URL = isLocalhost
  ? "http://127.0.0.1:8000/chat"
  : "https://rovai-api.onrender.com/chat";

const REQUEST_TIMEOUT_MS = 30000;
const MAX_HISTORY_MESSAGES = 10;
const CONTACT_CTA_TOKEN = "[CONTACT_CTA]";
const HISTORY_STORAGE_KEY = "rovai_chat_history";
const WELCOME_MESSAGE = "Hallo! Ik ben de assistent van Rovai. Waarmee kan ik je helpen?";

const toggleBtn = document.getElementById("chat-toggle");
const chatWindow = document.getElementById("chat-window");
const messagesEl = document.getElementById("chat-messages");
const inputEl = document.getElementById("chat-input");
const sendBtn = document.getElementById("chat-send");

let history = loadHistory();
let isOpen = false;
let hasWelcomed = history.length > 0;
let welcomeBubble = null;

renderHistory();

function setChatOpen(nextOpen, { focusInput = true } = {}) {
  isOpen = nextOpen;
  chatWindow.classList.toggle("open", isOpen);
  toggleBtn.setAttribute("aria-expanded", String(isOpen));
  toggleBtn.setAttribute("aria-label", t(isOpen ? "Chat sluiten" : "Chat openen"));
  if (isOpen && history.length === 0 && !hasWelcomed) {
    welcomeBubble = addBubble("bot", t(WELCOME_MESSAGE));
    hasWelcomed = true;
  }
  if (isOpen && focusInput) inputEl.focus();
}

document.addEventListener("rovai:languagechange", () => {
  toggleBtn.setAttribute("aria-label", t(isOpen ? "Chat sluiten" : "Chat openen"));
  if (welcomeBubble) welcomeBubble.innerHTML = renderMarkdown(t(WELCOME_MESSAGE));
});

toggleBtn?.addEventListener("click", () => {
  setChatOpen(!isOpen);
});

if (new URLSearchParams(window.location.search).get("chat") === "open") {
  setChatOpen(true);
}

sendBtn?.addEventListener("click", sendMessage);
inputEl?.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

function loadHistory() {
  try {
    const raw = sessionStorage.getItem(HISTORY_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveHistory() {
  try {
    sessionStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
  } catch {
    // sessionStorage kan onbeschikbaar zijn (bv. privénavigatie), gesprek werkt dan gewoon zonder persistentie
  }
}

function renderHistory() {
  history.forEach((msg) => addBubble(msg.role === "user" ? "user" : "bot", msg.content));
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function renderMarkdown(text) {
  const escaped = escapeHtml(text);
  const lines = escaped.split("\n");
  let html = "";
  let listTag = null;

  const closeList = () => {
    if (listTag) {
      html += `</${listTag}>`;
      listTag = null;
    }
  };

  for (const line of lines) {
    if (!line.trim()) continue;

    const bulletMatch = line.match(/^[-*]\s+(.*)/);
    const numberedMatch = line.match(/^\d+[.)]\s+(.*)/);

    if (bulletMatch || numberedMatch) {
      const tag = bulletMatch ? "ul" : "ol";
      const content = bulletMatch ? bulletMatch[1] : numberedMatch[1];
      if (listTag !== tag) {
        closeList();
        html += `<${tag}>`;
        listTag = tag;
      }
      html += `<li>${content}</li>`;
    } else {
      closeList();
      html += `<p>${line}</p>`;
    }
  }
  closeList();

  return html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

function addBubble(role, text) {
  const bubble = document.createElement("div");
  bubble.className = `chat-bubble ${role}`;
  if (role === "bot") {
    bubble.innerHTML = renderMarkdown(text);
  } else {
    bubble.textContent = text;
  }
  messagesEl.appendChild(bubble);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return bubble;
}

function addContactCta() {
  const wrapper = document.createElement("div");
  wrapper.className = "chat-bubble bot chat-cta";
  const link = document.createElement("a");
  link.href = "pages/contact.html";
  link.className = "chat-cta-link";
  link.textContent = t("Bespreek je idee →");
  wrapper.appendChild(link);
  messagesEl.appendChild(wrapper);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function addTyping() {
  const bubble = document.createElement("div");
  bubble.className = "chat-bubble bot typing";
  bubble.innerHTML = "<span></span><span></span><span></span>";
  messagesEl.appendChild(bubble);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return bubble;
}

async function sendMessage() {
  const text = inputEl.value.trim();
  if (!text) return;

  inputEl.value = "";
  sendBtn.disabled = true;
  addBubble("user", text);
  history.push({ role: "user", content: text });
  saveHistory();

  const typing = addTyping();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(BACKEND_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: history.slice(-MAX_HISTORY_MESSAGES) }),
      signal: controller.signal,
    });

    if (!res.ok) throw new Error("Chat request failed");
    const data = await res.json();
    typing.remove();

    const rawReply = data.reply || t("Ik kon geen antwoord ophalen. Probeer het gerust opnieuw.");
    const hasCta = rawReply.includes(CONTACT_CTA_TOKEN);
    const reply = rawReply.replace(CONTACT_CTA_TOKEN, "").trim();

    addBubble("bot", reply);
    history.push({ role: "assistant", content: reply });
    saveHistory();
    if (hasCta) addContactCta();
  } catch (err) {
    typing.remove();
    const message =
      err.name === "AbortError"
        ? t("Het duurt langer dan verwacht. Probeer het straks opnieuw.")
        : t("Er ging iets mis. Probeer het later opnieuw.");
    addBubble("bot", message);
  } finally {
    clearTimeout(timeoutId);
  }

  sendBtn.disabled = false;
  inputEl.focus();
}

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || !isOpen) return;
  setChatOpen(false, { focusInput: false });
  toggleBtn.focus();
});

// Face on the toggle: breathes, blinks and now and then follows the mouse, all at random intervals so it feels alive
const faceEyes = toggleBtn?.querySelector(".chat-face-eyes");
const faceBlink = toggleBtn?.querySelector(".chat-face-blink");
const faceSmile = toggleBtn?.querySelector(".chat-face-smile");
const FACE_MAX_OFFSET = 2.2;

let faceTarget = { x: 0, y: 0 };
let faceCurrent = { x: 0, y: 0 };
let faceFollowsMouse = false;
let facePointer = null;
let faceFrame = 0;

const randomBetween = (min, max) => min + Math.random() * (max - min);

function renderFace() {
  faceCurrent.x += (faceTarget.x - faceCurrent.x) * 0.07;
  faceCurrent.y += (faceTarget.y - faceCurrent.y) * 0.07;
  faceEyes.style.transform = `translate(${faceCurrent.x}px, ${faceCurrent.y}px)`;
  // The smile moves less than the eyes, which gives the face a bit of depth
  faceSmile.style.transform = `translate(${faceCurrent.x * 0.45}px, ${faceCurrent.y * 0.45}px)`;

  const settled = Math.abs(faceTarget.x - faceCurrent.x) < 0.02 && Math.abs(faceTarget.y - faceCurrent.y) < 0.02;
  faceFrame = settled ? 0 : requestAnimationFrame(renderFace);
}

function lookTowards(x, y) {
  faceTarget = { x, y };
  if (!faceFrame) faceFrame = requestAnimationFrame(renderFace);
}

function lookAtPointer({ clientX, clientY }) {
  const rect = toggleBtn.getBoundingClientRect();
  const dx = clientX - (rect.left + rect.width / 2);
  const dy = clientY - (rect.top + rect.height / 2);
  const distance = Math.hypot(dx, dy) || 1;
  if (!faceFollowsMouse) return;

  const reach = Math.min(distance / 140, 1) * FACE_MAX_OFFSET;
  lookTowards((dx / distance) * reach, (dy / distance) * reach);
}

// Mostly looks straight ahead; now and then it takes a good look at the cursor (or somewhere else),
// then looks ahead again and waits a random while before the next look
function lookAround() {
  if (Math.random() < 0.7 && facePointer && !isOpen) {
    faceFollowsMouse = true;
    lookAtPointer(facePointer);
  } else {
    const angle = Math.random() * Math.PI * 2;
    lookTowards(Math.cos(angle) * FACE_MAX_OFFSET * 0.7, Math.sin(angle) * FACE_MAX_OFFSET * 0.7);
  }

  setTimeout(() => {
    faceFollowsMouse = false;
    lookTowards(0, 0);
    setTimeout(lookAround, randomBetween(5000, 11000));
  }, randomBetween(2500, 4500));
}

function blinkFace() {
  faceBlink.animate(
    [{ transform: "scaleY(1)" }, { transform: "scaleY(0.1)" }, { transform: "scaleY(1)" }],
    { duration: 170, easing: "ease-in-out" }
  );
}

function scheduleBlink() {
  setTimeout(() => {
    blinkFace();
    if (Math.random() < 0.25) setTimeout(blinkFace, 240);
    scheduleBlink();
  }, randomBetween(2200, 6500));
}

function breatheToggle() {
  const breath = toggleBtn.animate(
    [{ scale: "1" }, { scale: String(randomBetween(1.065, 1.1)) }, { scale: "1" }],
    { duration: randomBetween(2800, 4600), easing: "ease-in-out" }
  );
  breath.onfinish = () => setTimeout(breatheToggle, randomBetween(150, 1400));
}

if (faceEyes && faceBlink && faceSmile && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
  window.addEventListener("pointermove", (event) => {
    facePointer = { clientX: event.clientX, clientY: event.clientY };
    if (!isOpen) lookAtPointer(facePointer);
  }, { passive: true });

  setTimeout(lookAround, randomBetween(3000, 7000));
  scheduleBlink();
  breatheToggle();
}
