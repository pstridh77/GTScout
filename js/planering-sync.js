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
        el.classList.toggle("detail-note-warning", !isError && /lokalt|lokal data|den här webbläsaren/i.test(text || ""));
    }

    function toRow(group) {
        return {
            id: group.id,
            kar_id: karId(),
            created_by: group.created_by || auth().getUser()?.id || null,
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
            .select("id, created_by, data")
            .eq("kar_id", karId());
        if (error) throw error;
        return (data || [])
            .map(row => (row.data && typeof row.data === "object" ? { ...row.data, id: row.id, created_by: row.created_by || null } : null))
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
        if (!auth().isAdmin()) {
            const userId = auth().getUser()?.id;
            if (!userId) throw new Error("Kunde inte fastställa användarens identitet för borttagning.");
            deleteQuery = deleteQuery.eq("created_by", userId);
        }
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
            const local = hooks.getGroups?.() || [];

            if (!canWrite()) {
                if (!remote.length) {
                    setStatus("Kåren har inga planeringar i databasen – visar lokal data.", false);
                    return;
                }
                const localOnly = local.filter(group => group?.local_only);
                hooks.applyGroups([...remote, ...localOnly]);
                setStatus(`Kårens planeringar visas (${remote.length} st) – egna planeringar sparas lokalt.`, false);
                return;
            }

            const localNew = local.filter(l => !remote.some(r => r.id === l.id));

            if (!remote.length && local.length) {
                const upload = window.confirm(
                    `Du har ${local.length} planering(ar) från när du arbetade oinloggad.\n\nVill du lägga till och spara dem i kårens databas?`
                );
                if (upload) {
                    const userId = auth().getUser()?.id || null;
                    const userName = auth().getProfile()?.full_name || auth().getProfile()?.email || "";
                    local.forEach(g => {
                        if (!g.created_by) {
                            g.created_by = userId;
                            g.created_by_name = userName;
                        }
                    });
                    await pushGroups(local);
                    hooks.applyGroups(local);
                    setStatus(`Sparade ${local.length} planeringar i kårens databas`, false);
                    return;
                }
                hooks.applyGroups([]);
                setStatus("Inga planeringar i databasen.", false);
                return;
            }

            if (remote.length && localNew.length) {
                const upload = window.confirm(
                    `Du har skapat ${localNew.length} planering(ar) när du arbetade oinloggad.\n\nVill du lägga till dem i kårens databas tillsammans med kårens befintliga planeringar (${remote.length} st)?`
                );
                if (upload) {
                    const userId = auth().getUser()?.id || null;
                    const userName = auth().getProfile()?.full_name || auth().getProfile()?.email || "";
                    localNew.forEach(g => {
                        if (!g.created_by) {
                            g.created_by = userId;
                            g.created_by_name = userName;
                        }
                    });
                    const combined = [...remote, ...localNew];
                    await pushGroups(combined);
                    hooks.applyGroups(combined);
                    setStatus(`Synkad med databasen (${combined.length} planeringar)`, false);
                    return;
                }
            }

            hooks.applyGroups(remote);
            setStatus(`Synkad med databasen (${remote.length} planeringar)`, false);
        } catch (error) {
            console.error("Kunde inte hämta planeringar från databasen", error);
            setStatus("Kunde inte hämta från databasen – använder lokal data.", true);
        }
    }

    function onAuthChange() {
        if (!canRead()) {
            const wasLoaded = loadedForKarId !== null;
            loadedForKarId = null;
            setStatus(auth()?.isOnline() ? "Du är inte inloggad – planeringar sparas bara i den här webbläsaren." : "", false);
            if (wasLoaded && hooks) {
                // Endast om användaren tidigare var inloggad i en kår och nu loggat ut
                hooks.applyGroups([]);
            }
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
