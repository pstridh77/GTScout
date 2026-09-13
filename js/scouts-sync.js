(function () {
    const STORAGE_KEY = "gtscout_scouts";
    let scouts = [];
    let badges = {};
    let onChange = null;
    let loadedForKarId = null;
    let saveTimer = null;

    const auth = () => window.GTScoutAuth;
    const client = () => auth()?.getClient() || null;
    const karId = () => auth()?.getState?.().karId || null;
    const canRead = () => Boolean(client() && auth()?.isSignedIn?.() && karId());
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
                client().from("scouts").select("id, namn, fodelsear, aktiv").eq("kar_id", karId()).order("namn"),
                client().from("scout_badges").select("scout_id, badge_id, status")
            ]);
            if (scoutError) throw scoutError;
            if (badgeError) throw badgeError;
            scouts = (scoutRows || []).map(scout => ({ ...scout, fodelsear: Number(scout.fodelsear), statuses: {} }));
            (badgeRows || []).forEach(row => {
                const scout = scouts.find(item => item.id === row.scout_id);
                if (scout) scout.statuses[row.badge_id] = row.status;
            });
            writeLocal();
        } catch (error) {
            console.error("Kunde inte hämta scouter", error);
            scouts = readLocal();
            onChange?.();
        }
    }

    async function flush() {
        saveTimer = null;
        if (!canWrite()) return;
        const rows = scouts.map(scout => ({
            id: scout.id,
            kar_id: karId(),
            namn: scout.namn,
            fodelsear: scout.fodelsear,
            aktiv: scout.aktiv !== false,
            created_by: auth().getUser()?.id || null
        }));
        const { error } = await client().from("scouts").upsert(rows, { onConflict: "id" });
        if (error) console.error("Kunde inte spara scouter", error);
        const badgeRows = scouts.flatMap(scout => Object.entries(scout.statuses || {})
            .filter(([, status]) => status && status !== "not_started")
            .map(([badge_id, status]) => ({ scout_id: scout.id, badge_id, status, updated_by: auth().getUser()?.id || null })));
        const { error: badgeError } = await client().from("scout_badges").upsert(badgeRows, { onConflict: "scout_id,badge_id" });
        if (badgeError) console.error("Kunde inte spara märkesstatus", badgeError);
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
            scouts = readLocal();
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
            scouts = readLocal();
            auth()?.onChange(onAuthChange);
            onChange?.();
        },
        getAll: () => scouts,
        canWrite,
        add(scout) {
            scouts.push({ ...scout, statuses: {} });
            notify();
        },
        remove(id) {
            scouts = scouts.filter(scout => scout.id !== id);
            notify();
        },
        setStatus(scoutId, badgeId, status) {
            const scout = scouts.find(item => item.id === scoutId);
            if (!scout) return;
            scout.statuses = scout.statuses || {};
            if (status === "not_started") delete scout.statuses[badgeId];
            else scout.statuses[badgeId] = status;
            notify();
        }
    };
})();
