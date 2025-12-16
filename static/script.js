document.addEventListener('DOMContentLoaded', () => {
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const fileList = document.getElementById('file-list');
    const sendBtn = document.getElementById('send-btn');
    const userInput = document.getElementById('user-input');
    const chatHistory = document.getElementById('chat-history');
    const apiKeyInput = document.getElementById('api-key');
    const saveKeyBtn = document.getElementById('save-key-btn');
    const storeSelect = document.getElementById('store-select');
    const createStoreBtn = document.getElementById('create-store-btn');
    const deleteStoreBtn = document.getElementById('delete-store-btn');
    const modelSelect = document.getElementById('model-select');
    const clearChatBtn = document.getElementById('clear-chat-btn');
    const closeCostBtn = document.getElementById('close-cost-widget');
    const costWidget = document.getElementById('cost-info-widget');

    if (closeCostBtn && costWidget) {
        closeCostBtn.addEventListener('click', () => {
            costWidget.style.display = 'none';
        });
    }

    const exitBtn = document.getElementById('exit-btn');
    if (exitBtn) {
        exitBtn.addEventListener('click', async () => {
            if (confirm("Are you sure you want to exit? This will shut down the application.")) {
                try {
                    await fetch('/api/shutdown', { method: 'POST' });
                } catch (e) { /* Ignore */ }
                window.close(); // Try to close tab
                document.body.innerHTML = "<div style='color:white; text-align:center; padding-top:50px;'>Application Shutting Down...<br>You can close this tab.</div>";
            }
        });
    }

    // Optional: Warn on browser close, but we can't force shutdown robustly without heartbeat
    // window.addEventListener('beforeunload', (e) => {
    //     e.preventDefault();
    //     e.returnValue = ''; // Standard standard 'Are you sure' dialog
    // });


    // --- Chat Management ---
    if (clearChatBtn) clearChatBtn.addEventListener('click', () => {
        if (confirm("Clear chat history?")) {
            chatHistory.innerHTML = '';
        }
    });

    // --- Store Management ---
    let currentStoreId = null;

    async function fetchStores() {
        try {
            const res = await fetch('/api/stores');
            const data = await res.json();

            storeSelect.innerHTML = '<option value="" disabled selected>Select Store...</option>';

            if (data.stores && data.stores.length > 0) {
                data.stores.forEach(store => {
                    const opt = document.createElement('option');
                    opt.value = store.id;
                    if (store.file_count !== undefined) {
                        opt.textContent = `${store.name} (${store.file_count})`;
                    } else {
                        opt.textContent = store.name;
                    }
                    opt.dataset.name = store.name;
                    if (store.active) {
                        opt.selected = true;
                        currentStoreId = store.id;
                    }
                    storeSelect.appendChild(opt);
                });
            } else {
                storeSelect.innerHTML = '<option value="" disabled selected>No stores found</option>';
            }
            // After fetching stores, if we have an active one, fetch its files
            if (currentStoreId) {
                fetchStoreFiles(currentStoreId);
            }
        } catch (e) {
            console.error(e);
        }
    }

    createStoreBtn.addEventListener('click', async () => {
        const name = prompt("Enter new Knowledge Base name:");
        if (!name) return;

        try {
            const res = await fetch('/api/stores', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: name })
            });
            const data = await res.json();
            if (data.status === 'success') {
                const opt = document.createElement('option');
                opt.value = data.id;
                opt.textContent = data.name;
                opt.selected = true;

                const placeholder = storeSelect.querySelector('option[disabled]');
                if (placeholder) placeholder.remove();

                storeSelect.appendChild(opt);
                currentStoreId = data.id;

                alert(`Store '${name}' created!`);
                setTimeout(fetchStores, 1000);
            } else {
                alert("Error: " + data.error);
            }
        } catch (e) {
            alert("Network Error");
        }
    });

    deleteStoreBtn.addEventListener('click', async () => {
        if (!currentStoreId) return alert("Select a store to delete.");
        if (!confirm("Are you sure? This will delete all indexed files in this store.")) return;

        try {
            const res = await fetch(`/api/stores/${currentStoreId}`, {
                method: 'DELETE'
            });
            const data = await res.json();
            if (data.status === 'success') {
                await fetchStores();
                currentStoreId = null;
                fileList.innerHTML = ''; // Clear file list
                alert("Store deleted.");
            } else {
                alert("Error: " + data.error);
            }
        } catch (e) {
            alert("Network Error");
        }
    });

    storeSelect.addEventListener('change', async () => {
        const selectedId = storeSelect.value;
        if (!selectedId) return;

        try {
            const res = await fetch('/api/stores/active', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ store_id: selectedId })
            });
            const data = await res.json();
            if (data.status === 'success') {
                currentStoreId = selectedId;
                fetchStoreFiles(selectedId);
            }
        } catch (e) {
            console.error(e);
        }
    });

    // --- File List Management (Feature 1) ---
    let fileMap = {}; // Map URI -> Display Name for citations

    async function fetchStoreFiles(storeId) {
        if (!storeId) return;
        fileList.innerHTML = '<div style="text-align:center; color:grey; padding:10px;">Loading files...</div>';
        try {
            const res = await fetch(`/api/store/${storeId}/files`);
            const data = await res.json();

            fileList.innerHTML = ''; // Clear loading
            fileMap = {}; // Reset map

            if (data.files && data.files.length > 0) {
                // Sort by name
                data.files.sort((a, b) => a.name.localeCompare(b.name));

                data.files.forEach(f => {
                    // Update map
                    fileMap[f.uri] = f.name;

                    const item = document.createElement('div');
                    item.className = 'file-item';
                    item.innerHTML = `
                        <div style="width:100%; display:flex; justify-content:space-between; align-items:center;">
                            <span class="file-name" title="${f.name}">${f.name}</span>
                            <span class="check">✓</span>
                        </div>
                    `;
                    fileList.appendChild(item);
                });
            } else {
                fileList.innerHTML = '<div style="text-align:center; color:grey; padding:10px;">No files indexed.</div>';
            }
        } catch (e) {
            console.error(e);
            fileList.innerHTML = `<div style="color:red; font-size:12px; padding:5px;">Error loading files</div>`;
        }
    }

    // --- Heartbeat ---
    // User wants auto-shutdown when browser closes.
    // We send a heartbeat every 2 seconds. Server waits 5 seconds.
    setInterval(async () => {
        try {
            await fetch('/api/heartbeat', { method: 'POST' });
        } catch (e) {
            // Server dead?
        }
    }, 2000);

    // Initial load
    fetchStores();

    // --- API Key Handling ---
    saveKeyBtn.addEventListener('click', async () => {
        const key = apiKeyInput.value.trim();
        if (!key) return;

        try {
            const res = await fetch('/api/set_key', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ apiKey: key })
            });
            const data = await res.json();
            if (data.status === 'success') {
                const originalText = saveKeyBtn.textContent;
                saveKeyBtn.textContent = 'Saved';
                saveKeyBtn.style.background = '#2ea043';
                saveKeyBtn.style.color = '#fff';
                setTimeout(() => {
                    saveKeyBtn.textContent = originalText;
                    saveKeyBtn.style.background = '';
                    saveKeyBtn.style.color = '';
                    apiKeyInput.value = '';
                }, 2000);

                fetchModels();
                fetchStores();
            }
        } catch (e) {
            console.error(e);
            alert("Failed to save key");
        }
    });

    const DEFAULT_MODELS = [
        { id: 'gemini-3-pro-preview', name: 'Gemini 3.0 Pro Preview' },
        { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
        { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
        { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite' },
        { id: 'gemini-2.0-flash-exp', name: 'Gemini 2.0 Flash Exp' },
        { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro' },
        { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash' }
    ];

    async function fetchModels() {
        if (!modelSelect) return;
        if (modelSelect.options.length <= 1) {
            renderModels(DEFAULT_MODELS);
        }

        try {
            const res = await fetch('/api/models');
            const data = await res.json();

            if (data.models && data.models.length > 0) {
                renderModels(data.models);
            }
        } catch (e) {
            console.log("Could not fetch models");
        }
    }

    function renderModels(models) {
        const currentVal = modelSelect.value;
        modelSelect.innerHTML = '';
        models.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m.id;
            const name = m.name || m.id;
            opt.textContent = name === m.id ? name : `${name} (${m.id})`;
            modelSelect.appendChild(opt);
        });

        if (currentVal && Array.from(modelSelect.options).some(o => o.value === currentVal)) {
            modelSelect.value = currentVal;
        } else if (models.length > 0) {
            modelSelect.value = models[0].id;
        }
    }

    fetchModels();

    // --- File Upload Handling ---
    const triggerFile = document.getElementById('trigger-file');
    const triggerFolder = document.getElementById('trigger-folder');
    const folderInput = document.getElementById('folder-input');

    if (triggerFile) triggerFile.addEventListener('click', (e) => { e.stopPropagation(); fileInput.click(); });
    if (triggerFolder) triggerFolder.addEventListener('click', (e) => { e.stopPropagation(); folderInput.click(); });

    dropZone.addEventListener('click', (e) => {
        if (e.target === dropZone || e.target.tagName === 'P' || e.target.className === 'icon') {
            fileInput.click();
        }
    });

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        const items = e.dataTransfer.items;
        if (items) {
            for (let i = 0; i < items.length; i++) {
                const item = items[i].webkitGetAsEntry();
                if (item) traverseFileTree(item);
            }
        }
    });

    fileInput.addEventListener('change', () => {
        if (fileInput.files.length) {
            for (let i = 0; i < fileInput.files.length; i++) {
                if (isIgnored(fileInput.files[i].name, false)) continue;
                uploadFiles(fileInput.files[i]);
            }
        }
        fileInput.value = '';
    });

    folderInput.addEventListener('change', () => {
        if (folderInput.files.length) {
            for (let i = 0; i < folderInput.files.length; i++) {
                const file = folderInput.files[i];
                if (isIgnored(file.name, false)) continue;
                uploadFiles(file);
            }
        }
        folderInput.value = '';
    });

    const IGNORED_DIRS = new Set(['node_modules', '.git', '.vscode', '__pycache__', 'venv', '.venv']);
    const IGNORED_FILES = new Set(['.DS_Store', 'Thumbs.db']);

    function isIgnored(name, isDir) {
        if (isDir && IGNORED_DIRS.has(name)) return true;
        if (!isDir && IGNORED_FILES.has(name)) return true;
        return false;
    }

    function traverseFileTree(item, path) {
        path = path || "";
        if (isIgnored(item.name, item.isDirectory)) return;

        if (item.isFile) {
            item.file(function (file) {
                if (isIgnored(file.name, false)) return;
                uploadFiles(file);
            });
        } else if (item.isDirectory) {
            const dirReader = item.createReader();
            const readEntries = () => {
                dirReader.readEntries(function (entries) {
                    if (entries.length > 0) {
                        for (let i = 0; i < entries.length; i++) {
                            traverseFileTree(entries[i], path + item.name + "/");
                        }
                        readEntries();
                    }
                });
            };
            readEntries();
        }
    }

    async function uploadFiles(file) {
        const item = document.createElement('div');
        item.className = 'file-item uploading';
        item.innerHTML = `
            <div style="width:100%">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span class="file-name">${file.name}</span>
                    <div class="spinner"></div>
                </div>
                <div class="progress-bar-container"><div class="progress-bar"></div></div>
            </div>
        `;
        // Prepend to list for visual feedback
        fileList.prepend(item);

        const progressBar = item.querySelector('.progress-bar');
        const spinner = item.querySelector('.spinner');
        const formData = new FormData();
        formData.append('file', file);

        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('POST', '/api/upload', true);
            xhr.upload.onprogress = (e) => {
                if (e.lengthComputable) {
                    progressBar.style.width = ((e.loaded / e.total) * 100) + '%';
                }
            };
            xhr.onload = () => {
                item.classList.remove('uploading');
                if (xhr.status === 200) {
                    if (spinner) spinner.replaceWith(createCheckmark());
                    // Refresh the full list to get correct state/order
                    fetchStoreFiles(currentStoreId);
                    fetchStores(); // Update counts
                    resolve();
                } else {
                    handleError("Error");
                }
            };
            xhr.onerror = () => handleError("Network Error");
            function handleError(msg) {
                item.classList.remove('uploading');
                if (spinner) spinner.remove();
                item.style.borderColor = 'red';
                reject();
            }
            xhr.send(formData);
        });
    }

    function createCheckmark() {
        const span = document.createElement('span');
        span.className = 'check';
        span.textContent = '✓';
        return span;
    }

    // --- Chat Handling ---
    function autoResize() {
        userInput.style.height = 'auto';
        userInput.style.height = userInput.scrollHeight + 'px';
        sendBtn.disabled = userInput.value.trim() === '';
    }

    userInput.addEventListener('input', autoResize);
    userInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    sendBtn.addEventListener('click', sendMessage);

    async function sendMessage() {
        const text = userInput.value.trim();
        // Feature 2: Custom Instruction
        const systemInstruction = document.getElementById('system-instruction').value.trim();

        if (!text) return;

        addMessage('user', text);
        userInput.value = '';
        userInput.style.height = 'auto';
        sendBtn.disabled = true;

        const loadingId = addMessage('ai', 'Thinking...', true);

        try {
            const model = modelSelect ? modelSelect.value : 'gemini-1.5-flash';
            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: text,
                    model: model,
                    system_instruction: systemInstruction
                })
            });
            const data = await res.json();
            const loader = document.getElementById(loadingId);
            if (loader) loader.remove();

            if (data.error) {
                addMessage('ai', "⚠️ Error: " + data.error);
            } else {
                // Feature 3: Citations
                addMessage('ai', data.response, false, data.citations);
            }
        } catch (e) {
            const loader = document.getElementById(loadingId);
            if (loader) loader.remove();
            addMessage('ai', "Error: " + e.message);
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
            bubble.style.opacity = 0.7;
            bubble.style.fontStyle = 'italic';
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
                    const name = fileMap[c.uri] || "Unknown File";
                    const range = c.startIndex !== undefined ? `[${c.startIndex}-${c.endIndex}]` : "";
                    html += `<span class="citation-item" title="${c.uri}">${name} ${range}</span>`;
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
});
