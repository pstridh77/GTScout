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
    let loadedForUserId = null;
    let loadRevision = 0;
    let sharedToken = null;

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

    function formatErrorPart(value) {
        if (value === undefined || value === null || value === "") return "";
        return String(value).replace(/\s+/g, " ").trim().slice(0, 240);
    }

    function withDatabaseError(operation, error) {
        if (error?.syncOperation) return error;
        const status = error?.status ?? error?.statusCode;
        const parts = [operation, `tid=${new Date().toISOString()}`];
        if (error?.code) parts.push(`kod=${formatErrorPart(error.code)}`);
        parts.push(status === undefined ? "HTTP-status saknas" : `HTTP=${formatErrorPart(status)}`);
        for (const [label, value] of [["fel", error?.message], ["detaljer", error?.details], ["hint", error?.hint]]) {
            const part = formatErrorPart(value);
            if (part) parts.push(`${label}=${part}`);
        }
        const diagnosed = new Error(parts.join(" | "));
        diagnosed.name = error?.name || "DatabaseError";
        diagnosed.syncOperation = operation;
        return diagnosed;
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
            share_token: group.share_token || null,
            visibility: group.visibility || "kar_edit",
            data: group
        };
    }

    async function fetchGroups() {
        let result;
        try {
            result = await client()
                .from("planeringar")
                .select("id, created_by, data, visibility, share_token")
                .eq("kar_id", karId());
        } catch (error) {
            throw withDatabaseError("planeringar.select", error);
        }
        if (result.error) throw withDatabaseError("planeringar.select", result.error);
        const { data } = result;
        return (data || [])
            .map(row => (row.data && typeof row.data === "object" ? { ...row.data, id: row.id, created_by: row.created_by || null, share_token: row.share_token || row.data.share_token || null, visibility: row.visibility || row.data.visibility || "kar_edit" } : null))
            .filter(Boolean);
    }

    function canWriteRow(group) {
        if (auth().isAdmin()) return true;
        const userId = auth().getUser()?.id;
        if (userId && group.created_by === userId) return true;
        return (group.visibility || "kar_edit") === "kar_edit";
    }

    async function pushGroups(groups, addOnly = false) {
        // Rader som användaren inte får ändra (t.ex. andras privata/kar_view-planeringar)
        // utesluts så att upsert inte stöter på RLS-fel för dem.
        // local_only-rader (avböjd uppladdning) ska inte heller skrivas.
        const rows = groups.filter(group => group?.id && !group.local_only && canWriteRow(group)).map(toRow);
        const currentKarId = karId();
        const currentUserId = auth().getUser()?.id || null;
        const writeGuard = () => canWrite() && karId() === currentKarId && (auth().getUser()?.id || null) === currentUserId;
        if (rows.length) {
            try {
                await window.GTScoutSyncRetry.withRetry(async () => {
                    const result = await client().from("planeringar").upsert(rows, { onConflict: "id" });
                    if (result.error) throw result.error;
                }, writeGuard);
            } catch (error) {
                throw withDatabaseError("planeringar.upsert", error);
            }
        }

        if (addOnly) return;
        const keepIds = rows.map(row => row.id);
        if (!auth().isAdmin() && !currentUserId) throw new Error("Kunde inte fastställa användarens identitet för borttagning.");
        try {
            await window.GTScoutSyncRetry.withRetry(async () => {
                let deleteQuery = client().from("planeringar").delete().eq("kar_id", currentKarId);
                if (!auth().isAdmin()) {
                    deleteQuery = deleteQuery.eq("created_by", currentUserId);
                }
                if (keepIds.length) {
                    deleteQuery = deleteQuery.not("id", "in", `(${keepIds.join(",")})`);
                }
                const deleteResult = await deleteQuery;
                if (deleteResult.error) throw deleteResult.error;
            }, writeGuard);
        } catch (error) {
            throw withDatabaseError("planeringar.delete", error);
        }
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
            const diagnosed = withDatabaseError("planeringar.save", error);
            console.error("Kunde inte spara planeringar till databasen", { diagnostic: diagnosed.message, error });
            setStatus(`Kunde inte spara till databasen – ändringarna finns kvar lokalt. ${diagnosed.message}`, true);
        }
    }

    function scheduleSave(groups) {
        if (!canWrite()) return;
        pendingGroups = groups.map(group => JSON.parse(JSON.stringify(group)));
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(flush, SAVE_DELAY_MS);
    }

    function confirmUpload(groups, revision) {
        return window.GTScoutLocalChanges.confirm({
            kind: "planeringar",
            localData: groups,
            isCurrent: () => revision === loadRevision && canWrite(),
            items: groups.map(group => ({
                title: group.name || "Namnlös planering",
                detail: [group.year, group.term].filter(value => value !== undefined && value !== null && value !== "").join(" · ")
            }))
        });
    }

    async function load() {
        if (!hooks || !canRead()) return;
        const revision = ++loadRevision;
        try {
            setStatus("Hämtar planeringar...", false);
            const remote = await fetchGroups();
            if (revision !== loadRevision || !canRead()) return;
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
            const keepLocalNew = () => {
                localNew.forEach(g => { g.local_only = true; });
                hooks.applyGroups([...remote, ...localNew]);
                setStatus(`Synkad med databasen (${remote.length} planeringar) – ${localNew.length} planering(ar) sparas lokalt i den här webbläsaren.`, false);
            };

            if (!remote.length && local.length) {
                const action = await confirmUpload(local, revision);
                if (revision !== loadRevision || !canWrite()) return;
                if (action === "upload") {
                    const userId = auth().getUser()?.id || null;
                    const userName = auth().getProfile()?.full_name || auth().getProfile()?.email || "";
                    local.forEach(g => {
                        delete g.local_only;
                        if (!g.created_by) {
                            g.created_by = userId;
                            g.created_by_name = userName;
                        }
                    });
                    await pushGroups(local, true);
                    if (revision !== loadRevision || !canRead()) return;
                    hooks.applyGroups(local);
                    setStatus(`Sparade ${local.length} planeringar i kårens databas`, false);
                    return;
                }
                if (action === "delete") {
                    hooks.applyGroups([]);
                    setStatus("Lokala planeringar har tagits bort.", false);
                    return;
                }
                keepLocalNew();
                return;
            }

            if (remote.length && localNew.length) {
                const action = await confirmUpload(localNew, revision);
                if (revision !== loadRevision || !canWrite()) return;
                if (action === "upload") {
                    const userId = auth().getUser()?.id || null;
                    const userName = auth().getProfile()?.full_name || auth().getProfile()?.email || "";
                    localNew.forEach(g => {
                        delete g.local_only;
                        if (!g.created_by) {
                            g.created_by = userId;
                            g.created_by_name = userName;
                        }
                    });
                    const combined = [...remote, ...localNew];
                    await pushGroups(localNew, true);
                    if (revision !== loadRevision || !canRead()) return;
                    hooks.applyGroups(combined);
                    setStatus(`Synkad med databasen (${combined.length} planeringar)`, false);
                    return;
                }
                if (action === "delete") {
                    hooks.applyGroups(remote);
                    setStatus(`Synkad med databasen (${remote.length} planeringar) – lokala planeringar har tagits bort.`, false);
                    return;
                }
                keepLocalNew();
                return;
            }

            hooks.applyGroups(remote);
            setStatus(`Synkad med databasen (${remote.length} planeringar)`, false);
        } catch (error) {
            if (revision !== loadRevision || !canRead()) return;
            const diagnosed = withDatabaseError("planeringar.load", error);
            console.error("Kunde inte hämta planeringar från databasen", { diagnostic: diagnosed.message, error });
            setStatus(`Kunde inte hämta från databasen – använder lokal data. ${diagnosed.message}`, true);
        }
    }

    async function loadShared() {
        if (!hooks || !sharedToken || !client()) return;
        try {
            const { data, error } = await client().rpc("get_shared_planning", { requested_token: sharedToken });
            if (error) throw error;
            const row = Array.isArray(data) ? data[0] : data;
            if (!row?.data || typeof row.data !== "object") throw new Error("Planeringen kunde inte hittas.");
            hooks.applyGroups([{ ...row.data, id: row.id, share_token: null, visibility: "kar_view", shared_view: true }]);
            setStatus("Delad planering – skrivskyddad visning", false);
        } catch (error) {
            console.error("Kunde inte hämta delad planering", error);
            setStatus("Den delade planeringen kunde inte hittas eller är inte längre delad.", true);
        }
    }

    function onAuthChange() {
        if (auth()?.getState().loading) {
            setStatus("Kontrollerar inloggning...", false);
            return;
        }
        if (!canRead()) {
            const wasLoaded = loadedForKarId !== null;
            loadedForKarId = null;
            loadedForUserId = null;
            loadRevision++;
            if (saveTimer) clearTimeout(saveTimer);
            saveTimer = null;
            pendingGroups = null;
            setStatus(auth()?.isOnline() ? "Du är inte inloggad – planeringar sparas bara i den här webbläsaren." : "", false);
            if (wasLoaded && hooks) {
                // Endast om användaren tidigare var inloggad i en kår och nu loggat ut
                hooks.applyGroups([]);
            }
            return;
        }
        const userId = auth().getUser()?.id || null;
        if (loadedForKarId === karId() && loadedForUserId === userId) return;
        loadedForKarId = karId();
        loadedForUserId = userId;
        load();
    }

    window.GTScoutPlanningSync = {
        canRead,
        canWrite,
        scheduleSave,
        reload: load,
        init(config) {
            hooks = config;
            sharedToken = config.ignoreShared ? null : new URLSearchParams(window.location.search).get("share");
            if (sharedToken) {
                document.body.classList.add("shared-planning-view");
                auth()?.onChange(() => loadShared());
                return;
            }
            auth()?.onChange(onAuthChange);
        }
    };
})();
