const STORAGE_KEY = 'fugu-chat-conversations-v1';

const state = {
  conversations: [],
  currentId: null,
  models: [],
  controller: null,
  pendingImage: null,
};

const el = {
  sidebar: document.getElementById('sidebar'),
  menuBtn: document.getElementById('menuBtn'),
  conversationList: document.getElementById('conversationList'),
  messages: document.getElementById('messages'),
  messageInput: document.getElementById('messageInput'),
  composerForm: document.getElementById('composerForm'),
  sendBtn: document.getElementById('sendBtn'),
  stopBtn: document.getElementById('stopBtn'),
  modelSelect: document.getElementById('modelSelect'),
  effortSelect: document.getElementById('effortSelect'),
  contextBadge: document.getElementById('contextBadge'),
  newChatBtn: document.getElementById('newChatBtn'),
  settingsBtn: document.getElementById('settingsBtn'),
  systemPromptPanel: document.getElementById('systemPromptPanel'),
  systemPromptInput: document.getElementById('systemPromptInput'),
  attachBtn: document.getElementById('attachBtn'),
  fileInput: document.getElementById('fileInput'),
  imagePreview: document.getElementById('imagePreview'),
  imagePreviewImg: document.getElementById('imagePreviewImg'),
  removeImageBtn: document.getElementById('removeImageBtn'),
};

// ---------- persistence ----------

function loadConversations() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    state.conversations = raw ? JSON.parse(raw) : [];
  } catch {
    state.conversations = [];
  }
}

function saveConversations() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.conversations));
  } catch (err) {
    console.error('Could not save conversations to localStorage', err);
  }
}

function getCurrentConversation() {
  return state.conversations.find((c) => c.id === state.currentId) || null;
}

// ---------- rendering helpers ----------

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str ?? '';
  return d.innerHTML;
}

function renderMarkdown(text) {
  if (typeof marked === 'undefined' || typeof DOMPurify === 'undefined') {
    return escapeHtml(text).replace(/\n/g, '<br>');
  }
  return DOMPurify.sanitize(marked.parse(text || ''));
}

// Local content representation: a plain string, or an array of
// {type:'text', text} / {type:'image', url} parts (used when an image is attached).
function contentToHtml(content) {
  if (typeof content === 'string') return renderMarkdown(content);
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (part.type === 'text') return renderMarkdown(part.text);
        if (part.type === 'image') return `<img class="msg-image" src="${part.url}" alt="attached image" />`;
        return '';
      })
      .join('');
  }
  return '';
}

// Converts our local content representation into Sakana/OpenAI Responses API
// input content parts (input_text / input_image).
function toResponsesContent(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (part.type === 'text') return { type: 'input_text', text: part.text };
        if (part.type === 'image') return { type: 'input_image', image_url: part.url };
        return null;
      })
      .filter(Boolean);
  }
  return content;
}

function toResponsesInput(messages) {
  return messages.map((m) => ({ role: m.role, content: toResponsesContent(m.content) }));
}

function fuguMarkSVG(extraClass) {
  return `<svg class="fugu-icon${extraClass ? ' ' + extraClass : ''}" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
    <g class="fugu-spines" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none">
      <path d="M11 15 L8 11 M17 10 L15 5 M25 9 L25 4 M31 8 L33 3 M33 11 L36 6 M8 25 L2 25 M9 35 L5 39"/>
    </g>
    <ellipse cx="23" cy="25" rx="16" ry="13" fill="currentColor" fill-opacity="0.18" stroke="currentColor" stroke-width="2"/>
    <path d="M39 25 L47 18 L47 32 Z" fill="currentColor" fill-opacity="0.6"/>
    <circle cx="17" cy="21" r="2.2" fill="#e9eef1"/>
  </svg>`;
}

function highlightCode(container) {
  if (typeof hljs === 'undefined') return;
  container.querySelectorAll('pre code').forEach((block) => {
    hljs.highlightElement(block);
    addCopyButton(block);
  });
}

function addCopyButton(block) {
  const pre = block.parentElement;
  if (!pre || pre.querySelector('.copy-btn')) return;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'copy-btn';
  btn.textContent = 'Copy';
  btn.addEventListener('click', () => {
    navigator.clipboard.writeText(block.textContent || '');
    btn.textContent = 'Copied!';
    setTimeout(() => (btn.textContent = 'Copy'), 1500);
  });
  pre.appendChild(btn);
}

function emptyStateHTML() {
  return `<div class="empty-state">${fuguMarkSVG()}<h1>Fugu Chat</h1><p>Ask Fugu anything — messages stream in as they're generated.</p></div>`;
}

