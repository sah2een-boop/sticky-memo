/* App — Main Controller */
const App = {
    state: { activeWallId: 'default', walls: [{ id: 'default', name: '預設牆面' }] },
    notes: [],
    selectedColor: 'yellow',
    selectedSize: 'medium',

    init() {
        MD.init();

        // Load local state
        const saved = localStorage.getItem('sticky_app_state');
        if (saved) {
            try { this.state = JSON.parse(saved); } catch(e) {}
        }

        this.switchWall(this.state.activeWallId);

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            if (e.key === 'n' || e.key === 'N') this.createNote();
            if (e.key === 'd' || e.key === 'D') Theme.toggle();
            if (e.key === '/') { e.preventDefault(); this.toggleSearch(); }
        });

        // Search input
        const searchInput = document.getElementById('search-input');
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                Search.filter(this.notes, searchInput.value);
            });
            searchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') this.clearSearch();
            });
        }

        // Close popups on outside click
        document.addEventListener('mousedown', (e) => {
            if (!e.target.closest('.note-color-popup') && !e.target.closest('[data-action="color"]')) {
                document.querySelectorAll('.note-color-popup.open').forEach(p => p.classList.remove('open'));
            }
        });

        // Init cloud
        Cloud.init();

        // Clear loading
        setTimeout(() => {
            const overlay = document.getElementById('loading-overlay');
            if (overlay) {
                overlay.classList.add('fade-out');
                setTimeout(() => overlay.remove(), 600);
            }
        }, 800);
    },

    // ===== Notes =====
    createNote() {
        const isMobile = window.innerWidth <= 768;
        const x = isMobile ? 0 : Math.max(20, Math.random() * (window.innerWidth - 400));
        const y = isMobile ? 0 : Math.max(80, Math.random() * (window.innerHeight - 400));

        const note = {
            id: Date.now(),
            title: '',
            content: '',
            color: this.selectedColor,
            size: this.selectedSize,
            x, y,
            rotate: isMobile ? 0 : (Math.random() * 4 - 2),
            zIndex: ++Notes.highestZ,
            pinned: false,
            createdAt: Date.now(),
            updatedAt: Date.now()
        };

        this.notes.push(note);
        this.saveLocal();
        Notes.render(note, document.getElementById('wall'));
        this._updateNoteCount();

        // Focus on the new note's content
        setTimeout(() => {
            const el = document.getElementById('note-' + note.id);
            if (el) {
                const textarea = el.querySelector('.note-content');
                if (textarea) textarea.focus();
            }
        }, 100);
    },

    deleteNote(id) {
        const el = document.getElementById('note-' + id);
        if (!el) return;

        el.classList.add('removing');
        setTimeout(() => {
            el.remove();
            this.notes = this.notes.filter(n => n.id !== id);
            this.saveLocal();
            this._updateNoteCount();
            Cloud.deleteNote(id);
        }, 300);
    },

    togglePin(id) {
        const note = this.notes.find(n => n.id === id);
        if (!note) return;

        note.pinned = !note.pinned;
        if (note.pinned) note.zIndex = 99000 + Notes.highestZ;
        this.saveLocal();

        // Re-render note
        const el = document.getElementById('note-' + id);
        if (el) {
            const pin = el.querySelector('.pin-indicator');
            const btn = el.querySelector('.btn-pin');
            if (note.pinned) {
                if (!pin) {
                    const pinEl = document.createElement('div');
                    pinEl.className = 'pin-indicator';
                    pinEl.textContent = '📌';
                    el.prepend(pinEl);
                }
                if (btn) btn.classList.add('pinned');
                el.style.zIndex = note.zIndex;
            } else {
                if (pin) pin.remove();
                if (btn) btn.classList.remove('pinned');
            }
        }
    },

    changeNoteColor(id, color) {
        const note = this.notes.find(n => n.id === id);
        if (!note) return;
        note.color = color;
        const el = document.getElementById('note-' + id);
        if (el) {
            el.className = el.className.replace(/note-\w+/, 'note-' + color);
        }
        this.saveLocal();
    },

    setColor(color) {
        this.selectedColor = color;
        // Update active dots in both toolbars
        document.querySelectorAll('.color-dot').forEach(d => {
            d.classList.toggle('active', d.dataset.color === color);
        });
        this.createNote();
    },

    setSize(size) {
        this.selectedSize = size;
    },

    // ===== Walls =====
    switchWall(id) {
        this.state.activeWallId = id;
        const local = localStorage.getItem('sticky_notes_' + id);
        this.notes = local ? JSON.parse(local) : [];
        this._renderAllNotes();
        Walls.renderSidebar(this.state);

        const wallName = this.state.walls.find(w => w.id === id);
        document.getElementById('current-wall-name').textContent = wallName ? wallName.name : id;
        this._updateNoteCount();

        Cloud.relisten(id);
    },

    _renderAllNotes() {
        const wall = document.getElementById('wall');
        if (!wall) return;
        wall.innerHTML = '';
        // Pinned notes last so they render on top
        const sorted = [...this.notes].sort((a, b) => (a.pinned ? 1 : 0) - (b.pinned ? 1 : 0));
        sorted.forEach(note => Notes.render(note, wall));
    },

    _updateNoteCount() {
        const badge = document.getElementById('note-count');
        if (badge) badge.textContent = this.notes.length;
    },

    // ===== Save =====
    saveLocal() {
        localStorage.setItem('sticky_app_state', JSON.stringify(this.state));
        localStorage.setItem('sticky_notes_' + this.state.activeWallId, JSON.stringify(this.notes));
        Cloud.syncState();
        Cloud.syncNotes();
    },

    // ===== Search =====
    toggleSearch() {
        const bar = document.getElementById('search-bar');
        bar.classList.toggle('hidden');
        if (!bar.classList.contains('hidden')) {
            document.getElementById('search-input').focus();
        } else {
            this.clearSearch();
        }
    },

    clearSearch() {
        Search.clear();
        Search.filter(this.notes, '');
        document.getElementById('search-bar').classList.add('hidden');
    },

    // ===== Sidebar =====
    toggleSidebar() {
        document.getElementById('sidebar').classList.toggle('open');
        document.getElementById('sidebar-overlay').classList.toggle('open');
    },

    // ===== Tidy =====
    tidyNotes() {
        if (window.innerWidth <= 768) return; // Mobile already has masonry
        const START_X = 80, START_Y = 80, STEP_X = 40, STEP_Y = 60;
        let curX = START_X, curY = START_Y;

        this.notes.sort((a, b) => a.id - b.id).forEach(note => {
            const el = document.getElementById('note-' + note.id);
            if (!el || el.classList.contains('filtered-out')) return;
            if (curY + 300 > window.innerHeight - 80) { curX += 320; curY = START_Y; }
            note.x = curX; note.y = curY; note.rotate = 0; note.zIndex = ++Notes.highestZ;
            el.style.left = curX + 'px'; el.style.top = curY + 'px';
            el.style.transform = 'none'; el.style.zIndex = note.zIndex;
            curX += STEP_X; curY += STEP_Y;
        });
        this.saveLocal();
        this.toggleSidebar();
        this.showToast('✅ 已整理排列');
    },

    // ===== Backup =====
    exportBackup() {
        const data = { appState: this.state, notes: {} };
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key.startsWith('sticky_notes_')) data.notes[key] = JSON.parse(localStorage.getItem(key));
        }
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `sticky_memo_backup_${new Date().toISOString().slice(0,10)}.json`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        this.showToast('📥 備份已下載');
    },

    importBackup() {
        const input = document.createElement('input');
        input.type = 'file'; input.accept = '.json';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                try {
                    const data = JSON.parse(ev.target.result);
                    if (data.appState) {
                        localStorage.setItem('sticky_app_state', JSON.stringify(data.appState));
                    }
                    for (const key in data.notes) {
                        localStorage.setItem(key, JSON.stringify(data.notes[key]));
                    }
                    this.showToast('📤 匯入成功，重新載入中...');
                    setTimeout(() => location.reload(), 1000);
                } catch (err) {
                    this.showToast('❌ 檔案格式錯誤');
                }
            };
            reader.readAsText(file);
        };
        input.click();
    },

    // ===== Auth Modal =====
    openAuthModal() {
        const modal = document.getElementById('auth-modal');
        modal.classList.remove('hidden');
        if (Cloud.currentUser) {
            document.getElementById('auth-logged-out').classList.add('hidden');
            document.getElementById('auth-logged-in').classList.remove('hidden');
        } else {
            document.getElementById('auth-logged-out').classList.remove('hidden');
            document.getElementById('auth-logged-in').classList.add('hidden');
        }
    },

    closeAuthModal() {
        document.getElementById('auth-modal').classList.add('hidden');
    },

    async enterRoom() {
        const input = document.getElementById('auth-room-input');
        const room = input.value.trim();
        if (!room) { this.showToast('請輸入房間名稱'); return; }
        await Cloud.enterRoom(room);
        this.closeAuthModal();
    },

    async leaveRoom() {
        await Cloud.leaveRoom();
        this.closeAuthModal();
        this.showToast('已離開房間，切換為離線模式');
    },

    // ===== Wall Modals =====
    _wallModalMode: null,
    _wallModalTargetId: null,

    promptAddWall() {
        this._wallModalMode = 'add';
        document.getElementById('wall-modal-title').textContent = '新增牆面';
        document.getElementById('wall-modal-input').value = '';
        document.getElementById('wall-modal-input-group').style.display = 'block';
        document.getElementById('wall-modal-desc').classList.add('hidden');
        document.getElementById('wall-modal').classList.remove('hidden');
    },

    promptRenameWall(id) {
        this._wallModalMode = 'rename';
        this._wallModalTargetId = id;
        const w = this.state.walls.find(x => x.id === id);
        document.getElementById('wall-modal-title').textContent = '重新命名';
        document.getElementById('wall-modal-input').value = w ? w.name : '';
        document.getElementById('wall-modal-input-group').style.display = 'block';
        document.getElementById('wall-modal-desc').classList.add('hidden');
        document.getElementById('wall-modal').classList.remove('hidden');
    },

    promptDeleteWall(id) {
        if (this.state.walls.length <= 1) { this.showToast('至少保留一個牆面'); return; }
        this._wallModalMode = 'delete';
        this._wallModalTargetId = id;
        const w = this.state.walls.find(x => x.id === id);
        document.getElementById('wall-modal-title').textContent = '刪除牆面';
        document.getElementById('wall-modal-input-group').style.display = 'none';
        const desc = document.getElementById('wall-modal-desc');
        desc.classList.remove('hidden');
        desc.textContent = `確定要刪除「${w ? w.name : id}」嗎？`;
        document.getElementById('wall-modal').classList.remove('hidden');
    },

    closeWallModal() {
        document.getElementById('wall-modal').classList.add('hidden');
    },

    confirmWallModal() {
        const val = document.getElementById('wall-modal-input').value.trim();

        if (this._wallModalMode === 'add' && val) {
            const id = 'wall_' + Date.now();
            this.state.walls.push({ id, name: val });
            this.switchWall(id);
        } else if (this._wallModalMode === 'rename' && val) {
            const w = this.state.walls.find(x => x.id === this._wallModalTargetId);
            if (w) w.name = val;
            Walls.renderSidebar(this.state);
            const nameEl = document.getElementById('current-wall-name');
            if (this._wallModalTargetId === this.state.activeWallId && nameEl) nameEl.textContent = val;
        } else if (this._wallModalMode === 'delete') {
            const oldId = this._wallModalTargetId;
            this.state.walls = this.state.walls.filter(x => x.id !== oldId);
            localStorage.removeItem('sticky_notes_' + oldId);
            if (oldId === this.state.activeWallId) {
                this.switchWall(this.state.walls[0].id);
            } else {
                Walls.renderSidebar(this.state);
            }
        }
        this.saveLocal();
        this.closeWallModal();
    },

    // ===== Toast =====
    showToast(msg) {
        const t = document.getElementById('toast');
        if (!t) return;
        t.textContent = msg;
        t.classList.add('show');
        clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => t.classList.remove('show'), 3000);
    }
};

// Boot
document.addEventListener('DOMContentLoaded', () => App.init());
