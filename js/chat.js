/* Chat Wall Module (對話式牆面) */
const Chat = {
    activeWallId: null,
    messages: [],
    isLoadingHistory: false,
    hasMore: false,
    searchKeyword: '',

    _messagesKey(wallId) {
        return `sticky_messages_${App.storagePrefix}_${wallId}`;
    },

    initWall(wallId) {
        this.activeWallId = wallId;
        this.searchKeyword = '';

        // Load cached messages from localStorage (max 200)
        const local = localStorage.getItem(this._messagesKey(wallId));
        this.messages = local ? JSON.parse(local) : [];

        this.render();
        this.scrollToBottom();
        this._updateCountBadge();

        // Listen for new messages if in cloud mode
        if (Cloud.currentUser) {
            Cloud.relisten(wallId, 'chat');
        }

        this._bindInputEvents();
    },

    _updateCountBadge() {
        const badge = document.getElementById('note-count');
        if (badge) badge.textContent = this.messages.length;
    },

    _formatDateDivider(timestamp) {
        const d = new Date(timestamp);
        const y = d.getFullYear();
        const m = d.getMonth() + 1;
        const day = d.getDate();
        const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
        return `${y} 年 ${m} 月 ${day} 日 星期${weekDays[d.getDay()]}`;
    },

    _formatTime(timestamp) {
        const d = new Date(timestamp);
        const h = String(d.getHours()).padStart(2, '0');
        const min = String(d.getMinutes()).padStart(2, '0');
        return `${h}:${min}`;
    },

    _isDifferentDay(t1, t2) {
        if (!t1 || !t2) return true;
        const d1 = new Date(t1);
        const d2 = new Date(t2);
        return d1.getFullYear() !== d2.getFullYear() ||
               d1.getMonth() !== d2.getMonth() ||
               d1.getDate() !== d2.getDate();
    },

    _formatSize(bytes) {
        if (!bytes || bytes <= 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    },

    _getFileMeta(name, type) {
        const ext = (name.split('.').pop() || '').toLowerCase();
        const t = (type || '').toLowerCase();
        if (t.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) {
            return { category: 'image', icon: '🖼️', cardClass: 'card-image' };
        }
        if (ext === 'pdf' || t.includes('pdf')) {
            return { category: 'pdf', icon: '📕', cardClass: 'card-pdf' };
        }
        if (['doc', 'docx'].includes(ext) || t.includes('word') || t.includes('officedocument.wordprocessingml')) {
            return { category: 'word', icon: '📘', cardClass: 'card-word' };
        }
        if (['xls', 'xlsx', 'csv'].includes(ext) || t.includes('excel') || t.includes('officedocument.spreadsheetml') || t.includes('csv')) {
            return { category: 'excel', icon: '📗', cardClass: 'card-excel' };
        }
        if (['html', 'htm'].includes(ext) || t.includes('html')) {
            return { category: 'html', icon: '🌐', cardClass: 'card-html' };
        }
        return { category: 'file', icon: '📎', cardClass: 'card-other' };
    },

    render() {
        const listEl = document.getElementById('chat-message-list');
        if (!listEl) return;
        listEl.innerHTML = '';

        if (this.messages.length === 0) {
            listEl.innerHTML = `
                <div class="chat-empty-state">
                    <div style="font-size: 2.5rem; margin-bottom: 8px;">💬</div>
                    <div style="font-weight: 700; font-size: 1.05rem; margin-bottom: 4px;">對話式牆面已就緒</div>
                    <div style="font-size: 0.85rem; color: var(--text-secondary);">像 LINE 一樣在此記錄工作日誌、記事與傳送檔案！</div>
                </div>
            `;
            return;
        }

        // Sort messages by timestamp ascending
        const sorted = [...this.messages].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

        let lastTimestamp = null;

        sorted.forEach(msg => {
            // Insert date divider if different calendar day
            if (this._isDifferentDay(lastTimestamp, msg.timestamp)) {
                const divider = document.createElement('div');
                divider.className = 'chat-date-divider';
                divider.innerHTML = `<span>${this._formatDateDivider(msg.timestamp)}</span>`;
                listEl.appendChild(divider);
            }
            lastTimestamp = msg.timestamp;

            const bubble = document.createElement('div');
            bubble.className = 'chat-bubble' + (this._matchesSearch(msg) ? ' search-match' : '');
            bubble.id = `chat-msg-${msg.id}`;

            // Attachments HTML
            let attachmentsHTML = '';
            if (msg.attachments && msg.attachments.length > 0) {
                attachmentsHTML = '<div class="chat-bubble-attachments">';
                msg.attachments.forEach(att => {
                    const meta = this._getFileMeta(att.name, att.type);
                    if (meta.category === 'image') {
                        attachmentsHTML += `
                            <div class="chat-attachment-image">
                                <img src="${att.url}" alt="${att.name}" onclick="Notes.openLightbox('${att.url}', '${att.name}')" title="點擊放大">
                            </div>
                        `;
                    } else {
                        attachmentsHTML += `
                            <div class="attachment-item ${meta.cardClass}" style="margin-top: 4px;">
                                <span class="attachment-icon">${meta.icon}</span>
                                <div class="attachment-meta" title="${att.name} (${this._formatSize(att.size)})">
                                    <span class="attachment-name">${att.name}</span>
                                    <span class="attachment-size">${this._formatSize(att.size)}</span>
                                </div>
                                <div class="attachment-actions-group">
                                    <a href="${att.url}" download="${att.name}" target="_blank" rel="noopener" class="attachment-btn-action" title="下載">⬇</a>
                                </div>
                            </div>
                        `;
                    }
                });
                attachmentsHTML += '</div>';
            }

            // Text content
            let textHTML = '';
            if (msg.content) {
                const cleanContent = typeof DOMPurify !== 'undefined'
                    ? DOMPurify.sanitize(msg.content)
                    : msg.content;
                textHTML = `<div class="chat-bubble-text">${this._escapeAndFormatText(cleanContent)}</div>`;
            }

            // Edited indicator
            const editedHTML = msg.edited ? '<span class="chat-bubble-edited">（已編輯）</span>' : '';

            bubble.innerHTML = `
                <div class="chat-bubble-main">
                    ${textHTML}
                    ${attachmentsHTML}
                    <div class="chat-bubble-footer">
                        ${editedHTML}
                        <span class="chat-bubble-time">${this._formatTime(msg.timestamp)}</span>
                    </div>
                </div>
                <div class="chat-bubble-actions">
                    <button class="chat-action-btn" title="編輯訊息" onclick="Chat.editMessage('${msg.id}')">✎</button>
                    <button class="chat-action-btn btn-del" title="刪除訊息" onclick="Chat.deleteMessage('${msg.id}')">🗑</button>
                </div>
            `;

            listEl.appendChild(bubble);
        });
    },

    _escapeAndFormatText(text) {
        const div = document.createElement('div');
        div.textContent = text;
        const escaped = div.innerHTML;
        // Convert URLs to clickable links
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        return escaped.replace(urlRegex, '<a href="$1" target="_blank" rel="noopener">$1</a>')
                      .replace(/\n/g, '<br>');
    },

    _matchesSearch(msg) {
        if (!this.searchKeyword) return false;
        const kw = this.searchKeyword.toLowerCase();
        if (msg.content && msg.content.toLowerCase().includes(kw)) return true;
        if (msg.attachments) {
            return msg.attachments.some(a => a.name && a.name.toLowerCase().includes(kw));
        }
        return false;
    },

    filter(keyword) {
        this.searchKeyword = (keyword || '').trim();
        this.render();

        if (this.searchKeyword) {
            const firstMatch = document.querySelector('.chat-bubble.search-match');
            if (firstMatch) {
                firstMatch.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
    },

    scrollToBottom(smooth = false) {
        const container = document.getElementById('chat-messages');
        if (container) {
            requestAnimationFrame(() => {
                container.scrollTo({
                    top: container.scrollHeight,
                    behavior: smooth ? 'smooth' : 'auto'
                });
            });
        }
    },

    async handleSendClick() {
        const input = document.getElementById('chat-text-input');
        if (!input) return;
        const text = input.value.trim();
        if (!text) return;

        input.value = '';
        input.style.height = 'auto';
        await this.sendMessage(text);
    },

    async sendMessage(text, files = []) {
        if (!this.activeWallId) return;
        if (!text && (!files || files.length === 0)) return;

        let uploadedAttachments = [];

        if (files && files.length > 0) {
            if (!Cloud.currentUser) {
                App.showToast('⚠️ 附件需先進入雲端房間才可發送');
                App.openAuthModal();
                return;
            }

            App.showToast('📤 正在上傳附件...');
            const tempMsgId = 'msg_' + Date.now();

            for (const file of files) {
                try {
                    let fileToUpload = file;
                    if (file.type.startsWith('image/')) {
                        fileToUpload = await Notes._compressImage(file);
                    }
                    const att = await Cloud.uploadAttachment(this.activeWallId, tempMsgId, fileToUpload);
                    uploadedAttachments.push(att);
                } catch (e) {
                    console.error('[Chat Upload]', e);
                    App.showToast('❌ 附件上傳失敗：' + e.message);
                }
            }
        }

        const msg = {
            id: 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
            type: uploadedAttachments.some(a => a.type.startsWith('image/')) ? 'image' : (uploadedAttachments.length > 0 ? 'file' : 'text'),
            content: text || '',
            attachments: uploadedAttachments,
            timestamp: Date.now(),
            edited: false,
            editedAt: null
        };

        this.messages.push(msg);

        // Cache last 200 in localStorage
        this._saveLocal();

        this.render();
        this.scrollToBottom(true);
        this._updateCountBadge();

        // Sync to cloud Firestore
        if (Cloud.currentUser) {
            Cloud.syncMessage(this.activeWallId, msg);
        }
    },

    async editMessage(msgId) {
        const msg = this.messages.find(m => m.id === msgId);
        if (!msg) return;

        const newContent = prompt('編輯訊息：', msg.content || '');
        if (newContent === null) return;
        const trimmed = newContent.trim();
        if (trimmed === msg.content) return;

        msg.content = trimmed;
        msg.edited = true;
        msg.editedAt = Date.now();

        this._saveLocal();
        this.render();

        if (Cloud.currentUser) {
            Cloud.syncMessage(this.activeWallId, msg);
        }
        App.showToast('✅ 訊息已更新');
    },

    async deleteMessage(msgId) {
        const msg = this.messages.find(m => m.id === msgId);
        if (!msg) return;

        if (!confirm('確定要刪除這則訊息嗎？\n此動作無法復原！')) return;

        // Clean up any Storage attachments
        if (msg.attachments && msg.attachments.length > 0 && Cloud.currentUser) {
            msg.attachments.forEach(att => {
                if (att.storagePath) Cloud.deleteAttachment(att.storagePath);
            });
        }

        this.messages = this.messages.filter(m => m.id !== msgId);
        this._saveLocal();
        this.render();
        this._updateCountBadge();

        if (Cloud.currentUser) {
            Cloud.deleteMessage(this.activeWallId, msgId, msg.attachments);
        }
        App.showToast('🗑️ 訊息已刪除');
    },

    _saveLocal() {
        // Keep at most 200 latest messages in localStorage
        const latest = this.messages.slice(-200);
        localStorage.setItem(this._messagesKey(this.activeWallId), JSON.stringify(latest));
    },

    _bindInputEvents() {
        const input = document.getElementById('chat-text-input');
        const fileInput = document.getElementById('chat-file-input');
        if (!input) return;

        // Auto-expand textarea height
        input.oninput = () => {
            input.style.height = 'auto';
            input.style.height = Math.min(120, input.scrollHeight) + 'px';
        };

        // Enter to send, Shift+Enter for newline
        input.onkeydown = (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.handleSendClick();
            }
        };

        // Paste (Ctrl+V) image support inside input or chat container
        input.onpaste = (e) => {
            const items = e.clipboardData && e.clipboardData.items;
            if (!items) return;
            const files = [];
            for (let i = 0; i < items.length; i++) {
                if (items[i].kind === 'file') {
                    const file = items[i].getAsFile();
                    if (file) files.push(file);
                }
            }
            if (files.length > 0) {
                e.preventDefault();
                const text = input.value.trim();
                input.value = '';
                this.sendMessage(text, files);
            }
        };

        // File input change
        if (fileInput) {
            fileInput.onchange = () => {
                if (fileInput.files && fileInput.files.length > 0) {
                    const files = Array.from(fileInput.files);
                    fileInput.value = '';
                    this.sendMessage('', files);
                }
            };
        }
    }
};
