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

        try {
            if (upserts.length) {
                const { error } = await client()
                    .from("badge_notes")
                    .upsert(upserts, { onConflict: "kar_id,badge_id" });
                if (error) throw error;
            }
            if (removals.length) {
                const { error } = await client()
                    .from("badge_notes")
                    .delete()
                    .eq("kar_id", kar)
                    .in("badge_id", removals);
                if (error) throw error;
            }
        } catch (error) {
            console.error("Kunde inte spara anteckningar till databasen", error);
        }
    }

    function scheduleSave(badgeId, note) {
        if (!canWrite() || !badgeId) return;
        pending.set(badgeId, String(note ?? ""));
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(flush, SAVE_DELAY_MS);
    }

    function scheduleSaveAll(notes) {
        Object.entries(notes || {}).forEach(([badgeId, note]) => scheduleSave(badgeId, note));
    }

    async function load() {
        if (!canRead()) return;
        try {
            const { data, error } = await client()
                .from("badge_notes")
                .select("badge_id, note")
                .eq("kar_id", karId());
            if (error) throw error;

            const remote = {};
            (data || []).forEach(row => {
                if (row.note && row.note.trim()) remote[row.badge_id] = row.note;
            });

            const local = readLocal();
            if (!Object.keys(remote).length && Object.keys(local).length && canWrite()) {
                scheduleSaveAll(local);
                return;
            }

            writeLocal(remote);
            onChange?.();
        } catch (error) {
            console.error("Kunde inte hämta anteckningar från databasen", error);
        }
    }

    function onAuthChange() {
        if (!canRead()) {
            loadedForKarId = null;
            writeLocal({});
            onChange?.();
            return;
        }
        if (loadedForKarId === karId()) return;
        loadedForKarId = karId();
        load();
    }

    window.GTScoutNotes = {
        canRead,
        canWrite,
        scheduleSave,
        scheduleSaveAll,
        reload: load,
        init(config) {
            onChange = config?.onChange || null;
            auth()?.onChange(onAuthChange);
        }
    };
})();
