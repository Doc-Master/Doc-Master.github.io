        // ── DOM refs ──
        const uploadArea = document.getElementById('uploadArea');
        const fileInput = document.getElementById('fileInput');
        const uploadStatus = document.getElementById('uploadStatus');
        const documentList = document.getElementById('documentList');
        const settingsHeader = document.getElementById('settingsHeader');
        const settingsToggle = document.getElementById('settingsToggle');
        const settingsContent = document.getElementById('settingsContent');
        const filterTopKInput = document.getElementById('filterTopK');
        const ragTopKInput = document.getElementById('ragTopK');
        const resetSettingsBtn = document.getElementById('resetSettings');

        let refreshInterval = null;
        const DEFAULT_SETTINGS = { filterTopK: 10, ragTopK: 5 };

        // ── State ──
        let currentDocuments = [];
        let currentTreeData = null;
        let currentIndexData = null;
        let currentViewMode = 'tree';
        let chatHistory = [];
        let chatScope = 'all';
        let filteredDocuments = [];
        let inputMode = 'chat'; // 'chat' | 'filter'
        let filterHistory = [];
        let sessionMsgCount = 0;
        let sessionFilterCount = 0;

        // ── Init ──
        loadDocuments();
        loadSettings();
        startAutoRefresh();

        // ── Settings panel ──
        settingsHeader.addEventListener('click', () => {
            settingsContent.classList.toggle('show');
            settingsToggle.classList.toggle('open');
            settingsHeader.classList.toggle('open');
        });

        filterTopKInput.addEventListener('change', saveSettings);
        ragTopKInput.addEventListener('change', saveSettings);

        resetSettingsBtn.addEventListener('click', () => {
            filterTopKInput.value = DEFAULT_SETTINGS.filterTopK;
            ragTopKInput.value = DEFAULT_SETTINGS.ragTopK;
            saveSettings();
        });

        function saveSettings() {
            localStorage.setItem('semantic_filter_settings', JSON.stringify({
                filterTopK: parseInt(filterTopKInput.value),
                ragTopK: parseInt(ragTopKInput.value)
            }));
        }

        function loadSettings() {
            const s = localStorage.getItem('semantic_filter_settings');
            if (s) {
                try {
                    const p = JSON.parse(s);
                    filterTopKInput.value = p.filterTopK || DEFAULT_SETTINGS.filterTopK;
                    ragTopKInput.value = p.ragTopK || DEFAULT_SETTINGS.ragTopK;
                } catch(e) {}
            }
        }

        // ── Upload ──
        uploadArea.addEventListener('click', () => fileInput.click());

        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.classList.add('dragover');
        });

        uploadArea.addEventListener('dragleave', () => {
            uploadArea.classList.remove('dragover');
        });

        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('dragover');
            if (e.dataTransfer.files.length > 0) handleFile(e.dataTransfer.files[0]);
        });

        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) handleFile(e.target.files[0]);
        });

        async function loadDocuments() {
            try {
                const res = await fetch('/api/documents');
                const data = await res.json();
                if (res.ok) {
                    const changed = JSON.stringify(currentDocuments) !== JSON.stringify(data.documents);
                    if (changed) {
                        currentDocuments = data.documents;
                        displayDocumentList(data.documents);
                    }
                } else {
                    documentList.innerHTML = '<div style="text-align:center;color:#9ca3af;padding:14px;font-size:0.88em;">No documents uploaded yet</div>';
                }
            } catch(e) { console.error(e); }
        }

        function startAutoRefresh() {
            setTimeout(() => document.getElementById('syncIndicator').classList.add('show'), 1000);
            refreshInterval = setInterval(loadDocuments, 5000);
        }

        function stopAutoRefresh() {
            if (refreshInterval) { clearInterval(refreshInterval); refreshInterval = null; }
            document.getElementById('syncIndicator').classList.remove('show');
        }

        document.addEventListener('visibilitychange', () => {
            if (document.hidden) { stopAutoRefresh(); }
            else { loadDocuments(); startAutoRefresh(); }
        });

        function displayDocumentList(docs) {
            if (!docs || docs.length === 0) {
                documentList.innerHTML = '<div style="text-align:center;color:#9ca3af;padding:14px;font-size:0.88em;">No documents uploaded yet</div>';
                return;
            }
            documentList.innerHTML =
                '<div class="doc-list-label">Uploaded Documents</div>' +
                docs.map(d => `
                    <div class="document-item">
                        <span class="document-name">${d.filename}</span>
                        <span class="document-size">${formatFileSize(d.size)}</span>
                    </div>
                `).join('');
            updateTreeDocumentSelect(docs);
        }

        function updateTreeDocumentSelect(docs) {
            const sel = document.getElementById('treeDocumentSelect');
            const prev = sel.value;
            sel.innerHTML = '<option value="">Select a document&hellip;</option>' +
                docs.map(d => `<option value="${d.filename}">${d.filename}</option>`).join('');
            if (prev && docs.some(d => d.filename === prev)) {
                sel.value = prev;
                document.getElementById('loadTreeBtn').disabled = false;
            }
        }

        function formatFileSize(bytes) {
            if (bytes < 1024) return bytes + ' B';
            if (bytes < 1048576) return (bytes/1024).toFixed(1) + ' KB';
            return (bytes/1048576).toFixed(1) + ' MB';
        }

        async function handleFile(file) {
            if (!file.name.endsWith('.pdf')) { showStatus('Only PDF files are supported.', 'error'); return; }
            const fd = new FormData();
            fd.append('file', file);
            showStatus('Processing document and building semantic index&hellip; <span class="loading"></span>', 'info');
            try {
                const res = await fetch('/api/upload', { method: 'POST', body: fd });
                const data = await res.json();
                if (res.ok) {
                    showStatus(`&#x2705; ${data.filename} uploaded and indexed successfully.`, 'success');
                    await loadDocuments();
                } else {
                    showStatus(`&#x274C; Error: ${data.error}`, 'error');
                }
            } catch(e) {
                showStatus(`&#x274C; Network error: ${e.message}`, 'error');
            }
        }

        function showStatus(msg, type) {
            uploadStatus.innerHTML = `<div class="status ${type}">${msg}</div>`;
        }

        // ── Filter Progress Animation ──
        const filterOverlay = document.getElementById('filterProgressOverlay');
        const fpSteps = [
            document.getElementById('fpStep1'),
            document.getElementById('fpStep2'),
            document.getElementById('fpStep3')
        ];
        const fpBar = document.getElementById('filterProgressBar');

        function showFilterProgress() {
            fpSteps.forEach(s => {
                s.classList.remove('active', 'done');
                s.querySelector('.fp-step-status').innerHTML = '';
            });
            fpBar.style.width = '0%';
            filterOverlay.classList.add('show');

            setTimeout(() => {
                fpSteps[0].classList.add('active');
                fpSteps[0].querySelector('.fp-step-status').innerHTML = '<span class="loading loading-blue"></span>';
                fpBar.style.width = '15%';
            }, 100);

            setTimeout(() => {
                fpSteps[0].classList.remove('active');
                fpSteps[0].classList.add('done');
                fpSteps[0].querySelector('.fp-step-status').innerHTML = '<span class="fp-step-check">&#x2713;</span>';
                fpSteps[1].classList.add('active');
                fpSteps[1].querySelector('.fp-step-status').innerHTML = '<span class="loading loading-blue"></span>';
                fpBar.style.width = '45%';
            }, 1500);

            setTimeout(() => {
                fpSteps[1].classList.remove('active');
                fpSteps[1].classList.add('done');
                fpSteps[1].querySelector('.fp-step-status').innerHTML = '<span class="fp-step-check">&#x2713;</span>';
                fpSteps[2].classList.add('active');
                fpSteps[2].querySelector('.fp-step-status').innerHTML = '<span class="loading loading-blue"></span>';
                fpBar.style.width = '75%';
            }, 3000);
        }

        function hideFilterProgress() {
            fpSteps[2].classList.remove('active');
            fpSteps[2].classList.add('done');
            fpSteps[2].querySelector('.fp-step-status').innerHTML = '<span class="fp-step-check">&#x2713;</span>';
            fpBar.style.width = '100%';
            setTimeout(() => { filterOverlay.classList.remove('show'); }, 500);
        }

        // ── Input Mode Switching ──
        const inputModeTabs = document.getElementById('inputModeTabs');
        const chatInput = document.getElementById('chatInput');
        const chatSendBtn = document.getElementById('chatSendBtn');
        const chatMessages = document.getElementById('chatMessages');
        const chatEmpty = document.getElementById('chatEmpty');
        const chatClearBtn = document.getElementById('chatClearBtn');
        const chatScopeOptions = document.getElementById('chatScopeOptions');
        const filteredScopeChip = document.getElementById('filteredScopeChip');
        const inputScopeBar = document.getElementById('inputScopeBar');

        inputModeTabs.addEventListener('click', e => {
            const tab = e.target.closest('.input-mode-tab');
            if (!tab || tab.classList.contains('active')) return;
            inputModeTabs.querySelectorAll('.input-mode-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            inputMode = tab.dataset.mode;
            updateInputMode();
        });

        function updateInputMode() {
            if (inputMode === 'filter') {
                chatInput.placeholder = 'Enter a filter condition, e.g., "This paper discusses machine learning in healthcare"';
                chatInput.classList.add('filter-mode');
                chatSendBtn.classList.add('filter-mode');
                inputScopeBar.style.display = 'none';
            } else {
                chatInput.placeholder = 'Ask a question about your documents\u2026';
                chatInput.classList.remove('filter-mode');
                chatSendBtn.classList.remove('filter-mode');
                inputScopeBar.style.display = 'flex';
            }
        }

        // ── Scope ──
        chatScopeOptions.addEventListener('click', e => {
            const chip = e.target.closest('.scope-chip');
            if (!chip) return;
            chatScopeOptions.querySelectorAll('.scope-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            chatScope = chip.dataset.scope;
        });

        function showFilteredScopeOption(docNames) {
            filteredDocuments = docNames;
            filteredScopeChip.style.display = '';
        }

        // ── Chat Input ──
        chatInput.addEventListener('input', () => {
            chatInput.style.height = 'auto';
            chatInput.style.height = Math.min(chatInput.scrollHeight, 100) + 'px';
        });

        chatInput.addEventListener('keydown', e => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
            }
        });

        chatSendBtn.addEventListener('click', handleSend);

        chatClearBtn.addEventListener('click', () => {
            chatHistory = [];
            chatMessages.innerHTML = '';
            chatMessages.appendChild(chatEmpty);
            chatEmpty.style.display = 'flex';
            sessionMsgCount = 0;
            updateSessionStats();
        });

        function handleSend() {
            if (inputMode === 'filter') {
                sendFilterMessage();
            } else {
                sendChatMessage();
            }
        }

        // ── Conversation Helpers ──
        function escapeHtml(text) {
            const d = document.createElement('div');
            d.textContent = text;
            return d.innerHTML;
        }

        function hideWelcome() {
            chatEmpty.style.display = 'none';
        }

        function appendConvMessage(role, contentHtml, extraClass) {
            hideWelcome();
            const msgEl = document.createElement('div');
            msgEl.className = `conv-message ${role}` + (extraClass ? ` ${extraClass}` : '');

            const avatarEl = document.createElement('div');
            avatarEl.className = 'conv-avatar';
            avatarEl.textContent = role === 'user' ? 'U' : (role === 'system' ? 'F' : 'AI');

            const bubbleEl = document.createElement('div');
            bubbleEl.className = 'conv-bubble';
            bubbleEl.innerHTML = contentHtml;

            msgEl.appendChild(avatarEl);
            msgEl.appendChild(bubbleEl);
            chatMessages.appendChild(msgEl);
            chatMessages.scrollTop = chatMessages.scrollHeight;
            return msgEl;
        }

        function appendThinkingIndicator(id) {
            hideWelcome();
            const msgEl = document.createElement('div');
            msgEl.className = 'conv-message assistant';
            msgEl.id = id || 'conv-thinking';
            const avatarEl = document.createElement('div');
            avatarEl.className = 'conv-avatar';
            avatarEl.textContent = 'AI';
            const bubbleEl = document.createElement('div');
            bubbleEl.className = 'conv-bubble';
            bubbleEl.innerHTML = '<div class="conv-thinking"><span></span><span></span><span></span></div>';
            msgEl.appendChild(avatarEl);
            msgEl.appendChild(bubbleEl);
            chatMessages.appendChild(msgEl);
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }

        function updateSessionStats() {
            const msgCountEl = document.getElementById('sessionMsgCount');
            const filterCountEl = document.getElementById('sessionFilterCount');
            if (msgCountEl) msgCountEl.textContent = sessionMsgCount;
            if (filterCountEl) filterCountEl.textContent = sessionFilterCount;
        }

        // ── Filter (as conversation turn) ──
        async function sendFilterMessage() {
            const condition = chatInput.value.trim();
            if (!condition) return;

            chatSendBtn.disabled = true;
            chatInput.value = '';
            chatInput.style.height = 'auto';

            // Show user message as filter query
            appendConvMessage('user', `<strong>Filter:</strong> ${escapeHtml(condition)}`);
            sessionMsgCount++;
            updateSessionStats();

            // Show thinking
            appendThinkingIndicator('filter-thinking');
            showFilterProgress();

            try {
                const res = await fetch('/api/filter', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        condition,
                        filter_top_k: parseInt(filterTopKInput.value),
                        rag_top_k: parseInt(ragTopKInput.value)
                    })
                });
                const data = await res.json();
                hideFilterProgress();

                const thinkingEl = document.getElementById('filter-thinking');
                if (thinkingEl) thinkingEl.remove();

                if (res.ok) {
                    // Render inline filter result
                    renderFilterResultInConversation(condition, data);
                    // Update right panel
                    updateRightPanel(condition, data);
                    // Add to history
                    addFilterHistory(condition, data);
                    sessionFilterCount++;
                    updateSessionStats();

                    const matched = data.results.filter(r => r.combined).map(r => r.filename);
                    if (matched.length > 0) showFilteredScopeOption(matched);
                } else {
                    appendConvMessage('assistant', `Error: ${escapeHtml(data.error || 'Unknown error')}`);
                }
            } catch(e) {
                hideFilterProgress();
                const thinkingEl = document.getElementById('filter-thinking');
                if (thinkingEl) thinkingEl.remove();
                appendConvMessage('assistant', `Network error: ${escapeHtml(e.message)}`);
            } finally {
                chatSendBtn.disabled = false;
                chatInput.focus();
            }
        }

        function renderFilterResultInConversation(condition, data) {
            hideWelcome();

            const treeCount = data.matched_documents.document_tree;
            const hyperCount = data.matched_documents.hyperedge_search;
            const combCount = data.matched_documents.combined;
            const totalDocs = data.results.length;

            // Build result HTML
            let html = `<div class="conv-filter-result">`;

            // Header
            html += `<div class="conv-filter-header">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
                <span class="conv-filter-header-text">Filter Results</span>
                <span class="conv-filter-query" title="${escapeHtml(condition)}">"${escapeHtml(condition.length > 40 ? condition.substring(0, 40) + '...' : condition)}"</span>
            </div>`;

            // Stats row
            html += `<div class="conv-stats-row">
                <div class="conv-stat-card ${treeCount > 0 ? 'match' : 'no-match'}">
                    <div class="conv-stat-value">${treeCount}</div>
                    <div class="conv-stat-label">Tree</div>
                </div>
                <div class="conv-stat-card ${hyperCount > 0 ? 'match' : 'no-match'}">
                    <div class="conv-stat-value">${hyperCount}</div>
                    <div class="conv-stat-label">Hyper</div>
                </div>
                <div class="conv-stat-card ${combCount > 0 ? 'match' : 'no-match'}">
                    <div class="conv-stat-value">${combCount}</div>
                    <div class="conv-stat-label">Combined</div>
                </div>
            </div>`;

            // Distribution bars
            html += `<div class="conv-distribution">
                <div class="conv-dist-title">Match Distribution</div>
                <div class="conv-dist-bar-row">
                    <span class="conv-dist-label">Tree</span>
                    <div class="conv-dist-bar"><div class="conv-dist-fill tree" style="width:0%" data-target="${totalDocs > 0 ? (treeCount/totalDocs*100) : 0}"></div></div>
                    <span class="conv-dist-count">${treeCount}/${totalDocs}</span>
                </div>
                <div class="conv-dist-bar-row">
                    <span class="conv-dist-label">Hyper</span>
                    <div class="conv-dist-bar"><div class="conv-dist-fill hyper" style="width:0%" data-target="${totalDocs > 0 ? (hyperCount/totalDocs*100) : 0}"></div></div>
                    <span class="conv-dist-count">${hyperCount}/${totalDocs}</span>
                </div>
                <div class="conv-dist-bar-row">
                    <span class="conv-dist-label">Combined</span>
                    <div class="conv-dist-bar"><div class="conv-dist-fill combined" style="width:0%" data-target="${totalDocs > 0 ? (combCount/totalDocs*100) : 0}"></div></div>
                    <span class="conv-dist-count">${combCount}/${totalDocs}</span>
                </div>
            </div>`;

            // Per-doc breakdown
            html += `<div class="conv-doc-list">`;
            data.results.forEach(doc => {
                if (doc.error) {
                    html += `<div class="conv-doc-item"><span class="conv-doc-name">${escapeHtml(doc.filename)}</span><span style="color:var(--error);font-size:0.78em;">Error</span></div>`;
                    return;
                }
                html += `<div class="conv-doc-item ${doc.combined ? 'matched' : ''}">
                    <span class="conv-doc-name">${escapeHtml(doc.filename)}</span>
                    <div class="conv-doc-badges">
                        <span class="conv-badge ${doc.document_tree ? 'pass' : 'fail'}">${doc.document_tree ? '\u2713' : '\u2717'} T</span>
                        <span class="conv-badge ${doc.hyperedge_search ? 'pass' : 'fail'}">${doc.hyperedge_search ? '\u2713' : '\u2717'} H</span>
                        <span class="conv-badge ${doc.combined ? 'pass' : 'fail'}">${doc.combined ? '\u2713' : '\u2717'} C</span>
                    </div>
                </div>`;
            });
            html += `</div>`;

            // Token usage
            html += `<div class="conv-token-row">
                <span class="conv-token-chip">Tree: <strong>${data.total_tokens.document.toLocaleString()}</strong></span>
                <span class="conv-token-chip">Hyper: <strong>${data.total_tokens.hyperedge.toLocaleString()}</strong></span>
                <span class="conv-token-chip">Combined: <strong>${data.total_tokens.combined.toLocaleString()}</strong></span>
            </div>`;

            html += `</div>`;

            // Append as system message
            const msgEl = document.createElement('div');
            msgEl.className = 'conv-message system';
            const avatarEl = document.createElement('div');
            avatarEl.className = 'conv-avatar';
            avatarEl.textContent = 'F';
            const bubbleEl = document.createElement('div');
            bubbleEl.className = 'conv-bubble';
            bubbleEl.innerHTML = html;
            msgEl.appendChild(avatarEl);
            msgEl.appendChild(bubbleEl);
            chatMessages.appendChild(msgEl);
            chatMessages.scrollTop = chatMessages.scrollHeight;

            // Animate distribution bars after render
            requestAnimationFrame(() => {
                setTimeout(() => {
                    msgEl.querySelectorAll('.conv-dist-fill').forEach(bar => {
                        bar.style.width = bar.dataset.target + '%';
                    });
                }, 100);
            });
        }

        // ── Right Panel Updates ──
        function updateRightPanel(condition, data) {
            const panel = document.getElementById('filterResultsPanel');
            panel.style.display = 'block';

            document.getElementById('filterQueryDisplay').textContent = condition;

            const treeCount = data.matched_documents.document_tree;
            const hyperCount = data.matched_documents.hyperedge_search;
            const combCount = data.matched_documents.combined;

            // Mini cards
            const miniTree = document.getElementById('miniDocTree');
            const miniHyper = document.getElementById('miniHyperedge');
            const miniComb = document.getElementById('miniCombined');

            document.getElementById('miniDocTreeVal').textContent = treeCount;
            document.getElementById('miniHyperedgeVal').textContent = hyperCount;
            document.getElementById('miniCombinedVal').textContent = combCount;

            miniTree.classList.toggle('match', treeCount > 0);
            miniHyper.classList.toggle('match', hyperCount > 0);
            miniComb.classList.toggle('match', combCount > 0);

            // Doc list
            const docList = document.getElementById('rightDocList');
            docList.innerHTML = data.results.map(doc => {
                if (doc.error) return `<div class="right-doc-item"><span class="right-doc-name">${escapeHtml(doc.filename)}</span><span style="color:var(--error);font-size:0.72em;">Error</span></div>`;
                return `<div class="right-doc-item ${doc.combined ? 'matched' : ''}">
                    <span class="right-doc-name">${escapeHtml(doc.filename)}</span>
                    <div class="right-doc-badges">
                        <span class="right-badge ${doc.document_tree ? 'pass' : 'fail'}">${doc.document_tree ? '\u2713' : '\u2717'}</span>
                        <span class="right-badge ${doc.hyperedge_search ? 'pass' : 'fail'}">${doc.hyperedge_search ? '\u2713' : '\u2717'}</span>
                        <span class="right-badge ${doc.combined ? 'pass' : 'fail'}">${doc.combined ? '\u2713' : '\u2717'}</span>
                    </div>
                </div>`;
            }).join('');

            // Tokens
            document.getElementById('rightDocTokens').textContent = data.total_tokens.document.toLocaleString();
            document.getElementById('rightHyperedgeTokens').textContent = data.total_tokens.hyperedge.toLocaleString();
            document.getElementById('rightCombinedTokens').textContent = data.total_tokens.combined.toLocaleString();
        }

        // ── Filter History ──
        function addFilterHistory(condition, data) {
            const combCount = data.matched_documents.combined;
            const totalDocs = data.results.length;
            filterHistory.unshift({ condition, combCount, totalDocs, data, timestamp: Date.now() });
            renderFilterHistory();
        }

        function renderFilterHistory() {
            const list = document.getElementById('filterHistoryList');
            if (filterHistory.length === 0) {
                list.innerHTML = '<div class="filter-history-empty">No filters run yet</div>';
                return;
            }
            list.innerHTML = filterHistory.map((h, i) => `
                <div class="filter-history-item ${i === 0 ? 'active' : ''}" data-index="${i}">
                    <div class="filter-history-query">${escapeHtml(h.condition)}</div>
                    <div class="filter-history-meta">
                        <span class="match-count">${h.combCount}/${h.totalDocs} matched</span>
                        <span>${formatTimestamp(h.timestamp)}</span>
                    </div>
                </div>
            `).join('');

            // Click to load previous results
            list.querySelectorAll('.filter-history-item').forEach(item => {
                item.addEventListener('click', () => {
                    const idx = parseInt(item.dataset.index);
                    const h = filterHistory[idx];
                    if (h) {
                        updateRightPanel(h.condition, h.data);
                        list.querySelectorAll('.filter-history-item').forEach(i => i.classList.remove('active'));
                        item.classList.add('active');
                    }
                });
            });
        }

        function formatTimestamp(ts) {
            const d = new Date(ts);
            return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }

        // ── Chat (RAG Q&A as conversation turn) ──
        async function sendChatMessage() {
            const question = chatInput.value.trim();
            if (!question) return;
            chatSendBtn.disabled = true;
            chatInput.value = '';
            chatInput.style.height = 'auto';

            appendConvMessage('user', escapeHtml(question));
            sessionMsgCount++;
            updateSessionStats();

            appendThinkingIndicator('chat-thinking');

            try {
                const payload = { question, top_k: parseInt(ragTopKInput.value) || 5 };
                if (chatScope === 'filtered' && filteredDocuments.length > 0) payload.documents = filteredDocuments;
                const res = await fetch('/api/rag/query', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const thinkingEl = document.getElementById('chat-thinking');
                if (thinkingEl) thinkingEl.remove();
                const data = await res.json();
                if (res.ok) {
                    let html = escapeHtml(data.answer);
                    if (data.sources && data.sources.length > 0) {
                        html += `<div class="conv-sources">
                            <div class="conv-sources-title">Sources</div>
                            ${data.sources.map(src => `
                                <div class="conv-source-item">
                                    <div class="conv-source-filename">${escapeHtml(src.filename)}</div>
                                    <div class="conv-source-excerpt">${escapeHtml(src.content)}&hellip;</div>
                                </div>
                            `).join('')}
                        </div>`;
                    }
                    appendConvMessage('assistant', html);
                    chatHistory.push({ question, answer: data.answer });
                    sessionMsgCount++;
                    updateSessionStats();
                } else {
                    appendConvMessage('assistant', `Error: ${escapeHtml(data.error || 'Unknown error')}`);
                }
            } catch(err) {
                const thinkingEl = document.getElementById('chat-thinking');
                if (thinkingEl) thinkingEl.remove();
                appendConvMessage('assistant', `Network error: ${escapeHtml(err.message)}`);
            } finally {
                chatSendBtn.disabled = false;
                chatInput.focus();
            }
        }

        // ── Tree viewer (SVG graph) ──
        const treeDocumentSelect = document.getElementById('treeDocumentSelect');
        const loadTreeBtn = document.getElementById('loadTreeBtn');
        const treeViewer = document.getElementById('treeViewer');
        const indexViewTabs = document.getElementById('indexViewTabs');

        const NODE_COLORS = {
            root: '#2563eb', title: '#7c3aed', text: '#059669',
            figure: '#d97706', table: '#b45309'
        };

        const EDGE_PALETTE = [
            '#6366f1', '#ec4899', '#f59e0b', '#10b981', '#ef4444',
            '#8b5cf6', '#14b8a6', '#f97316', '#06b6d4', '#84cc16'
        ];

        treeDocumentSelect.addEventListener('change', e => {
            loadTreeBtn.disabled = !e.target.value;
        });

        indexViewTabs.addEventListener('click', e => {
            const tab = e.target.closest('.index-tab');
            if (!tab || tab.classList.contains('active')) return;
            indexViewTabs.querySelectorAll('.index-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            currentViewMode = tab.dataset.view;
            if (currentTreeData) renderCurrentView();
        });

        loadTreeBtn.addEventListener('click', async () => {
            const filename = treeDocumentSelect.value;
            if (!filename) return;
            loadTreeBtn.disabled = true;
            loadTreeBtn.innerHTML = 'Loading&hellip;';
            treeViewer.innerHTML = '';
            treeViewer.style.display = 'none';
            indexViewTabs.style.display = 'none';
            currentIndexData = null;

            try {
                const [treeRes, indexRes] = await Promise.all([
                    fetch(`/api/tree/${filename}`),
                    fetch(`/api/index/${filename}`).catch(() => null)
                ]);
                const treeData = await treeRes.json();
                if (treeRes.ok) {
                    currentTreeData = treeData;
                    if (indexRes && indexRes.ok) {
                        currentIndexData = await indexRes.json();
                    }
                    indexViewTabs.style.display = 'flex';
                    updateTabAvailability();
                    renderCurrentView();
                } else {
                    treeViewer.innerHTML = `<div class="tree-empty">Error: ${treeData.error}</div>`;
                    treeViewer.style.display = 'block';
                }
            } catch(e) {
                treeViewer.innerHTML = `<div class="tree-empty">Error: ${e.message}</div>`;
                treeViewer.style.display = 'block';
            } finally {
                loadTreeBtn.disabled = false;
                loadTreeBtn.innerHTML = 'Load Tree';
            }
        });

        function updateTabAvailability() {
            const hasHyperedges = currentTreeData && currentTreeData.tree_structure &&
                currentTreeData.tree_structure.some(n => n.hyper_edges && Object.keys(n.hyper_edges).length > 0);
            const hasClusters = currentIndexData && currentIndexData.has_semantic_index;

            indexViewTabs.querySelectorAll('.index-tab').forEach(tab => {
                const view = tab.dataset.view;
                if (view === 'hyperedge') {
                    tab.classList.toggle('disabled', !hasHyperedges);
                    tab.title = hasHyperedges ? '' : 'No hyperedge data available';
                } else if (view === 'cluster') {
                    tab.classList.toggle('disabled', !hasClusters);
                    tab.title = hasClusters ? '' : 'No semantic cluster data available';
                }
            });
        }

        function renderCurrentView() {
            if (currentViewMode === 'tree') displayDocumentTree(currentTreeData);
            else if (currentViewMode === 'hyperedge') displayHyperedgeView(currentTreeData);
            else if (currentViewMode === 'cluster') displayClusterView(currentTreeData, currentIndexData);
        }

        // Build tree structure from flat node array
        function buildTreeStructure(nodes) {
            if (!nodes || nodes.length === 0) return null;
            const rootNodes = [];
            nodes.forEach(n => { n._children = []; });
            nodes.forEach((node, idx) => {
                if (node.depth === 0) { rootNodes.push(node); }
                else {
                    for (let i = idx - 1; i >= 0; i--) {
                        if (nodes[i].depth === node.depth - 1) {
                            nodes[i]._children.push(node);
                            break;
                        }
                    }
                }
            });
            if (rootNodes.length === 1) return rootNodes[0];
            return { id: '__virtual_root', type: 'root', depth: 0, content: 'Document', _children: rootNodes };
        }

        function visibleChildren(node) {
            if (node._collapsed || !node._children) return [];
            return node._children;
        }

        function computeTreeLayout(root, cfg) {
            const { nodeW, nodeH, hGap, vGap } = cfg;
            function subtreeWidth(node) {
                const kids = visibleChildren(node);
                if (kids.length === 0) {
                    node._sw = nodeW;
                    return node._sw;
                }
                let w = 0;
                kids.forEach(c => { w += subtreeWidth(c); });
                w += (kids.length - 1) * hGap;
                node._sw = Math.max(nodeW, w);
                return node._sw;
            }
            subtreeWidth(root);

            function assign(node, x, y) {
                node._x = x + node._sw / 2;
                node._y = y;
                const kids = visibleChildren(node);
                if (kids.length > 0) {
                    let cx = x;
                    kids.forEach(c => {
                        assign(c, cx, y + nodeH + vGap);
                        cx += c._sw + hGap;
                    });
                }
            }
            assign(root, 0, 0);

            return { width: root._sw + nodeW, height: getMaxDepth(root) * (nodeH + vGap) + nodeH };
        }

        function getMaxDepth(node) {
            const kids = visibleChildren(node);
            if (kids.length === 0) return 0;
            return 1 + Math.max(...kids.map(getMaxDepth));
        }

        function collectNodes(node, list) {
            list.push(node);
            visibleChildren(node).forEach(c => collectNodes(c, list));
            return list;
        }

        function renderTreeSVG(root, container, cfg, isModal) {
            const { nodeW, nodeH } = cfg;
            const pad = 20;

            const wrapper = document.createElement('div');
            wrapper.className = 'tree-svg-wrapper' + (isModal ? ' tree-svg-modal' : '');

            function draw() {
                const oldSvg = wrapper.querySelector('svg');
                if (oldSvg) oldSvg.remove();
                const oldPopup = container.querySelector('.tree-detail-popup');
                if (oldPopup) oldPopup.remove();

                const layout = computeTreeLayout(root, cfg);
                const svgW = layout.width + pad * 2;
                const svgH = layout.height + pad * 2;

                const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                svg.setAttribute('viewBox', `0 0 ${svgW} ${svgH}`);
                svg.setAttribute('width', svgW);
                svg.setAttribute('height', svgH);
                svg.classList.add('tree-svg');

                const allNodes = collectNodes(root, []);

                const edgesG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                allNodes.forEach(node => {
                    visibleChildren(node).forEach(child => {
                        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                        const x1 = node._x + pad, y1 = node._y + nodeH + pad;
                        const x2 = child._x + pad, y2 = child._y + pad;
                        const my = (y1 + y2) / 2;
                        path.setAttribute('d', `M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`);
                        path.setAttribute('fill', 'none');
                        path.setAttribute('stroke', '#cbd5e1');
                        path.setAttribute('stroke-width', '2');
                        edgesG.appendChild(path);
                    });
                });
                svg.appendChild(edgesG);

                const nodesG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                allNodes.forEach(node => {
                    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                    g.setAttribute('transform', `translate(${node._x - nodeW / 2 + pad}, ${node._y + pad})`);
                    g.style.cursor = 'pointer';

                    const color = NODE_COLORS[node.type] || '#64748b';
                    const hasKids = node._children && node._children.length > 0;
                    const isCollapsed = hasKids && node._collapsed;

                    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                    rect.setAttribute('width', nodeW);
                    rect.setAttribute('height', nodeH);
                    rect.setAttribute('rx', '8');
                    rect.setAttribute('fill', isCollapsed ? '#f8fafc' : 'white');
                    rect.setAttribute('stroke', color);
                    rect.setAttribute('stroke-width', '2');
                    if (isCollapsed) rect.setAttribute('stroke-dasharray', '6 3');
                    g.appendChild(rect);

                    const bar = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                    bar.setAttribute('width', nodeW);
                    bar.setAttribute('height', '4');
                    bar.setAttribute('rx', '2');
                    bar.setAttribute('fill', color);
                    g.appendChild(bar);

                    const typeText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                    typeText.setAttribute('x', nodeW / 2);
                    typeText.setAttribute('y', '18');
                    typeText.setAttribute('text-anchor', 'middle');
                    typeText.setAttribute('font-size', isModal ? '12' : '10');
                    typeText.setAttribute('font-weight', '700');
                    typeText.setAttribute('fill', color);
                    typeText.textContent = (node.type || 'node').toUpperCase();
                    g.appendChild(typeText);

                    let preview = '';
                    if (node.content) preview = node.content.length > 30 ? node.content.substring(0, 30) + '...' : node.content;
                    else if (node.filename) preview = node.filename;
                    if (preview) {
                        const prevText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                        prevText.setAttribute('x', nodeW / 2);
                        prevText.setAttribute('y', '32');
                        prevText.setAttribute('text-anchor', 'middle');
                        prevText.setAttribute('font-size', isModal ? '10' : '8');
                        prevText.setAttribute('fill', '#64748b');
                        prevText.textContent = preview;
                        g.appendChild(prevText);
                    }

                    if (hasKids) {
                        const toggleG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                        toggleG.setAttribute('transform', `translate(${nodeW / 2}, ${nodeH})`);
                        toggleG.style.cursor = 'pointer';

                        const toggleBg = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                        toggleBg.setAttribute('r', '10');
                        toggleBg.setAttribute('fill', 'white');
                        toggleBg.setAttribute('stroke', color);
                        toggleBg.setAttribute('stroke-width', '1.5');
                        toggleG.appendChild(toggleBg);

                        const toggleText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                        toggleText.setAttribute('text-anchor', 'middle');
                        toggleText.setAttribute('y', '4');
                        toggleText.setAttribute('font-size', '12');
                        toggleText.setAttribute('font-weight', '700');
                        toggleText.setAttribute('fill', color);
                        toggleText.textContent = isCollapsed ? '+' : '\u2212';
                        toggleG.appendChild(toggleText);

                        const countText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                        countText.setAttribute('text-anchor', 'middle');
                        countText.setAttribute('y', '22');
                        countText.setAttribute('font-size', '8');
                        countText.setAttribute('font-weight', '600');
                        countText.setAttribute('fill', '#94a3b8');
                        countText.textContent = node._children.length;
                        toggleG.appendChild(countText);

                        toggleG.addEventListener('click', (e) => {
                            e.stopPropagation();
                            node._collapsed = !node._collapsed;
                            draw();
                        });

                        toggleG.addEventListener('mouseenter', () => {
                            toggleBg.setAttribute('fill', color);
                            toggleText.setAttribute('fill', 'white');
                        });
                        toggleG.addEventListener('mouseleave', () => {
                            toggleBg.setAttribute('fill', 'white');
                            toggleText.setAttribute('fill', color);
                        });

                        g.appendChild(toggleG);
                    }

                    g.addEventListener('click', (e) => {
                        e.stopPropagation();
                        showNodeDetail(node, container, wrapper);
                    });

                    g.addEventListener('mouseenter', () => {
                        rect.setAttribute('stroke-width', '3');
                        rect.setAttribute('filter', 'drop-shadow(0 2px 4px rgba(0,0,0,0.15))');
                    });
                    g.addEventListener('mouseleave', () => {
                        rect.setAttribute('stroke-width', '2');
                        rect.removeAttribute('filter');
                    });

                    nodesG.appendChild(g);
                });
                svg.appendChild(nodesG);

                svg.addEventListener('click', () => {
                    const existing = container.querySelector('.tree-detail-popup');
                    if (existing) existing.remove();
                });

                wrapper.appendChild(svg);
            }

            draw();
            container.appendChild(wrapper);
            return { wrapper, redraw: draw };
        }

        function showNodeDetail(node, container, wrapper) {
            const existing = container.querySelector('.tree-detail-popup');
            if (existing) existing.remove();

            const popup = document.createElement('div');
            popup.className = 'tree-detail-popup';

            let html = `<div class="tree-detail-close">&times;</div>`;
            html += `<div class="tree-detail-type" style="color:${NODE_COLORS[node.type] || '#64748b'}">${(node.type || 'node').toUpperCase()}</div>`;
            if (node.content) html += `<div class="tree-detail-section"><div class="tree-detail-label">Content</div><div class="tree-detail-text">${escapeHtml(node.content)}</div></div>`;
            if (node.summary && node.summary !== 'Summary not generated') html += `<div class="tree-detail-section"><div class="tree-detail-label">Summary</div><div class="tree-detail-text" style="font-style:italic;color:#475569;">${escapeHtml(node.summary)}</div></div>`;
            html += `<div class="tree-detail-meta">`;
            if (node.depth !== undefined) html += `<span class="tree-detail-tag">Depth: ${node.depth}</span>`;
            if (node.children_count !== undefined) html += `<span class="tree-detail-tag">Children: ${node.children_count}</span>`;
            if (node.title_level !== undefined) html += `<span class="tree-detail-tag">Level: ${node.title_level}</span>`;
            if (node.filename) html += `<span class="tree-detail-tag">${escapeHtml(node.filename)}</span>`;
            html += `</div>`;

            popup.innerHTML = html;
            container.appendChild(popup);

            popup.querySelector('.tree-detail-close').addEventListener('click', (e) => {
                e.stopPropagation();
                popup.remove();
            });
        }

        function displayDocumentTree(treeData) {
            treeViewer.style.display = 'block';
            treeViewer.innerHTML = '';

            const statsBar = document.createElement('div');
            statsBar.className = 'tree-stats';
            statsBar.innerHTML = `
                <span><strong>File:</strong> ${treeData.meta_dict.file_name}</span>
                <span><strong>Nodes:</strong> ${treeData.nodes_count}</span>
                <button class="tree-view-btn" id="treeViewBtn" title="View full screen">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
                    View
                </button>
            `;
            treeViewer.appendChild(statsBar);

            const root = buildTreeStructure(treeData.tree_structure);
            if (!root) {
                treeViewer.innerHTML += '<div class="tree-empty">No tree structure available</div>';
                return;
            }

            const cfg = { nodeW: 100, nodeH: 36, hGap: 12, vGap: 40 };
            renderTreeSVG(root, treeViewer, cfg, false);

            document.getElementById('treeViewBtn').addEventListener('click', () => {
                openTreeModal(treeData);
            });
        }

        // ── Hyperedge View ──
        function displayHyperedgeView(treeData) {
            treeViewer.style.display = 'block';
            treeViewer.innerHTML = '';

            const titleNodes = treeData.tree_structure.filter(n => n.hyper_edges && Object.keys(n.hyper_edges).length > 0);
            if (titleNodes.length === 0) {
                treeViewer.innerHTML = '<div class="tree-empty">No hyperedge data available for this document</div>';
                return;
            }

            const nodeById = {};
            treeData.tree_structure.forEach(n => { nodeById[n.id] = n; });

            const totalEdges = titleNodes.reduce((sum, n) => sum + Object.keys(n.hyper_edges).length, 0);
            const statsBar = document.createElement('div');
            statsBar.className = 'tree-stats';
            statsBar.innerHTML = `
                <span><strong>File:</strong> ${treeData.meta_dict.file_name}</span>
                <span><strong>Sections:</strong> ${titleNodes.length}</span>
                <span><strong>Hyperedges:</strong> ${totalEdges}</span>
            `;
            treeViewer.appendChild(statsBar);

            const container = document.createElement('div');
            container.className = 'hyperedge-container';

            titleNodes.forEach(titleNode => {
                const section = document.createElement('div');
                section.className = 'hyperedge-section';

                const header = document.createElement('div');
                header.className = 'hyperedge-section-header';
                header.innerHTML = `<span class="hyperedge-section-title">${escapeHtml(titleNode.content || 'Untitled')}</span>
                    <span class="hyperedge-section-meta">Depth ${titleNode.depth} &middot; ${Object.keys(titleNode.hyper_edges).length} edge(s)</span>`;
                section.appendChild(header);

                const edgeKeys = Object.keys(titleNode.hyper_edges);
                edgeKeys.forEach((edgeKey, idx) => {
                    const color = EDGE_PALETTE[idx % EDGE_PALETTE.length];
                    const nodeIds = titleNode.hyper_edges[edgeKey];
                    const summary = titleNode.edge_summaries ? titleNode.edge_summaries[edgeKey] : null;

                    const group = document.createElement('div');
                    group.className = 'hyperedge-group';
                    group.style.borderLeftColor = color;

                    let groupHtml = `<div class="hyperedge-group-header">
                        <span class="hyperedge-badge" style="background:${color}">${edgeKey.replace('edge_', 'E')}</span>
                        <span class="hyperedge-node-count">${nodeIds.length} nodes</span>
                    </div>`;

                    if (summary) {
                        groupHtml += `<div class="hyperedge-summary">${escapeHtml(summary)}</div>`;
                    }

                    groupHtml += '<div class="hyperedge-nodes">';
                    nodeIds.forEach(nid => {
                        const node = nodeById[nid];
                        const preview = node ? (node.content || '').substring(0, 60) : `Node ${nid}`;
                        const nodeType = node ? node.type : 'unknown';
                        groupHtml += `<div class="hyperedge-node-chip" data-node-id="${nid}" style="border-color:${color}">
                            <span class="hyperedge-chip-type" style="color:${NODE_COLORS[nodeType] || '#64748b'}">${nodeType}</span>
                            <span class="hyperedge-chip-text">${escapeHtml(preview)}${(node && node.content && node.content.length > 60) ? '...' : ''}</span>
                        </div>`;
                    });
                    groupHtml += '</div>';

                    if (titleNode.edge_must_links && titleNode.edge_must_links[edgeKey]) {
                        const links = titleNode.edge_must_links[edgeKey];
                        groupHtml += '<div class="hyperedge-must-links">';
                        groupHtml += '<span class="must-link-label">Linked to:</span>';
                        links.forEach(link => {
                            const linkedTitle = nodeById[link.title_id];
                            const linkedName = linkedTitle ? (linkedTitle.content || '').substring(0, 40) : `Section ${link.title_id}`;
                            groupHtml += `<span class="must-link-chip">${escapeHtml(linkedName)} \u2192 ${link.edge_id}</span>`;
                        });
                        groupHtml += '</div>';
                    }

                    group.innerHTML = groupHtml;
                    section.appendChild(group);

                    group.querySelectorAll('.hyperedge-node-chip').forEach(chip => {
                        chip.addEventListener('click', () => {
                            const nid = parseInt(chip.dataset.nodeId);
                            const node = nodeById[nid];
                            if (node) showHyperedgeNodeDetail(node, container);
                        });
                    });
                });

                container.appendChild(section);
            });

            treeViewer.appendChild(container);
        }

        function showHyperedgeNodeDetail(node, container) {
            const existing = container.querySelector('.tree-detail-popup');
            if (existing) existing.remove();

            const popup = document.createElement('div');
            popup.className = 'tree-detail-popup';
            let html = `<div class="tree-detail-close">&times;</div>`;
            html += `<div class="tree-detail-type" style="color:${NODE_COLORS[node.type] || '#64748b'}">${(node.type || 'node').toUpperCase()} (ID: ${node.id})</div>`;
            if (node.content) html += `<div class="tree-detail-section"><div class="tree-detail-label">Content</div><div class="tree-detail-text">${escapeHtml(node.content)}</div></div>`;
            if (node.summary && node.summary !== 'Summary not generated') html += `<div class="tree-detail-section"><div class="tree-detail-label">Summary</div><div class="tree-detail-text" style="font-style:italic;color:#475569;">${escapeHtml(node.summary)}</div></div>`;
            popup.innerHTML = html;
            container.appendChild(popup);
            popup.querySelector('.tree-detail-close').addEventListener('click', (e) => { e.stopPropagation(); popup.remove(); });
        }

        // ── Semantic Cluster View ──
        function displayClusterView(treeData, indexData) {
            treeViewer.style.display = 'block';
            treeViewer.innerHTML = '';

            if (!indexData || !indexData.has_semantic_index || !indexData.semantic_index) {
                treeViewer.innerHTML = '<div class="tree-empty">No semantic cluster data available for this document</div>';
                return;
            }

            const semIndex = indexData.semantic_index;
            const semTree = indexData.semantic_tree;
            const nodeById = {};
            treeData.tree_structure.forEach(n => { nodeById[n.id] = n; });

            const numClusters = semIndex.num_clusters || Object.keys(semIndex.clusters_by_id || {}).length;
            const numNodes = Object.keys(semIndex.clusters || {}).length;
            const statsBar = document.createElement('div');
            statsBar.className = 'tree-stats';
            statsBar.innerHTML = `
                <span><strong>File:</strong> ${treeData.meta_dict.file_name}</span>
                <span><strong>Clusters:</strong> ${numClusters}</span>
                <span><strong>Clustered Nodes:</strong> ${numNodes}</span>
            `;
            treeViewer.appendChild(statsBar);

            const container = document.createElement('div');
            container.className = 'cluster-container';

            if (semTree && semTree.hierarchy) {
                renderSemanticHierarchy(semTree, nodeById, container);
            } else if (semIndex.clusters_by_id) {
                renderFlatClusters(semIndex, nodeById, container);
            } else {
                container.innerHTML = '<div class="tree-empty">Cluster data format not recognized</div>';
            }

            treeViewer.appendChild(container);
        }

        function renderFlatClusters(semIndex, nodeById, container) {
            const clustersById = semIndex.clusters_by_id;
            const clusterKeys = Object.keys(clustersById).sort((a, b) => parseInt(a) - parseInt(b));

            clusterKeys.forEach((clusterId, idx) => {
                const nodeIds = clustersById[clusterId];
                const color = EDGE_PALETTE[idx % EDGE_PALETTE.length];

                const section = document.createElement('div');
                section.className = 'cluster-section';
                section.style.borderLeftColor = color;

                let html = `<div class="cluster-header">
                    <span class="cluster-badge" style="background:${color}">C${clusterId}</span>
                    <span class="cluster-count">${nodeIds.length} nodes</span>
                </div>`;

                html += '<div class="cluster-nodes">';
                nodeIds.forEach(nid => {
                    const node = nodeById[nid] || nodeById[String(nid)];
                    const content = node ? (node.content || '').substring(0, 80) : `Node ${nid}`;
                    const nodeType = node ? node.type : 'text';
                    html += `<div class="cluster-node-chip" data-node-id="${nid}">
                        <span class="cluster-chip-type" style="color:${NODE_COLORS[nodeType] || '#64748b'}">${nodeType}</span>
                        <span class="cluster-chip-text">${escapeHtml(content)}${content.length >= 80 ? '...' : ''}</span>
                    </div>`;
                });
                html += '</div>';

                section.innerHTML = html;
                container.appendChild(section);

                section.querySelectorAll('.cluster-node-chip').forEach(chip => {
                    chip.addEventListener('click', () => {
                        const nid = parseInt(chip.dataset.nodeId);
                        const node = nodeById[nid] || nodeById[String(nid)];
                        if (node) showHyperedgeNodeDetail(node, container);
                    });
                });
            });

            if (semIndex.must_link && semIndex.must_link.length > 0) {
                const constraintSection = document.createElement('div');
                constraintSection.className = 'cluster-constraints';
                let cHtml = '<div class="cluster-constraint-title">Pairwise Constraints</div>';
                cHtml += `<div class="cluster-constraint-summary">
                    <span class="constraint-badge must-link">Must-link: ${semIndex.must_link.length}</span>
                    <span class="constraint-badge cannot-link">Cannot-link: ${(semIndex.cannot_link || []).length}</span>
                </div>`;
                constraintSection.innerHTML = cHtml;
                container.appendChild(constraintSection);
            }
        }

        function renderSemanticHierarchy(semTree, nodeById, container) {
            const hierarchy = semTree.hierarchy;
            const leafClusters = semTree.leaf_clusters || {};

            function renderHierNode(nodeId, level) {
                const nodeData = hierarchy[nodeId];
                if (!nodeData) return '';

                const color = EDGE_PALETTE[level % EDGE_PALETTE.length];
                const children = nodeData.children || [];
                const summary = nodeData.summary || '';
                const isLeaf = children.length === 0;

                let html = `<div class="sem-tree-node" style="margin-left:${level * 20}px;">`;
                html += `<div class="sem-tree-node-header" style="border-left-color:${color}">`;
                html += `<span class="sem-tree-badge" style="background:${color}">${nodeId === 'root' ? 'Root' : nodeId}</span>`;
                if (children.length > 0) html += `<span class="sem-tree-children-count">${children.length} children</span>`;
                html += '</div>';

                if (summary) {
                    html += `<div class="sem-tree-summary" style="margin-left:${level * 20 + 12}px;">${escapeHtml(summary)}</div>`;
                }

                if (isLeaf && leafClusters[nodeId]) {
                    html += `<div class="sem-tree-leaf-nodes" style="margin-left:${level * 20 + 12}px;">`;
                    leafClusters[nodeId].forEach(nid => {
                        const node = nodeById[nid] || nodeById[String(nid)];
                        const content = node ? (node.content || '').substring(0, 60) : `Node ${nid}`;
                        html += `<div class="cluster-node-chip" data-node-id="${nid}">
                            <span class="cluster-chip-text">${escapeHtml(content)}</span>
                        </div>`;
                    });
                    html += '</div>';
                }

                children.forEach(childId => {
                    html += renderHierNode(childId, level + 1);
                });

                html += '</div>';
                return html;
            }

            container.innerHTML = renderHierNode('root', 0);

            container.querySelectorAll('.cluster-node-chip').forEach(chip => {
                chip.addEventListener('click', () => {
                    const nid = parseInt(chip.dataset.nodeId);
                    const node = nodeById[nid] || nodeById[String(nid)];
                    if (node) showHyperedgeNodeDetail(node, container);
                });
            });
        }

        // Full-screen modal with zoom/pan and collapse controls
        function openTreeModal(treeData) {
            const old = document.getElementById('treeModal');
            if (old) old.remove();

            const modal = document.createElement('div');
            modal.id = 'treeModal';
            modal.className = 'tree-modal-overlay';
            modal.innerHTML = `
                <div class="tree-modal">
                    <div class="tree-modal-header">
                        <h3>Document Tree \u2014 ${escapeHtml(treeData.meta_dict.file_name)}</h3>
                        <div class="tree-modal-toolbar">
                            <div class="tree-toolbar-group">
                                <button class="tree-toolbar-btn" id="tmZoomIn" title="Zoom in">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
                                </button>
                                <span class="tree-zoom-label" id="tmZoomLabel">100%</span>
                                <button class="tree-toolbar-btn" id="tmZoomOut" title="Zoom out">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
                                </button>
                                <button class="tree-toolbar-btn" id="tmZoomReset" title="Reset zoom">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                                </button>
                            </div>
                            <div class="tree-toolbar-divider"></div>
                            <div class="tree-toolbar-group">
                                <button class="tree-toolbar-btn" id="tmExpandAll" title="Expand all">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
                                    Expand
                                </button>
                                <button class="tree-toolbar-btn" id="tmCollapseAll" title="Collapse all">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 15l-6-6-6 6"/></svg>
                                    Collapse
                                </button>
                            </div>
                        </div>
                        <button class="tree-modal-close">&times;</button>
                    </div>
                    <div class="tree-modal-body"></div>
                </div>
            `;
            document.body.appendChild(modal);

            const freshNodes = JSON.parse(JSON.stringify(treeData.tree_structure));
            const root = buildTreeStructure(freshNodes);
            const body = modal.querySelector('.tree-modal-body');
            let treeResult = null;

            if (root) {
                const cfg = { nodeW: 160, nodeH: 48, hGap: 24, vGap: 70 };
                treeResult = renderTreeSVG(root, body, cfg, true);
            }

            let scale = 1;
            const SCALE_STEP = 0.15;
            const MIN_SCALE = 0.2;
            const MAX_SCALE = 3;
            const zoomLabel = modal.querySelector('#tmZoomLabel');

            function applyZoom() {
                if (!treeResult) return;
                const svg = treeResult.wrapper.querySelector('svg');
                if (svg) {
                    svg.style.transform = `scale(${scale})`;
                    svg.style.transformOrigin = 'top left';
                }
                zoomLabel.textContent = Math.round(scale * 100) + '%';
            }

            modal.querySelector('#tmZoomIn').addEventListener('click', () => {
                scale = Math.min(MAX_SCALE, scale + SCALE_STEP);
                applyZoom();
            });
            modal.querySelector('#tmZoomOut').addEventListener('click', () => {
                scale = Math.max(MIN_SCALE, scale - SCALE_STEP);
                applyZoom();
            });
            modal.querySelector('#tmZoomReset').addEventListener('click', () => {
                scale = 1;
                applyZoom();
                scrollToRoot();
            });

            function scrollToRoot() {
                if (!treeResult || !root) return;
                const svg = treeResult.wrapper.querySelector('svg');
                if (!svg) return;
                const rootCenterX = root._x * scale;
                const bodyW = body.clientWidth;
                body.scrollLeft = Math.max(0, rootCenterX - bodyW / 2);
                body.scrollTop = 0;
            }

            requestAnimationFrame(() => scrollToRoot());

            function setCollapseAll(node, collapsed) {
                if (node._children && node._children.length > 0) {
                    node._collapsed = collapsed;
                    node._children.forEach(c => setCollapseAll(c, collapsed));
                }
            }

            modal.querySelector('#tmExpandAll').addEventListener('click', () => {
                if (root) { setCollapseAll(root, false); if (treeResult) treeResult.redraw(); applyZoom(); scrollToRoot(); }
            });
            modal.querySelector('#tmCollapseAll').addEventListener('click', () => {
                if (root) {
                    root._collapsed = false;
                    if (root._children) root._children.forEach(c => setCollapseAll(c, true));
                    if (treeResult) treeResult.redraw();
                    applyZoom();
                    scrollToRoot();
                }
            });

            modal.querySelector('.tree-modal-close').addEventListener('click', () => modal.remove());
            modal.addEventListener('click', (e) => {
                if (e.target === modal) modal.remove();
            });
            const escHandler = (e) => {
                if (e.key === 'Escape') { modal.remove(); document.removeEventListener('keydown', escHandler); }
            };
            document.addEventListener('keydown', escHandler);

            requestAnimationFrame(() => modal.classList.add('active'));
        }
