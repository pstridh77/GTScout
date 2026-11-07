/* Fristående synkronisering för scoutkokboken. Recept har ingen koppling till planeringar. */
(function () {
    const STORAGE_KEY = "gtscout_kokbok_recept";
    let recipes = [];
    let onChange = null;
    let loadedForKarId = null;
    let loading = false;
    let loadError = false;

    const auth = () => window.GTScoutAuth;
    const client = () => auth()?.getClient() || null;
    const karId = () => auth()?.getState?.().karId || null;
    const canRead = () => Boolean(client());
    const canWrite = () => !auth()?.isSignedIn?.() || (canRead() && auth()?.isLeader?.());
    const canSync = () => Boolean(canRead() && auth()?.isLeader?.());
    const canEdit = () => canSync();

    let uploadDialog = null;

    function createUploadDialog() {
        const modal = document.createElement("div");
        modal.id = "cookbookUploadModal";
        modal.className = "modal hidden";
        modal.setAttribute("role", "dialog");
        modal.setAttribute("aria-modal", "true");
        modal.setAttribute("aria-labelledby", "cookbookUploadDialogTitle");

        const content = document.createElement("div");
        content.className = "modal-content";

        const closeBtn = document.createElement("button");
        closeBtn.className = "close-popup";
        closeBtn.type = "button";
        closeBtn.setAttribute("aria-label", "Stäng");
        closeBtn.textContent = "×";

        const title = document.createElement("h2");
        title.id = "cookbookUploadDialogTitle";
        title.textContent = "Spara recept i kårens databas?";

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

    function normalize(recipe) {
        return {
            id: String(recipe?.id || crypto.randomUUID()),
            namn: String(recipe?.namn || "").trim(),
            kategori: String(recipe?.kategori || "Övrigt").trim(),
            beskrivning: String(recipe?.beskrivning || "").trim(),
            ingredienser: Array.isArray(recipe?.ingredienser) ? recipe.ingredienser.map(String).map(value => value.trim()).filter(Boolean) : [],
            ingredienser_skalningar: Array.isArray(recipe?.ingredienser_skalningar) ? recipe.ingredienser_skalningar.map(item => ({ namn: String(item?.namn || "").trim(), mangder: item?.mangder && typeof item.mangder === "object" ? Object.fromEntries(Object.entries(item.mangder).map(([key, value]) => [key, String(value || "").trim()]).filter(([, value]) => value)) : {} })).filter(item => item.namn) : [],
            instruktioner: String(recipe?.instruktioner || "").trim(),
            portioner: Math.max(1, Number(recipe?.portioner) || 4),
            tid: String(recipe?.tid || "").trim(),
            svarighet: ["Enkel", "Medel", "Avancerad"].includes(recipe?.svarighet) ? recipe.svarighet : "Enkel",
            kar_id: recipe?.kar_id || null,
            created_by: recipe?.created_by || null,
            created_at: recipe?.created_at || null,
            updated_at: recipe?.updated_at || null,
            local_only: Boolean(recipe?.local_only)
        };
    }

    function readLocal() {
        try {
            const value = JSON.parse(localStorage.getItem(STORAGE_KEY));
            return Array.isArray(value) ? value.map(normalize).filter(recipe => recipe.namn) : [];
        } catch {
            return [];
        }
    }

    function writeLocal() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(recipes));
        onChange?.(recipes);
    }

    async function load() {
        if (!canRead()) return;
        loading = true;
        loadError = false;
        onChange?.(recipes);
        try {
            const { data, error } = await client().from("kokbok_recept").select("id, kar_id, created_by, namn, kategori, beskrivning, ingredienser, ingredienser_skalningar, instruktioner, portioner, tid, svarighet, created_at, updated_at").order("namn");
            if (error) throw error;
            const remote = (data || []).map(normalize);
            const remoteIds = new Set(remote.map(recipe => recipe.id));
            const local = readLocal();
            const localOnly = local.filter(recipe => !remoteIds.has(recipe.id)).map(recipe => ({ ...recipe, local_only: true }));

            if (localOnly.length && canSync()) {
                const action = await confirmUpload(remote.length
                    ? `Du har skapat ${localOnly.length} recept när du arbetade oinloggad.\n\nVill du lägga till dem i kårens databas tillsammans med kårens befintliga recept (${remote.length} st)?`
                    : `Du har ${localOnly.length} recept från när du arbetade oinloggad.\n\nVill du lägga till och spara dem i kårens databas?`);
                if (action === "upload") {
                    const userId = auth()?.getUser()?.id || null;
                    for (const recipe of localOnly) {
                        await save({ ...recipe, kar_id: karId(), created_by: recipe.created_by || userId });
                    }
                    recipes = [...remote, ...localOnly.map(recipe => ({ ...recipe, kar_id: karId() }))];
                } else if (action === "delete") {
                    recipes = remote;
                } else {
                    recipes = [...remote, ...localOnly];
                }
            } else {
                recipes = remote;
            }
            loading = false;
            writeLocal();
        } catch (error) {
            loading = false;
            loadError = true;
            console.error("Kunde inte hämta recept", error);
            recipes = readLocal();
            onChange?.(recipes);
        }
    }

    async function save(recipe) {
        const userId = auth()?.getUser()?.id || null;
        const next = normalize({ ...recipe, kar_id: karId(), created_by: recipe.created_by || userId });
        const index = recipes.findIndex(item => item.id === next.id);
        if (index === -1) recipes.push(next); else recipes[index] = next;
        writeLocal();
        if (!canSync()) {
            next.local_only = true;
            writeLocal();
            return { localOnly: true, recipe: next };
        }
        const row = { id: next.id, kar_id: karId(), created_by: next.created_by, namn: next.namn, kategori: next.kategori || null, beskrivning: next.beskrivning || null, ingredienser: next.ingredienser, ingredienser_skalningar: next.ingredienser_skalningar, instruktioner: next.instruktioner, portioner: next.portioner, tid: next.tid || null, svarighet: next.svarighet };
        try {
            await window.GTScoutSyncRetry.withRetry(async () => {
                const { error } = await client().from("kokbok_recept").upsert(row, { onConflict: "id" });
                if (error) throw error;
            }, () => canSync() && karId() === row.kar_id && auth()?.getUser()?.id === userId);
            next.local_only = false;
            writeLocal();
            return { recipe: next };
        } catch (error) {
            next.local_only = true;
            writeLocal();
            throw error;
        }
    }

    async function remove(id) {
        const existing = recipes.find(recipe => recipe.id === id);
        recipes = recipes.filter(recipe => recipe.id !== id);
        writeLocal();
        if (!canSync() || !existing) return { localOnly: true };
        const currentKarId = karId();
        const currentUserId = auth()?.getUser()?.id || null;
        await window.GTScoutSyncRetry.withRetry(async () => {
            const { error } = await client().from("kokbok_recept").delete().eq("id", id).eq("kar_id", currentKarId);
            if (error) throw error;
        }, () => canSync() && karId() === currentKarId && auth()?.getUser()?.id === currentUserId);
        return {};
    }

    function onAuthChange() {
        if (!canRead()) { loadedForKarId = null; recipes = readLocal(); onChange?.(recipes); return; }
        if (loadedForKarId === "public") return;
        loadedForKarId = "public";
        load();
    }

    window.GTScoutCookbook = {
        init(config) { onChange = config?.onChange || null; recipes = canRead() ? readLocal() : readLocal(); auth()?.onChange(onAuthChange); onChange?.(recipes); onAuthChange(); },
        getAll: () => recipes.map(recipe => ({ ...recipe, ingredienser: [...recipe.ingredienser] })),
        getSyncState: () => ({ loading, error: loadError }),
        canWrite,
        canEdit,
        save,
        remove,
        reload: load
    };
})();
