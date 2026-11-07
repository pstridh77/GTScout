/**
 * Synkar märkesanteckningar mot Supabase. Anteckningarna är kårgemensamma:
 * alla inloggade i kåren läser dem, ledare och admin får spara.
 * localStorage används alltid som lokal kopia och som enda lagring i offline-läge.
 */
(function () {
    const STORAGE_KEY = "gtscout_badge_notes";
    const SAVE_DELAY_MS = 800;

    let onChange = null;
    let saveTimer = null;
    const pending = new Map();
    let loadedForKarId = null;
    let loadedForUserId = null;
    let loadRevision = 0;

    const auth = () => window.GTScoutAuth;
    const client = () => auth()?.getClient() || null;

    function karId() {
        return auth()?.getState().karId || null;
    }

    function canRead() {
        return Boolean(client() && auth().isSignedIn() && karId());
    }

    function canWrite() {
        return canRead() && auth().isLeader();
    }

    function readLocal() {
        try {
            const notes = JSON.parse(localStorage.getItem(STORAGE_KEY));
            return notes && typeof notes === "object" && !Array.isArray(notes) ? notes : {};
        } catch {
            return {};
        }
    }

    function writeLocal(notes) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
    }

    // Anteckningar som användaren avböjt uppladdning för hålls lokala tills de redigeras.
    const localOnlyIds = new Set();

    function isLocalOnly(badgeId) {
        return localOnlyIds.has(badgeId);
    }

    async function flush() {
        saveTimer = null;
        const entries = [...pending.entries()];
        pending.clear();
        if (!entries.length || !canWrite()) return;

        const kar = karId();
        const updatedBy = auth().getUser()?.id || null;
        const upserts = entries
            .filter(([, note]) => note.trim())
            .map(([badgeId, note]) => ({ kar_id: kar, badge_id: badgeId, note, updated_by: updatedBy }));
        const removals = entries.filter(([, note]) => !note.trim()).map(([badgeId]) => badgeId);

        const writeGuard = () => canWrite() && karId() === kar && (auth().getUser()?.id || null) === updatedBy;
        try {
            if (upserts.length) {
                await window.GTScoutSyncRetry.withRetry(async () => {
                    const { error } = await client()
                        .from("badge_notes")
                        .upsert(upserts, { onConflict: "kar_id,badge_id" });
                    if (error) throw error;
                }, writeGuard);
            }
            if (removals.length) {
                await window.GTScoutSyncRetry.withRetry(async () => {
                    const { error } = await client()
                        .from("badge_notes")
                        .delete()
                        .eq("kar_id", kar)
                        .in("badge_id", removals);
                    if (error) throw error;
                }, writeGuard);
            }
        } catch (error) {
            console.error("Kunde inte spara anteckningar till databasen", error);
        }
    }

    function scheduleSave(badgeId, note) {
        if (!canWrite() || !badgeId) return;
        localOnlyIds.delete(badgeId);
        pending.set(badgeId, String(note ?? ""));
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(flush, SAVE_DELAY_MS);
    }

    function scheduleSaveAll(notes) {
        Object.entries(notes || {}).forEach(([badgeId, note]) => scheduleSave(badgeId, note));
    }

    let uploadDialog = null;

    function createUploadDialog() {
        const modal = document.createElement("div");
        modal.id = "notesUploadModal";
        modal.className = "modal hidden";
        modal.setAttribute("role", "dialog");
        modal.setAttribute("aria-modal", "true");
        modal.setAttribute("aria-labelledby", "notesUploadDialogTitle");

        const content = document.createElement("div");
        content.className = "modal-content";

        const closeBtn = document.createElement("button");
        closeBtn.className = "close-popup";
        closeBtn.type = "button";
        closeBtn.setAttribute("aria-label", "Stäng");
        closeBtn.textContent = "×";

        const title = document.createElement("h2");
        title.id = "notesUploadDialogTitle";
        title.textContent = "Spara anteckningar i kårens databas?";

        const messageEl = document.createElement("p");
        messageEl.className = "sync-upload-dialog-message";

        const actions = document.createElement("div");
        actions.className = "modal-actions";

        const cancelBtn = document.createElement("button");
        cancelBtn.className = "btn-secondary";
        cancelBtn.type = "button";
        cancelBtn.textContent = "Avbryt";

        const deleteBtn = document.createElement("button");
        deleteBtn.className = "btn-danger";
        deleteBtn.type = "button";
        deleteBtn.textContent = "Ta bort lokala";

        const confirmBtn = document.createElement("button");
        confirmBtn.className = "btn-primary";
        confirmBtn.type = "button";
        confirmBtn.textContent = "Lägg till i databasen";

        actions.appendChild(cancelBtn);
        actions.appendChild(deleteBtn);
        actions.appendChild(confirmBtn);
        content.appendChild(closeBtn);
        content.appendChild(title);
        content.appendChild(messageEl);
        content.appendChild(actions);
        modal.appendChild(content);
        document.body.appendChild(modal);
        return { modal, messageEl, confirmBtn, deleteBtn, cancelBtn, closeBtn, resolve: null };
    }

    function closeUploadDialog(result) {
        if (!uploadDialog?.resolve) return;
        const resolve = uploadDialog.resolve;
        uploadDialog.resolve = null;
        uploadDialog.modal.classList.add("hidden");
        document.removeEventListener("keydown", onUploadDialogKeydown, true);
        resolve(result);
    }

    function onUploadDialogKeydown(event) {
        if (event.key !== "Escape") return;
        event.stopPropagation();
        closeUploadDialog("cancel");
    }

    function confirmUpload(message) {
        if (typeof document.createElement !== "function" || typeof document.body?.appendChild !== "function") {
            return Promise.resolve(window.confirm(message) ? "upload" : "cancel");
        }
        if (!uploadDialog) {
            uploadDialog = createUploadDialog();
            uploadDialog.confirmBtn.addEventListener("click", () => closeUploadDialog("upload"));
            uploadDialog.deleteBtn.addEventListener("click", () => closeUploadDialog("delete"));
            uploadDialog.cancelBtn.addEventListener("click", () => closeUploadDialog("cancel"));
            uploadDialog.closeBtn.addEventListener("click", () => closeUploadDialog("cancel"));
            uploadDialog.modal.addEventListener("click", event => {
                if (event.target === uploadDialog.modal) closeUploadDialog("cancel");
            });
        }
        closeUploadDialog("cancel");
        uploadDialog.messageEl.textContent = message;
        uploadDialog.modal.classList.remove("hidden");
        document.addEventListener("keydown", onUploadDialogKeydown, true);
        uploadDialog.confirmBtn.focus();
        return new Promise(resolve => { uploadDialog.resolve = resolve; });
    }

    async function load() {
        if (!canRead()) return;
        const revision = ++loadRevision;
        try {
            const { data, error } = await client()
                .from("badge_notes")
                .select("badge_id, note")
                .eq("kar_id", karId());
            if (revision !== loadRevision || !canRead()) return;
            if (error) throw error;

            const remote = {};
            (data || []).forEach(row => {
                if (row.note && row.note.trim()) remote[row.badge_id] = row.note;
            });

            const local = readLocal();
            const localKeys = Object.keys(local).filter(k => local[k] && local[k].trim());
            const newOrDifferentKeys = localKeys.filter(k => !remote[k] || remote[k] !== local[k]);

            if (newOrDifferentKeys.length && canWrite()) {
                const action = await confirmUpload(
                    `Du har skrivit ${newOrDifferentKeys.length} märkesanteckning(ar) när du arbetade oinloggad.\n\nVill du spara dem i kårens databas?`
                );
                if (action === "upload") {
                    const merged = { ...remote };
                    newOrDifferentKeys.forEach(k => { merged[k] = local[k]; });
                    writeLocal(merged);
                    scheduleSaveAll(merged);
                    onChange?.();
                    return;
                }
                if (action === "delete") {
                    writeLocal(remote);
                    onChange?.();
                    return;
                }
                newOrDifferentKeys.forEach(k => localOnlyIds.add(k));
                writeLocal({ ...remote, ...Object.fromEntries(newOrDifferentKeys.map(k => [k, local[k]])) });
                onChange?.();
                return;
            }

            writeLocal(remote);
            onChange?.();
        } catch (error) {
            if (revision !== loadRevision || !canRead()) return;
            console.error("Kunde inte hämta anteckningar från databasen", error);
        }
    }

    function onAuthChange() {
        if (!canRead()) {
            const wasLoaded = loadedForKarId !== null;
            loadedForKarId = null;
            loadedForUserId = null;
            loadRevision++;
            if (saveTimer) clearTimeout(saveTimer);
            saveTimer = null;
            pending.clear();
            if (wasLoaded) {
                // Endast om användaren tidigare var inloggad i en kår och nu loggat ut
                writeLocal({});
                onChange?.();
            }
            return;
        }
        const userId = auth().getUser()?.id || null;
        if (loadedForKarId === karId() && loadedForUserId === userId) return;
        loadedForKarId = karId();
        loadedForUserId = userId;
        load();
    }

    window.GTScoutNotes = {
        canRead,
        canWrite,
        isLocalOnly,
        scheduleSave,
        scheduleSaveAll,
        reload: load,
        init(config) {
            onChange = config?.onChange || null;
            auth()?.onChange(onAuthChange);
        }
    };
})();
