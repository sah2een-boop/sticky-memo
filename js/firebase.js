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

            // Enable offline persistence
            try { await fireMod.enableIndexedDbPersistence(this.db); } catch(e) {}

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

    async enterRoom(roomName) {
        if (!roomName || !this.auth) return;

        const email = roomName.trim() + '@stickymemo.app';
        // Use room name itself as password seed
        const pwd = 'sm_' + roomName.trim() + '_2024!';

        localStorage.setItem('sticky_last_room', roomName.trim());

        try {
            await this.authMod.signInWithEmailAndPassword(this.auth, email, pwd);
        } catch (e) {
            if (e.code === 'auth/user-not-found' || e.code === 'auth/invalid-credential') {
                try {
                    await this.authMod.createUserWithEmailAndPassword(this.auth, email, pwd);
                } catch (regErr) {
                    if (regErr.code === 'auth/operation-not-allowed') {
                        App.showToast('❌ 請先在 Firebase 啟用 Email/Password 驗證');
                    } else {
                        App.showToast('❌ 進入房間失敗: ' + regErr.message);
                    }
                    return;
                }
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
            if (cloudBtn) { cloudBtn.classList.remove('cloud-offline'); cloudBtn.classList.add('cloud-online'); }
            App.showToast('☁️ 已連接房間: ' + roomName);
            document.getElementById('auth-current-room').textContent = roomName;

            // Sync: upload local state then listen
            this._uploadThenListen(user.uid);
        } else {
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
                localStorage.setItem('sticky_notes_' + wallId, JSON.stringify(notes));
                App._renderAllNotes();
            }
        });
    },

    syncState() {
        if (!this.currentUser || !this.db) return;
        const f = this.fireMod;
        const ref = f.doc(this.db, 'memo', this.currentUser.uid, 'meta', 'state');
        f.setDoc(ref, App.state, { merge: true }).catch(() => {});
    },

    syncNotes() {
        if (!this.currentUser || !this.db) return;
        const f = this.fireMod;
        const uid = this.currentUser.uid;
        const wallId = App.state.activeWallId;

        App.notes.forEach(note => {
            const ref = f.doc(this.db, 'memo', uid, 'notes_' + wallId, note.id.toString());
            f.setDoc(ref, note, { merge: true }).catch(() => {});
        });
    },

    deleteNote(noteId) {
        if (!this.currentUser || !this.db) return;
        const f = this.fireMod;
        const ref = f.doc(this.db, 'memo', this.currentUser.uid, 'notes_' + App.state.activeWallId, noteId.toString());
        f.deleteDoc(ref).catch(() => {});
    },

    relisten(wallId) {
        if (!this.currentUser) return;
        this._listenWall(this.currentUser.uid, wallId);
    }
};
