/* Walls Module */
const Walls = {
    renderSidebar(appState) {
        const container = document.getElementById('sidebar-walls');
        if (!container) return;
        container.innerHTML = '';

        appState.walls.forEach(w => {
            const item = document.createElement('div');
            item.className = 'wall-item' + (w.id === appState.activeWallId ? ' active' : '');
            const icon = w.type === 'chat' ? '💬' : '🗒️';
            item.innerHTML = `
                <span class="wall-item-name"><span class="wall-type-icon">${icon}</span> ${w.name}</span>
                <div class="wall-item-actions">
                    <button class="wall-item-btn" onclick="event.stopPropagation(); App.promptRenameWall('${w.id}')" title="重新命名">✎</button>
                    <button class="wall-item-btn" onclick="event.stopPropagation(); App.promptDeleteWall('${w.id}')" title="刪除">🗑</button>
                </div>
            `;
            item.addEventListener('click', () => {
                App.switchWall(w.id);
                App.toggleSidebar();
            });
            container.appendChild(item);
        });
    }
};
