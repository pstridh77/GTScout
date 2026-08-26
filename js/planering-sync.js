/**
 * Synkar planeringar mot Supabase för inloggade användare med kårtillhörighet.
 * Gäster läser kårens planeringar, ledare och admin får också spara.
 * localStorage används alltid som lokal kopia och som enda lagring i offline-läge.
 */
(function () {
    const SAVE_DELAY_MS = 800;

    let hooks = null;
    let saveTimer = null;
    let pendingGroups = null;
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

    function setStatus(text, isError) {
        const el = document.getElementById("planningSyncStatus");
        if (!el) return;
        el.textContent = text || "";
        el.classList.toggle("hidden", !text);
        el.classList.toggle("planning-sync-status--error", Boolean(isError));
    }

    function toRow(group) {
        return {
            id: group.id,
            kar_id: karId(),
            created_by: auth().getUser()?.id || null,
            name: group.name || "",
            level: group.level || null,
            year: Number.isFinite(Number(group.year)) && group.year !== "" ? Number(group.year) : null,
            term: group.term || null,
            data: group
        };
    }

    async function fetchGroups() {
        const { data, error } = await client()
            .from("planeringar")
            .select("id, data")
            .eq("kar_id", karId());
        if (error) throw error;
        return (data || [])
            .map(row => (row.data && typeof row.data === "object" ? { ...row.data, id: row.id } : null))
            .filter(Boolean);
    }

    async function pushGroups(groups) {
        const rows = groups.filter(group => group?.id).map(toRow);
        if (rows.length) {
            const { error } = await client().from("planeringar").upsert(rows, { onConflict: "id" });
            if (error) throw error;
        }

        const keepIds = rows.map(row => row.id);
        let deleteQuery = client().from("planeringar").delete().eq("kar_id", karId());
        if (keepIds.length) {
            deleteQuery = deleteQuery.not("id", "in", `(${keepIds.join(",")})`);
        }
        const { error: deleteError } = await deleteQuery;
        if (deleteError) throw deleteError;
    }

    async function flush() {
        saveTimer = null;
        const groups = pendingGroups;
        pendingGroups = null;
        if (!groups || !canWrite()) return;

        try {
            setStatus("Sparar till databasen...", false);
            await pushGroups(groups);
            setStatus("Sparat i databasen", false);
        } catch (error) {
            console.error("Kunde inte spara planeringar till databasen", error);
            setStatus("Kunde inte spara till databasen – ändringarna finns kvar lokalt.", true);
        }
    }

    function scheduleSave(groups) {
        if (!canWrite()) return;
        pendingGroups = groups.map(group => JSON.parse(JSON.stringify(group)));
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(flush, SAVE_DELAY_MS);
    }

    async function load() {
        if (!hooks || !canRead()) return;
        try {
            setStatus("Hämtar planeringar...", false);
            const remote = await fetchGroups();
            const local = hooks.getGroups();

            if (!remote.length && !canWrite()) {
                setStatus("Kåren har inga planeringar i databasen – visar lokal data.", false);
                return;
            }

            if (!remote.length && local.length) {
                const upload = window.confirm(
                    `Kåren har inga planeringar i databasen. Vill du ladda upp dina ${local.length} lokala planeringar?`
                );
                if (upload) {
                    await pushGroups(local);
                    setStatus("Lokala planeringar uppladdade", false);
                    return;
                }
                setStatus("Inga planeringar i databasen – arbetar lokalt.", false);
                return;
            }

            hooks.applyGroups(remote);
            setStatus(canWrite()
                ? `Synkad med databasen (${remote.length} planeringar)`
                : `Kårens planeringar visas (${remote.length} st) – dina ändringar sparas bara lokalt.`, false);
        } catch (error) {
            console.error("Kunde inte hämta planeringar från databasen", error);
            setStatus("Kunde inte hämta från databasen – använder lokal data.", true);
        }
    }

    function onAuthChange() {
        if (!canRead()) {
            loadedForKarId = null;
            setStatus(auth()?.isOnline() ? "Arbetar lokalt (inte inloggad i någon kår)" : "", false);
            return;
        }
        if (loadedForKarId === karId()) return;
        loadedForKarId = karId();
        load();
    }

    window.GTScoutPlanningSync = {
        canRead,
        canWrite,
        scheduleSave,
        reload: load,
        init(config) {
            hooks = config;
            auth()?.onChange(onAuthChange);
        }
    };
})();
