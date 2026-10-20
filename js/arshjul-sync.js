(function () {
    const STORAGE_KEY = "gtscout_arshjul";
    let wheels = [];
    let onChange = null;
    let loadedForKarId = null;
    let loadedForUserId = null;
    let revision = 0;
    const pendingWrites = new Map();
    let status = null;
    let detachedWheels = [];

    const auth = () => window.GTScoutAuth;
    const client = () => auth()?.getClient?.() || null;
    const karId = () => auth()?.getState?.().karId || null;
    const canRead = () => Boolean(client() && auth()?.isSignedIn?.() && karId());
    const canWrite = () => Boolean(canRead() && auth()?.isLeader?.());

    function setStatus(message, isError = false) {
        if (!status) return;
        status.textContent = message;
        status.classList.toggle("hidden", !message);
        status.classList.toggle("planning-sync-status--error", isError);
    }

    function readLocal() {
        try {
            const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
            return Array.isArray(value) ? value.filter(item => item && typeof item === "object") : [];
        } catch (error) {
            console.error("Kunde inte läsa lokala årshjul", error);
            setStatus("Kunde inte läsa lokalt sparade årshjul.", true);
            return [];
        }
    }

    function writeLocal() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify([...detachedWheels, ...wheels]));
    }

    function notify(source = "change") {
        onChange?.(wheels, source);
    }

    async function enqueueWrite(id, operation) {
        const previous = pendingWrites.get(id) || Promise.resolve();
        const next = previous.then(operation, operation);
        pendingWrites.set(id, next);
        try {
            await next;
        } finally {
            if (pendingWrites.get(id) === next) pendingWrites.delete(id);
        }
    }

    function isCurrentContext(currentRevision, currentKarId, currentUserId) {
        return currentRevision === revision && canWrite()
            && currentKarId === karId() && currentUserId === auth().getUser()?.id;
    }

    async function saveWheel(wheel) {
        const currentRevision = revision;
        const currentKarId = karId();
        const currentUserId = auth()?.getUser?.()?.id || null;
        const existing = wheels.find(item => item.id === wheel.id);
        const payload = {
            ...wheel,
            local_kar_id: wheel.local_kar_id || (canRead() ? karId() : null),
            updated_at: new Date().toISOString(),
            local_only: true
        };
        if (existing) wheels = wheels.map(item => item.id === payload.id ? payload : item);
        else wheels = [...wheels, payload];
        writeLocal();
        notify();
        if (!canWrite()) {
            setStatus("Sparat lokalt. Inloggning som ledare krävs för att dela med kåren.");
            return;
        }
        await enqueueWrite(payload.id, async () => {
            if (!isCurrentContext(currentRevision, currentKarId, currentUserId)
                || wheels.find(item => item.id === payload.id) !== payload) return;
            try {
                const { error } = await client().from("arshjul").upsert({
                    id: payload.id,
                    kar_id: currentKarId,
                    created_by: payload.created_by || currentUserId,
                    name: payload.name,
                    data: payload
                }, { onConflict: "id" });
                if (!isCurrentContext(currentRevision, currentKarId, currentUserId)) return;
                if (error) throw error;
                if (wheels.find(item => item.id === payload.id) !== payload) return;
                wheels = wheels.map(item => item.id === payload.id ? { ...payload, local_only: false } : item);
                writeLocal();
                notify();
                setStatus("Årshjulet är sparat och delas med kåren.");
            } catch (error) {
                if (!isCurrentContext(currentRevision, currentKarId, currentUserId)) return;
                console.error("Kunde inte spara årshjul", error);
                setStatus(`Kunde inte spara årshjulet i databasen: ${error.message || "okänt fel"}. Ändringen finns kvar lokalt.`, true);
            }
        });
    }

    async function removeWheel(id) {
        const currentRevision = revision;
        const currentKarId = karId();
        const currentUserId = auth()?.getUser?.()?.id || null;
        const existing = wheels.find(item => item.id === id);
        wheels = wheels.filter(item => item.id !== id);
        writeLocal();
        notify();
        if (!canWrite()) return;
        await enqueueWrite(id, async () => {
            if (!isCurrentContext(currentRevision, currentKarId, currentUserId)) return;
            try {
                const { error } = await client().from("arshjul").delete().eq("id", id).eq("kar_id", currentKarId);
                if (!isCurrentContext(currentRevision, currentKarId, currentUserId)) return;
                if (error) throw error;
                setStatus("Årshjulet har tagits bort.");
            } catch (error) {
                if (!isCurrentContext(currentRevision, currentKarId, currentUserId)) return;
                console.error("Kunde inte ta bort årshjul", error);
                if (existing && !wheels.some(item => item.id === id)) {
                    wheels = [...wheels, existing];
                    writeLocal();
                    notify();
                }
                setStatus(`Kunde inte ta bort årshjulet från databasen: ${error.message || "okänt fel"}.`, true);
            }
        });
    }

    async function load() {
        const currentRevision = ++revision;
        if (!canRead()) return;
        setStatus("Hämtar kårens årshjul...");
        try {
            const { data, error } = await client().from("arshjul")
                .select("id, created_by, name, data, updated_at")
                .eq("kar_id", karId())
                .order("name");
            if (error) throw error;
            if (currentRevision !== revision || !canRead()) return;
            const local = readLocal();
            const activeLocal = local.filter(item => !item.local_kar_id || item.local_kar_id === karId());
            detachedWheels = local.filter(item => item.local_only && item.local_kar_id && item.local_kar_id !== karId());
            const remote = (data || []).map(row => ({
                ...(row.data || {}),
                id: row.id,
                name: row.name || row.data?.name || "",
                created_by: row.created_by || null,
                local_kar_id: karId(),
                local_only: false
            }));
            const remoteIds = new Set(remote.map(item => item.id));
            const localOnly = activeLocal.filter(item => item.local_only);
            const localById = new Map(localOnly.map(item => [item.id, item]));
            wheels = remote.map(item => localById.get(item.id) || item);
            wheels.push(...localOnly.filter(item => !remoteIds.has(item.id)));
            writeLocal();
            setStatus(wheels.length ? `Synkad med databasen (${wheels.length} årshjul).` : "Kåren har inga årshjul ännu.");
            notify("load");
            if (canWrite()) {
                for (const pending of wheels.filter(item => item.local_only)) {
                    if (currentRevision !== revision || !canRead()) return;
                    if (pendingWrites.has(pending.id)) {
                        await pendingWrites.get(pending.id);
                        continue;
                    }
                    if (wheels.find(item => item.id === pending.id) !== pending) continue;
                    await saveWheel(pending);
                }
            }
        } catch (error) {
            if (currentRevision !== revision || !canRead()) return;
            console.error("Kunde inte hämta årshjul", error);
            setStatus(`Kunde inte hämta från databasen: ${error.message || "okänt fel"}. Visar lokal data.`, true);
            const local = readLocal();
            wheels = local.filter(item => !item.local_kar_id || item.local_kar_id === karId());
            detachedWheels = local.filter(item => item.local_only && item.local_kar_id && item.local_kar_id !== karId());
            notify();
        }
    }

    function onAuthChange() {
        if (auth()?.getState?.().loading) return;
        if (!canRead()) {
            revision++;
            loadedForKarId = null;
            loadedForUserId = null;
            const local = readLocal();
            detachedWheels = local.filter(wheel => wheel.local_only && wheel.local_kar_id);
            wheels = local.filter(wheel => wheel.local_only && !wheel.local_kar_id);
            writeLocal();
            notify("load");
            setStatus(auth()?.isOnline?.() ? "Logga in med kårtillhörighet för att visa kårens årshjul. Lokala årshjul finns kvar." : "Årshjul sparas lokalt i den här webbläsaren.");
            return;
        }
        const userId = auth().getUser()?.id || null;
        if (loadedForKarId === karId() && loadedForUserId === userId) return;
        loadedForKarId = karId();
        loadedForUserId = userId;
        load();
    }

    window.GTScoutYearWheelSync = {
        init(config) {
            onChange = config?.onChange || null;
            status = document.getElementById("yearWheelSyncStatus");
            wheels = [];
            notify();
            auth()?.onChange?.(onAuthChange);
        },
        saveWheel,
        removeWheel,
        canWrite
    };
})();
