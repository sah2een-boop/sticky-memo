/* Notes Module — CRUD + Drag + Render */
const Notes = {
    highestZ: 1000,

    render(note, wall) {
        const div = document.createElement('div');
        div.className = `sticky-note note-${note.color} size-${note.size}`;
        div.id = `note-${note.id}`;
        div.style.cssText = `left:${note.x}px;top:${note.y}px;z-index:${note.zIndex}`;
        if (note.rotate) div.style.transform = `rotate(${note.rotate}deg)`;

        const pinHTML = note.pinned ? '<div class="pin-indicator">📌</div>' : '';
        const pinnedClass = note.pinned ? ' pinned' : '';

        div.innerHTML = `
            ${pinHTML}
            <div class="note-header">
                <textarea class="note-title" rows="1" placeholder="標題...">${note.title || ''}</textarea>
                <div class="note-actions">
                    <button class="note-action-btn btn-pin${pinnedClass}" data-action="pin" title="釘選">📌</button>
                    <button class="note-action-btn" data-action="size" title="調整大小">📏</button>
                    <button class="note-action-btn" data-action="color" title="顏色">🎨</button>
                    <button class="note-action-btn btn-delete" data-action="delete" title="刪除">✕</button>
                </div>
            </div>
            <div class="note-body">
                <textarea class="note-content" placeholder="寫點什麼... (支援 Markdown)">${note.content || ''}</textarea>
                <div class="note-markdown" style="display:none"></div>
            </div>
            <div class="note-color-popup">
                ${['yellow','pink','blue','green','orange','purple','gray'].map(c =>
                    `<div class="note-color-popup-dot color-dot-${c}" data-color="${c}"></div>`
                ).join('')}
            </div>
        `;

        this._bindEvents(div, note);
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
            else if (action === 'color') this._toggleColorPopup(div);
            else if (action === 'pin') App.togglePin(note.id);
        });

        // Color popup clicks
        div.querySelector('.note-color-popup').addEventListener('click', (e) => {
            const dot = e.target.closest('[data-color]');
            if (!dot) return;
            App.changeNoteColor(note.id, dot.dataset.color);
            this._toggleColorPopup(div);
        });

        // Drag (desktop)
        this._setupDrag(div, note);
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
        if (!isOpen) popup.classList.add('open');
    },

    cycleSize(note) {
        const sizes = ['small', 'medium', 'large'];
        const idx = sizes.indexOf(note.size);
        note.size = sizes[(idx + 1) % sizes.length];
        const el = document.getElementById('note-' + note.id);
        if (el) {
            el.classList.remove('size-small', 'size-medium', 'size-large');
            el.classList.add('size-' + note.size);
        }
        App.saveLocal();
    },

    _setupDrag(el, note) {
        // Skip drag on mobile (masonry layout)
        if (window.innerWidth <= 768) return;

        let isDragging = false, startX, startY, offsetX, offsetY;

        const onStart = (e) => {
            // Only drag from header, not from inputs or buttons
            if (!e.target.closest('.note-header')) return;
            if (e.target.closest('.note-actions')) return;
            if (e.target.tagName === 'TEXTAREA') return;

            isDragging = true;
            el.classList.add('dragging');
            el.style.zIndex = ++this.highestZ;

            const rect = el.getBoundingClientRect();
            const cx = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
            const cy = e.clientY ?? e.touches?.[0]?.clientY ?? 0;
            offsetX = cx - rect.left;
            offsetY = cy - rect.top;

            if (e.cancelable) e.preventDefault();
        };

        const onMove = (e) => {
            if (!isDragging) return;
            const cx = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
            const cy = e.clientY ?? e.touches?.[0]?.clientY ?? 0;
            el.style.left = (cx - offsetX) + 'px';
            el.style.top = (cy - offsetY) + 'px';
        };

        const onEnd = () => {
            if (!isDragging) return;
            isDragging = false;
            el.classList.remove('dragging');
            note.x = parseInt(el.style.left);
            note.y = parseInt(el.style.top);
            note.zIndex = this.highestZ;
            App.saveLocal();
        };

        el.addEventListener('mousedown', onStart);
        el.addEventListener('touchstart', onStart, { passive: false });
        document.addEventListener('mousemove', onMove);
        document.addEventListener('touchmove', onMove, { passive: false });
        document.addEventListener('mouseup', onEnd);
        document.addEventListener('touchend', onEnd);
    }
};
