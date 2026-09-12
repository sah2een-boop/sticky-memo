/* Firebase Cloud Sync */
const Cloud = {
    db: null,
    auth: null,
    storage: null,
    authMod: null,
    fireMod: null,
    storageMod: null,
    currentUser: null,
    unsubscribe: null,

    config: {
        apiKey: "AIzaSyAKnwSnUAraWYLyXDiVZd6osQVb8MZjBN0",
        authDomain: "my-sticky-memo.firebaseapp.com",
        projectId: "my-sticky-memo",
        storageBucket: "my-sticky-memo.firebasestorage.app",
        messagingSenderId: "1068049417616",
        appId: "1:1068049417616:web:4d97c7c325af56dbd51f15"
    },

    async init() {
        try {
            const [appMod, authMod, fireMod, storageMod] = await Promise.all([
                import("https://www.gstatic.com/firebasejs/11.8.1/firebase-app.js"),
                import("https://www.gstatic.com/firebasejs/11.8.1/firebase-auth.js"),
                import("https://www.gstatic.com/firebasejs/11.8.1/firebase-firestore.js"),
                import("https://www.gstatic.com/firebasejs/11.8.1/firebase-storage.js")
            ]);

            this.authMod = authMod;
            this.fireMod = fireMod;
            this.storageMod = storageMod;

            const app = appMod.initializeApp(this.config);
            this.auth = authMod.getAuth(app);
            this.db = fireMod.getFirestore(app);
            this.storage = storageMod.getStorage(app);

            // Listen auth state
            authMod.onAuthStateChanged(this.auth, (user) => this._onAuthChanged(user));

            // Auto-restore last room
            const lastRoom = localStorage.getItem('sticky_last_room');
            if (lastRoom) {
                document.getElementById('auth-room-input').value = lastRoom;
            }

        } catch (err) {
            console.warn('[Cloud] Init failed:', err.message);
        }
    },

    async enterRoom(roomName, password) {
        if (!roomName || !password || !this.auth) return;

        const email = roomName.trim() + '@stickymemo.app';

        localStorage.setItem('sticky_last_room', roomName.trim());

        try {
            await this.authMod.signInWithEmailAndPassword(this.auth, email, password);
        } catch (e) {
            if (e.code === 'auth/user-not-found' || e.code === 'auth/invalid-credential') {
                try {
                    await this.authMod.createUserWithEmailAndPassword(this.auth, email, password);
                } catch (regErr) {
                    if (regErr.code === 'auth/operation-not-allowed') {
                        App.showToast('❌ 請先在 Firebase 啟用 Email/Password 驗證');
                    } else if (regErr.code === 'auth/weak-password') {
                        App.showToast('❌ 密碼至少需要 6 個字元');
                    } else {
                        App.showToast('❌ 建立房間失敗: ' + regErr.message);
                    }
                    return;
                }
            } else if (e.code === 'auth/wrong-password') {
                App.showToast('❌ 密碼錯誤');
                return;
            } else if (e.code === 'auth/operation-not-allowed') {
                App.showToast('❌ 請先在 Firebase 啟用 Email/Password 驗證');
                return;
            } else {
                App.showToast('❌ 登入失敗: ' + e.message);
                return;
            }
        }
    },

    async leaveRoom() {
        if (this.unsubscribe) { this.unsubscribe(); this.unsubscribe = null; }
        if (this.auth) await this.authMod.signOut(this.auth);
    },

    _onAuthChanged(user) {
        this.currentUser = user;
        const cloudBtn = document.getElementById('cloud-btn');

        if (user) {
            const roomName = user.email.split('@')[0];
            App.storagePrefix = roomName;
            if (cloudBtn) { cloudBtn.classList.remove('cloud-offline'); cloudBtn.classList.add('cloud-online'); }
            App.showToast('☁️ 已連接房間: ' + roomName);
            document.getElementById('auth-current-room').textContent = roomName;

            // Sync: upload local state then listen
            this._uploadThenListen(user.uid);
        } else {
            App.storagePrefix = 'local';
            if (cloudBtn) { cloudBtn.classList.remove('cloud-online'); cloudBtn.classList.add('cloud-offline'); }
            if (this.unsubscribe) { this.unsubscribe(); this.unsubscribe = null; }
        }
    },

    async _uploadThenListen(uid) {
        const f = this.fireMod;
        const stateRef = f.doc(this.db, 'memo', uid, 'meta', 'state');
        const snap = await f.getDoc(stateRef);

        if (snap.exists()) {
            // Cloud has data → load it
            const cloudState = snap.data();
            App.state = cloudState;
            // Clear current notes before switching to prevent flash of old data
            App.notes = [];
            App._renderAllNotes();
            App.switchWall(cloudState.activeWallId);
            App.showToast('📥 已從雲端載入資料');
        } else {
            // First time in this room → start with clean slate
            App.notes = [];
            App.state = { activeWallId: 'default', walls: [{ id: 'default', name: '預設牆面' }] };
            App._renderAllNotes();
            App._updateNoteCount();
            Walls.renderSidebar(App.state);
            document.getElementById('current-wall-name').textContent = '預設牆面';
            this.syncState();
            this.syncNotes();
            App.showToast('🆕 新房間已建立');
        }

        // Listen for changes
        this._listenWall(uid, App.state.activeWallId);
    },

    _listenWall(uid, wallId, wallType) {
        if (this.unsubscribe) this.unsubscribe();

        const f = this.fireMod;
        const isChat = wallType === 'chat' || (App.state.walls.find(w => w.id === wallId)?.type === 'chat');

        if (isChat) {
            const coll = f.collection(this.db, 'memo', uid, 'messages_' + wallId);
            this.unsubscribe = f.onSnapshot(coll, (snapshot) => {
                if (snapshot.metadata.hasPendingWrites) return;

                const messages = [];
                snapshot.forEach(doc => messages.push(doc.data()));
                messages.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

                if (messages.length > 0) {
                    Chat.messages = messages;
                    Chat._saveLocal();
                    Chat.render();
                    Chat.scrollToBottom();
                    Chat._updateCountBadge();
                }
            }, (err) => {
                console.warn('[Cloud] Chat listener error:', err.message);
            });
            return;
        }

        const coll = f.collection(this.db, 'memo', uid, 'notes_' + wallId);
        this.unsubscribe = f.onSnapshot(coll, (snapshot) => {
            if (snapshot.metadata.hasPendingWrites) return;

            const notes = [];
            snapshot.forEach(doc => notes.push(doc.data()));

            if (notes.length > 0) {
                App.notes = notes;
                localStorage.setItem(App._notesKey(wallId), JSON.stringify(notes));
                App._renderAllNotes();
            }
        }, (err) => {
            console.warn('[Cloud] Listener error:', err.message);
        });
    },

    syncState() {
        if (!this.currentUser || !this.db) return;
        const f = this.fireMod;
        const ref = f.doc(this.db, 'memo', this.currentUser.uid, 'meta', 'state');
        f.setDoc(ref, App.state, { merge: true }).catch(e => {
            console.warn('[Cloud] syncState:', e.message);
            App.showToast('⚠️ 牆面狀態同步失敗');
        });
    },

    syncNotes() {
        if (!this.currentUser || !this.db) return;
        const f = this.fireMod;
        const uid = this.currentUser.uid;
        const wallId = App.state.activeWallId;

        let failCount = 0;
        App.notes.forEach(note => {
            const ref = f.doc(this.db, 'memo', uid, 'notes_' + wallId, note.id.toString());
            f.setDoc(ref, note, { merge: true }).catch(e => {
                console.warn('[Cloud] syncNote:', e.message);
                failCount++;
                if (failCount === 1) App.showToast('⚠️ 部分便利貼同步失敗');
            });
        });
    },

    deleteNote(noteId, attachments = []) {
        if (!this.currentUser || !this.db) return;
        const f = this.fireMod;
        const ref = f.doc(this.db, 'memo', this.currentUser.uid, 'notes_' + App.state.activeWallId, noteId.toString());
        f.deleteDoc(ref).catch(e => console.warn('[Cloud] deleteNote:', e.message));

        // Clean up any cloud attachments for this note
        if (attachments && Array.isArray(attachments)) {
            attachments.forEach(att => {
                if (att && att.storagePath) this.deleteAttachment(att.storagePath);
            });
        }
    },

    /** Add a note to a specific wall's cloud collection */
    addNoteToWall(wallId, note) {
        if (!this.currentUser || !this.db) return;
        const f = this.fireMod;
        const ref = f.doc(this.db, 'memo', this.currentUser.uid, 'notes_' + wallId, note.id.toString());
        f.setDoc(ref, note, { merge: true }).catch(e => console.warn('[Cloud] addNoteToWall:', e.message));
    },

    /** Sync a single chat message to Firestore */
    syncMessage(wallId, msg) {
        if (!this.currentUser || !this.db) return;
        const f = this.fireMod;
        const ref = f.doc(this.db, 'memo', this.currentUser.uid, 'messages_' + wallId, msg.id.toString());
        f.setDoc(ref, msg, { merge: true }).catch(e => console.warn('[Cloud] syncMessage:', e.message));
    },

    /** Delete a chat message from Firestore and delete its storage attachments */
    deleteMessage(wallId, msgId, attachments = []) {
        if (!this.currentUser || !this.db) return;
        const f = this.fireMod;
        const ref = f.doc(this.db, 'memo', this.currentUser.uid, 'messages_' + wallId, msgId.toString());
        f.deleteDoc(ref).catch(e => console.warn('[Cloud] deleteMessage:', e.message));

        if (attachments && Array.isArray(attachments)) {
            attachments.forEach(att => {
                if (att && att.storagePath) this.deleteAttachment(att.storagePath);
            });
        }
    },

    async relisten(wallId, wallType) {
        if (!this.currentUser) return;
        const uid = this.currentUser.uid;
        const isChat = wallType === 'chat' || (App.state.walls.find(w => w.id === wallId)?.type === 'chat');

        if (isChat) {
            try {
                const f = this.fireMod;
                const coll = f.collection(this.db, 'memo', uid, 'messages_' + wallId);
                const snapshot = await f.getDocs(coll);
                const messages = [];
                snapshot.forEach(doc => messages.push(doc.data()));
                messages.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
                if (messages.length > 0) {
                    Chat.messages = messages;
                    Chat._saveLocal();
                    Chat.render();
                    Chat.scrollToBottom();
                    Chat._updateCountBadge();
                }
            } catch (e) {
                console.warn('[Cloud] relisten chat fetch:', e.message);
            }
            this._listenWall(uid, wallId, 'chat');
            return;
        }

        // Sticky notes wall
        try {
            const f = this.fireMod;
            const coll = f.collection(this.db, 'memo', uid, 'notes_' + wallId);
            const snapshot = await f.getDocs(coll);
            const notes = [];
            snapshot.forEach(doc => notes.push(doc.data()));
            if (notes.length > 0) {
                App.notes = notes;
                localStorage.setItem(App._notesKey(wallId), JSON.stringify(notes));
                App._renderAllNotes();
                App._updateNoteCount();
            }
        } catch (e) {
            console.warn('[Cloud] relisten fetch:', e.message);
        }

        this._listenWall(uid, wallId, 'sticky');
    },

    // ===== Phase 2 & 3: Export/Import/Cleanup & Storage =====

    /** Fetch all notes for a specific wall from Firestore */
    async getAllNotesForWall(wallId) {
        if (!this.currentUser || !this.db) return null;
        try {
            const f = this.fireMod;
            const coll = f.collection(this.db, 'memo', this.currentUser.uid, 'notes_' + wallId);
            const snapshot = await f.getDocs(coll);
            const notes = [];
            snapshot.forEach(doc => notes.push(doc.data()));
            return notes;
        } catch (e) {
            console.warn('[Cloud] getAllNotesForWall:', e.message);
            return null;
        }
    },

    /** Delete all Firestore documents in a wall's notes collection and their storage attachments */
    async deleteWall(wallId) {
        if (!this.currentUser || !this.db) return;
        try {
            const f = this.fireMod;
            const uid = this.currentUser.uid;
            const coll = f.collection(this.db, 'memo', uid, 'notes_' + wallId);
            const snapshot = await f.getDocs(coll);
            const deletes = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                if (data.attachments && Array.isArray(data.attachments)) {
                    data.attachments.forEach(att => {
                        if (att && att.storagePath) this.deleteAttachment(att.storagePath);
                    });
                }
                deletes.push(f.deleteDoc(doc.ref));
            });
            // Also delete messages collection and attachments if chat wall
            const msgColl = f.collection(this.db, 'memo', uid, 'messages_' + wallId);
            const msgSnap = await f.getDocs(msgColl);
            msgSnap.forEach(doc => {
                const data = doc.data();
                if (data.attachments && Array.isArray(data.attachments)) {
                    data.attachments.forEach(att => {
                        if (att && att.storagePath) this.deleteAttachment(att.storagePath);
                    });
                }
                deletes.push(f.deleteDoc(doc.ref));
            });

            await Promise.all(deletes);
            console.log(`[Cloud] deleteWall: deleted ${deletes.length} docs from wall ${wallId}`);
        } catch (e) {
            console.warn('[Cloud] deleteWall:', e.message);
        }
    },

    /** Fetch all messages for a specific chat wall from Firestore */
    async getAllMessagesForWall(wallId) {
        if (!this.currentUser || !this.db) return null;
        try {
            const f = this.fireMod;
            const coll = f.collection(this.db, 'memo', this.currentUser.uid, 'messages_' + wallId);
            const snapshot = await f.getDocs(coll);
            const messages = [];
            snapshot.forEach(doc => messages.push(doc.data()));
            messages.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
            return messages;
        } catch (e) {
            console.warn('[Cloud] getAllMessagesForWall:', e.message);
            return null;
        }
    },

    /** Upload attachment file to Firebase Storage with progress callback */
    async uploadAttachment(wallId, noteId, file, onProgress) {
        if (!this.currentUser || !this.storage) {
            throw new Error('請先登入雲端房間以使用附件上傳功能');
        }
        const uid = this.currentUser.uid;
        const s = this.storageMod;
        const safeName = file.name.replace(/[^a-zA-Z0-9._\-\u4e00-\u9fa5]/g, '_');
        const storagePath = `attachments/${uid}/${wallId}/${noteId}/${Date.now()}_${safeName}`;
        const fileRef = s.ref(this.storage, storagePath);

        const uploadTask = s.uploadBytesResumable(fileRef, file);

        return new Promise((resolve, reject) => {
            uploadTask.on('state_changed',
                (snapshot) => {
                    if (snapshot.totalBytes > 0 && onProgress) {
                        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                        onProgress(progress);
                    }
                },
                (error) => {
                    console.error('[Storage] Upload error:', error);
                    reject(error);
                },
                async () => {
                    try {
                        const downloadURL = await s.getDownloadURL(uploadTask.snapshot.ref);
                        resolve({
                            id: 'att_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
                            name: file.name,
                            size: file.size,
                            type: file.type || 'application/octet-stream',
                            storagePath: storagePath,
                            url: downloadURL,
                            uploadedAt: Date.now()
                        });
                    } catch (e) {
                        reject(e);
                    }
                }
            );
        });
    },

    /** Delete attachment file from Firebase Storage */
    async deleteAttachment(storagePath) {
        if (!this.storage || !storagePath) return;
        try {
            const s = this.storageMod;
            const fileRef = s.ref(this.storage, storagePath);
            await s.deleteObject(fileRef);
            console.log('[Storage] Deleted attachment:', storagePath);
        } catch (e) {
            console.warn('[Storage] deleteAttachment error:', e.message);
        }
    },

    /** Get fresh download URL for an attachment */
    async getAttachmentURL(storagePath) {
        if (!this.storage || !storagePath) return null;
        try {
            const s = this.storageMod;
            const fileRef = s.ref(this.storage, storagePath);
            return await s.getDownloadURL(fileRef);
        } catch (e) {
            console.warn('[Storage] getAttachmentURL error:', e.message);
            return null;
        }
    },

    /** Delete entire room: all walls + meta/state + auth user */
    async deleteRoom() {
        if (!this.currentUser || !this.db) return;
        try {
            const f = this.fireMod;
            const uid = this.currentUser.uid;

            // Delete all walls' notes collections
            for (const wall of App.state.walls) {
                await this.deleteWall(wall.id);
            }

            // Delete meta/state document
            const stateRef = f.doc(this.db, 'memo', uid, 'meta', 'state');
            await f.deleteDoc(stateRef).catch(() => {});

            // Delete the auth user (room account)
            try {
                await this.authMod.deleteUser(this.currentUser);
            } catch (e) {
                console.warn('[Cloud] deleteUser:', e.message);
            }

            // Clear local room info
            localStorage.removeItem('sticky_last_room');
            this.currentUser = null;
            if (this.unsubscribe) { this.unsubscribe(); this.unsubscribe = null; }

            console.log('[Cloud] deleteRoom: completed');
        } catch (e) {
            console.warn('[Cloud] deleteRoom:', e.message);
        }
    },

    /** Upload all walls' notes and messages to Firestore (used after import) */
    async syncAllWalls(walls, notesMap, messagesMap = {}) {
        if (!this.currentUser || !this.db) return;
        const f = this.fireMod;
        const uid = this.currentUser.uid;

        // Sync state (wall list)
        const stateRef = f.doc(this.db, 'memo', uid, 'meta', 'state');
        await f.setDoc(stateRef, App.state, { merge: true }).catch(e =>
            console.warn('[Cloud] syncAllWalls state:', e.message)
        );

        // Sync each wall's notes and messages
        for (const wall of walls) {
            if (wall.type === 'chat') {
                const msgs = messagesMap[wall.id] || [];
                for (const msg of msgs) {
                    const ref = f.doc(this.db, 'memo', uid, 'messages_' + wall.id, msg.id.toString());
                    await f.setDoc(ref, msg, { merge: true }).catch(e =>
                        console.warn('[Cloud] syncAllWalls msg:', e.message)
                    );
                }
            } else {
                const notes = notesMap[wall.id] || [];
                for (const note of notes) {
                    const ref = f.doc(this.db, 'memo', uid, 'notes_' + wall.id, note.id.toString());
                    await f.setDoc(ref, note, { merge: true }).catch(e =>
                        console.warn('[Cloud] syncAllWalls note:', e.message)
                    );
                }
            }
        }
    }
};
