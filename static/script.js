document.addEventListener('DOMContentLoaded', () => {
    // --- Elements ---
    const apiKeyInput = document.getElementById('api-key');
    const saveKeyBtn = document.getElementById('save-key-btn');
    const modelSelect = document.getElementById('model-select');
    const storeSelect = document.getElementById('store-select');
    const createStoreBtn = document.getElementById('create-store-btn');
    const deleteStoreBtn = document.getElementById('delete-store-btn');
    const fileList = document.getElementById('file-list');

    // UI Views
    // const welcomeView = document.getElementById('welcome-view'); // Removed
    const chatView = document.getElementById('chat-view');
    const progressOverlay = document.getElementById('progress-overlay');
    const suggestionsDiv = document.getElementById('suggestions');
    const clearChatBtn = document.getElementById('clear-chat-btn');

    // Modal Elements
    const settingsBtn = document.getElementById('settings-btn');
    const settingsModal = document.getElementById('settings-modal');
    const closeSettingsBtn = document.getElementById('close-settings-btn');
    const sysTemplateSelect = document.getElementById('sys-template-select');
    const systemInstruction = document.getElementById('system-instruction');

    // Upload - Now in sidebar
    const fileInput = document.getElementById('file-input');
    const folderInput = document.getElementById('folder-input');
    const triggerFile = document.getElementById('trigger-file');
    const triggerFolder = document.getElementById('trigger-folder');
    // const dropZone ... Removed

    // Chat
    const chatHistory = document.getElementById('chat-history');
    const userInput = document.getElementById('user-input');
    const sendBtn = document.getElementById('send-btn');
    const exitBtn = document.getElementById('exit-btn');

    let currentStoreId = null;

    // --- Modal Logic ---
    if (settingsBtn && settingsModal && closeSettingsBtn) {
        settingsBtn.addEventListener('click', () => {
            settingsModal.classList.remove('hidden');
        });
        closeSettingsBtn.addEventListener('click', () => {
            settingsModal.classList.add('hidden');
        });
        // Close on outside click
        settingsModal.addEventListener('click', (e) => {
            if (e.target === settingsModal) {
                settingsModal.classList.add('hidden');
            }
        });
    }

    // --- Template Logic ---
    const TEMPLATES = {
        'react': "You are an expert React and TypeScript developer. Focus on clean, functional components, hooks, and modern best practices.",
        'academic': "You are a helpful academic research assistant. Provide citations, summarize key findings, and maintain a formal tone.",
        'legal': "You are a senior legal analyst. Analyze documents for clauses, risks, and definitions. Be precise and cite page numbers.",
        'summary': "You are a concise summarizer. Extract the most important points from the documents in bullet points."
    };

    if (sysTemplateSelect) {
        sysTemplateSelect.addEventListener('change', () => {
            const key = sysTemplateSelect.value;
            if (TEMPLATES[key]) {
                systemInstruction.value = TEMPLATES[key];
            }
        });
    }

    // --- View Switching (Legacy Removed) ---
    // Chat view is always active now
    function showChatView() {
        // Just focus input
        userInput.focus();
    }

    function showWelcomeView() {
        // Reset to initial state if needed, or just clear chat
        // chatHistory.innerHTML = ... (Handled by clear chat btn)
    }

    // --- Store & State Logic ---

    async function fetchStores() {
        try {
            const res = await fetch('/api/stores');
            const data = await res.json();

            storeSelect.innerHTML = '<option value="" disabled selected>Select Store...</option>';

            if (data.stores) {
                data.stores.forEach(s => {
                    const opt = document.createElement('option');
                    opt.value = s.id;
                    const count = s.file_count !== undefined ? `(${s.file_count} files)` : '';
                    opt.textContent = `${s.name} ${count}`;
                    storeSelect.appendChild(opt);
                });
            }

            if (data.active_store_id) {
                storeSelect.value = data.active_store_id;
                currentStoreId = data.active_store_id;
                fetchStoreFiles(currentStoreId); // Update sidebar list
            }
        } catch (e) { console.error("Fetch stores error", e); }
    }

    storeSelect.addEventListener('change', () => {
        const storeId = storeSelect.value;
        if (!storeId) return;
        setActiveStore(storeId);
    });

    async function setActiveStore(storeId) {
        try {
            await fetch('/api/stores/active', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ store_id: storeId })
            });
            currentStoreId = storeId;
            fetchStoreFiles(storeId);
        } catch (e) { console.error(e); }
    }

    createStoreBtn.addEventListener('click', async () => {
        const name = prompt("Enter Knowledge Base Name:");
        if (!name) return;
        try {
            const res = await fetch('/api/stores', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name })
            });
            const data = await res.json();
            if (data.status === 'success') {
                await fetchStores();
                storeSelect.value = data.id;
                currentStoreId = data.id;
                setActiveStore(data.id);
            } else {
                alert("Error: " + data.error);
            }
        } catch (e) { alert("Failed to create store"); }
    });

    deleteStoreBtn.addEventListener('click', async () => {
        if (!currentStoreId) return;
        if (!confirm("Delete this Knowledge Base? This cannot be undone.")) return;
        try {
            const res = await fetch(`/api/stores/${currentStoreId}`, { method: 'DELETE' });
            if (res.ok) {
                currentStoreId = null;
                await fetchStores();
                fileList.innerHTML = '';
                showWelcomeView(); // Go back to welcome on delete
            }
        } catch (e) { alert("Delete failed"); }
    });

    // --- Upload Logic ---

    function setStepStatus(id, status) {
        // status: 'active', 'completed', 'pending'
        const el = document.getElementById(id);
        el.className = 'step'; // reset
        if (status === 'active') el.classList.add('active');
        if (status === 'completed') el.classList.add('completed');
    }

    async function handleUploadFlow(files) {
        if (!files || files.length === 0) return;

        // Ensure store exists
        if (!currentStoreId) {
            // Auto create "My Library" if none
            const name = "My Library";
            try {
                const res = await fetch('/api/stores', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name })
                });
                const data = await res.json();
                await fetchStores();
                storeSelect.value = data.id;
                currentStoreId = data.id;
                setActiveStore(data.id);
            } catch (e) {
                alert("Please create a Knowledge Base first.");
                return;
            }
        }

        // Show Progress
        progressOverlay.classList.remove('hidden');
        setStepStatus('step-upload', 'active');
        setStepStatus('step-index', 'pending');
        setStepStatus('step-suggest', 'pending');

        // Upload Files Loop
        let uploadedCount = 0;

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const formData = new FormData();
            formData.append('file', file);

            // Upload
            try {
                await fetch('/api/upload', { method: 'POST', body: formData });
                uploadedCount++;
            } catch (e) {
                console.error(e);
            }
        }

        setStepStatus('step-upload', 'completed');
        setStepStatus('step-index', 'active');

        // Refresh List
        await fetchStoreFiles(currentStoreId);
        await fetchStores(); // Update counts

        // Simulate indexing wait (API handles it mostly synchronously per file, but visualization helps)
        setStepStatus('step-index', 'completed');

        // Generate Suggestions
        setStepStatus('step-suggest', 'active');
        await generateAndRenderSuggestions();
        setStepStatus('step-suggest', 'completed');

        // Done
        setTimeout(() => {
            progressOverlay.classList.add('hidden');
            showChatView();
            // Add a system welcome message
            if (chatHistory.children.length === 0) {
                addMessage('ai', `Analysis complete! I've processed ${uploadedCount} documents. You can select a suggested question below or ask me anything.`);
            }
        }, 800);
    }

    async function generateAndRenderSuggestions() {
        if (!currentStoreId) return;
        try {
            suggestionsDiv.innerHTML = ''; // clear
            suggestionsDiv.style.display = 'grid'; // ensure visible before content added
            const res = await fetch(`/api/store/${currentStoreId}/suggestions`, { method: 'POST' });
            const data = await res.json();

            if (data.questions && data.questions.length > 0) {
                data.questions.forEach(q => {
                    const chip = document.createElement('div');
                    chip.className = 'suggestion-chip';
                    chip.textContent = q;
                    chip.onclick = () => {
                        userInput.value = q;
                        sendMessage();
                        suggestionsDiv.style.display = 'none';
                    };
                    suggestionsDiv.appendChild(chip);
                });
            } else {
                // Fallback / Placeholder suggestions if generation fails
                const defaults = ["Summarize the documents", "What are the key points?", "Any risks mentioned?"];
                defaults.forEach(q => {
                    const chip = document.createElement('div');
                    chip.className = 'suggestion-chip';
                    chip.textContent = q;
                    chip.onclick = () => {
                        userInput.value = q;
                        sendMessage();
                        suggestionsDiv.style.display = 'none';
                    };
                    suggestionsDiv.appendChild(chip);
                });
            }
        } catch (e) { console.error("Suggestions failed", e); }
    }

    // --- Drag & Drop Removed (moved to sidebar buttons only) ---
    // If you want drag-drop on the whole body, you can add it, but for now buttons only as requested.

    triggerFile.addEventListener('click', () => fileInput.click());
    triggerFolder.addEventListener('click', () => folderInput.click());
    fileInput.addEventListener('change', () => handleUploadFlow(fileInput.files));
    folderInput.addEventListener('change', () => handleUploadFlow(folderInput.files));

    // --- Chat Logic ---
    async function sendMessage() {
        const text = userInput.value.trim();
        // Read instruction from the now-relocated textarea
        const systemIns = systemInstruction.value.trim();

        if (!text) return;

        addMessage('user', text);
        userInput.value = '';
        userInput.style.height = 'auto';
        sendBtn.disabled = true;

        const loaderId = addMessage('ai', 'Thinking...', true);

        try {
            const model = modelSelect.value || 'gemini-1.5-flash';
            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: text,
                    model: model,
                    system_instruction: systemIns
                })
            });
            const data = await res.json();
            document.getElementById(loaderId).remove();

            if (data.error) addMessage('ai', "Error: " + data.error);
            else addMessage('ai', data.response, false, data.citations);

        } catch (e) {
            document.getElementById(loaderId).remove();
            addMessage('ai', "Network Error");
        }
    }

    function addMessage(role, text, isLoading = false, citations = []) {
        const msgDiv = document.createElement('div');
        msgDiv.className = `message ${role}`;
        if (isLoading) msgDiv.id = 'msg-' + Date.now();

        const bubble = document.createElement('div');
        bubble.className = 'bubble';

        if (isLoading) {
            bubble.textContent = text;
            bubble.style.opacity = '0.7';
        } else {
            let html = text
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
                .replace(/\n/g, '<br>');

            if (citations && citations.length > 0) {
                html += `<div class="citation-block"><span class="citation-title">Sources:</span><br>`;
                citations.forEach(c => {
                    // try to find name from file map if needed, but simplistic now
                    const range = c.startIndex !== undefined ? `[${c.startIndex}-${c.endIndex}]` : "";
                    html += `<span class="citation-item">${c.uri.split('/').pop()} ${range}</span>`;
                });
                html += `</div>`;
            }
            bubble.innerHTML = html;
        }

        msgDiv.appendChild(bubble);
        chatHistory.appendChild(msgDiv);
        chatHistory.scrollTop = chatHistory.scrollHeight;
        return msgDiv.id;
    }

    userInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    userInput.addEventListener('input', () => {
        userInput.style.height = 'auto';
        userInput.style.height = userInput.scrollHeight + 'px';
        sendBtn.disabled = userInput.value.trim() === '';
    });
    sendBtn.addEventListener('click', sendMessage);

    clearChatBtn.addEventListener('click', () => {
        chatHistory.innerHTML = '';
        suggestionsDiv.style.display = 'none';
        // Add welcome message back
        const msgDiv = document.createElement('div');
        msgDiv.className = 'message ai';
        msgDiv.innerHTML = '<div class="bubble">Chat cleared. Upload more files or ask a question.</div>';
        chatHistory.appendChild(msgDiv);
    });

    // --- Sidebar File List ---
    async function fetchStoreFiles(storeId) {
        if (!storeId) {
            fileList.innerHTML = '<div style="text-align:center; color:grey; padding:10px;">No store selected.</div>';
            return;
        }
        fileList.innerHTML = '<div class="spinner" style="margin:10px auto;"></div>';

        try {
            const res = await fetch(`/api/store/${storeId}/files`);
            const data = await res.json();
            fileList.innerHTML = '';

            if (data.files && data.files.length > 0) {
                data.files.forEach(f => {
                    const item = document.createElement('div');
                    item.className = 'file-item';
                    item.innerHTML = `
                        <div style="display:flex; justify-content:space-between; width:100%;">
                            <span class="file-name" title="${f.name}">${f.name}</span>
                            <span class="check">✓</span>
                        </div>
                    `;
                    fileList.appendChild(item);
                });
            } else {
                fileList.innerHTML = '<div style="text-align:center; color:grey; padding:10px; font-size:12px;">No files yet.</div>';
            }
        } catch (e) {
            fileList.innerText = "Error loading files";
        }
    }

    // --- Init ---
    fetchStores();

    // Model List
    async function fetchModels() {
        // User-specified models PREFERRED
        const EXTENDED_MODELS = [
            { id: 'gemini-3.0-pro-preview', name: 'Gemini 3.0 Pro Preview' },
            { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
            { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
            { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash-Lite' },
            // Fallbacks where available
            { id: 'gemini-2.0-flash-exp', name: 'Gemini 2.0 Flash Exp' },
            { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro' },
            { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash' }
        ];

        try {
            const res = await fetch('/api/models');
            const data = await res.json();
            modelSelect.innerHTML = '';

            let models = data.models || [];

            // Create a map for user models to ensure we use our friendly names and ordering
            const modelIds = new Set(models.map(m => m.id));

            // First add our priority list
            EXTENDED_MODELS.forEach(em => {
                const opt = document.createElement('option');
                opt.value = em.id;
                opt.textContent = em.name;
                modelSelect.appendChild(opt);

                // Track that we added this
                modelIds.add(em.id);
            });

            // Add any others from API that weren't in our priority list
            models.forEach(m => {
                if (!EXTENDED_MODELS.find(em => em.id === m.id)) {
                    const opt = document.createElement('option');
                    opt.value = m.id;
                    opt.textContent = m.name;
                    modelSelect.appendChild(opt);
                }
            });

            if (modelSelect.options.length > 0) modelSelect.selectedIndex = 0;

        } catch (e) {
            console.error("Model fetch failed, using defaults", e);
            modelSelect.innerHTML = '';
            EXTENDED_MODELS.forEach(m => {
                const opt = document.createElement('option');
                opt.value = m.id;
                opt.textContent = m.name;
                modelSelect.appendChild(opt);
            });
            modelSelect.selectedIndex = 0;
        }
    }
    fetchModels();

    // Key Save Visuals
    const apiKeyStatus = document.createElement('span');
    apiKeyStatus.id = 'api-key-status';
    apiKeyStatus.style.marginLeft = '8px';
    apiKeyStatus.style.color = 'var(--success)';
    apiKeyStatus.style.fontWeight = 'bold';
    apiKeyStatus.style.display = 'none';
    apiKeyStatus.innerHTML = '✓';
    if (saveKeyBtn && saveKeyBtn.parentNode) saveKeyBtn.parentNode.appendChild(apiKeyStatus);

    saveKeyBtn.addEventListener('click', async () => {
        const key = apiKeyInput.value.trim();
        if (!key) return;
        try {
            await fetch('/api/set_key', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ apiKey: key })
            });

            // Show checkmark
            apiKeyStatus.style.display = 'inline';
            setTimeout(() => apiKeyStatus.style.display = 'none', 3000);

            alert("API Key Saved");
            // Refresh stores/models
            await fetchStores();
            await fetchModels();
        } catch (e) { alert("Failed to save key"); }
    });

    // Check for key on load
    (async () => {
        try {
            const res = await fetch('/api/has_key');
            if (res.ok) {
                const data = await res.json();
                if (data.has_key) {
                    apiKeyStatus.style.display = 'inline';
                }
            }
        } catch (e) { }
    })();

    // Exit
    if (exitBtn) {
        exitBtn.addEventListener('click', async () => {
            if (confirm("Exit Application?")) {
                try { await fetch('/api/shutdown', { method: 'POST' }); } catch (e) { }
                window.close();
                document.body.innerHTML = "<div style='color:white;text-align:center;padding-top:100px;'>Application Closed.</div>";
            }
        });
    }

    // Heartbeat
    setInterval(async () => {
        try { await fetch('/api/heartbeat', { method: 'POST' }); } catch (e) { }
    }, 2000);
});
