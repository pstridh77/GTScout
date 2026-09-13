(function () {
    const STORAGE_KEY = "gtscout_scouts";
    let scouts = [];
    let badges = {};
    let onChange = null;
    let loadedForKarId = null;
    let saveTimer = null;
    const pendingDeletions = new Set();

    const auth = () => window.GTScoutAuth;
    const client = () => auth()?.getClient() || null;
    const karId = () => auth()?.getState?.().karId || null;
    const canRead = () => Boolean(client() && auth()?.isSignedIn?.() && karId() && auth()?.isLeader?.());
    const canWrite = () => canRead() && auth()?.isLeader?.();

    function readLocal() {
        try {
            const value = JSON.parse(localStorage.getItem(STORAGE_KEY));
            return Array.isArray(value) ? value : [];
        } catch {
            return [];
        }
    }

    function writeLocal() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(scouts));
        onChange?.();
    }

    async function load() {
        if (!canRead()) return;
        try {
            const [{ data: scoutRows, error: scoutError }, { data: badgeRows, error: badgeError }] = await Promise.all([
                client().from("scouts").select("id, medlemsnummer, namn, fodelsedatum, fodelsear, aktiv").eq("kar_id", karId()).order("namn"),
                client().from("scout_badges").select("scout_id, badge_id, status, antal")
            ]);
            if (scoutError) throw scoutError;
            if (badgeError) throw badgeError;
            scouts = (scoutRows || []).map(scout => ({ ...scout, fodelsear: Number(scout.fodelsear), statuses: {} }));
            (badgeRows || []).forEach(row => {
                const scout = scouts.find(item => item.id === row.scout_id);
                if (scout) {
                    scout.statuses[row.badge_id] = row.status;
                    scout.counts = scout.counts || {};
                    scout.counts[row.badge_id] = Number(row.antal) || 0;
                }
            });
            writeLocal();
        } catch (error) {
            console.error("Kunde inte hämta scouter", error);
            scouts = [];
            onChange?.();
        }
    }

    async function flush() {
        saveTimer = null;
        if (!canWrite()) return;
        const rows = scouts.map(scout => ({
            id: scout.id,
            kar_id: karId(),
            medlemsnummer: scout.medlemsnummer || null,
            namn: scout.namn,
            fodelsedatum: scout.fodelsedatum || null,
            fodelsear: scout.fodelsear,
            aktiv: scout.aktiv !== false,
            created_by: auth().getUser()?.id || null
        }));
        const { error } = await client().from("scouts").upsert(rows, { onConflict: "id" });
        if (error) console.error("Kunde inte spara scouter", error);
        const badgeRows = scouts.flatMap(scout => {
            const badgeIds = new Set([
                ...Object.keys(scout.statuses || {}),
                ...Object.keys(scout.counts || {})
            ]);
            return [...badgeIds].map(badge_id => ({
                scout_id: scout.id,
                badge_id,
                status: scout.statuses?.[badge_id] || "not_started",
                antal: Number(scout.counts?.[badge_id]) || 0,
                updated_by: auth().getUser()?.id || null
            }));
        });
        const { error: badgeError } = await client().from("scout_badges").upsert(badgeRows, { onConflict: "scout_id,badge_id" });
        if (badgeError) console.error("Kunde inte spara märkesstatus", badgeError);
        if (pendingDeletions.size > 0) {
            const ids = [...pendingDeletions];
            const { error: deleteError } = await client()
                .from("scouts")
                .delete()
                .eq("kar_id", karId())
                .in("id", ids);
            if (deleteError) {
                console.error("Kunde inte ta bort scouter", deleteError);
            } else {
                ids.forEach(id => pendingDeletions.delete(id));
            }
        }
    }

    function scheduleSave() {
        if (!canWrite()) return;
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(flush, 500);
    }

    function notify() {
        writeLocal();
        scheduleSave();
    }

    function onAuthChange() {
        if (!canRead()) {
            loadedForKarId = null;
            scouts = [];
            onChange?.();
            return;
        }
        if (loadedForKarId === karId()) return;
        loadedForKarId = karId();
        load();
    }

    window.GTScoutScouts = {
        init(config) {
            onChange = config?.onChange || null;
            badges = config?.badges || {};
            scouts = canRead() ? readLocal() : [];
            auth()?.onChange(onAuthChange);
            onChange?.();
        },
        getAll: () => scouts,
        canWrite,
        add(scout) {
            scouts.push({ ...scout, statuses: {}, counts: {} });
            notify();
        },
        upsertMany(importedScouts) {
            importedScouts.forEach(importedScout => {
                const existing = importedScout.medlemsnummer
                    ? scouts.find(scout => scout.medlemsnummer === importedScout.medlemsnummer)
                    : null;
                if (existing) {
                    existing.namn = importedScout.namn;
                    existing.fodelsedatum = importedScout.fodelsedatum;
                    existing.fodelsear = importedScout.fodelsear;
                    existing.aktiv = true;
                } else {
                    scouts.push({ ...importedScout, id: crypto.randomUUID(), statuses: {}, counts: {} });
                }
            });
            notify();
        },
        remove(id) {
            pendingDeletions.add(id);
            scouts = scouts.filter(scout => scout.id !== id);
            notify();
        },
        removeMany(ids) {
            const idsToRemove = new Set(ids);
            idsToRemove.forEach(id => pendingDeletions.add(id));
            scouts = scouts.filter(scout => !idsToRemove.has(scout.id));
            notify();
        },
        setStatus(scoutId, badgeId, status) {
            const scout = scouts.find(item => item.id === scoutId);
            if (!scout) return;
            scout.statuses = scout.statuses || {};
            if (status === "not_started") delete scout.statuses[badgeId];
            else scout.statuses[badgeId] = status;
            notify();
        },
        setCount(scoutId, badgeId, count) {
            const scout = scouts.find(item => item.id === scoutId);
            if (!scout) return;
            scout.counts = scout.counts || {};
            const safeCount = Math.max(0, Math.floor(Number(count) || 0));
            if (safeCount === 0) delete scout.counts[badgeId];
            else scout.counts[badgeId] = safeCount;
            scout.statuses = scout.statuses || {};
            if (safeCount === 0) delete scout.statuses[badgeId];
            else scout.statuses[badgeId] = safeCount >= 5 ? "completed" : "in_progress";
            notify();
        }
    };
})();
