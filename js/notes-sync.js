/**
 * Synkar märkesanteckningar mot Supabase. Anteckningarna är kårgemensamma:
 * alla inloggade i kåren läser dem, ledare och admin får spara.
 * localStorage används alltid som lokal kopia och som enda lagring i offline-läge.
 */
(function () {
    const STORAGE_KEY = "gtscout_badge_notes";
    const UNSYNCED_STORAGE_KEY = "gtscout_badge_notes_unsynced";
    const SAVE_DELAY_MS = 800;

    let onChange = null;
    let getBadges = async () => [];
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

    function readUnsyncedIds() {
        try {
            const ids = JSON.parse(localStorage.getItem(UNSYNCED_STORAGE_KEY) || "[]");
            if (!Array.isArray(ids)) throw new Error("Ogiltigt format för anteckningarnas synkstatus.");
            return new Set(ids);
        } catch (error) {
            console.error("Kunde inte läsa anteckningarnas synkstatus", error);
            return new Set(Object.keys(readLocal()));
        }
    }

    function markUnsynced(badgeId) {
        const ids = readUnsyncedIds();
        ids.add(badgeId);
        localStorage.setItem(UNSYNCED_STORAGE_KEY, JSON.stringify([...ids]));
    }

    function markSaved(entries) {
        const ids = readUnsyncedIds();
        const local = readLocal();
        entries.forEach(([badgeId, note]) => {
            if (String(local[badgeId] || "") === note) ids.delete(badgeId);
        });
        localStorage.setItem(UNSYNCED_STORAGE_KEY, JSON.stringify([...ids]));
        onChange?.();
    }

    function isLocalOnly(badgeId) {
        const note = readLocal()[badgeId];
        return Boolean(typeof note === "string" && note.trim()
            && (!auth()?.isSignedIn?.() || readUnsyncedIds().has(badgeId)));
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
                if (writeGuard()) markSaved(entries.filter(([, note]) => note.trim()));
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
                if (writeGuard()) markSaved(entries.filter(([, note]) => !note.trim()));
            }
        } catch (error) {
            console.error("Kunde inte spara anteckningar till databasen", error);
        }
    }

    function scheduleSave(badgeId, note) {
        if (!badgeId) return;
        markUnsynced(badgeId);
        onChange?.();
        if (!canWrite()) return;
        pending.set(badgeId, String(note ?? ""));
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(flush, SAVE_DELAY_MS);
    }

    function scheduleSaveAll(notes) {
        Object.entries(notes || {}).forEach(([badgeId, note]) => scheduleSave(badgeId, note));
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
            localStorage.setItem(UNSYNCED_STORAGE_KEY, JSON.stringify(newOrDifferentKeys));
            onChange?.();

            if (newOrDifferentKeys.length && canWrite()) {
                const badges = await getBadges();
                if (revision !== loadRevision || !canWrite()) return;
                const action = await window.GTScoutLocalChanges.confirm({
                    kind: "märkesanteckningar",
                    localData: newOrDifferentKeys.map(badgeId => ({ badgeId, note: local[badgeId] })),
                    isCurrent: () => revision === loadRevision && canWrite(),
                    items: newOrDifferentKeys.map(badgeId => ({
                        title: badges.find(badge => String(badge.id) === badgeId)?.namn || `Okänt märke (${badgeId})`,
                        text: local[badgeId],
                        remoteText: remote[badgeId]
                    }))
                });
                if (revision !== loadRevision || !canWrite()) return;
                if (action === "upload") {
                    const merged = { ...remote };
                    newOrDifferentKeys.forEach(k => { merged[k] = local[k]; });
                    writeLocal(merged);
                    newOrDifferentKeys.forEach(badgeId => scheduleSave(badgeId, local[badgeId]));
                    onChange?.();
                    return;
                }
                if (action === "delete") {
                    writeLocal(remote);
                    localStorage.setItem(UNSYNCED_STORAGE_KEY, "[]");
                    onChange?.();
                    return;
                }
                writeLocal({ ...remote, ...Object.fromEntries(newOrDifferentKeys.map(k => [k, local[k]])) });
                onChange?.();
                return;
            }

            writeLocal({ ...remote, ...Object.fromEntries(newOrDifferentKeys.map(k => [k, local[k]])) });
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
            }
            onChange?.();
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
            getBadges = config?.getBadges || getBadges;
            auth()?.onChange(onAuthChange);
            window.addEventListener("storage", event => {
                if (event.key === STORAGE_KEY || event.key === UNSYNCED_STORAGE_KEY || event.key === null) onChange?.();
            });
        }
    };
})();
