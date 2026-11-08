/* Fristående synkronisering för scoutkokboken. Recept har ingen koppling till planeringar. */
(function () {
    const STORAGE_KEY = "gtscout_kokbok_recept";
    let recipes = [];
    let onChange = null;
    let loadedForKarId = null;
    let loading = false;
    let loadError = false;
    let loadRevision = 0;

    const auth = () => window.GTScoutAuth;
    const client = () => auth()?.getClient() || null;
    const karId = () => auth()?.getState?.().karId || null;
    const canRead = () => Boolean(client());
    const canWrite = () => !auth()?.isSignedIn?.() || (canRead() && auth()?.isLeader?.());
    const canSync = () => Boolean(canRead() && auth()?.isSignedIn?.() && auth()?.isLeader?.() && karId());
    const canEdit = () => canSync();

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
        const revision = ++loadRevision;
        const currentKarId = karId();
        const currentUserId = auth()?.getUser()?.id;
        const isCurrent = () => revision === loadRevision && currentKarId === karId()
            && currentUserId === auth()?.getUser()?.id;
        loading = true;
        loadError = false;
        onChange?.(recipes);
        try {
            const { data, error } = await client().from("kokbok_recept").select("id, kar_id, created_by, namn, kategori, beskrivning, ingredienser, ingredienser_skalningar, instruktioner, portioner, tid, svarighet, created_at, updated_at").order("namn");
            if (!isCurrent()) return;
            if (error) throw error;
            const remote = (data || []).map(normalize);
            const remoteIds = new Set(remote.map(recipe => recipe.id));
            const local = readLocal();
            const localOnly = local.filter(recipe => !remoteIds.has(recipe.id)).map(recipe => ({ ...recipe, local_only: true }));

            if (localOnly.length && canSync()) {
                const action = await window.GTScoutLocalChanges.confirm({
                    kind: "recept",
                    localData: localOnly,
                    isCurrent,
                    items: localOnly.map(recipe => ({
                        title: recipe.namn,
                        detail: `${recipe.kategori} · ${recipe.portioner} portioner`
                    }))
                });
                if (!isCurrent() || !canSync()) return;
                if (action === "upload") {
                    const userId = auth()?.getUser()?.id || null;
                    for (const recipe of localOnly) {
                        await save({ ...recipe, kar_id: karId(), created_by: recipe.created_by || userId });
                        if (!isCurrent() || !canSync()) return;
                    }
                    recipes = [...remote, ...localOnly.map(recipe => ({ ...recipe, kar_id: karId(), local_only: false }))];
                } else if (action === "delete") {
                    recipes = remote;
                } else {
                    recipes = [...remote, ...localOnly];
                }
            } else {
                recipes = [...remote, ...localOnly];
            }
            loading = false;
            writeLocal();
        } catch (error) {
            if (!isCurrent()) return;
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
        const context = `${auth()?.getUser()?.id || "public"}:${karId() || ""}:${canSync()}`;
        if (!canRead()) { loadedForKarId = null; recipes = readLocal(); onChange?.(recipes); return; }
        if (loadedForKarId === context) return;
        loadedForKarId = context;
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
