/* Fristående synkronisering för scoutkokboken. Recept har ingen koppling till planeringar. */
(function () {
    const STORAGE_KEY = "gtscout_kokbok_recept";
    let recipes = [];
    let onChange = null;
    let loadedForKarId = null;

    const auth = () => window.GTScoutAuth;
    const client = () => auth()?.getClient() || null;
    const karId = () => auth()?.getState?.().karId || null;
    const canRead = () => Boolean(client());
    const canWrite = () => !auth()?.isSignedIn?.() || (canRead() && auth()?.isLeader?.());
    const canSync = () => Boolean(canRead() && auth()?.isLeader?.());

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
            updated_at: recipe?.updated_at || null
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
        try {
            const { data, error } = await client().from("kokbok_recept").select("id, kar_id, created_by, namn, kategori, beskrivning, ingredienser, ingredienser_skalningar, instruktioner, portioner, tid, svarighet, created_at, updated_at").order("namn");
            if (error) throw error;
            recipes = (data || []).map(normalize);
            writeLocal();
        } catch (error) {
            console.error("Kunde inte hämta recept", error);
            recipes = readLocal();
            onChange?.(recipes);
        }
    }

    async function save(recipe) {
        const next = normalize({ ...recipe, kar_id: karId(), created_by: recipe.created_by || auth().getUser()?.id || null });
        const index = recipes.findIndex(item => item.id === next.id);
        if (index === -1) recipes.push(next); else recipes[index] = next;
        writeLocal();
        if (!canSync()) return { localOnly: true, recipe: next };
        const row = { id: next.id, kar_id: karId(), created_by: next.created_by, namn: next.namn, kategori: next.kategori || null, beskrivning: next.beskrivning || null, ingredienser: next.ingredienser, ingredienser_skalningar: next.ingredienser_skalningar, instruktioner: next.instruktioner, portioner: next.portioner, tid: next.tid || null, svarighet: next.svarighet };
        const { error } = await client().from("kokbok_recept").upsert(row, { onConflict: "id" });
        if (error) throw error;
        return { recipe: next };
    }

    async function remove(id) {
        const existing = recipes.find(recipe => recipe.id === id);
        recipes = recipes.filter(recipe => recipe.id !== id);
        writeLocal();
        if (!canSync() || !existing) return { localOnly: true };
        const { error } = await client().from("kokbok_recept").delete().eq("id", id).eq("kar_id", karId());
        if (error) throw error;
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
        canWrite,
        save,
        remove,
        reload: load
    };
})();
