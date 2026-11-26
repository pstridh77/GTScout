(function () {
    const GUEST_KEY = "gtscout_campfire_plans_guest";
    const KAR_KEY = "gtscout_campfire_plans_kar_";
    let plans = [];
    let guestPlans = [];
    let currentKey = GUEST_KEY;
    let currentIdentity = null;
    let contextVersion = 0;
    let revision = 0;
    let loading = false;
    let loadError = false;
    let storageError = false;
    let onChange = null;
    let askedGuest = false;
    let authPending = false;
    let lastCanWrite = false;

    const auth = () => window.GTScoutAuth;
    const client = () => auth()?.getClient?.() || null;
    const karId = () => auth()?.getState?.().karId || null;
    const userId = () => auth()?.getUser?.()?.id || null;
    const canRead = () => Boolean(client() && auth()?.isSignedIn?.() && karId());
    const canWrite = () => Boolean(canRead() && auth()?.isLeader?.());
    const canEdit = () => !storageError && !auth()?.getState?.().loading && (!auth()?.isSignedIn?.() || canWrite());

    function normalize(input) {
        if (!input || typeof input !== "object" || typeof input.title !== "string" || !input.title.trim()) return null;
        if (!Array.isArray(input.items)) return null;
        const seen = new Set();
        const valid = input.items.every(item => {
            if (typeof item?.id !== "string" || !item.id.trim() || typeof item.title !== "string" || !item.title.trim() || seen.has(item.id)) return false;
            seen.add(item.id);
            return true;
        });
        if (!valid) return null;
        const items = input.items.map(item => ({ id: item.id, title: item.title.trim() }));
        return {
            id: String(input.id || crypto.randomUUID()),
            title: input.title.trim(),
            description: typeof input.description === "string" ? input.description.trim() : "",
            items,
            created_by: input.created_by || null,
            local_only: Boolean(input.local_only)
        };
    }

    function read(key) {
        try {
            const raw = localStorage.getItem(key);
            if (!raw) return [];
            const data = JSON.parse(raw);
            if (!Array.isArray(data)) throw new Error("Ogiltigt format för sparade lägerbål.");
            return data.map(item => {
                const plan = normalize(item);
                if (!plan) throw new Error("Ett sparat lägerbål har ogiltigt format.");
                return plan;
            });
        } catch (error) {
            storageError = true;
            throw error;
        }
    }

    function getAll() {
        const currentIds = new Set(plans.map(plan => plan.id));
        return [...plans, ...guestPlans.filter(plan => !currentIds.has(plan.id)).map(plan => ({ ...plan, guest_local: true }))]
            .map(plan => ({ ...plan, items: plan.items.map(item => ({ ...item })) }))
            .sort((a, b) => a.title.localeCompare(b.title, "sv"));
    }

    function notify() {
        onChange?.(getAll(), { loading, error: loadError, storageError, contextVersion });
    }

    function persist() {
        plans.sort((a, b) => a.title.localeCompare(b.title, "sv"));
        localStorage.setItem(currentKey, JSON.stringify(plans));
        notify();
    }

    async function save(input, duringReload = false) {
        if (!canEdit() || (loading && !duringReload)) throw new Error("Lägerbålet kan inte sparas just nu.");
        const plan = normalize({ ...input, local_only: true });
        if (!plan) throw new Error("Ange ett namn för lägerbålet.");
        if (input.guest_local && currentKey !== GUEST_KEY) {
            const index = guestPlans.findIndex(item => item.id === plan.id);
            if (index < 0) throw new Error("Det lokala lägerbålet finns inte längre.");
            const updated = guestPlans.slice();
            updated[index] = plan;
            localStorage.setItem(GUEST_KEY, JSON.stringify(updated));
            guestPlans = updated;
            notify();
            return { localOnly: true };
        }
        const token = revision;
        const savedKey = currentKey;
        const savedKar = karId();
        const savedUser = userId();
        const index = plans.findIndex(item => item.id === plan.id);
        const previous = plans.slice();
        if (index < 0) plans.push(plan); else plans[index] = plan;
        try {
            persist();
        } catch (error) {
            plans = previous;
            throw error;
        }
        if (!canWrite()) return { localOnly: true };
        plan.created_by = plan.created_by || savedUser;
        const guard = () => token === revision && canWrite() && karId() === savedKar && userId() === savedUser && currentKey === savedKey;
        try {
            await window.GTScoutSyncRetry.withRetry(async () => {
                const { error } = await client().from("planerade_lagerbal").upsert({
                    id: plan.id, kar_id: savedKar, created_by: plan.created_by,
                    data: { title: plan.title, description: plan.description, items: plan.items }
                }, { onConflict: "id" });
                if (error) throw error;
            }, guard);
            if (!guard()) return { localOnly: true, error: new Error("Inloggningen ändrades under sparandet.") };
            const current = plans.find(item => item.id === plan.id);
            if (current === plan) {
                plan.local_only = false;
                persist();
            }
            return { localOnly: false };
        } catch (error) {
            console.error("Kunde inte spara planerat lägerbål", error);
            if (guard()) {
                loadError = true;
                notify();
            }
            return { localOnly: true, error };
        }
    }

    async function remove(id) {
        if (!canEdit() || loading) throw new Error("Lägerbålet kan inte tas bort just nu.");
        if (!plans.some(item => item.id === id) && guestPlans.some(item => item.id === id)) {
            const updated = guestPlans.filter(item => item.id !== id);
            localStorage.setItem(GUEST_KEY, JSON.stringify(updated));
            guestPlans = updated;
            notify();
            return;
        }
        const plan = plans.find(item => item.id === id);
        if (!plan) throw new Error("Lägerbålet finns inte längre.");
        if (!canWrite()) {
            const previous = plans;
            plans = plans.filter(item => item.id !== id);
            try {
                persist();
            } catch (error) {
                plans = previous;
                throw error;
            }
            return;
        }
        const token = revision;
        const savedKar = karId();
        const savedUser = userId();
        const guard = () => token === revision && canWrite() && karId() === savedKar && userId() === savedUser;
        await window.GTScoutSyncRetry.withRetry(async () => {
            const { error } = await client().from("planerade_lagerbal").delete().eq("id", id).eq("kar_id", savedKar);
            if (error) throw error;
        }, guard);
        if (!guard()) throw new Error("Inloggningen ändrades när lägerbålet togs bort.");
        plans = plans.filter(item => item.id !== id);
        persist();
    }

    async function reload() {
        const token = ++revision;
        loading = canRead();
        loadError = false;
        storageError = false;
        try {
            plans = read(currentKey);
            guestPlans = currentKey === GUEST_KEY ? [] : read(GUEST_KEY);
            notify();
            if (!canRead()) return;
            const savedKar = karId();
            const savedUser = userId();
            const { data, error } = await client().from("planerade_lagerbal")
                .select("id, kar_id, created_by, data").eq("kar_id", savedKar);
            if (token !== revision || !canRead() || karId() !== savedKar || userId() !== savedUser) return;
            if (error) throw error;
            const local = read(currentKey);
            const pending = new Map(local.filter(item => item.local_only).map(item => [item.id, item]));
            const remote = (data || []).map(row => {
                const plan = normalize({ ...row.data, id: row.id, created_by: row.created_by, local_only: false });
                if (!plan) throw new Error("Ett lägerbål i databasen har ogiltigt format.");
                return plan;
            });
            const ids = new Set(remote.map(item => item.id));
            plans = remote.map(item => pending.get(item.id) || item);
            plans.push(...[...pending.values()].filter(item => !ids.has(item.id)));
            persist();
            if (canWrite()) {
                for (const plan of pending.values()) {
                    if (token !== revision) return;
                    await save(plan, true);
                }
                if (!askedGuest) {
                    askedGuest = true;
                    const guest = read(GUEST_KEY);
                    if (guest.length) {
                        const action = await window.GTScoutLocalChanges.confirm({
                            kind: "planerade lägerbål", localData: guest,
                            isCurrent: () => token === revision && canWrite(),
                            items: guest.map(plan => ({ title: plan.title }))
                        });
                        if (token !== revision || !canWrite()) return;
                        if (action === "upload") {
                            for (const plan of guest) {
                                const result = await save(plan, true);
                                if (token !== revision) return;
                                if (!result.error) {
                                    const remaining = read(GUEST_KEY).filter(item => item.id !== plan.id);
                                    localStorage.setItem(GUEST_KEY, JSON.stringify(remaining));
                                    guestPlans = remaining;
                                }
                            }
                        } else if (action === "delete") {
                            localStorage.setItem(GUEST_KEY, "[]");
                            guestPlans = [];
                        }
                    }
                }
            }
        } catch (error) {
            if (token !== revision) return;
            loadError = true;
            console.error("Kunde inte läsa planerade lägerbål", error);
        } finally {
            if (token === revision) {
                loading = false;
                notify();
            }
        }
    }

    function onAuthChange() {
        if (auth()?.getState?.().loading) {
            if (!authPending) revision++;
            authPending = true;
            loading = true;
            notify();
            return;
        }
        const identity = canRead() ? `${karId()}:${userId()}` : auth()?.isSignedIn?.() ? "signed-in-no-kar" : "guest";
        const writable = canWrite();
        if (identity === currentIdentity) {
            const needsReload = authPending || (writable && !lastCanWrite);
            authPending = false;
            lastCanWrite = writable;
            if (needsReload) reload(); else notify();
            return;
        }
        authPending = false;
        lastCanWrite = writable;
        currentIdentity = identity;
        contextVersion++;
        currentKey = canRead() ? `${KAR_KEY}${karId()}_${userId()}` : identity === "guest" ? GUEST_KEY : "gtscout_campfire_plans_unavailable";
        plans = [];
        guestPlans = [];
        askedGuest = false;
        reload();
    }

    window.addEventListener("online", () => reload());
    window.addEventListener("storage", event => {
        if (event.key === currentKey || event.key === GUEST_KEY) reload();
    });
    window.GTScoutCampfirePlans = {
        init(config) {
            onChange = config?.onChange || null;
            auth()?.onChange?.(onAuthChange);
        },
        getAll, canEdit, canWrite, save, remove, reload
    };
})();
