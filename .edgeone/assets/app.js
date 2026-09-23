/**
 * AI Investor - Frontend Chat Application
 * Handles conversation state, SSE streaming, and Q-style UI
 */

const CONV_KEY = 'eo_conversation_id';
const CHAT_HISTORY_KEY = 'ai_investor_history';

let currentStream = null;
let isGenerating = false;

// ===== Conversation ID Management =====
function getOrCreateConversationId() {
  let id = localStorage.getItem(CONV_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(CONV_KEY, id);
  }
  return id;
}

function resetConversation() {
  localStorage.removeItem(CONV_KEY);
  localStorage.removeItem(CHAT_HISTORY_KEY);
  return getOrCreateConversationId();
}

// ===== UI Helpers =====
function autoResize(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
}

function handleKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
}

function scrollToBottom() {
  const container = document.getElementById('chatContainer');
  container.scrollTop = container.scrollHeight;
}

function showError(msg) {
  const toast = document.createElement('div');
  toast.className = 'error-toast';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

// ===== Message Rendering =====
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function renderMarkdown(text) {
  // Escape HTML first
  let html = escapeHtml(text);

  // Headers (### → h3)
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^# (.+)$/gm, '<h3>$1</h3>');

  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');

  // Italic
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Blockquote
  html = html.replace(/^\> (.+)$/gm, '<blockquote>$1</blockquote>');

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Unordered list
  html = html.replace(/^(\s*)[-\*] (.+)$/gm, '$1<li>$2</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');

  // Ordered list
  html = html.replace(/^(\s*)\d+\. (.+)$/gm, '$1<li>$2</li>');

  // Line breaks
  html = html.replace(/\n/g, '<br>');

  // Clean up consecutive breaks around block elements
  html = html.replace(/<br>\s*<\/h3>/g, '</h3>');
  html = html.replace(/<br>\s*<ul>/g, '<ul>');
  html = html.replace(/<\/ul>\s*<br>/g, '</ul>');
  html = html.replace(/<br>\s*<blockquote>/g, '<blockquote>');
  html = html.replace(/<\/blockquote>\s*<br>/g, '</blockquote>');

  return html;
}

function appendUserMessage(text) {
  const container = document.getElementById('chatContainer');
  const msgDiv = document.createElement('div');
  msgDiv.className = 'message user';
  msgDiv.innerHTML = `
    <div class="message-content">${escapeHtml(text)}</div>
    <div class="message-avatar">🧑</div>
  `;
  container.appendChild(msgDiv);
  scrollToBottom();
  saveMessageToHistory('user', text);
}

function appendAgentMessage() {
  const container = document.getElementById('chatContainer');
  const msgDiv = document.createElement('div');
  msgDiv.className = 'message agent';
  msgDiv.id = 'currentAgentMessage';
  msgDiv.innerHTML = `
    <div class="message-avatar">💰</div>
    <div class="message-content"></div>
  `;
  container.appendChild(msgDiv);
  scrollToBottom();
  return msgDiv.querySelector('.message-content');
}

function showThinking() {
  const container = document.getElementById('chatContainer');
  const thinkingDiv = document.createElement('div');
  thinkingDiv.className = 'message agent thinking-msg';
  thinkingDiv.id = 'thinkingIndicator';
  thinkingDiv.innerHTML = `
    <div class="message-avatar">💰</div>
    <div class="thinking">
      <div class="thinking-dots">
        <span></span><span></span><span></span>
      </div>
      <span class="thinking-text">投资人正在分析...</span>
    </div>
  `;
  container.appendChild(thinkingDiv);
  scrollToBottom();
}

function removeThinking() {
  const el = document.getElementById('thinkingIndicator');
  if (el) el.remove();
}

// ===== History Management =====
function saveMessageToHistory(role, content) {
  const history = JSON.parse(localStorage.getItem(CHAT_HISTORY_KEY) || '[]');
  history.push({ role, content, timestamp: Date.now() });
  localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(history));
}