function appendMessageBubble(role, content) {
  const wrap = document.createElement('div');
  wrap.className = `message ${role}`;
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.innerHTML = contentToHtml(content);
  wrap.appendChild(bubble);
  el.messages.appendChild(wrap);
  el.messages.scrollTop = el.messages.scrollHeight;
  highlightCode(bubble);
  return bubble;
}

function appendThinkingBubble() {
  const wrap = document.createElement('div');
  wrap.className = 'message assistant';
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.innerHTML = fuguMarkSVG('thinking');
  wrap.appendChild(bubble);
  el.messages.appendChild(wrap);
  el.messages.scrollTop = el.messages.scrollHeight;
  return bubble;
}

function renderMessages(convo) {
  el.messages.innerHTML = '';
  if (!convo || convo.messages.length === 0) {
    el.messages.innerHTML = emptyStateHTML();
    return;
  }
  for (const m of convo.messages) appendMessageBubble(m.role, m.content);
  el.messages.scrollTop = el.messages.scrollHeight;
}

// ---------- sidebar ----------

function renderSidebar() {
  el.conversationList.innerHTML = '';
  const sorted = [...state.conversations].sort((a, b) => b.createdAt - a.createdAt);
  for (const c of sorted) {
    const item = document.createElement('div');
    item.className = 'conversation-item' + (c.id === state.currentId ? ' active' : '');
    const title = document.createElement('span');
    title.className = 'convo-title';
    title.textContent = c.title || 'New conversation';
    const del = document.createElement('button');
    del.className = 'delete-btn';
    del.textContent = '×';
    del.title = 'Delete conversation';
    del.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteConversation(c.id);
    });
    item.appendChild(title);
    item.appendChild(del);
    item.addEventListener('click', () => selectConversation(c.id));
    el.conversationList.appendChild(item);
  }
}

function selectConversation(id) {
  const convo = state.conversations.find((c) => c.id === id);
  if (!convo) return;
  state.currentId = id;
  renderMessages(convo);
  renderSidebar();
  syncSelectorsToConversation(convo);
}

function deleteConversation(id) {
  state.conversations = state.conversations.filter((c) => c.id !== id);
  saveConversations();
  if (state.currentId === id) startNewChat();
  else renderSidebar();
}

function createConversation() {
  const defaultModel = state.models[0];
  return {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    title: '',
    model: defaultModel?.slug || 'fugu',
    reasoningEffort: defaultModel?.default_effort || defaultModel?.reasoning_levels?.[0]?.effort || 'high',
    systemPrompt: '',
    messages: [],
    createdAt: Date.now(),
  };
}

function startNewChat() {
  state.currentId = null;
  state.pendingImage = null;
  updateImagePreview();
  el.messageInput.value = '';
  el.systemPromptInput.value = '';
  renderMessages(null);
  renderSidebar();
  syncSelectorsToConversation(null);
}

// ---------- model / effort selectors ----------

async function populateModelSelectors() {
  const res = await fetch('/api/models');
  const data = await res.json();
  state.models = data.models || [];
  el.modelSelect.innerHTML = state.models
    .map((m) => `<option value="${m.slug}">${escapeHtml(m.display_name)}</option>`)
    .join('');
  updateEffortOptions();
}

function updateEffortOptions(preferredEffort) {
  const model = state.models.find((m) => m.slug === el.modelSelect.value) || state.models[0];
  if (!model) return;
  el.effortSelect.innerHTML = (model.reasoning_levels || [])
    .map((r) => `<option value="${r.effort}" title="${escapeHtml(r.description || '')}">${r.effort.toUpperCase()}</option>`)
    .join('');
  el.effortSelect.value = preferredEffort || model.default_effort || model.reasoning_levels?.[0]?.effort || '';
  el.contextBadge.textContent = model.context_window ? `${formatContext(model.context_window)} ctx` : '';
}

function formatContext(n) {
  if (n >= 1_000_000) return `${Math.round(n / 100000) / 10}M`;
  if (n >= 1_000) return `${Math.round(n / 1000)}K`;
  return String(n);
}

function syncSelectorsToConversation(convo) {
  if (convo) {
    el.modelSelect.value = convo.model;
    updateEffortOptions(convo.reasoningEffort);
    el.systemPromptInput.value = convo.systemPrompt || '';
  } else {
    updateEffortOptions();
  }
}

el.modelSelect.addEventListener('change', () => {
  updateEffortOptions();
  const convo = getCurrentConversation();
  if (convo) {
    convo.model = el.modelSelect.value;
    convo.reasoningEffort = el.effortSelect.value;
    saveConversations();
  }
});
el.effortSelect.addEventListener('change', () => {
  const convo = getCurrentConversation();
  if (convo) {
    convo.reasoningEffort = el.effortSelect.value;
    saveConversations();
  }
});

