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
                // Optimistic Update: Add to list immediately
                const opt = document.createElement('option');
                opt.value = data.id;
                opt.textContent = data.name;
                opt.selected = true;

                // Remove placeholder if present
                const placeholder = storeSelect.querySelector('option[disabled]');
                if (placeholder) placeholder.remove();

                storeSelect.appendChild(opt);
                currentStoreId = data.id;

                alert(`Store '${name}' created!`);

                // Refresh list properly after a short delay to ensure API consistency
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
            // Because IDs might have slashes (resource names), we might need to handle URLs carefully.
            // But usually fetch handles it if we don't double encode incorrectly.
            // However, Flask path param captures slashes.
            const res = await fetch(`/api/stores/${currentStoreId}`, {
                method: 'DELETE'
            });
            const data = await res.json();
            if (data.status === 'success') {
                await fetchStores();
                currentStoreId = null;
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
            }
        } catch (e) {
            console.error(e);
        }
    });

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
                    apiKeyInput.value = ''; // Clear for security presentation
                }, 2000);

                // Refresh models and stores
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
        { id: 'gemini-2.0-flash-exp', name: 'Gemini 2.0 Flash Exp' },
        { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro' },
        { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash' }
    ];

    async function fetchModels() {
        if (!modelSelect) return;

        // Optimistic UI: If empty or loading, show defaults first
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
            console.log("Could not fetch models (maybe no key yet)");
            // If failed and we still have defaults, keep them. 
            // Only show error if we really have nothing.
            if (modelSelect.options.length === 0) {
                modelSelect.innerHTML = '<option value="" disabled selected>Please set API Key</option>';
            }
        }
    }

    function renderModels(models) {
        const currentVal = modelSelect.value;
        modelSelect.innerHTML = '';

        // Priority Sort logic...
        models.sort((a, b) => {
            const score = (name) => {
                if (name.includes('flash')) return 3;
                if (name.includes('pro')) return 2;
                return 1;
            }
            return score(b.id) - score(a.id);
        });

        models.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m.id;
            // Handle if name already has ID or is undefined
            const name = m.name || m.id;
            // Don't duplicate ID in display if it's the same
            opt.textContent = name === m.id ? name : `${name} (${m.id})`;
            modelSelect.appendChild(opt);
        });

        // Restore selection
        if (currentVal && Array.from(modelSelect.options).some(o => o.value === currentVal)) {
            modelSelect.value = currentVal;
        } else if (models.length > 0) {
            // Default to first (best sorted)
            modelSelect.value = models[0].id;
        }
    }

    // Initial fetch (might fail if no key, but worth trying if key env is set)
    fetchModels();

    // --- File Upload Handling ---
    const triggerFile = document.getElementById('trigger-file');
    const triggerFolder = document.getElementById('trigger-folder');
    const folderInput = document.getElementById('folder-input');

    // Click triggers
    if (triggerFile) triggerFile.addEventListener('click', (e) => { e.stopPropagation(); fileInput.click(); });
    if (triggerFolder) triggerFolder.addEventListener('click', (e) => { e.stopPropagation(); folderInput.click(); });

    // Main drop zone click default to file
    dropZone.addEventListener('click', (e) => {
        // Only trigger if clicked on background, not on buttons
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
                if (item) {
                    traverseFileTree(item);
                }
            }
        } else {
            // Fallback for older browsers
            if (e.dataTransfer.files.length) {
                for (let i = 0; i < e.dataTransfer.files.length; i++) {
                    uploadFiles(e.dataTransfer.files[i]);
                }
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
        // Reset to allow selecting same file again
        fileInput.value = '';
    });

    folderInput.addEventListener('change', () => {
        if (folderInput.files.length) {
            for (let i = 0; i < folderInput.files.length; i++) {
                const file = folderInput.files[i];
                // Check path for ignored folders
                const path = file.webkitRelativePath || file.name;
                // Simple check: does path contain ignored dir?
                // .webkitRelativePath looks like "folder/sub/file.txt"
                const parts = path.split('/');
                let skip = false;
                for (let part of parts) {
                    if (IGNORED_DIRS.has(part)) { skip = true; break; }
                }
                if (skip) {
                    console.log("Skipping " + path);
                    continue;
                }
                if (isIgnored(file.name, false)) continue;

                uploadFiles(file);
            }
        }
        folderInput.value = '';
    });

    const IGNORED_DIRS = new Set([
        'node_modules', '.git', '.vscode', '.idea', 'dist', 'build',
        '__pycache__', 'venv', 'env', '.venv', '.env',
        '$RECYCLE.BIN', 'System Volume Information'
    ]);

    const IGNORED_FILES = new Set([
        '.DS_Store', 'Thumbs.db', 'desktop.ini'
    ]);

    function isIgnored(name, isDir) {
        if (isDir && IGNORED_DIRS.has(name)) return true;
        if (!isDir && IGNORED_FILES.has(name)) return true;
        // Ignore dotfiles generally if needed, but let's stick to specific list for now 
        // or prevent all hidden files:
        // if (name.startsWith('.')) return true; 
        return false;
    }

    function traverseFileTree(item, path) {
        path = path || "";
        if (isIgnored(item.name, item.isDirectory)) {
            console.log(`Skipping ignored item: ${path}${item.name}`);
            return;
        }

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
                        // Continue reading (some browsers return in chunks)
                        readEntries();
                    }
                });
            };
            readEntries();
        }
    }

    async function uploadFiles(file) {
        // Create UI Item
        const item = document.createElement('div');
        item.className = 'file-item uploading';
        item.innerHTML = `
            <div style="width:100%">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span class="file-name">${file.name}</span>
                    <div class="spinner"></div>
                </div>
                <div class="progress-bar-container">
                    <div class="progress-bar"></div>
                </div>
            </div>
        `;
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
                    const percent = (e.loaded / e.total) * 100;
                    progressBar.style.width = percent + '%';
                }
            };

            xhr.onload = () => {
                item.classList.remove('uploading');
                if (xhr.status === 200) {
                    const data = JSON.parse(xhr.responseText);
                    if (data.status === 'success') {
                        if (spinner) spinner.replaceWith(createCheckmark());
                        resolve(data);
                        // Update file counts in dropdown
                        fetchStores();
                    } else {
                        handleError(data.error);
                    }
                } else {
                    handleError("HTTP " + xhr.status);
                }
            };

            xhr.onerror = () => handleError("Network Error");

            function handleError(msg) {
                item.classList.remove('uploading');
                if (spinner) spinner.remove();
                item.style.borderColor = '#fa4549';
                item.innerHTML += `<div style="color:red; font-size:10px">${msg}</div>`;
                reject(new Error(msg));
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
        if (!text) return;

        addMessage('user', text);
        userInput.value = '';
        userInput.style.height = 'auto'; // Reset height
        sendBtn.disabled = true;

        // Add loading bubble
        const loadingId = addMessage('ai', 'Thinking...', true);

        try {
            const model = modelSelect ? modelSelect.value : 'gemini-1.5-flash';
            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: text, model: model })
            });
            const data = await res.json();

            // Remove loading
            const loader = document.getElementById(loadingId);
            if (loader) loader.remove();

            if (data.error) {
                addMessage('ai', "⚠️ Error: " + data.error + "\n\nMake sure you have uploaded a file and set your API key.");
            } else {
                addMessage('ai', data.response);
            }

        } catch (e) {
            const loader = document.getElementById(loadingId);
            if (loader) loader.remove();
            addMessage('ai', "Network Error: " + e.message);
        }
    }

    function addMessage(role, text, isLoading = false) {
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
            // Simple markdown Text to HTML (very basic)
            let html = text
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
                .replace(/\n/g, '<br>');
            bubble.innerHTML = html;
        }

        msgDiv.appendChild(bubble);

        chatHistory.appendChild(msgDiv);
        chatHistory.scrollTop = chatHistory.scrollHeight;

        return msgDiv.id;
    }
});
