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

            const treeCount   = data.matched_documents.document_tree;
            const semCount    = data.matched_documents.semantic_cluster || 0;
            const hyperCount  = data.matched_documents.hyperedge_search;
            const combCount   = data.matched_documents.combined;
            const totalDocs   = data.results.length;

            const tokTree  = data.total_tokens.document    || 0;
            const tokSem   = data.total_tokens.semantic    || 0;
            const tokHyper = data.total_tokens.hyperedge   || 0;
            const tokComb  = data.total_tokens.combined    || 0;
            const maxTok   = Math.max(tokTree, tokSem, tokHyper, tokComb, 1);

            // Nice y-axis tick values
            function niceMax(v) {
                const mag = Math.pow(10, Math.floor(Math.log10(v || 1)));
                return Math.ceil(v / mag) * mag;
            }
            const yMax = niceMax(maxTok);
            const yMid = Math.round(yMax / 2);

            // Muted academic palette
            const C = { tree: '#1a56db', semantic: '#b45309', hyper: '#6d28d9', combined: '#15803d' };
            const methods = [
                { key: 'tree',     label: 'Doc Tree',   count: treeCount,  tokens: tokTree,  color: C.tree },
                { key: 'semantic', label: 'Semantic',    count: semCount,   tokens: tokSem,   color: C.semantic },
                { key: 'hyper',    label: 'Hyperedge',   count: hyperCount, tokens: tokHyper,  color: C.hyper },
                { key: 'combined', label: 'Combined',    count: combCount,  tokens: tokComb,   color: C.combined },
            ];

            let html = `<div class="conv-filter-result">`;

            // ── Header ──
            html += `<div class="conv-filter-header">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
                <span class="conv-filter-header-text">Filter Results</span>
                <span class="conv-filter-query" title="${escapeHtml(condition)}">&ldquo;${escapeHtml(condition.length > 50 ? condition.substring(0, 50) + '\u2026' : condition)}&rdquo;</span>
            </div>`;

            // ── Method comparison table ──
            html += `<div class="conv-method-table">
                <div class="conv-method-table-head">
                    <span>Method</span><span>Matched</span><span>Recall</span><span>Tokens</span>
                </div>`;
            methods.forEach(m => {
                const pct = totalDocs > 0 ? Math.round(m.count / totalDocs * 100) : 0;
                html += `<div class="conv-method-row ${m.count > 0 ? 'has-match' : ''}">
                    <span class="conv-method-name">
                        <span class="conv-method-dot" style="background:${m.color}"></span>${m.label}
                    </span>
                    <span class="conv-method-matched">${m.count}<span class="conv-method-total">/${totalDocs}</span></span>
                    <span class="conv-method-recall">
                        <span class="conv-recall-bar-wrap">
                            <span class="conv-recall-bar-fill" style="width:0%;background:${m.color}20;border-right:2px solid ${m.color}" data-target="${pct}"></span>
                        </span>
                        <span class="conv-recall-pct">${pct}%</span>
                    </span>
                    <span class="conv-method-tokens">${m.tokens.toLocaleString()}</span>
                </div>`;
            });
            html += `</div>`;

            // ── Token Cost — vertical bar chart ──
            html += `<div class="conv-token-chart">
                <div class="conv-chart-title">Token Cost Comparison</div>
                <div class="conv-chart-body">
                    <div class="conv-chart-yaxis">
                        <span>${yMax.toLocaleString()}</span>
                        <span>${yMid.toLocaleString()}</span>
                        <span>0</span>
                    </div>
                    <div class="conv-chart-plot">
                        <div class="conv-chart-grid">
                            <div class="conv-chart-gridline"></div>
                            <div class="conv-chart-gridline"></div>
                            <div class="conv-chart-gridline"></div>
                        </div>
                        <div class="conv-chart-bars">`;
            methods.forEach(m => {
                const heightPct = yMax > 0 ? (m.tokens / yMax * 100) : 0;
                html += `<div class="conv-chart-col">
                    <div class="conv-chart-bar-wrap">
                        <span class="conv-bar-value">${m.tokens >= 1000 ? (m.tokens/1000).toFixed(1)+'k' : m.tokens}</span>
                        <div class="conv-chart-bar" style="height:0%;background:${m.color}cc" data-target="${heightPct.toFixed(1)}"></div>
                    </div>
                    <div class="conv-chart-bar-label" style="color:${m.color}">${m.label}</div>
                </div>`;
            });
            html += `       </div>
                    </div>
                </div>
            </div>`;

            // ── Per-doc breakdown ──
            if (data.results.length > 0) {
                html += `<div class="conv-doc-section">
                    <div class="conv-dist-title">Per-Document Results</div>
                    <div class="conv-doc-list">`;
                data.results.forEach(doc => {
                    if (doc.error) {
                        html += `<div class="conv-doc-item"><span class="conv-doc-name">${escapeHtml(doc.filename)}</span><span style="color:var(--error);font-size:0.78em;">Error</span></div>`;
                        return;
                    }
                    html += `<div class="conv-doc-item ${doc.combined ? 'matched' : ''}">
                        <span class="conv-doc-name">${escapeHtml(doc.filename)}</span>
                        <div class="conv-doc-badges">
                            <span class="conv-badge ${doc.document_tree ? 'pass' : 'fail'}" title="Document Tree">${doc.document_tree ? '\u2713' : '\u2717'} Tree</span>
                            <span class="conv-badge ${doc.semantic_cluster ? 'pass' : 'fail'}" title="Semantic Cluster">${doc.semantic_cluster ? '\u2713' : '\u2717'} Sem</span>
                            <span class="conv-badge ${doc.hyperedge_search ? 'pass' : 'fail'}" title="Hyperedge">${doc.hyperedge_search ? '\u2713' : '\u2717'} Hyp</span>
                            <span class="conv-badge ${doc.combined ? 'pass' : 'fail'}" title="Combined">${doc.combined ? '\u2713' : '\u2717'} Comb</span>
                        </div>
                    </div>`;
                });
                html += `   </div></div>`;
            }

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

            // Animate recall bars and token bars after render
            requestAnimationFrame(() => {
                setTimeout(() => {
                    msgEl.querySelectorAll('.conv-recall-bar-fill').forEach(el => {
                        el.style.width = el.dataset.target + '%';
                    });
                    msgEl.querySelectorAll('.conv-chart-bar').forEach(el => {
                        el.style.height = el.dataset.target + '%';
                    });
                }, 80);
            });
        }

        // ── Right Panel Updates ──
        function updateRightPanel(condition, data) {
            const panel = document.getElementById('filterResultsPanel');
            panel.style.display = 'block';

            document.getElementById('filterQueryDisplay').textContent = condition;

            const treeCount = data.matched_documents.document_tree;
            const semCount = data.matched_documents.semantic_cluster || 0;
            const hyperCount = data.matched_documents.hyperedge_search;
            const combCount = data.matched_documents.combined;

            // Mini cards
            const miniTree = document.getElementById('miniDocTree');
            const miniSem = document.getElementById('miniSemantic');
            const miniHyper = document.getElementById('miniHyperedge');
            const miniComb = document.getElementById('miniCombined');

            document.getElementById('miniDocTreeVal').textContent = treeCount;
            document.getElementById('miniSemanticVal').textContent = semCount;
            document.getElementById('miniHyperedgeVal').textContent = hyperCount;
            document.getElementById('miniCombinedVal').textContent = combCount;

            miniTree.classList.toggle('match', treeCount > 0);
            miniSem.classList.toggle('match', semCount > 0);
            miniHyper.classList.toggle('match', hyperCount > 0);
            miniComb.classList.toggle('match', combCount > 0);

            // Doc list
            const docList = document.getElementById('rightDocList');
            docList.innerHTML = data.results.map(doc => {
                if (doc.error) return `<div class="right-doc-item"><span class="right-doc-name">${escapeHtml(doc.filename)}</span><span style="color:var(--error);font-size:0.72em;">Error</span></div>`;
                return `<div class="right-doc-item ${doc.combined ? 'matched' : ''}">
                    <span class="right-doc-name">${escapeHtml(doc.filename)}</span>
                    <div class="right-doc-badges">
                        <span class="right-badge ${doc.document_tree ? 'pass' : 'fail'}" title="Tree">${doc.document_tree ? '\u2713' : '\u2717'}</span>
                        <span class="right-badge ${doc.semantic_cluster ? 'pass' : 'fail'}" title="Semantic">${doc.semantic_cluster ? '\u2713' : '\u2717'}</span>
                        <span class="right-badge ${doc.hyperedge_search ? 'pass' : 'fail'}" title="Hyper">${doc.hyperedge_search ? '\u2713' : '\u2717'}</span>
                        <span class="right-badge ${doc.combined ? 'pass' : 'fail'}" title="Combined">${doc.combined ? '\u2713' : '\u2717'}</span>
                    </div>
                </div>`;
            }).join('');

            // Filter tokens
            document.getElementById('rightDocTokens').textContent = data.total_tokens.document.toLocaleString();
            document.getElementById('rightSemanticTokens').textContent = (data.total_tokens.semantic || 0).toLocaleString();
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
            if (!tab || tab.classList.contains('active') || tab.classList.contains('disabled')) return;
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
                        // Display index construction tokens
                        const idxTokens = currentIndexData.index_tokens || {};
                        const idxSection = document.getElementById('indexTokensSection');
                        const filterPanel = document.getElementById('filterResultsPanel');
                        if (idxSection && (idxTokens.document_tree || idxTokens.semantic_cluster || idxTokens.hyperedge)) {
                            const fmt = t => t ? (t.total_tokens || 0).toLocaleString() : '—';
                            document.getElementById('idxDocTreeTokens').textContent = fmt(idxTokens.document_tree);
                            document.getElementById('idxSemanticTokens').textContent = fmt(idxTokens.semantic_cluster);
                            document.getElementById('idxHyperedgeTokens').textContent = fmt(idxTokens.hyperedge);
                            idxSection.style.display = 'block';
                            if (filterPanel) filterPanel.style.display = 'block';
                        }
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

        // Build tree structure from flat node array (deduplicates by id)
        function buildTreeStructure(nodes) {
            if (!nodes || nodes.length === 0) return null;
            // Deduplicate: keep first occurrence of each id
            const seen = new Set();
            nodes = nodes.filter(n => {
                const key = n.id != null ? String(n.id) : `${n.type}:${n.depth}:${(n.content || '').substring(0, 80)}`;
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });
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
            return rootNodes.length === 1 ? rootNodes[0] : { id: '__virtual_root', type: 'root', depth: 0, content: 'Document', _children: rootNodes };
        }

        function collectNodes(node, list) {
            list.push(node);
            (node._children || []).forEach(c => collectNodes(c, list));
            return list;
        }

        // ── Force-directed graph for panel view (Obsidian-style) ──
        function renderForceGraph(root, container, isModal) {
            const wrapper = document.createElement('div');
            wrapper.className = 'tree-svg-wrapper tree-force-graph' + (isModal ? ' tree-force-graph-modal' : '');

            // Flatten tree into nodes & edges
            const allNodes = collectNodes(root, []);
            const edges = [];
            allNodes.forEach(node => {
                (node._children || []).forEach(child => {
                    edges.push({ source: node, target: child });
                });
            });

            const W = isModal ? (container.clientWidth || window.innerWidth * 0.9) : (container.clientWidth || 280);
            const H = isModal ? (container.clientHeight || window.innerHeight * 0.75) : 320;
            const centerX = W / 2, centerY = H / 2;

            // Node radii by type — larger in modal
            const sizeScale = isModal ? 1.8 : 1;
            function getRadius(node) {
                if (node.type === 'root') return 8 * sizeScale;
                if (node.type === 'title') return 5 * sizeScale;
                return 3.5 * sizeScale;
            }

            // Initialize positions — spread by depth
            const spreadScale = isModal ? 2.5 : 1;
            allNodes.forEach((node, i) => {
                const angle = (i / allNodes.length) * Math.PI * 2 + Math.random() * 0.5;
                const dist = (30 + (node.depth || 0) * 40 + Math.random() * 20) * spreadScale;
                node._fx = centerX + Math.cos(angle) * dist;
                node._fy = centerY + Math.sin(angle) * dist;
                node._vx = 0;
                node._vy = 0;
            });

            // Zoom/pan state
            let viewX = 0, viewY = 0, viewScale = 1;
            let isPanning = false, panStartX = 0, panStartY = 0, panStartVX = 0, panStartVY = 0;
            let dragNode = null, dragOffsetX = 0, dragOffsetY = 0;

            // Tooltip element
            const tooltip = document.createElement('div');
            tooltip.className = 'force-graph-tooltip';
            tooltip.style.display = 'none';
            wrapper.appendChild(tooltip);

            // SVG setup
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.classList.add('tree-svg');
            svg.setAttribute('width', '100%');
            svg.setAttribute('height', isModal ? '100%' : H);
            svg.style.cursor = 'grab';
            svg.style.background = isModal ? '#f8fafc' : '#fafbfc';
            svg.style.borderRadius = isModal ? '0' : '8px';

            const edgesG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            const nodesG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            svg.appendChild(edgesG);
            svg.appendChild(nodesG);
            wrapper.appendChild(svg);

            // Create SVG elements for edges
            const edgeEls = edges.map(() => {
                const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                line.setAttribute('stroke', '#e2e8f0');
                line.setAttribute('stroke-width', '1');
                line.setAttribute('opacity', '0.6');
                edgesG.appendChild(line);
                return line;
            });

            // Create SVG elements for nodes
            const nodeEls = allNodes.map((node) => {
                const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                g.style.cursor = 'pointer';

                const color = NODE_COLORS[node.type] || '#64748b';
                const r = getRadius(node);

                // Outer glow (hidden by default, shown on hover)
                const glow = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                glow.setAttribute('r', r + 4);
                glow.setAttribute('fill', color);
                glow.setAttribute('opacity', '0');
                glow.classList.add('node-glow');
                g.appendChild(glow);

                const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                circle.setAttribute('r', r);
                circle.setAttribute('fill', color);
                circle.setAttribute('opacity', '0.85');
                g.appendChild(circle);

                // Show labels
                const showLabel = node.type === 'root' || (isModal && (node.type === 'title'));
                if (showLabel) {
                    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                    label.setAttribute('text-anchor', 'middle');
                    label.setAttribute('y', -r - 4);
                    label.setAttribute('font-size', isModal ? '11' : '9');
                    label.setAttribute('font-weight', '600');
                    label.setAttribute('fill', color);
                    let labelText = node.filename || node.content || (node.type || 'node');
                    if (labelText.length > 25) labelText = labelText.substring(0, 25) + '...';
                    label.textContent = labelText;
                    g.appendChild(label);
                }

                // Hover: show tooltip
                g.addEventListener('mouseenter', (e) => {
                    glow.setAttribute('opacity', '0.2');
                    circle.setAttribute('opacity', '1');
                    circle.setAttribute('r', r + 1.5);
                    const typeStr = (node.type || 'node').toUpperCase();
                    let content = typeStr;
                    if (node.content) content += ': ' + (node.content.length > 60 ? node.content.substring(0, 60) + '...' : node.content);
                    else if (node.filename) content += ': ' + node.filename;
                    tooltip.textContent = content;
                    tooltip.style.display = 'block';
                    const rect = wrapper.getBoundingClientRect();
                    tooltip.style.left = (e.clientX - rect.left + 10) + 'px';
                    tooltip.style.top = (e.clientY - rect.top - 24) + 'px';
                });
                g.addEventListener('mouseleave', () => {
                    glow.setAttribute('opacity', '0');
                    circle.setAttribute('opacity', '0.85');
                    circle.setAttribute('r', r);
                    tooltip.style.display = 'none';
                });

                // Click: show detail popup
                g.addEventListener('click', (e) => {
                    e.stopPropagation();
                    showNodeDetail(node, container, wrapper);
                });

                // Drag node
                g.addEventListener('mousedown', (e) => {
                    if (e.button !== 0) return;
                    e.stopPropagation();
                    dragNode = node;
                    dragOffsetX = 0;
                    dragOffsetY = 0;
                    svg.style.cursor = 'grabbing';
                    e.preventDefault();
                });

                nodesG.appendChild(g);
                return g;
            });

            // Simulation parameters
            const springLen = isModal ? 70 : 35;
            const springK = 0.04;
            const repelK = isModal ? 3000 : 800;
            const centerK = isModal ? 0.003 : 0.005;
            const damping = 0.85;
            let animFrame = null;
            let settled = 0;

            function simulate() {
                // Reset forces
                allNodes.forEach(n => { n._ax = 0; n._ay = 0; });

                // Center gravity
                allNodes.forEach(n => {
                    n._ax += (centerX - n._fx) * centerK;
                    n._ay += (centerY - n._fy) * centerK;
                });

                // Repulsion (all pairs)
                for (let i = 0; i < allNodes.length; i++) {
                    for (let j = i + 1; j < allNodes.length; j++) {
                        const a = allNodes[i], b = allNodes[j];
                        let dx = a._fx - b._fx, dy = a._fy - b._fy;
                        let dist = Math.sqrt(dx * dx + dy * dy) || 1;
                        const force = repelK / (dist * dist);
                        const fx = (dx / dist) * force, fy = (dy / dist) * force;
                        a._ax += fx; a._ay += fy;
                        b._ax -= fx; b._ay -= fy;
                    }
                }

                // Spring forces (edges)
                edges.forEach(({ source, target }) => {
                    let dx = target._fx - source._fx, dy = target._fy - source._fy;
                    let dist = Math.sqrt(dx * dx + dy * dy) || 1;
                    const force = (dist - springLen) * springK;
                    const fx = (dx / dist) * force, fy = (dy / dist) * force;
                    source._ax += fx; source._ay += fy;
                    target._ax -= fx; target._ay -= fy;
                });

                // Integrate
                let maxV = 0;
                allNodes.forEach(n => {
                    if (n === dragNode) return; // dragged node is pinned
                    n._vx = (n._vx + n._ax) * damping;
                    n._vy = (n._vy + n._ay) * damping;
                    n._fx += n._vx;
                    n._fy += n._vy;
                    maxV = Math.max(maxV, Math.abs(n._vx), Math.abs(n._vy));
                });

                // Render
                render();

                // Stop when settled
                if (maxV < 0.05) {
                    settled++;
                    if (settled > 60) return; // fully settled
                } else {
                    settled = 0;
                }
                animFrame = requestAnimationFrame(simulate);
            }

            function render() {
                // Update viewBox for zoom/pan
                const vbX = -viewX / viewScale + centerX - (W / 2) / viewScale;
                const vbY = -viewY / viewScale + centerY - (H / 2) / viewScale;
                const vbW = W / viewScale;
                const vbH = H / viewScale;
                svg.setAttribute('viewBox', `${vbX} ${vbY} ${vbW} ${vbH}`);

                edges.forEach(({ source, target }, i) => {
                    edgeEls[i].setAttribute('x1', source._fx);
                    edgeEls[i].setAttribute('y1', source._fy);
                    edgeEls[i].setAttribute('x2', target._fx);
                    edgeEls[i].setAttribute('y2', target._fy);
                });

                allNodes.forEach((node, i) => {
                    nodeEls[i].setAttribute('transform', `translate(${node._fx}, ${node._fy})`);
                });
            }

            // Mouse events for pan & drag
            svg.addEventListener('mousedown', (e) => {
                if (e.button !== 0 || dragNode) return;
                isPanning = true;
                panStartX = e.clientX;
                panStartY = e.clientY;
                panStartVX = viewX;
                panStartVY = viewY;
                svg.style.cursor = 'grabbing';
                e.preventDefault();
            });

            document.addEventListener('mousemove', (e) => {
                if (dragNode) {
                    // Convert screen coords to SVG coords
                    const rect = svg.getBoundingClientRect();
                    const svgX = (e.clientX - rect.left) / rect.width;
                    const svgY = (e.clientY - rect.top) / rect.height;
                    const vb = svg.getAttribute('viewBox').split(' ').map(Number);
                    dragNode._fx = vb[0] + svgX * vb[2];
                    dragNode._fy = vb[1] + svgY * vb[3];
                    dragNode._vx = 0;
                    dragNode._vy = 0;
                    // Wake simulation
                    settled = 0;
                    if (!animFrame) animFrame = requestAnimationFrame(simulate);
                    return;
                }
                if (!isPanning) return;
                viewX = panStartVX + (e.clientX - panStartX);
                viewY = panStartVY + (e.clientY - panStartY);
                render();
            });

            document.addEventListener('mouseup', () => {
                if (dragNode) {
                    dragNode = null;
                    svg.style.cursor = 'grab';
                }
                if (isPanning) {
                    isPanning = false;
                    svg.style.cursor = 'grab';
                }
            });

            // Scroll to zoom
            svg.addEventListener('wheel', (e) => {
                e.preventDefault();
                const delta = e.deltaY > 0 ? 0.9 : 1.1;
                viewScale = Math.max(0.3, Math.min(4, viewScale * delta));
                render();
            }, { passive: false });

            // Dismiss popup on svg click
            svg.addEventListener('click', () => {
                const existing = container.querySelector('.tree-detail-popup');
                if (existing) existing.remove();
            });

            container.appendChild(wrapper);

            // Start simulation
            animFrame = requestAnimationFrame(simulate);

            function resetView() {
                viewX = 0; viewY = 0; viewScale = 1;
                render();
            }

            function destroy() {
                if (animFrame) cancelAnimationFrame(animFrame);
            }

            return { wrapper, resetView, destroy };
        }

        // ── Radial Tree for fullscreen modal ──
        function renderRadialTree(root, container) {
            const wrapper = document.createElement('div');
            wrapper.className = 'tree-svg-wrapper tree-force-graph tree-force-graph-modal';

            const allNodes = collectNodes(root, []);
            const edges = [];
            allNodes.forEach(node => {
                (node._children || []).forEach(child => {
                    edges.push({ source: node, target: child });
                });
            });

            const W = container.clientWidth || window.innerWidth * 0.9;
            const H = container.clientHeight || window.innerHeight * 0.75;
            // Root near top so tree fans downward
            const centerX = W / 2, centerY = H * 0.15;

            // Find max depth
            let maxDepth = 0;
            allNodes.forEach(n => { if ((n.depth || 0) > maxDepth) maxDepth = n.depth; });

            // Auto ring spacing — shrink when many nodes so they don't overlap
            const leafCount = allNodes.filter(n => !n._children || n._children.length === 0).length;
            const arcAngle = (5 / 6) * Math.PI; // 150 degrees

            // Ring spacing: more generous, adaptive to viewport & node density
            const maxRingBySpace = Math.min(W, H) * 0.45 / Math.max(maxDepth, 1);
            const minArcPerLeaf = allNodes.length > 200 ? 8 : allNodes.length > 100 ? 12 : 16;
            const maxRingByLeaves = (leafCount > 0 && maxDepth > 0)
                ? (minArcPerLeaf * leafCount) / (arcAngle * maxDepth)
                : 160;
            const ringSpacing = Math.min(160, Math.max(35, Math.min(maxRingBySpace, maxRingByLeaves)));

            // 150° arc centered downward (tree fans downward from root at top)
            const arcStart = Math.PI / 2 - arcAngle / 2;
            const arcEnd = arcStart + arcAngle;

            // Subtree gap: generous angular spacing between sibling subtrees
            // Scales with depth — deeper nodes get proportionally more gap for clarity
            const baseGapAngle = allNodes.length > 200 ? 0.015 : allNodes.length > 80 ? 0.025 : 0.04;

            function countLeaves(node) {
                if (!node._children || node._children.length === 0) return 1;
                let sum = 0;
                node._children.forEach(c => { sum += countLeaves(c); });
                node._leafCount = sum;
                return sum;
            }
            countLeaves(root);

            function assignPositions(node, angleStart, angleEnd, depth) {
                const angle = (angleStart + angleEnd) / 2;
                const r = depth * ringSpacing;
                node._fx = centerX + Math.cos(angle) * r;
                node._fy = centerY + Math.sin(angle) * r;

                if (!node._children || node._children.length === 0) return;

                const numChildren = node._children.length;
                // Gap grows slightly at shallower depths where fans are more visible
                const gapAngle = baseGapAngle * Math.max(0.5, 1.5 - depth * 0.15);
                const totalGap = gapAngle * Math.max(0, numChildren - 1);
                const availableAngle = Math.max((angleEnd - angleStart) - totalGap, 0.01);
                const totalLeaves = node._children.reduce((s, c) => s + (c._leafCount || 1), 0);
                let current = angleStart;
                node._children.forEach((child, i) => {
                    const childLeaves = child._leafCount || 1;
                    const childAngleSpan = availableAngle * (childLeaves / totalLeaves);
                    assignPositions(child, current, current + childAngleSpan, depth + 1);
                    current += childAngleSpan;
                    if (i < numChildren - 1) current += gapAngle;
                });
            }
            assignPositions(root, arcStart, arcEnd, 0);

            // Node sizing — smaller overall, adaptive shrink for large trees
            const n = allNodes.length;
            const nodeSizeScale = n > 300 ? 0.3 : n > 200 ? 0.38 : n > 100 ? 0.5 : n > 50 ? 0.6 : 0.7;
            function getRadius(node) {
                if (node.type === 'root') return 10 * nodeSizeScale;
                if (node.type === 'title') return 7 * nodeSizeScale;
                return 4.5 * nodeSizeScale;
            }

            // Zoom/pan state
            let viewX = 0, viewY = 0, viewScale = 1;
            let isPanning = false, panStartX = 0, panStartY = 0, panStartVX = 0, panStartVY = 0;

            // Tooltip
            const tooltip = document.createElement('div');
            tooltip.className = 'force-graph-tooltip';
            tooltip.style.display = 'none';
            wrapper.appendChild(tooltip);

            // SVG
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.classList.add('tree-svg');
            svg.setAttribute('width', '100%');
            svg.setAttribute('height', '100%');
            svg.style.cursor = 'grab';
            svg.style.background = '#f8fafc';

            // Draw depth arcs (subtle 150° guides)
            const ringsG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            for (let d = 1; d <= maxDepth; d++) {
                const r = d * ringSpacing;
                const x1 = centerX + Math.cos(arcStart) * r;
                const y1 = centerY + Math.sin(arcStart) * r;
                const x2 = centerX + Math.cos(arcEnd) * r;
                const y2 = centerY + Math.sin(arcEnd) * r;
                const arc = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                arc.setAttribute('d', `M${x1},${y1} A${r},${r} 0 0,1 ${x2},${y2}`);
                arc.setAttribute('fill', 'none');
                arc.setAttribute('stroke', '#e2e8f0');
                arc.setAttribute('stroke-width', '0.5');
                arc.setAttribute('stroke-dasharray', '4 4');
                arc.setAttribute('opacity', '0.5');
                ringsG.appendChild(arc);
            }
            svg.appendChild(ringsG);

            // Edges — curved paths instead of straight lines
            const edgesG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            const edgeEls = edges.map(({ source, target }) => {
                const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                path.setAttribute('fill', 'none');
                path.setAttribute('stroke', '#cbd5e1');
                path.setAttribute('stroke-width', '0.8');
                path.setAttribute('opacity', '0.4');
                edgesG.appendChild(path);
                return path;
            });
            svg.appendChild(edgesG);

            // Nodes
            const nodesG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            const nodeEls = allNodes.map((node) => {
                const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                g.style.cursor = 'pointer';
                g.setAttribute('transform', `translate(${node._fx}, ${node._fy})`);

                const color = NODE_COLORS[node.type] || '#64748b';
                const r = getRadius(node);

                const glow = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                glow.setAttribute('r', r + 2.5);
                glow.setAttribute('fill', color);
                glow.setAttribute('opacity', '0');
                glow.classList.add('node-glow');
                g.appendChild(glow);

                const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                circle.setAttribute('r', r);
                circle.setAttribute('fill', color);
                circle.setAttribute('opacity', '0.8');
                g.appendChild(circle);

                // Hover
                g.addEventListener('mouseenter', (e) => {
                    glow.setAttribute('opacity', '0.25');
                    circle.setAttribute('opacity', '1');
                    circle.setAttribute('r', r + 1.5);
                    const typeStr = (node.type || 'node').toUpperCase();
                    let content = typeStr;
                    if (node.content) content += ': ' + (node.content.length > 60 ? node.content.substring(0, 60) + '...' : node.content);
                    else if (node.filename) content += ': ' + node.filename;
                    tooltip.textContent = content;
                    tooltip.style.display = 'block';
                    const rect = wrapper.getBoundingClientRect();
                    tooltip.style.left = (e.clientX - rect.left + 10) + 'px';
                    tooltip.style.top = (e.clientY - rect.top - 24) + 'px';

                    // Highlight connected edges
                    edges.forEach(({ source, target }, i) => {
                        if (source === node || target === node) {
                            edgeEls[i].setAttribute('stroke', color);
                            edgeEls[i].setAttribute('opacity', '0.8');
                            edgeEls[i].setAttribute('stroke-width', '1.5');
                        }
                    });
                });
                g.addEventListener('mouseleave', () => {
                    glow.setAttribute('opacity', '0');
                    circle.setAttribute('opacity', '0.85');
                    circle.setAttribute('r', r);
                    tooltip.style.display = 'none';
                    edges.forEach((_, i) => {
                        edgeEls[i].setAttribute('stroke', '#cbd5e1');
                        edgeEls[i].setAttribute('opacity', '0.5');
                        edgeEls[i].setAttribute('stroke-width', '0.8');
                    });
                });

                g.addEventListener('click', (e) => {
                    e.stopPropagation();
                    showNodeDetail(node, container, wrapper);
                });

                nodesG.appendChild(g);
                return g;
            });
            svg.appendChild(nodesG);

            wrapper.appendChild(svg);
            container.appendChild(wrapper);

            // Render edges as curved paths
            function renderEdges() {
                edges.forEach(({ source, target }, i) => {
                    // Quadratic bezier curving toward center
                    const mx = (source._fx + target._fx) / 2;
                    const my = (source._fy + target._fy) / 2;
                    // Pull control point slightly toward center
                    const cx = mx + (centerX - mx) * 0.2;
                    const cy = my + (centerY - my) * 0.2;
                    edgeEls[i].setAttribute('d', `M${source._fx},${source._fy} Q${cx},${cy} ${target._fx},${target._fy}`);
                });
            }

            // Auto-fit: compute bounding box of all nodes, then set initial view
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            allNodes.forEach(n => {
                const r = getRadius(n);
                if (n._fx - r < minX) minX = n._fx - r;
                if (n._fy - r < minY) minY = n._fy - r;
                if (n._fx + r > maxX) maxX = n._fx + r;
                if (n._fy + r > maxY) maxY = n._fy + r;
            });
            const padding = 40;
            const fitX = minX - padding, fitY = minY - padding;
            const fitW = (maxX - minX) + padding * 2, fitH = (maxY - minY) + padding * 2;
            // Initial offset/scale to fit all nodes
            const fitScaleX = W / fitW, fitScaleY = H / fitH;
            let initScale = Math.min(fitScaleX, fitScaleY, 2);
            let initOffsetX = (W / 2) - (fitX + fitW / 2) * initScale;
            let initOffsetY = (H / 2) - (fitY + fitH / 2) * initScale;

            function applyView() {
                const effScale = viewScale * initScale;
                const effX = viewX + initOffsetX;
                const effY = viewY + initOffsetY;
                const vbX = -effX / effScale;
                const vbY = -effY / effScale;
                const vbW = W / effScale;
                const vbH = H / effScale;
                svg.setAttribute('viewBox', `${vbX} ${vbY} ${vbW} ${vbH}`);
            }

            renderEdges();
            applyView();

            // Pan
            svg.addEventListener('mousedown', (e) => {
                if (e.button !== 0) return;
                isPanning = true;
                panStartX = e.clientX;
                panStartY = e.clientY;
                panStartVX = viewX;
                panStartVY = viewY;
                svg.style.cursor = 'grabbing';
                e.preventDefault();
            });
            document.addEventListener('mousemove', (e) => {
                if (!isPanning) return;
                viewX = panStartVX + (e.clientX - panStartX);
                viewY = panStartVY + (e.clientY - panStartY);
                applyView();
            });
            document.addEventListener('mouseup', () => {
                if (isPanning) { isPanning = false; svg.style.cursor = 'grab'; }
            });

            // Zoom
            svg.addEventListener('wheel', (e) => {
                e.preventDefault();
                const delta = e.deltaY > 0 ? 0.9 : 1.1;
                viewScale = Math.max(0.2, Math.min(5, viewScale * delta));
                applyView();
            }, { passive: false });

            // Dismiss popup on svg click
            svg.addEventListener('click', () => {
                const existing = container.querySelector('.tree-detail-popup');
                if (existing) existing.remove();
            });

            function resetView() {
                viewX = 0; viewY = 0; viewScale = 1;
                applyView();
            }

            return { wrapper, resetView, destroy: () => {} };
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

            // Count nodes by type
            const typeCounts = {};
            let maxDepth = 0;
            (treeData.tree_structure || []).forEach(n => {
                const t = n.type || 'node';
                typeCounts[t] = (typeCounts[t] || 0) + 1;
                if ((n.depth || 0) > maxDepth) maxDepth = n.depth;
            });

            // Stats-only panel
            const panel = document.createElement('div');
            panel.className = 'tree-stats-panel';

            let legendHtml = '';
            Object.entries(typeCounts).forEach(([type, count]) => {
                const color = NODE_COLORS[type] || '#64748b';
                legendHtml += `<div class="tree-stat-row">
                    <span class="tree-legend-dot" style="background:${color}"></span>
                    <span class="tree-stat-type">${type}</span>
                    <span class="tree-stat-value">${count}</span>
                </div>`;
            });

            panel.innerHTML = `
                <div class="tree-stats-header">
                    <span class="tree-stats-filename" title="${escapeHtml(treeData.meta_dict.file_name)}">${escapeHtml(treeData.meta_dict.file_name)}</span>
                </div>
                <div class="tree-stats-summary">
                    <div class="tree-stat-chip">
                        <span class="tree-stat-chip-value">${treeData.nodes_count}</span>
                        <span class="tree-stat-chip-label">Nodes</span>
                    </div>
                    <div class="tree-stat-chip">
                        <span class="tree-stat-chip-value">${maxDepth}</span>
                        <span class="tree-stat-chip-label">Depth</span>
                    </div>
                    <div class="tree-stat-chip">
                        <span class="tree-stat-chip-value">${Object.keys(typeCounts).length}</span>
                        <span class="tree-stat-chip-label">Types</span>
                    </div>
                </div>
                <div class="tree-stats-breakdown">${legendHtml}</div>
                <button class="tree-graph-btn" id="treeViewBtn">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="5" cy="6" r="2"/><circle cx="12" cy="18" r="2"/><circle cx="19" cy="6" r="2"/><path d="M5 8v2a4 4 0 0 0 4 4h6a4 4 0 0 0 4-4V8"/><line x1="12" y1="14" x2="12" y2="16"/></svg>
                    View Graph
                </button>
            `;
            treeViewer.appendChild(panel);

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

        // Full-screen modal with force-directed graph
        function openTreeModal(treeData) {
            const old = document.getElementById('treeModal');
            if (old) old.remove();

            // Count types for legend
            const typeCounts = {};
            (treeData.tree_structure || []).forEach(n => {
                const t = n.type || 'node';
                typeCounts[t] = (typeCounts[t] || 0) + 1;
            });
            let legendHtml = '';
            Object.entries(typeCounts).forEach(([type, count]) => {
                const color = NODE_COLORS[type] || '#64748b';
                legendHtml += `<span class="tree-legend-item"><span class="tree-legend-dot" style="background:${color}"></span>${type} <span class="tree-legend-count">${count}</span></span>`;
            });

            const modal = document.createElement('div');
            modal.id = 'treeModal';
            modal.className = 'tree-modal-overlay';
            modal.innerHTML = `
                <div class="tree-modal">
                    <div class="tree-modal-header">
                        <h3>Document Tree \u2014 ${escapeHtml(treeData.meta_dict.file_name)}</h3>
                        <div class="tree-modal-toolbar">
                            <div class="tree-toolbar-group tree-modal-legend">${legendHtml}</div>
                            <div class="tree-toolbar-divider"></div>
                            <div class="tree-toolbar-group">
                                <button class="tree-toolbar-btn" id="tmResetView" title="Reset view">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                                    Reset
                                </button>
                            </div>
                        </div>
                        <button class="tree-modal-close">&times;</button>
                    </div>
                    <div class="tree-modal-body tree-modal-graph-body"></div>
                </div>
            `;
            document.body.appendChild(modal);

            const freshNodes = JSON.parse(JSON.stringify(treeData.tree_structure));
            const root = buildTreeStructure(freshNodes);
            const body = modal.querySelector('.tree-modal-body');
            let graphResult = null;

            if (root) {
                graphResult = renderRadialTree(root, body);
            }

            modal.querySelector('#tmResetView').addEventListener('click', () => {
                if (graphResult) graphResult.resetView();
            });

            modal.querySelector('.tree-modal-close').addEventListener('click', () => {
                if (graphResult) graphResult.destroy();
                modal.remove();
            });
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    if (graphResult) graphResult.destroy();
                    modal.remove();
                }
            });
            const escHandler = (e) => {
                if (e.key === 'Escape') {
                    if (graphResult) graphResult.destroy();
                    modal.remove();
                    document.removeEventListener('keydown', escHandler);
                }
            };
            document.addEventListener('keydown', escHandler);

            requestAnimationFrame(() => modal.classList.add('active'));
        }
