(function () {
    const STORAGE_KEY = "gtscout_arrangemang";
    let arrangements = [];
    let onChange = null;
    let loadedForKarId = null;
    let sharedToken = null;
    const DEPARTMENTS = ["Familjescouter", "Spårare", "Upptäckare", "Äventyrare", "Utmanare", "Rover"];

    const auth = () => window.GTScoutAuth;
    const client = () => auth()?.getClient?.() || null;
    const karId = () => auth()?.getState?.().karId || null;
    const canRead = () => Boolean(client() && auth()?.isSignedIn?.() && karId());
    const canWrite = () => Boolean(canRead() && auth()?.isLeader?.());

    function normalize(item) {
        if (!item || typeof item !== "object") return null;
        const id = String(item.id || crypto.randomUUID());
        const startDate = String(item.start_date || "");
        const endDate = String(item.end_date || startDate);
        if (!String(item.title || "").trim() || !/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || endDate < startDate) return null;
        const departments = Array.isArray(item.departments)
            ? [...new Set(item.departments.filter(department => DEPARTMENTS.includes(department)))]
            : [...DEPARTMENTS];
        const days = new Set();
        for (let date = new Date(`${startDate}T12:00:00`); date <= new Date(`${endDate}T12:00:00`); date.setDate(date.getDate() + 1)) {
            days.add(date.toISOString().slice(0, 10));
        }
        const agenda = Array.isArray(item.agenda) ? item.agenda.map(entry => {
            if (!entry || typeof entry !== "object" || !days.has(String(entry.date || ""))) return null;
            const kind = ["meal", "activity", "program"].includes(entry.kind) ? entry.kind : "program";
            return {
                id: String(entry.id || crypto.randomUUID()),
                date: String(entry.date),
                time: String(entry.time || ""),
                end_time: String(entry.end_time || ""),
                kind,
                meal_type: kind === "meal" ? String(entry.meal_type || "") : "",
                source_type: ["recipe", "activity"].includes(entry.source_type) ? entry.source_type : "",
                source_id: String(entry.source_id || ""),
                shared: entry.shared !== false,
                departments: Array.isArray(entry.departments) ? [...new Set(entry.departments.filter(department => DEPARTMENTS.includes(department)))] : [],
                title: String(entry.title || "").trim(),
                responsible: String(entry.responsible || "").trim(),
                notes: String(entry.notes || "").trim()
            };
        }).filter(entry => entry?.title) : [];
        const responsibilities = Array.isArray(item.responsibilities) ? item.responsibilities.map(entry => {
            const responsibility = {
                id: String(entry?.id || crypto.randomUUID()),
                person: String(entry?.person || "").trim(),
                role: String(entry?.role || "").trim(),
                role_description: String(entry?.role_description || "").trim(),
                description: String(entry?.description || "").trim()
            };
            return responsibility;
        }).filter(entry => entry.person || entry.role || entry.description) : [];
        return {
            id,
            title: String(item.title).trim(),
            description: String(item.description || "").trim(),
            type: String(item.type || "Övrigt"),
            start_date: startDate,
            end_date: endDate,
            start_time: String(item.start_time || ""),
            end_time: String(item.end_time || ""),
            location: String(item.location || "").trim(),
            status: ["planned", "completed", "cancelled"].includes(item.status) ? item.status : "planned",
            departments,
            planning_ref: item.planning_ref && typeof item.planning_ref === "object" ? {
                id: String(item.planning_ref.id || ""),
                name: String(item.planning_ref.name || "")
            } : null,
            agenda,
            responsibilities,
            notes: String(item.notes || "").trim(),
            experience: String(item.experience || item.after_notes || "").trim(),
            created_by: item.created_by || null,
            share_token: item.share_token || null,
            local_only: Boolean(item.local_only),
            updated_at: String(item.updated_at || new Date().toISOString())
        };
    }

    function readLocal() {
        try {
            const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
            return Array.isArray(parsed) ? parsed.map(normalize).filter(Boolean) : [];
        } catch {
            return [];
        }
    }

    function writeLocal() {
        arrangements.sort((left, right) => left.start_date.localeCompare(right.start_date) || left.title.localeCompare(right.title, "sv"));
        localStorage.setItem(STORAGE_KEY, JSON.stringify(arrangements));
        onChange?.(getAll());
    }

    function getAll() {
        return arrangements.map(item => ({
            ...item,
            departments: [...item.departments],
            agenda: item.agenda.map(entry => ({ ...entry, departments: [...entry.departments] })),
            responsibilities: item.responsibilities.map(entry => ({ ...entry })),
            planning_ref: item.planning_ref ? { ...item.planning_ref } : null
        }));
    }

    async function reload() {
        const local = readLocal();
        arrangements = local;
        if (!canRead()) {
            loadedForKarId = null;
            writeLocal();
            return getAll();
        }

        const currentKarId = karId();
        try {
            const { data, error } = await client().from("arrangemang").select("id, kar_id, created_by, data, updated_at, share_token").eq("kar_id", currentKarId);
            if (error) throw error;
            const remote = (data || []).map(row => normalize({ ...row.data, id: row.id, created_by: row.created_by, updated_at: row.updated_at, share_token: row.share_token || row.data?.share_token, local_only: false })).filter(Boolean);
            const remoteIds = new Set(remote.map(item => item.id));
            const pendingById = new Map(local.filter(item => item.local_only).map(item => [item.id, item]));
            arrangements = remote.map(item => pendingById.get(item.id) || item);
            arrangements.push(...local.filter(item => item.local_only && !remoteIds.has(item.id)));
            loadedForKarId = currentKarId;
            if (canWrite()) {
                for (const pending of [...pendingById.values()]) {
                    await save(pending);
                }
            }
        } catch (error) {
            console.error("Kunde inte hämta arrangemang", error);
        }
        writeLocal();
        return getAll();
    }

    async function loadShared() {
        const status = document.getElementById("arrangementSyncStatus");
        arrangements = [];
        onChange?.([]);
        if (status) status.textContent = "Hämtar delat arrangemang...";
        if (!client()) {
            if (status) status.textContent = "Delningslänken kräver en databaskoppling.";
            return;
        }
        try {
            const { data, error } = await client().rpc("get_shared_arrangement", { requested_token: sharedToken });
            if (error) throw error;
            const row = Array.isArray(data) ? data[0] : data;
            const item = row?.data && typeof row.data === "object"
                ? normalize({ ...row.data, id: row.id, share_token: null, local_only: false, read_only: true })
                : null;
            if (!item) throw new Error("Arrangemanget kunde inte hittas.");
            arrangements = [item];
            onChange?.(getAll());
            if (status) status.textContent = "Delat arrangemang · skrivskyddad visning";
        } catch (error) {
            console.error("Kunde inte hämta delat arrangemang", error);
            if (status) status.textContent = "Det delade arrangemanget kunde inte hittas eller är inte längre delat.";
        }
    }

    async function save(input) {
        const item = normalize({ ...input, updated_at: new Date().toISOString() });
        if (!item) throw new Error("Kontrollera titel och datumintervall.");
        item.created_by = item.created_by || auth()?.getUser?.()?.id || null;
        item.local_only = !canWrite();
        const index = arrangements.findIndex(existing => existing.id === item.id);
        if (index < 0) arrangements.push(item); else arrangements[index] = item;
        writeLocal();
        if (!canWrite()) return { item, localOnly: true };

        const row = {
            id: item.id,
            kar_id: karId(),
            created_by: item.created_by,
            title: item.title,
            start_date: item.start_date,
            end_date: item.end_date,
            status: item.status,
            share_token: item.share_token || null,
            data: item
        };
        try {
            const { error } = await client().from("arrangemang").upsert(row, { onConflict: "id" });
            if (error) throw error;
            item.local_only = false;
            const savedIndex = arrangements.findIndex(existing => existing.id === item.id);
            if (savedIndex >= 0) arrangements[savedIndex] = item;
            writeLocal();
            return { item, localOnly: false };
        } catch (error) {
            item.local_only = true;
            const savedIndex = arrangements.findIndex(existing => existing.id === item.id);
            if (savedIndex >= 0) arrangements[savedIndex] = item;
            writeLocal();
            return { item, localOnly: true, error };
        }
    }

    async function remove(id) {
        const existing = arrangements.find(item => item.id === id);
        arrangements = arrangements.filter(item => item.id !== id);
        writeLocal();
        if (!existing || existing.local_only || !canWrite()) return { localOnly: true };
        const { error } = await client().from("arrangemang").delete().eq("id", id).eq("kar_id", karId());
        if (error) {
            arrangements.push(existing);
            writeLocal();
            throw error;
        }
        return { localOnly: false };
    }

    function onAuthChange() {
        if (sharedToken !== null) {
            loadShared();
            return;
        }
        const currentKarId = canRead() ? karId() : null;
        if (loadedForKarId === currentKarId) {
            onChange?.(getAll());
            return;
        }
        reload();
    }

    window.addEventListener("online", () => {
        loadedForKarId = null;
        onAuthChange();
    });

    window.GTScoutArrangements = {
        init(config) {
            onChange = config?.onChange || null;
            const params = new URLSearchParams(window.location.search);
            sharedToken = params.has("share") ? params.get("share") : null;
            if (sharedToken !== null) {
                document.body.classList.add("shared-arrangement-view");
                auth()?.onChange?.(onAuthChange);
                return;
            }
            arrangements = readLocal();
            onChange?.(getAll());
            auth()?.onChange?.(onAuthChange);
            onAuthChange();
        },
        getAll,
        canRead,
        canWrite,
        reload,
        save,
        remove
    };
})();
