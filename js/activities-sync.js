/**
 * Synkar aktiviteter mot Supabase.
 *
 * Regler:
 * - Alla (även gäster/anon) kan läsa aktiviteter och badge-kopplingar.
 * - Endast ledare/admin i en kår kan skapa och ändra aktiviteter för sin egen kår.
 * - Endast administratörer kan radera aktiviteter för sin egen kår.
 * - localStorage används alltid som cache och fallback i lokalt läge.
 */
(function () {
    const CUSTOM_ACTIVITIES_STORAGE_KEY = "gtscout_custom_activities";
    const CUSTOM_BADGE_ACTIVITIES_STORAGE_KEY = "gtscout_custom_badge_activities";

    let activities = [];
    let badgeLinks = [];
    let loaded = false;
    let loadPromise = null;
    const listeners = new Set();

    const auth = () => window.GTScoutAuth;
    const client = () => auth()?.getClient() || null;

    function getKarId() {
        return auth()?.getState().karId || null;
    }

    function canWrite() {
        return Boolean(client() && auth()?.isSignedIn() && auth()?.isLeader() && getKarId());
    }

    function canEditActivity(activity) {
        return Boolean(canWrite() && activity?.kar_id && activity.kar_id === getKarId());
    }

    function canDeleteActivity(activity) {
        return Boolean(auth()?.isAdmin() && canEditActivity(activity));
    }

    function normalizeActivity(activity) {
        return {
            id: String(activity?.id || ""),
            namn: String(activity?.namn || "").trim(),
            kategori: String(activity?.kategori || "").trim(),
            beskrivning: String(activity?.beskrivning || "").trim(),
            tid: String(activity?.tid ?? "").trim(),
            material: Array.isArray(activity?.material)
                ? activity.material.map(item => String(item ?? "").trim()).filter(Boolean)
                : [],
            genomforande: String(activity?.genomforande || "").trim(),
            kar_id: activity?.kar_id || null,
            kar_namn: String(activity?.kar_namn || "")
        };
    }

    function normalizeBadgeLink(link) {
        return {
            kar_id: link?.kar_id || null,
            badge_id: String(link?.badge_id || "").trim(),
            activity_id: String(link?.activity_id || "").trim()
        };
    }

    function readLocalActivities() {
        try {
            const stored = JSON.parse(localStorage.getItem(CUSTOM_ACTIVITIES_STORAGE_KEY));
            return Array.isArray(stored) ? stored.map(normalizeActivity).filter(item => item.id && item.namn) : [];
        } catch {
            return [];
        }
    }

    function readLocalBadgeLinks() {
        try {
            const links = JSON.parse(localStorage.getItem(CUSTOM_BADGE_ACTIVITIES_STORAGE_KEY));
            if (!links || typeof links !== "object" || Array.isArray(links)) return [];
            const rows = [];
            Object.entries(links).forEach(([badgeId, activityIds]) => {
                if (!Array.isArray(activityIds)) return;
                activityIds.forEach(activityId => {
                    rows.push(normalizeBadgeLink({
                        kar_id: null,
                        badge_id: badgeId,
                        activity_id: activityId
                    }));
                });
            });
            return rows.filter(item => item.badge_id && item.activity_id);
        } catch {
            return [];
        }
    }

    function writeLocalActivities(nextActivities) {
        localStorage.setItem(CUSTOM_ACTIVITIES_STORAGE_KEY, JSON.stringify(nextActivities));
    }

    function writeLocalBadgeLinks(nextBadgeLinks) {
        const managedActivityIds = new Set((activities || []).map(activity => activity.id));
        const preservedLocalLinks = readLocalBadgeLinks().filter(link => !managedActivityIds.has(link.activity_id));
        const combinedLinks = [...(nextBadgeLinks || []), ...preservedLocalLinks];
        const map = {};
        combinedLinks.forEach(link => {
            if (!link.badge_id || !link.activity_id) return;
            map[link.badge_id] = map[link.badge_id] || [];
            if (!map[link.badge_id].includes(link.activity_id)) {
                map[link.badge_id].push(link.activity_id);
            }
        });
        localStorage.setItem(CUSTOM_BADGE_ACTIVITIES_STORAGE_KEY, JSON.stringify(map));
    }

    function notify() {
        const state = {
            loaded,
            activities: activities.map(item => ({ ...item })),
            badgeLinks: badgeLinks.map(item => ({ ...item }))
        };
        listeners.forEach(listener => {
            try {
                listener(state);
            } catch (error) {
                console.error("Aktivitetslyssnare kastade fel", error);
            }
        });
    }

    function upsertLocalActivity(nextActivity) {
        const index = activities.findIndex(item => item.id === nextActivity.id);
        if (index === -1) activities.push(nextActivity);
        else activities[index] = nextActivity;
        writeLocalActivities(activities);
    }

    function removeLocalActivity(activityId) {
        activities = activities.filter(item => item.id !== activityId);
        badgeLinks = badgeLinks.filter(item => item.activity_id !== activityId);
        writeLocalActivities(activities);
        writeLocalBadgeLinks(badgeLinks);
    }

    function upsertLocalBadgeLink(nextLink) {
        const exists = badgeLinks.some(link =>
            link.kar_id === nextLink.kar_id
            && link.badge_id === nextLink.badge_id
            && link.activity_id === nextLink.activity_id
        );
        if (exists) return;
        badgeLinks.push(nextLink);
        writeLocalBadgeLinks(badgeLinks);
    }

    function removeLocalBadgeLink(karId, badgeId, activityId) {
        const before = badgeLinks.length;
        badgeLinks = badgeLinks.filter(link => !(link.kar_id === karId && link.badge_id === badgeId && link.activity_id === activityId));
        if (badgeLinks.length !== before) writeLocalBadgeLinks(badgeLinks);
    }

    async function reload() {
        if (!client()) {
            activities = readLocalActivities();
            badgeLinks = readLocalBadgeLinks();
            loaded = true;
            notify();
            return;
        }

        try {
            const localCustom = readLocalActivities().filter(a => !a.kar_id && a.id && a.id.startsWith("egen-"));
            if (localCustom.length > 0 && canWrite()) {
                const uploadActs = window.confirm(
                    `Du har skapat ${localCustom.length} aktivitet(er) när du arbetade oinloggad.\n\nVill du spara dem i kårens databas?`
                );
                if (uploadActs) {
                    const karId = getKarId();
                    const userId = auth()?.getUser()?.id || null;
                    const rowsToUpsert = localCustom.map(a => ({
                        id: a.id,
                        kar_id: karId,
                        created_by: userId,
                        namn: a.namn,
                        kategori: a.kategori || null,
                        beskrivning: a.beskrivning || null,
                        tid: a.tid || null,
                        material: a.material || [],
                        genomforande: a.genomforande || null
                    }));
                    await client().from("aktiviteter").upsert(rowsToUpsert, { onConflict: "id" });
                }
            }

            const [activitiesResult, linksResult] = await Promise.all([
                client()
                    .from("aktiviteter")
                    .select("id, namn, kategori, beskrivning, tid, material, genomforande, kar_id, kar:kar_id(namn)")
                    .order("namn"),
                client()
                    .from("badge_activities")
                    .select("kar_id, badge_id, activity_id")
            ]);

            if (activitiesResult.error) throw activitiesResult.error;
            if (linksResult.error) throw linksResult.error;

            activities = (activitiesResult.data || []).map(row => normalizeActivity({
                ...row,
                kar_namn: row.kar?.namn || ""
            }));
            badgeLinks = (linksResult.data || []).map(normalizeBadgeLink).filter(item => item.badge_id && item.activity_id);

            writeLocalActivities(activities);
            writeLocalBadgeLinks(badgeLinks);
        } catch (error) {
            console.error("Kunde inte hämta aktiviteter från databasen", error);
            activities = readLocalActivities();
            badgeLinks = readLocalBadgeLinks();
        }

        loaded = true;
        notify();
    }

    function ensureLoaded() {
        if (loaded) return Promise.resolve();
        if (!loadPromise) {
            loadPromise = reload().finally(() => {
                loadPromise = null;
            });
        }
        return loadPromise;
    }

    function getAllActivities() {
        return activities.map(item => ({ ...item }));
    }

    function getCustomActivities() {
        return getAllActivities();
    }

    function getBadgeLinksMap() {
        const map = {};
        badgeLinks.forEach(link => {
            map[link.badge_id] = map[link.badge_id] || [];
            if (!map[link.badge_id].includes(link.activity_id)) {
                map[link.badge_id].push(link.activity_id);
            }
        });
        return map;
    }

    function canEditBadgeLink(badgeId, activityId) {
        if (!canWrite()) return false;
        const karId = getKarId();
        return badgeLinks.some(link => link.kar_id === karId && link.badge_id === badgeId && link.activity_id === activityId);
    }

    function getKarFilters() {
        const byKar = new Map();
        activities.forEach(activity => {
            if (!activity.kar_id) return;
            if (byKar.has(activity.kar_id)) return;
            byKar.set(activity.kar_id, activity.kar_namn || "Okänd kår");
        });
        return [...byKar.entries()]
            .map(([id, namn]) => ({ id, namn }))
            .sort((a, b) => a.namn.localeCompare(b.namn, "sv"));
    }

    async function saveActivity(activity) {
        if (!canWrite()) throw new Error("Du saknar behörighet att spara aktiviteter.");
        const karId = getKarId();
        const normalized = normalizeActivity({
            ...activity,
            id: activity?.id || `egen-${crypto.randomUUID()}`,
            kar_id: karId
        });

        const existing = activities.find(item => item.id === normalized.id);
        if (existing?.kar_id && existing.kar_id !== karId) {
            throw new Error("Du kan bara redigera aktiviteter som ägs av din kår.");
        }

        upsertLocalActivity(normalized);
        notify();

        if (!client()) return normalized;

        const { error } = await client().from("aktiviteter").upsert({
            id: normalized.id,
            kar_id: normalized.kar_id,
            created_by: auth()?.getUser()?.id || null,
            namn: normalized.namn,
            kategori: normalized.kategori || null,
            beskrivning: normalized.beskrivning || null,
            tid: normalized.tid || null,
            material: normalized.material,
            genomforande: normalized.genomforande || null
        }, { onConflict: "id" });

        if (error) {
            console.error("Kunde inte spara aktivitet i databasen", error);
            throw error;
        }

        await reload();
        return normalized;
    }

    async function deleteActivity(activityId) {
        if (!auth()?.isAdmin()) throw new Error("Endast administratörer kan radera aktiviteter.");
        const activity = activities.find(item => item.id === activityId);
        if (!activity) return;
        if (!canDeleteActivity(activity)) throw new Error("Du kan bara radera aktiviteter som ägs av din kår.");

        removeLocalActivity(activityId);
        notify();

        if (!client()) return;

        const karId = getKarId();
        const [{ error: linksError }, { error: activityError }] = await Promise.all([
            client().from("badge_activities").delete().eq("activity_id", activityId).eq("kar_id", karId),
            client().from("aktiviteter").delete().eq("id", activityId).eq("kar_id", karId)
        ]);

        if (linksError) {
            console.error("Kunde inte radera aktivitetskopplingar", linksError);
            throw linksError;
        }
        if (activityError) {
            console.error("Kunde inte radera aktivitet", activityError);
            throw activityError;
        }

        await reload();
    }

    async function addBadgeActivityLink(badgeId, activityId) {
        if (!canWrite()) return false;

        const row = normalizeBadgeLink({
            kar_id: getKarId(),
            badge_id: badgeId,
            activity_id: activityId
        });

        upsertLocalBadgeLink(row);
        notify();

        if (!client()) return true;

        const { error } = await client().from("badge_activities").upsert(row, {
            onConflict: "kar_id,badge_id,activity_id"
        });
        if (error) {
            console.error("Kunde inte spara aktivitetskoppling", error);
            throw error;
        }

        await reload();
        return true;
    }

    async function removeBadgeActivityLink(badgeId, activityId) {
        if (!canWrite()) return false;
        const karId = getKarId();
        if (!canEditBadgeLink(badgeId, activityId)) return false;

        removeLocalBadgeLink(karId, badgeId, activityId);
        notify();

        if (!client()) return true;

        const { error } = await client()
            .from("badge_activities")
            .delete()
            .eq("kar_id", karId)
            .eq("badge_id", badgeId)
            .eq("activity_id", activityId);

        if (error) {
            console.error("Kunde inte ta bort aktivitetskoppling", error);
            throw error;
        }

        await reload();
        return true;
    }

    function onAuthChange() {
        loaded = false;
        ensureLoaded();
    }

    window.GTScoutActivities = {
        init(config) {
            if (typeof config?.onChange === "function") {
                listeners.add(config.onChange);
            }
            auth()?.onChange(onAuthChange);
            ensureLoaded();
        },
        ensureLoaded,
        reload,
        canWrite,
        canEditActivity,
        canDeleteActivity,
        canEditBadgeLink,
        getAllActivities,
        getCustomActivities,
        getBadgeLinksMap,
        getKarFilters,
        saveActivity,
        deleteActivity,
        addBadgeActivityLink,
        removeBadgeActivityLink,
        onChange(listener) {
            listeners.add(listener);
            listener({ loaded, activities: getAllActivities(), badgeLinks: badgeLinks.map(item => ({ ...item })) });
            return () => listeners.delete(listener);
        }
    };
})();
