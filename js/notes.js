/* Notes Module — CRUD + Drag + Render */
const Notes = {
    highestZ: 1000,

    // ===== Event Delegation for Drag (single handler on document) =====
    _dragState: null,
    DRAG_THRESHOLD: 5,

    initDragDelegation() {
        const onStart = (e) => {
            if (window.innerWidth <= 768) return;

            const noteEl = e.target.closest('.sticky-note');
            if (!noteEl) return;

            if (e.target.closest('.note-actions')) return;
            if (e.target.closest('.note-color-popup')) return;
            if (e.target.closest('.note-move-popup')) return;
            if (e.target.closest('.note-attachments')) return;
            if (e.target.closest('.resize-handle')) return;
            if (e.target.tagName === 'BUTTON') return;
            if (e.target.tagName === 'TEXTAREA') return;
            if (e.target.tagName === 'A') return;

            const noteId = noteEl.id.replace('note-', '');
            const note = App.notes.find(n => String(n.id) === noteId);
            if (!note) return;

            const cx = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
            const cy = e.clientY ?? e.touches?.[0]?.clientY ?? 0;

            this._dragState = {
                el: noteEl, note,
                startX: cx, startY: cy,
                initialLeft: parseInt(noteEl.style.left) || 0,
                initialTop: parseInt(noteEl.style.top) || 0,
                isDragging: false,
                target: e.target
            };

            if (e.cancelable) e.preventDefault();
        };

        const onMove = (e) => {
            if (!this._dragState) return;
            const cx = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
            const cy = e.clientY ?? e.touches?.[0]?.clientY ?? 0;

            if (!this._dragState.isDragging) {
                const dx = cx - this._dragState.startX;
                const dy = cy - this._dragState.startY;
                if (Math.abs(dx) < this.DRAG_THRESHOLD && Math.abs(dy) < this.DRAG_THRESHOLD) return;

                this._dragState.isDragging = true;
                this._dragState.el.classList.add('dragging');
                this._dragState.el.style.zIndex = ++this.highestZ;
            }

            const dx = cx - this._dragState.startX;
            const dy = cy - this._dragState.startY;
            this._dragState.el.style.left = (this._dragState.initialLeft + dx) + 'px';
            this._dragState.el.style.top = (this._dragState.initialTop + dy) + 'px';
        };

        const onEnd = () => {
            if (!this._dragState) return;
            const { el, note, isDragging, target } = this._dragState;

            if (isDragging) {
                el.classList.remove('dragging');
                note.x = parseInt(el.style.left);
                note.y = parseInt(el.style.top);
                note.zIndex = this.highestZ;
                App.saveLocal();
            } else {
                const mdView = target.closest('.note-markdown');
                if (mdView) {
                    mdView.style.display = 'none';
                    const contentEl = el.querySelector('.note-content');
                    if (contentEl) { contentEl.style.display = 'block'; contentEl.focus(); }
                }
            }

            this._dragState = null;
        };

        document.addEventListener('mousedown', onStart);
        document.addEventListener('touchstart', onStart, { passive: false });
        document.addEventListener('mousemove', onMove);
        document.addEventListener('touchmove', onMove, { passive: false });
        document.addEventListener('mouseup', onEnd);
        document.addEventListener('touchend', onEnd);
    },

    render(note, wall) {
        const div = document.createElement('div');
        div.className = `sticky-note note-${note.color} size-${note.size}`;
        div.id = `note-${note.id}`;
        div.style.cssText = `left:${note.x}px;top:${note.y}px;z-index:${note.zIndex}`;
        if (note.w && note.h) { div.style.width = note.w + 'px'; div.style.height = note.h + 'px'; }
        if (note.rotate) div.style.transform = `rotate(${note.rotate}deg)`;

        const pinHTML = note.pinned ? '<div class="pin-indicator">📌</div>' : '';
        const pinnedClass = note.pinned ? ' pinned' : '';

        div.innerHTML = `
            ${pinHTML}
            <div class="note-header">
                <textarea class="note-title" rows="1" placeholder="標題...">${note.title || ''}</textarea>
                <div class="note-actions">
                    <button class="note-action-btn btn-pin${pinnedClass}" data-action="pin" title="釘選">📌</button>
                    <button class="note-action-btn" data-action="attach" title="上傳附件 (圖片/PDF/Word/Excel)">📎</button>
                    <button class="note-action-btn" data-action="size" title="調整大小">📏</button>
                    <button class="note-action-btn" data-action="color" title="顏色">🎨</button>
                    <button class="note-action-btn" data-action="move" title="移動到其他牆面">📋</button>
                    <button class="note-action-btn btn-delete" data-action="delete" title="刪除">✕</button>
                </div>
            </div>
            <input type="file" class="note-file-input" style="display:none" multiple>
            <div class="note-attachments" style="display:none"></div>
            <div class="note-body">
                <textarea class="note-content" placeholder="寫點什麼... (支援 Markdown)">${note.content || ''}</textarea>
                <div class="note-markdown" style="display:none"></div>
            </div>
            <div class="note-color-popup">
                ${['yellow','pink','blue','green','orange','purple','gray'].map(c =>
                    `<div class="note-color-popup-dot color-dot-${c}" data-color="${c}"></div>`
                ).join('')}
            </div>
            <div class="note-move-popup">
                ${App.state.walls
                    .filter(w => w.id !== App.state.activeWallId)
                    .map(w => `<div class="note-move-item" data-wall-id="${w.id}">${w.name}</div>`)
                    .join('') || '<div class="note-move-empty">沒有其他牆面</div>'}
            </div>
            <div class="resize-handle" title="拖曳調整大小">⟋</div>
        `;

        this._bindEvents(div, note);
        this._renderAttachments(div, note);
        wall.appendChild(div);

        // Auto-size title
        const titleEl = div.querySelector('.note-title');
        if (titleEl) { titleEl.style.height = 'auto'; titleEl.style.height = titleEl.scrollHeight + 'px'; }

        // Show markdown if content exists and not focused
        if (note.content) this._showMarkdown(div, note);
    },

    _bindEvents(div, note) {
        const titleEl = div.querySelector('.note-title');
        const contentEl = div.querySelector('.note-content');
        const mdView = div.querySelector('.note-markdown');

        // Title input
        titleEl.addEventListener('input', () => {
            titleEl.style.height = 'auto';
            titleEl.style.height = titleEl.scrollHeight + 'px';
            note.title = titleEl.value;
            App.saveLocal();
        });

        // Content input
        contentEl.addEventListener('input', () => {
            note.content = contentEl.value;
            App.saveLocal();
        });

        // Content focus/blur → toggle markdown
        contentEl.addEventListener('focus', () => {
            mdView.style.display = 'none';
            contentEl.style.display = 'block';
        });
        contentEl.addEventListener('blur', () => {
            this._showMarkdown(div, note);
        });

        // Click markdown → edit
        mdView.addEventListener('click', () => {
            mdView.style.display = 'none';
            contentEl.style.display = 'block';
            contentEl.focus();
        });

        // Action buttons
        div.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-action]');
            if (!btn) return;
            const action = btn.dataset.action;
            if (action === 'delete') App.deleteNote(note.id);
            else if (action === 'size') this.cycleSize(note);
            else if (action === 'attach') {
                const fileInput = div.querySelector('.note-file-input');
                if (fileInput) fileInput.click();
            }
            else if (action === 'color') this._toggleColorPopup(div);
            else if (action === 'pin') App.togglePin(note.id);
            else if (action === 'move') this._toggleMovePopup(div);
        });

        // Hidden file input change
        const fileInput = div.querySelector('.note-file-input');
        if (fileInput) {
            fileInput.addEventListener('change', () => {
                if (fileInput.files && fileInput.files.length > 0) {
                    this.handleFiles(note, Array.from(fileInput.files), div);
                    fileInput.value = '';
                }
            });
        }

        // Drag and drop onto note
        div.addEventListener('dragover', (e) => {
            if (e.dataTransfer && e.dataTransfer.types && Array.from(e.dataTransfer.types).includes('Files')) {
                e.preventDefault();
                div.classList.add('drag-hover');
            }
        });
        div.addEventListener('dragleave', (e) => {
            if (!div.contains(e.relatedTarget)) {
                div.classList.remove('drag-hover');
            }
        });
        div.addEventListener('drop', (e) => {
            e.preventDefault();
            div.classList.remove('drag-hover');
            if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                this.handleFiles(note, Array.from(e.dataTransfer.files), div);
            }
        });

        // Paste (Ctrl+V) onto note
        div.addEventListener('paste', (e) => {
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
                this.handleFiles(note, files, div);
            }
        });

        // Color popup clicks
        div.querySelector('.note-color-popup').addEventListener('click', (e) => {
            const dot = e.target.closest('[data-color]');
            if (!dot) return;
            App.changeNoteColor(note.id, dot.dataset.color);
            this._toggleColorPopup(div);
        });

        // Move popup clicks
        div.querySelector('.note-move-popup').addEventListener('click', (e) => {
            const item = e.target.closest('[data-wall-id]');
            if (!item) return;
            App.moveNoteToWall(note.id, item.dataset.wallId);
            this._toggleMovePopup(div);
        });
    },

    // ===== Attachment Helpers =====
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

    _renderAttachments(div, note) {
        const container = div.querySelector('.note-attachments');
        if (!container) return;
        container.innerHTML = '';

        if (!note.attachments || note.attachments.length === 0) {
            container.style.display = 'none';
            return;
        }
        container.style.display = 'flex';

        note.attachments.forEach(att => {
            const meta = this._getFileMeta(att.name, att.type || '');
            const item = document.createElement('div');
            item.className = 'attachment-item ' + meta.cardClass;
            item.dataset.attId = att.id;

            const isImg = meta.category === 'image';
            item.innerHTML = `
                <span class="attachment-icon">${meta.icon}</span>
                <div class="attachment-meta" title="${att.name} (${this._formatSize(att.size)})">
                    <span class="attachment-name">${att.name}</span>
                    <span class="attachment-size">${this._formatSize(att.size)}</span>
                </div>
                <div class="attachment-actions-group">
                    ${isImg ? `<button class="attachment-btn-action btn-preview" title="放大檢視">🔍</button>` : ''}
                    <a href="${att.url}" download="${att.name}" target="_blank" rel="noopener" class="attachment-btn-action" title="下載檔案">⬇</a>
                    <button class="attachment-btn-action btn-del" title="刪除附件">✕</button>
                </div>
            `;

            const delBtn = item.querySelector('.btn-del');
            if (delBtn) {
                delBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.removeAttachment(note, att.id, div);
                });
            }
            const prevBtn = item.querySelector('.btn-preview');
            if (prevBtn) {
                prevBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.openLightbox(att.url, att.name);
                });
            }

            container.appendChild(item);
        });
    },

    async _compressImage(file, quality = 0.85) {
        if (file.type === 'image/svg+xml' || file.type === 'image/gif') return file;
        return new Promise((resolve) => {
            const img = new Image();
            const url = URL.createObjectURL(file);
            img.onload = () => {
                URL.revokeObjectURL(url);
                const canvas = document.createElement('canvas');
                let { width, height } = img;
                const maxDim = 2400;
                if (width > maxDim || height > maxDim) {
                    if (width > height) {
                        height = Math.round((height * maxDim) / width);
                        width = maxDim;
                    } else {
                        width = Math.round((width * maxDim) / height);
                        height = maxDim;
                    }
                }
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                canvas.toBlob((blob) => {
                    if (!blob || blob.size >= file.size) {
                        resolve(file);
                    } else {
                        const newName = file.name.replace(/\.[^.]+$/, '') + '.webp';
                        resolve(new File([blob], newName, { type: 'image/webp' }));
                    }
                }, 'image/webp', quality);
            };
            img.onerror = () => resolve(file);
            img.src = url;
        });
    },

    async handleFiles(note, files, div) {
        if (!files || files.length === 0) return;

        for (const file of files) {
            // Markdown file (.md) -> directly import text
            if (file.name.toLowerCase().endsWith('.md')) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    const text = e.target.result;
                    note.content = (note.content ? note.content + '\n\n' : '') + text;
                    const contentEl = div.querySelector('.note-content');
                    if (contentEl) contentEl.value = note.content;
                    this._showMarkdown(div, note);
                    App.saveLocal();
                    App.showToast('📄 已將 Markdown 內容匯入便利貼！');
                };
                reader.readAsText(file);
                continue;
            }

            // Cloud storage upload for other types
            if (!Cloud.currentUser) {
                App.showToast('⚠️ 附件上傳需先進入雲端房間');
                App.openAuthModal();
                return;
            }

            const container = div.querySelector('.note-attachments');
            if (container) container.style.display = 'flex';

            const uploadingEl = document.createElement('div');
            uploadingEl.className = 'attachment-uploading';
            uploadingEl.innerHTML = `<div class="attachment-spinner"></div> 上傳中 (${file.name})... <span class="up-pct">0%</span>`;
            if (container) container.appendChild(uploadingEl);

            try {
                let fileToUpload = file;
                if (file.type.startsWith('image/')) {
                    fileToUpload = await this._compressImage(file);
                }

                const att = await Cloud.uploadAttachment(
                    App.state.activeWallId,
                    note.id,
                    fileToUpload,
                    (pct) => {
                        const pctEl = uploadingEl.querySelector('.up-pct');
                        if (pctEl) pctEl.textContent = Math.round(pct) + '%';
                    }
                );

                note.attachments = note.attachments || [];
                note.attachments.push(att);
                App.saveLocal();
                App.showToast(`✅ 已上傳：${file.name}`);
            } catch (err) {
                console.error('[Upload]', err);
                App.showToast('❌ 上傳失敗: ' + (err.message || '網路錯誤'));
            } finally {
                uploadingEl.remove();
                this._renderAttachments(div, note);
            }
        }
    },

    async removeAttachment(note, attId, div) {
        if (!note.attachments) return;
        const att = note.attachments.find(a => a.id === attId);
        if (!att) return;
        if (!confirm(`確定要刪除附件「${att.name}」嗎？`)) return;

        if (att.storagePath) {
            Cloud.deleteAttachment(att.storagePath);
        }
        note.attachments = note.attachments.filter(a => a.id !== attId);
        App.saveLocal();
        this._renderAttachments(div, note);
        App.showToast('🗑️ 附件已刪除');
    },

    openLightbox(url, title = '') {
        const modal = document.getElementById('image-lightbox');
        const img = document.getElementById('lightbox-img');
        const cap = document.getElementById('lightbox-caption');
        if (!modal || !img) return;
        img.src = url;
        if (cap) cap.textContent = title;
        modal.classList.remove('hidden');
    },

    closeLightbox() {
        const modal = document.getElementById('image-lightbox');
        if (modal) modal.classList.add('hidden');
    },

    _showMarkdown(div, note) {
        if (!note.content) return;
        const contentEl = div.querySelector('.note-content');
        const mdView = div.querySelector('.note-markdown');
        contentEl.style.display = 'none';
        mdView.style.display = 'block';
        mdView.innerHTML = Search.term
            ? MD.renderWithHighlight(note.content, Search.term)
            : MD.render(note.content);
    },

    _toggleColorPopup(div) {
        const popup = div.querySelector('.note-color-popup');
        const isOpen = popup.classList.contains('open');
        // Close all popups first
        document.querySelectorAll('.note-color-popup.open').forEach(p => p.classList.remove('open'));
        document.querySelectorAll('.note-move-popup.open').forEach(p => p.classList.remove('open'));
        if (!isOpen) popup.classList.add('open');
    },

    _toggleMovePopup(div) {
        const popup = div.querySelector('.note-move-popup');
        const isOpen = popup.classList.contains('open');
        // Close all popups first
        document.querySelectorAll('.note-move-popup.open').forEach(p => p.classList.remove('open'));
        document.querySelectorAll('.note-color-popup.open').forEach(p => p.classList.remove('open'));
        if (!isOpen) popup.classList.add('open');
    },

    cycleSize(note) {
        const isMobile = window.innerWidth <= 768;
        const el = document.getElementById('note-' + note.id);

        if (isMobile) {
            // Mobile: toggle expand/collapse
            if (!el) return;
            const isExpanded = el.classList.contains('note-expanded');
            if (isExpanded) {
                el.classList.remove('note-expanded');
                el.style.minHeight = '';
            } else {
                el.classList.add('note-expanded');
                el.style.minHeight = '60vh';
            }
            return;
        }

        // Desktop: if custom w/h exists, clear it first and reset to class size
        if (note.w || note.h) {
            delete note.w;
            delete note.h;
            if (el) { el.style.width = ''; el.style.height = ''; }
        }

        // Cycle through S/M/L
        const sizes = ['small', 'medium', 'large'];
        const idx = sizes.indexOf(note.size);
        note.size = sizes[(idx + 1) % sizes.length];
        if (el) {
            el.classList.remove('size-small', 'size-medium', 'size-large');
            el.classList.add('size-' + note.size);
        }
        App.saveLocal();
    },

    // ===== Resize Delegation (single handler on document) =====
    _resizeState: null,

    initResizeDelegation() {
        const onStart = (e) => {
            if (window.innerWidth <= 768) return;

            const handle = e.target.closest('.resize-handle');
            if (!handle) return;

            const noteEl = handle.closest('.sticky-note');
            if (!noteEl) return;

            const noteId = noteEl.id.replace('note-', '');
            const note = App.notes.find(n => String(n.id) === noteId);
            if (!note) return;

            const cx = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
            const cy = e.clientY ?? e.touches?.[0]?.clientY ?? 0;

            this._resizeState = {
                el: noteEl, note,
                startX: cx, startY: cy,
                startW: noteEl.offsetWidth,
                startH: noteEl.offsetHeight
            };

            noteEl.classList.add('resizing');
            if (e.cancelable) e.preventDefault();
            e.stopPropagation(); // Prevent drag from triggering
        };

        const onMove = (e) => {
            if (!this._resizeState) return;
            const cx = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
            const cy = e.clientY ?? e.touches?.[0]?.clientY ?? 0;

            const newW = Math.max(200, this._resizeState.startW + (cx - this._resizeState.startX));
            const newH = Math.max(160, this._resizeState.startH + (cy - this._resizeState.startY));

            this._resizeState.el.style.width = newW + 'px';
            this._resizeState.el.style.height = newH + 'px';
        };

        const onEnd = () => {
            if (!this._resizeState) return;
            const { el, note } = this._resizeState;

            el.classList.remove('resizing');
            note.w = parseInt(el.style.width);
            note.h = parseInt(el.style.height);
            App.saveLocal();

            this._resizeState = null;
        };

        document.addEventListener('mousedown', onStart);
        document.addEventListener('touchstart', onStart, { passive: false });
        document.addEventListener('mousemove', onMove);
        document.addEventListener('touchmove', onMove, { passive: false });
        document.addEventListener('mouseup', onEnd);
        document.addEventListener('touchend', onEnd);
    }
};

// Initialize drag delegation once DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    Notes.initDragDelegation();
    Notes.initResizeDelegation();
});