function loadHistory() {
  const history = JSON.parse(localStorage.getItem(CHAT_HISTORY_KEY) || '[]');
  if (history.length === 0) return;

  const container = document.getElementById('chatContainer');
  // Remove welcome message if we have history
  const welcome = container.querySelector('.welcome-message');
  if (welcome) welcome.remove();

  history.forEach(({ role, content }) => {
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${role}`;
    if (role === 'user') {
      msgDiv.innerHTML = `
        <div class="message-content">${escapeHtml(content)}</div>
        <div class="message-avatar">🧑</div>
      `;
    } else {
      msgDiv.innerHTML = `
        <div class="message-avatar">💰</div>
        <div class="message-content">${renderMarkdown(content)}</div>
      `;
    }
    container.appendChild(msgDiv);
  });

  scrollToBottom();
}

function getHistoryArray() {
  return JSON.parse(localStorage.getItem(CHAT_HISTORY_KEY) || '[]');
}

// ===== SSE Parsing =====
function parseSSE(raw) {
  const lines = raw.split('\n');
  const events = [];
  let currentEvent = {};

  for (const line of lines) {
    if (line.startsWith('event: ')) {
      currentEvent.event = line.slice(7);
    } else if (line.startsWith('data: ')) {
      const dataStr = line.slice(6);
      if (dataStr === '[DONE]') {
        currentEvent.done = true;
      } else {
        try {
          currentEvent.data = JSON.parse(dataStr);
        } catch {
          currentEvent.data = dataStr;
        }
      }
    } else if (line === '') {
      if (Object.keys(currentEvent).length > 0) {
        events.push(currentEvent);
        currentEvent = {};
      }
    }
  }

  if (Object.keys(currentEvent).length > 0) {
    events.push(currentEvent);
  }

  return events;
}

// ===== Send Message =====
async function sendMessage() {
  const input = document.getElementById('messageInput');
  const sendBtn = document.getElementById('sendBtn');
  const text = input.value.trim();

  if (!text || isGenerating) {
    console.log('[sendMessage] Skipping: text empty or already generating', { text: !!text, isGenerating });
    return;
  }

  console.log('[sendMessage] Starting send', { text: text.slice(0, 50) });

  // Prevent double submission
  if (sendBtn.dataset.sending === 'true') {
    console.log('[sendMessage] Already sending, ignoring duplicate click');
    return;
  }
  sendBtn.dataset.sending = 'true';

  // Clear input
  input.value = '';
  input.style.height = 'auto';
  sendBtn.disabled = true;
  isGenerating = true;

  // Remove welcome message on first interaction
  const welcome = document.querySelector('.welcome-message');
  if (welcome) welcome.remove();

  // Append user message
  appendUserMessage(text);

  // Show thinking
  showThinking();

  const conversationId = getOrCreateConversationId();
  let fullResponse = '';
  let contentEl = null;

  try {
    console.log('[sendMessage] Fetching /chat...');
    const response = await fetch('/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'makers-conversation-id': conversationId,
      },
      body: JSON.stringify({ message: text, history: getHistoryArray() }),
    });
    console.log('[sendMessage] Response status:', response.status);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    removeThinking();
    contentEl = appendAgentMessage();
    console.log('[sendMessage] Starting to read stream...');

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n\n');
      buffer = lines.pop() || '';

      for (const chunk of lines) {
        if (!chunk.trim()) continue;

        const events = parseSSE(chunk);
        for (const evt of events) {
          if (evt.done) {
            // Stream complete
            continue;
          }

          if (evt.data?.type === 'ai_response' && evt.data.content) {
            fullResponse += evt.data.content;
            contentEl.innerHTML = renderMarkdown(fullResponse);
            scrollToBottom();
            if (fullResponse.length % 100 === 0) {
              console.log('[SSE] Streaming...', { len: fullResponse.length });
            }
          } else if (evt.data?.type === 'error_message') {
            console.error('[SSE] Error from agent:', evt.data.content);
            showError(evt.data.content || '出错了，请重试');
          } else if (evt.data?.type === 'ping') {
            // Heartbeat, ignore
          }
        }
      }
    }

    console.log('[sendMessage] Stream complete', { responseLen: fullResponse.length });

    // Save agent response to history
    if (fullResponse) {
      saveMessageToHistory('agent', fullResponse);
    }

  } catch (err) {
    removeThinking();
    console.error('Chat error:', err);
    showError(err.message || '连接失败，请检查网络');
  } finally {
    isGenerating = false;
    sendBtn.disabled = false;
    sendBtn.dataset.sending = 'false';
    const currentMsg = document.getElementById('currentAgentMessage');
    if (currentMsg) {
      currentMsg.id = '';
    }
    input.focus();
  }
}

// ===== Clear Chat =====
function clearChat() {
  if (!confirm('确定要清空所有对话吗？')) return;

  const container = document.getElementById('chatContainer');
  container.innerHTML = `
    <div class="welcome-message">
      <div class="welcome-bubble">
        <p>👋 你好，我是<strong>毒舌投资人</strong>。</p>
        <p>我见过太多项目，好的坏的都门儿清。</p>
        <p>把你的副业想法告诉我，我给你一个<strong>真实到扎心</strong>的评估——包括我愿意投多少钱（或者白送都不要 👋）。</p>
        <p class="hint">💡 描述得越详细（做什么、目标用户、怎么赚钱），我骂得越准。</p>
      </div>
    </div>
  `;

  resetConversation();
}

// ===== Init =====
document.addEventListener('DOMContentLoaded', () => {
  loadHistory();
  document.getElementById('messageInput').focus();
});
