/* Markdown Renderer */
const MD = {
    init() {
        if (typeof marked !== 'undefined') {
            marked.setOptions({
                breaks: true,
                gfm: true,
            });
        }
    },

    render(text) {
        if (!text || typeof marked === 'undefined') return text || '';
        try {
            let html = marked.parse(text);
            // Sanitize with DOMPurify to prevent XSS
            if (typeof DOMPurify !== 'undefined') {
                html = DOMPurify.sanitize(html);
            }
            return html;
        } catch (e) {
            return text;
        }
    },

    /** Render with search term highlighting */
    renderWithHighlight(text, searchTerm) {
        let html = this.render(text);
        if (searchTerm && searchTerm.trim()) {
            const escaped = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(`(${escaped})`, 'gi');
            html = html.replace(regex, '<span class="search-highlight">$1</span>');
        }
        return html;
    }
};
