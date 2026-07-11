/**
 * Generates the responsive HTML/CSS/JS webview sidebar layout with multi-vendor tier selector, live cost tracking, sessions management, and dynamic tool configurator modals.
 */
export function getSidebarHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Logan Agent</title>
  <style>
    :root {
      --header-bg: var(--vscode-sideBarSectionHeader-background, #252526);
      --border-color: var(--vscode-widget-border, #454545);
      --card-bg: var(--vscode-editor-background, #1e1e1e);
      --accent: var(--vscode-button-background, #0e639c);
    }
    body {
      font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
      font-size: var(--vscode-font-size, 13px);
      color: var(--vscode-foreground, #cccccc);
      background-color: var(--vscode-sideBar-background, #181818);
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      height: 100vh;
      box-sizing: border-box;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 12px;
      background-color: var(--header-bg);
      border-bottom: 1px solid var(--border-color);
    }
    .title {
      font-weight: 600;
      font-size: 14px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .toolbar {
      display: flex;
      gap: 6px;
      padding: 6px 12px;
      background: var(--vscode-sideBar-background);
      border-bottom: 1px solid var(--border-color);
    }
    .nav-btn {
      background: var(--vscode-button-secondaryBackground, #3a3d41);
      color: var(--vscode-button-secondaryForeground, #ffffff);
      border: none;
      padding: 5px 10px;
      border-radius: 3px;
      cursor: pointer;
      font-size: 11px;
      font-weight: 500;
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .nav-btn:hover {
      background: var(--vscode-button-secondaryHoverBackground, #45494e);
    }
    select {
      background: var(--vscode-dropdown-background, #3c3c3c);
      color: var(--vscode-dropdown-foreground, #f0f0f0);
      border: 1px solid var(--vscode-dropdown-border, #3c3c3c);
      padding: 4px 8px;
      border-radius: 3px;
      cursor: pointer;
      font-size: 11px;
    }
    #stats-bar {
      padding: 6px 12px;
      font-size: 11px;
      background: var(--vscode-statusBar-background, #007acc);
      color: var(--vscode-statusBar-foreground, #ffffff);
      display: flex;
      justify-content: space-between;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    #chat-container {
      flex: 1;
      overflow-y: auto;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .message-card {
      padding: 8px 10px;
      border-radius: 4px;
      background: var(--card-bg);
      border: 1px solid var(--border-color);
      line-height: 1.4;
      word-break: break-word;
    }
    .message-user {
      border-left: 3px solid #4ec9b0;
    }
    .message-assistant {
      border-left: 3px solid var(--accent);
    }
    details {
      background: var(--vscode-textCodeBlock-background, #111111);
      border: 1px solid var(--border-color);
      border-radius: 4px;
      padding: 6px 8px;
      font-size: 12px;
    }
    summary {
      cursor: pointer;
      font-weight: 500;
      color: var(--vscode-textLink-foreground, #3794ff);
    }
    .tool-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: var(--vscode-badge-background, #4d4d4d);
      color: var(--vscode-badge-foreground, #ffffff);
      padding: 4px 8px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 500;
      margin: 4px 0;
    }
    .diff-card {
      background: var(--vscode-diffEditor-insertedTextBackground, #143d26);
      border: 1px solid #287b4c;
      border-radius: 4px;
      padding: 10px;
      margin: 6px 0;
    }
    .diff-title {
      font-weight: bold;
      font-size: 12px;
      margin-bottom: 8px;
    }
    .diff-actions {
      display: flex;
      gap: 8px;
    }
    .btn-approve {
      background: #2ea043;
      color: white;
      border: none;
      padding: 5px 10px;
      border-radius: 3px;
      cursor: pointer;
    }
    .btn-reject {
      background: #da3633;
      color: white;
      border: none;
      padding: 5px 10px;
      border-radius: 3px;
      cursor: pointer;
    }
    .btn-rollback {
      background: #5a5a5a;
      color: white;
      border: none;
      padding: 4px 8px;
      border-radius: 3px;
      font-size: 11px;
      cursor: pointer;
      margin-top: 8px;
      display: inline-block;
    }
    .btn-rollback:hover {
      background: #7a7a7a;
    }
    .btn-stop {
      background: #da3633;
      color: white;
      border: none;
      padding: 6px 14px;
      border-radius: 3px;
      cursor: pointer;
      font-weight: bold;
      display: none;
    }
    .btn-stop:hover {
      background: #b82826;
    }
    pre {
      background: var(--vscode-textCodeBlock-background, #0a0a0a);
      padding: 8px;
      border-radius: 3px;
      overflow-x: auto;
      white-space: pre-wrap;
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 12px;
      margin: 6px 0 0 0;
    }
    .input-section {
      padding: 10px;
      border-top: 1px solid var(--border-color);
      display: flex;
      flex-direction: column;
      gap: 6px;
      background: var(--vscode-sideBar-background);
    }
    textarea {
      width: 100%;
      min-height: 54px;
      max-height: 150px;
      background: var(--vscode-input-background, #3c3c3c);
      color: var(--vscode-input-foreground, #cccccc);
      border: 1px solid var(--vscode-input-border, #3c3c3c);
      padding: 8px;
      border-radius: 3px;
      resize: vertical;
      font-family: inherit;
      font-size: inherit;
      box-sizing: border-box;
    }
    textarea:focus {
      outline: 1px solid var(--vscode-focusBorder, #007acc);
    }
    .btn-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
    }
    .hint {
      font-size: 11px;
      color: var(--vscode-descriptionForeground, #888);
    }
    button.send-btn {
      background: var(--accent);
      color: var(--vscode-button-foreground, #ffffff);
      border: none;
      padding: 6px 14px;
      border-radius: 3px;
      cursor: pointer;
      font-weight: 500;
    }
    button.send-btn:hover {
      background: var(--vscode-button-hoverBackground, #1177bb);
    }
    .modal {
      display: none;
      position: absolute;
      top: 0; left: 0; right: 0; bottom: 0;
      background: var(--vscode-sideBar-background);
      z-index: 100;
      padding: 14px;
      overflow-y: auto;
    }
    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid var(--border-color);
      padding-bottom: 10px;
      margin-bottom: 10px;
    }
    .modal-title-row {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: bold;
      font-size: 14px;
    }
    .selected-badge {
      background: var(--accent);
      color: white;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: normal;
    }
    .modal-close {
      background: none;
      border: none;
      color: var(--vscode-foreground);
      cursor: pointer;
      font-size: 16px;
    }
    .session-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px;
      border-bottom: 1px solid var(--border-color);
    }
    .session-title {
      cursor: pointer;
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .session-title:hover {
      color: var(--vscode-textLink-foreground);
    }
    .search-input {
      width: 100%;
      padding: 6px 8px;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border);
      border-radius: 3px;
      box-sizing: border-box;
      margin-bottom: 10px;
    }
    .master-toggle-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px;
      background: var(--vscode-editor-background);
      border: 1px solid var(--border-color);
      border-radius: 4px;
      margin-bottom: 12px;
      font-weight: 600;
    }
    .category-section {
      margin-bottom: 16px;
    }
    .category-header {
      font-weight: bold;
      font-size: 12px;
      color: var(--vscode-textLink-foreground);
      border-bottom: 1px solid var(--border-color);
      padding-bottom: 4px;
      margin-bottom: 8px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .tool-row {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      padding: 6px 4px;
    }
    .tool-info {
      flex: 1;
    }
    .tool-name {
      font-weight: bold;
      color: var(--vscode-foreground);
    }
    .tool-desc {
      font-size: 11px;
      color: var(--vscode-descriptionForeground, #8a8a8a);
      margin-top: 2px;
    }
    .modal-footer {
      padding-top: 12px;
      border-top: 1px solid var(--border-color);
      display: flex;
      justify-content: flex-end;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="title">🤖 Logan Agent v0.2.0</div>
    <select id="plan-selector">
      <option value="economy">Economy (GapGPT / Gemini / Suno)</option>
      <option value="pro" selected>Pro (Claude / DeepSeek / Alibaba / xAI)</option>
    </select>
  </div>
  <div class="toolbar">
    <button class="nav-btn" id="new-chat-btn">+ New Chat</button>
    <button class="nav-btn" id="history-btn">📂 History</button>
    <button class="nav-btn" id="tools-btn">🛠️ Configure Tools</button>
  </div>
  <div id="stats-bar">
    <span>Tokens: <strong id="token-count">0 in / 0 out</strong></span>
    <span>Cache Savings: <strong id="cache-savings">0%</strong></span>
    <span>Est. Cost: <strong id="est-cost">$0.0000</strong></span>
  </div>
  <div id="chat-container">
    <div class="message-card message-assistant">
      <b>Logan Agent</b>
      <div>Hello! I am ready to inspect code, build files, run terminal commands, or generate audio assets.</div>
    </div>
  </div>
  <div class="input-section">
    <textarea id="user-input" placeholder="Ask Logan Agent... (Cmd/Ctrl + Enter to submit)"></textarea>
    <div class="btn-row">
      <span class="hint">Cmd/Ctrl + Enter to send</span>
      <div style="display:flex;gap:6px;">
        <button class="btn-stop" id="stop-btn">🛑 Stop Generation</button>
        <button class="send-btn" id="send-btn">Send Task</button>
      </div>
    </div>
  </div>

  <div id="history-modal" class="modal">
    <div class="modal-header">
      <div class="modal-title-row"><span>📂 Past Conversations</span></div>
      <button class="modal-close" onclick="document.getElementById('history-modal').style.display='none'">✕</button>
    </div>
    <div id="sessions-list">Loading sessions...</div>
  </div>

  <div id="tools-modal" class="modal">
    <div class="modal-header">
      <div class="modal-title-row">
        <span>Configure Tools</span>
        <span id="selected-badge" class="selected-badge">0 Selected</span>
      </div>
      <button class="modal-close" onclick="document.getElementById('tools-modal').style.display='none'">✕</button>
    </div>
    <input type="text" id="tool-search" class="search-input" placeholder="Search tools by name or keyword..." oninput="window.filterTools()">
    <div class="master-toggle-row">
      <input type="checkbox" id="master-toggle" onchange="window.toggleAllTools(this.checked)">
      <label for="master-toggle" style="cursor:pointer;">Select All / None</label>
    </div>
    <div id="tools-list">Loading tool definitions...</div>
    <div class="modal-footer">
      <button class="send-btn" onclick="document.getElementById('tools-modal').style.display='none'">OK / Close</button>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    const planSelector = document.getElementById('plan-selector');
    const userInput = document.getElementById('user-input');
    const sendBtn = document.getElementById('send-btn');
    const stopBtn = document.getElementById('stop-btn');
    const chatContainer = document.getElementById('chat-container');

    const tokenCountEl = document.getElementById('token-count');
    const cacheSavingsEl = document.getElementById('cache-savings');
    const estCostEl = document.getElementById('est-cost');

    let totalIn = 0;
    let totalOut = 0;
    let totalCached = 0;
    let currentCostUSD = 0.0;
    let currentDetailsBox = null;
    let currentToolsList = [];

    planSelector.addEventListener('change', (e) => {
      vscode.postMessage({ type: 'SWITCH_PLAN', payload: { plan: e.target.value } });
    });

    document.getElementById('new-chat-btn').addEventListener('click', () => {
      vscode.postMessage({ type: 'NEW_CHAT' });
    });

    document.getElementById('history-btn').addEventListener('click', () => {
      document.getElementById('history-modal').style.display = 'block';
      vscode.postMessage({ type: 'GET_SESSIONS_LIST' });
    });

    document.getElementById('tools-btn').addEventListener('click', () => {
      document.getElementById('tools-modal').style.display = 'block';
      vscode.postMessage({ type: 'GET_AVAILABLE_TOOLS' });
    });

    window.toggleTool = function(toolName, enabled) {
      const item = currentToolsList.find((t) => t.name === toolName);
      if (item) item.enabled = enabled;
      renderToolsList();
      vscode.postMessage({ type: 'UPDATE_TOOL_SELECTION', payload: { toolName: toolName, enabled: enabled } });
    };

    window.toggleAllTools = function(enabled) {
      const selectedTools = [];
      currentToolsList.forEach((t) => {
        t.enabled = enabled;
        if (enabled) selectedTools.push(t.name);
      });
      renderToolsList();
      vscode.postMessage({ type: 'UPDATE_TOOL_SELECTION', payload: { selectedTools: selectedTools } });
    };

    window.filterTools = function() {
      renderToolsList();
    };

    function renderToolsList() {
      const query = (document.getElementById('tool-search').value || '').toLowerCase().trim();
      const listEl = document.getElementById('tools-list');
      const badgeEl = document.getElementById('selected-badge');
      const masterToggle = document.getElementById('master-toggle');

      const enabledCount = currentToolsList.filter((t) => t.enabled).length;
      badgeEl.textContent = enabledCount + ' Selected';
      masterToggle.checked = currentToolsList.length > 0 && enabledCount === currentToolsList.length;

      const categories = [
        { label: '📂 File Operations', key: 'File Ops' },
        { label: '💻 Terminal Execution', key: 'Terminal' },
        { label: '🔍 Search & RAG', key: 'Search & RAG' },
        { label: '🎵 Media Generation', key: 'Media' }
      ];

      let html = '';
      let anyRendered = false;

      categories.forEach((cat) => {
        const matches = currentToolsList.filter((t) => {
          if (t.category !== cat.key) return false;
          if (!query) return true;
          return t.name.toLowerCase().includes(query) || t.description.toLowerCase().includes(query);
        });

        if (matches.length > 0) {
          anyRendered = true;
          html += '<div class="category-section"><div class="category-header">' + cat.label + '</div>';
          matches.forEach((t) => {
            const checkedStr = t.enabled ? 'checked' : '';
            html += '<div class="tool-row">' +
              '<input type="checkbox" id="tool_' + t.name + '" ' + checkedStr + ' onchange="window.toggleTool(\\'' + t.name + '\\', this.checked)">' +
              '<div class="tool-info"><label for="tool_' + t.name + '" class="tool-name" style="cursor:pointer;">' + t.name + '</label>' +
              '<div class="tool-desc">' + escapeHtml(t.description) + '</div></div>' +
              '</div>';
          });
          html += '</div>';
        }
      });

      if (!anyRendered) {
        listEl.innerHTML = '<div style="color:#888;padding:8px;">No tools matching search query.</div>';
      } else {
        listEl.innerHTML = html;
      }
    }

    window.loadSession = function(sesId) {
      vscode.postMessage({ type: 'LOAD_CHAT', payload: { sessionId: sesId } });
    };

    window.deleteSession = function(sesId) {
      vscode.postMessage({ type: 'DELETE_CHAT', payload: { sessionId: sesId } });
    };

    function setGenerating(isGenerating) {
      if (isGenerating) {
        stopBtn.style.display = 'inline-block';
        sendBtn.disabled = true;
      } else {
        stopBtn.style.display = 'none';
        sendBtn.disabled = false;
        currentDetailsBox = null;
      }
    }

    stopBtn.addEventListener('click', () => {
      vscode.postMessage({ type: 'ABORT_GENERATION' });
      setGenerating(false);
    });

    function sendPrompt() {
      const text = userInput.value.trim();
      if (!text) return;
      appendCard('You', text, 'user');
      userInput.value = '';
      setGenerating(true);
      vscode.postMessage({ type: 'SEND_PROMPT', payload: { prompt: text } });
    }

    sendBtn.addEventListener('click', sendPrompt);
    userInput.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        sendPrompt();
      }
    });

    function appendCard(sender, content, roleClass) {
      const card = document.createElement('div');
      card.className = 'message-card message-' + roleClass;
      card.innerHTML = '<b>' + sender + '</b><pre>' + escapeHtml(content) + '</pre>';
      chatContainer.appendChild(card);
      chatContainer.scrollTop = chatContainer.scrollHeight;
      return card;
    }

    function escapeHtml(str) {
      return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    window.triggerRollback = function(checkpointId) {
      vscode.postMessage({ type: 'TRIGGER_ROLLBACK', payload: { checkpointId: checkpointId || 'latest' } });
    };

    window.approveDiff = function(filePath) {
      vscode.postMessage({ type: 'APPROVE_DIFF', payload: { filePath: filePath } });
    };

    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (!msg) return;

      if (msg.type === 'AVAILABLE_TOOLS_DATA') {
        currentToolsList = msg.payload.tools || [];
        renderToolsList();
      } else if (msg.type === 'SESSIONS_LIST_UPDATED') {
        const listEl = document.getElementById('sessions-list');
        const sessions = msg.payload.sessions || [];
        if (sessions.length === 0) {
          listEl.innerHTML = '<div style="padding:8px;color:#888;">No past conversation history found.</div>';
        } else {
          listEl.innerHTML = '';
          sessions.forEach((s) => {
            const item = document.createElement('div');
            item.className = 'session-item';
            const dateStr = new Date(s.timestamp).toLocaleDateString() + ' ' + new Date(s.timestamp).toLocaleTimeString();
            item.innerHTML = '<span class="session-title" onclick="window.loadSession(\\'' + s.id + '\\')">💬 ' + escapeHtml(s.title) + ' <small style="color:#888;">(' + dateStr + ')</small></span>' +
              '<button class="nav-btn" style="background:#da3633;" onclick="window.deleteSession(\\'' + s.id + '\\')">🗑️</button>';
            listEl.appendChild(item);
          });
        }
      } else if (msg.type === 'CHAT_LOADED') {
        document.getElementById('history-modal').style.display = 'none';
        chatContainer.innerHTML = '';
        const msgs = msg.payload.messages || [];
        if (msgs.length === 0) {
          appendCard('Logan Agent', 'Hello! I am ready to inspect code, build files, run terminal commands, or generate audio assets.', 'assistant');
        } else {
          msgs.forEach((m) => {
            if (m.role === 'user' && !m.content.startsWith('[SYSTEM CONTEXT COMPACTION')) {
              appendCard('You', m.content, 'user');
            } else if (m.role === 'assistant') {
              appendCard('Logan Agent', m.content, 'assistant');
            }
          });
        }
      } else if (msg.type === 'THINKING_STEP') {
        setGenerating(true);
        if (!currentDetailsBox) {
          currentDetailsBox = document.createElement('details');
          currentDetailsBox.open = true;
          currentDetailsBox.innerHTML = '<summary>🧠 Logan Thinking...</summary><div class="details-body" style="margin-top:6px;font-size:11px;color:#8a8a8a;"></div>';
          chatContainer.appendChild(currentDetailsBox);
        }
        const body = currentDetailsBox.querySelector('.details-body');
        const line = document.createElement('div');
        line.textContent = '[Step ' + (msg.payload.step || 0) + '] ' + (msg.payload.description || '');
        body.appendChild(line);
        chatContainer.scrollTop = chatContainer.scrollHeight;
      } else if (msg.type === 'TOOL_EXECUTION_START') {
        setGenerating(true);
        const badge = document.createElement('div');
        badge.className = 'tool-badge';
        badge.textContent = msg.payload.description || ('⚡ Executing ' + msg.payload.toolName);
        chatContainer.appendChild(badge);
        chatContainer.scrollTop = chatContainer.scrollHeight;
      } else if (msg.type === 'DIFF_PROPOSED') {
        const diffCard = document.createElement('div');
        diffCard.className = 'diff-card';
        const fp = msg.payload.filePath || 'Workspace File';
        const chk = msg.payload.checkpointId || 'latest';
        diffCard.innerHTML = '<div class="diff-title">✏️ Staged Diff Proposed: ' + escapeHtml(fp) + '</div>' +
          '<div class="diff-actions">' +
          '<button class="btn-approve" onclick="window.approveDiff(\\'' + escapeHtml(fp) + '\\')">✅ Approve & Save</button>' +
          '<button class="btn-reject" onclick="window.triggerRollback(\\'' + escapeHtml(chk) + '\\')">❌ Reject Change</button>' +
          '</div>';
        chatContainer.appendChild(diffCard);
        chatContainer.scrollTop = chatContainer.scrollHeight;
      } else if (msg.type === 'STREAM_CHUNK') {
        setGenerating(false);
        const card = appendCard('Logan Agent', msg.payload.chunk || '', 'assistant');
        const rbBtn = document.createElement('button');
        rbBtn.className = 'btn-rollback';
        rbBtn.textContent = '⏪ Undo / Rewind Step';
        rbBtn.onclick = function() { window.triggerRollback('latest'); };
        card.appendChild(document.createElement('br'));
        card.appendChild(rbBtn);
        chatContainer.scrollTop = chatContainer.scrollHeight;
      } else if (msg.type === 'GENERATION_ABORTED') {
        setGenerating(false);
        const abortDiv = document.createElement('div');
        abortDiv.style.color = '#dda0dd';
        abortDiv.style.padding = '6px';
        abortDiv.innerHTML = '<i>🛑 Generation stopped by user.</i>';
        chatContainer.appendChild(abortDiv);
        chatContainer.scrollTop = chatContainer.scrollHeight;
      } else if (msg.type === 'TOKEN_USAGE_UPDATE') {
        const metrics = msg.payload.metrics;
        if (metrics) {
          totalIn += (metrics.inputTokens || 0);
          totalOut += (metrics.outputTokens || 0);
          totalCached += (metrics.cachedTokens || 0);

          const plan = planSelector.value;
          if (plan === 'economy') {
            currentCostUSD += ((metrics.inputTokens || 0) * 0.000000075) + ((metrics.outputTokens || 0) * 0.00000030);
          } else {
            currentCostUSD += ((metrics.inputTokens || 0) * 0.000003) + ((metrics.outputTokens || 0) * 0.000015);
          }

          tokenCountEl.textContent = totalIn + ' in / ' + totalOut + ' out';
          const cachePct = totalIn > 0 ? Math.round((totalCached / (totalIn + totalCached)) * 100) : 0;
          cacheSavingsEl.textContent = cachePct + '%';
          estCostEl.textContent = '$' + currentCostUSD.toFixed(4);
        }
      } else if (msg.type === 'ERROR_ALERT') {
        setGenerating(false);
        const errDiv = document.createElement('div');
        errDiv.style.color = '#f48771';
        errDiv.style.padding = '8px';
        errDiv.innerHTML = '<b>Runtime Error:</b> ' + escapeHtml(msg.payload.errorMessage || 'Unknown error');
        chatContainer.appendChild(errDiv);
        chatContainer.scrollTop = chatContainer.scrollHeight;
      }
    });
  </script>
</body>
</html>`;
}