// ---------- system prompt ----------

el.settingsBtn.addEventListener('click', () => {
  el.systemPromptPanel.classList.toggle('hidden');
});
el.systemPromptInput.addEventListener('change', () => {
  const convo = getCurrentConversation();
  if (convo) {
    convo.systemPrompt = el.systemPromptInput.value;
    saveConversations();
  }
});

// ---------- sidebar toggle ----------

el.menuBtn.addEventListener('click', () => el.sidebar.classList.toggle('closed'));
el.newChatBtn.addEventListener('click', startNewChat);

// ---------- image attach ----------

el.attachBtn.addEventListener('click', () => el.fileInput.click());
el.fileInput.addEventListener('change', () => {
  const file = el.fileInput.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    state.pendingImage = reader.result;
    updateImagePreview();
  };
  reader.readAsDataURL(file);
  el.fileInput.value = '';
});
el.removeImageBtn.addEventListener('click', () => {
  state.pendingImage = null;
  updateImagePreview();
});
function updateImagePreview() {
  if (state.pendingImage) {
    el.imagePreviewImg.src = state.pendingImage;
    el.imagePreview.classList.remove('hidden');
  } else {
    el.imagePreview.classList.add('hidden');
  }
}

// ---------- composer ----------

el.messageInput.addEventListener('input', () => {
  el.messageInput.style.height = 'auto';
  el.messageInput.style.height = Math.min(el.messageInput.scrollHeight, 200) + 'px';
});
el.messageInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    el.composerForm.requestSubmit();
  }
});

el.composerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = el.messageInput.value.trim();
  if ((!text && !state.pendingImage) || state.controller) return;

  let convo = getCurrentConversation();
  if (!convo) {
    convo = createConversation();
    state.conversations.push(convo);
    state.currentId = convo.id;
  }

  let userContent;
  if (state.pendingImage) {
    userContent = [];
    if (text) userContent.push({ type: 'text', text });
    userContent.push({ type: 'image', url: state.pendingImage });
  } else {
    userContent = text;
  }

  if (!convo.title) {
    convo.title = text ? text.slice(0, 40) + (text.length > 40 ? '…' : '') : 'Image conversation';
  }
  convo.model = el.modelSelect.value;
  convo.reasoningEffort = el.effortSelect.value;
  convo.messages.push({ role: 'user', content: userContent });

  el.messageInput.value = '';
  el.messageInput.style.height = 'auto';
  state.pendingImage = null;
  updateImagePreview();

  renderMessages(convo);
  renderSidebar();
  saveConversations();

  await streamAssistantReply(convo);
});

async function streamAssistantReply(convo) {
  setStreamingUI(true);
  const assistantBubble = appendThinkingBubble();
  let assistantText = '';
  state.controller = new AbortController();

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: toResponsesInput(convo.messages),
        model: convo.model,
        instructions: convo.systemPrompt || undefined,
        reasoningEffort: convo.reasoningEffort,
      }),
      signal: state.controller.signal,
    });

    if (!res.ok || !res.body) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `Request failed (HTTP ${res.status})`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const data = trimmed.slice(5).trim();
        if (data === '[DONE]' || data === '') continue;

        let parsed;
        try {
          parsed = JSON.parse(data);
        } catch {
          continue;
        }
        if (parsed.error) throw new Error(parsed.error);
        if (parsed.delta) {
          assistantText += parsed.delta;
          assistantBubble.innerHTML = renderMarkdown(assistantText);
          highlightCode(assistantBubble);
          el.messages.scrollTop = el.messages.scrollHeight;
        }
      }
    }

    if (!assistantText) {
      assistantBubble.innerHTML = renderMarkdown('_No response text was returned._');
    }
    convo.messages.push({ role: 'assistant', content: assistantText });
    saveConversations();
  } catch (err) {
    if (err.name === 'AbortError') {
      if (assistantText) {
        convo.messages.push({ role: 'assistant', content: assistantText });
        saveConversations();
      }
    } else {
      assistantBubble.innerHTML = renderMarkdown(`⚠️ ${err.message}`);
      assistantBubble.classList.add('error');
    }
  } finally {
    setStreamingUI(false);
    state.controller = null;
  }
}

function setStreamingUI(isStreaming) {
  el.sendBtn.classList.toggle('hidden', isStreaming);
  el.stopBtn.classList.toggle('hidden', !isStreaming);
  el.messageInput.disabled = isStreaming;
}
el.stopBtn.addEventListener('click', () => state.controller?.abort());

// ---------- init ----------

(async function init() {
  loadConversations();
  await populateModelSelectors();
  renderSidebar();
  startNewChat();
})();
