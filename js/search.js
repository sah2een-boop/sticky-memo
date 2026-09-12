/* Search Module */
const Search = {
    term: '',

    filter(notes, term) {
        this.term = (term || '').toLowerCase().trim();
        const activeWall = App.state.walls.find(w => w.id === App.state.activeWallId);
        if (activeWall && activeWall.type === 'chat') {
            if (typeof Chat !== 'undefined') Chat.filter(this.term);
            return;
        }

        const wall = document.getElementById('wall');
        if (!wall) return;

        notes.forEach(n => {
            const el = document.getElementById('note-' + n.id);
            if (!el) return;

            if (!this.term) {
                el.classList.remove('filtered-out', 'search-match');
                this.resetMarkdown(el, n);
                return;
            }

            const titleMatch = (n.title || '').toLowerCase().includes(this.term);
            const contentMatch = (n.content || '').toLowerCase().includes(this.term);
            const isMatch = titleMatch || contentMatch;

            el.classList.toggle('filtered-out', !isMatch);
            el.classList.toggle('search-match', isMatch);

            if (isMatch) {
                this.highlightNote(el, n);
            }
        });
    },

    highlightNote(el, note) {
        // Highlight in rendered markdown view
        const mdView = el.querySelector('.note-markdown');
        if (mdView && mdView.style.display !== 'none') {
            mdView.innerHTML = MD.renderWithHighlight(note.content, this.term);
        }
        // Highlight title
        const titleEl = el.querySelector('.note-title');
        if (titleEl && this.term) {
            // Titles are inputs, can't highlight inside them easily
            // But we keep the search-match class on the note for visual feedback
        }
    },

    resetMarkdown(el, note) {
        const mdView = el.querySelector('.note-markdown');
        if (mdView && mdView.style.display !== 'none') {
            mdView.innerHTML = MD.render(note.content);
        }
    },

    clear() {
        this.term = '';
        const input = document.getElementById('search-input');
        if (input) input.value = '';
    }
};
