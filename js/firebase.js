/* Firebase Cloud Sync */
const Cloud = {
    db: null,
    auth: null,
    authMod: null,
    fireMod: null,
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
            const [appMod, authMod, fireMod] = await Promise.all([
                import("https://www.gstatic.com/firebasejs/11.8.1/firebase-app.js"),
                import("https://www.gstatic.com/firebasejs/11.8.1/firebase-auth.js"),
                import("https://www.gstatic.com/firebasejs/11.8.1/firebase-firestore.js")
            ]);

            this.authMod = authMod;
            this.fireMod = fireMod;

            const app = appMod.initializeApp(this.config);
            this.auth = authMod.getAuth(app);
            this.db = fireMod.getFirestore(app);

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
            // First time → upload local data
            this.syncState();
            this.syncNotes();
            App.showToast('📤 已將本地資料上傳至雲端');
        }

        // Listen for changes
        this._listenWall(uid, App.state.activeWallId);
    },

    _listenWall(uid, wallId) {
        if (this.unsubscribe) this.unsubscribe();

        const f = this.fireMod;
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
        f.setDoc(ref, App.state, { merge: true }).catch(e => console.warn('[Cloud] syncState:', e.message));
    },

    syncNotes() {
        if (!this.currentUser || !this.db) return;
        const f = this.fireMod;
        const uid = this.currentUser.uid;
        const wallId = App.state.activeWallId;

        App.notes.forEach(note => {
            const ref = f.doc(this.db, 'memo', uid, 'notes_' + wallId, note.id.toString());
            f.setDoc(ref, note, { merge: true }).catch(e => console.warn('[Cloud] syncNote:', e.message));
        });
    },

    deleteNote(noteId) {
        if (!this.currentUser || !this.db) return;
        const f = this.fireMod;
        const ref = f.doc(this.db, 'memo', this.currentUser.uid, 'notes_' + App.state.activeWallId, noteId.toString());
        f.deleteDoc(ref).catch(e => console.warn('[Cloud] deleteNote:', e.message));
    },

    /** Add a note to a specific wall's cloud collection */
    addNoteToWall(wallId, note) {
        if (!this.currentUser || !this.db) return;
        const f = this.fireMod;
        const ref = f.doc(this.db, 'memo', this.currentUser.uid, 'notes_' + wallId, note.id.toString());
        f.setDoc(ref, note, { merge: true }).catch(e => console.warn('[Cloud] addNoteToWall:', e.message));
    },

    async relisten(wallId) {
        if (!this.currentUser) return;
        const uid = this.currentUser.uid;

        // Actively fetch latest data before setting up listener
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

        this._listenWall(uid, wallId);
    }
};
