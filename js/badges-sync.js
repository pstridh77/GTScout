/**
 * Hämtar och sparar kårägda märken i Supabase.
 */
(function () {
    const DEFAULT_IMAGE = "images/marken/specialistmarken.png";
    const DEFAULT_TYPES = ["Intressemärke", "Deltagandemärke", "Bevismärke"];
    const TARGET_GROUPS = ["Familjescouting", "Spårare", "Upptäckare", "Äventyrare", "Utmanare", "Rover"];

    let badges = [];
    let loaded = false;
    let loadPromise = null;
    let initialized = false;
    let getAvailableTypes = () => [];
    const listeners = new Set();

    const auth = () => window.GTScoutAuth;
    const client = () => auth()?.getClient() || null;
    const getKarId = () => auth()?.getState().karId || null;
    const getKarName = () => String(auth()?.getState().karName || "").trim();

    function canWrite() {
        return Boolean(client() && auth()?.isSignedIn() && auth()?.isLeader() && getKarId());
    }

    function canDeleteBadge(badge) {
        return Boolean(
            canWrite()
            && auth()?.isAdmin()
            && badge?.isCustom
            && badge?.kar_id === getKarId()
        );
    }

    function normalizeBadge(badge) {
        return {
            id: String(badge?.id || ""),
            namn: String(badge?.namn || "").trim(),
            bild: String(badge?.bild || DEFAULT_IMAGE),
            kategori: String(badge?.kategori || "Övrigt").trim(),
            malgrupp: Array.isArray(badge?.malgrupp) ? badge.malgrupp.map(String).filter(Boolean) : [],
            inledning: String(badge?.inledning || "").trim(),
            kriterier: Array.isArray(badge?.kriterier) ? badge.kriterier.map(String).map(item => item.trim()).filter(Boolean) : [],
            program: Array.isArray(badge?.program) ? badge.program.map(String).filter(Boolean) : [],
            Typ: String(badge?.typ || badge?.Typ || "Eget märke"),
            kar_id: badge?.kar_id || null,
            isCustom: true
        };
    }

    function getAllBadges() {
        return badges.map(badge => ({ ...badge, malgrupp: [...badge.malgrupp], kriterier: [...badge.kriterier], program: [...badge.program] }));
    }

    function notify() {
        const state = { loaded, badges: getAllBadges(), canWrite: canWrite() };
        listeners.forEach(listener => {
            try {
                listener(state);
            } catch (error) {
                console.error("Märkeslyssnare kastade fel", error);
            }
        });
    }

    function updateActionVisibility() {
        document.querySelectorAll("[data-create-custom-badge]").forEach(button => {
            button.classList.toggle("hidden", !canWrite());
        });
    }

    async function reload() {
        if (!client() || !auth()?.isSignedIn() || !getKarId()) {
            badges = [];
            loaded = true;
            updateActionVisibility();
            notify();
            return;
        }

        try {
            const { data, error } = await client()
                .from("custom_badges")
                .select("id, kar_id, namn, kategori, malgrupp, inledning, kriterier, program, typ, bild, is_active")
                .eq("kar_id", getKarId())
                .eq("is_active", true)
                .order("namn");

            if (error) throw error;
            badges = (data || []).map(normalizeBadge);
        } catch (error) {
            console.error("Kunde inte hämta kårens märken", error);
            badges = [];
        }

        loaded = true;
        updateActionVisibility();
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

    async function saveBadge(badge) {
        if (!canWrite()) throw new Error("Du måste vara ledare eller administratör i en kår.");

        const normalized = normalizeBadge({
            ...badge,
            id: badge?.id || `egen-${crypto.randomUUID()}`,
            kar_id: getKarId(),
            program: [getKarName()]
        });
        if (!normalized.namn) throw new Error("Ange ett namn på märket.");
        if (normalized.program.length === 0) throw new Error("Kårnamnet kunde inte hämtas.");
        if (!normalized.Typ) throw new Error("Välj en typ för märket.");
        if (normalized.malgrupp.length === 0) throw new Error("Välj minst en målgrupp.");
        if (normalized.kriterier.length === 0) throw new Error("Ange minst ett kriterium.");

        const { error } = await client().from("custom_badges").insert({
            id: normalized.id,
            kar_id: normalized.kar_id,
            created_by: auth()?.getUser()?.id || null,
            namn: normalized.namn,
            kategori: normalized.kategori,
            malgrupp: normalized.malgrupp,
            inledning: normalized.inledning || null,
            kriterier: normalized.kriterier,
            program: normalized.program,
            typ: normalized.Typ,
            bild: DEFAULT_IMAGE
        });

        if (error) {
            if (error.code === "23505") throw new Error("Det finns redan ett märke med det namnet i kåren.");
            console.error("Kunde inte spara kårens märke", error);
            throw new Error(error.message || "Märket kunde inte sparas.");
        }

        await reload();
        return normalized;
    }

    async function deleteBadge(badge) {
        if (!canDeleteBadge(badge)) throw new Error("Endast kårens administratör kan ta bort märket.");

        const { error } = await client()
            .from("custom_badges")
            .update({ is_active: false })
            .eq("id", badge.id)
            .eq("kar_id", getKarId());

        if (error) {
            console.error("Kunde inte ta bort kårens märke", error);
            throw new Error(error.message || "Märket kunde inte tas bort.");
        }

        await reload();
    }

    function ensureCreateDialog() {
        let modal = document.getElementById("customBadgeModal");
        if (modal) return modal;

        modal = document.createElement("div");
        modal.id = "customBadgeModal";
        modal.className = "modal hidden";
        modal.setAttribute("role", "dialog");
        modal.setAttribute("aria-modal", "true");
        modal.setAttribute("aria-labelledby", "customBadgeTitle");
        modal.innerHTML = `
            <form class="modal-content custom-badge-form">
                <button class="close-popup" type="button" aria-label="Stäng">&times;</button>
                <h2 id="customBadgeTitle">Skapa eget märke</h2>
                <label class="modal-field"><span>Namn</span><input name="namn" type="text" maxlength="100" required></label>
                <label class="modal-field"><span>Typ</span><select name="typ" required></select></label>
                <label class="modal-field"><span>Kategori</span><input name="kategori" type="text" maxlength="100" placeholder="Till exempel Friluftsliv" required></label>
                <fieldset class="custom-badge-targets">
                    <legend>Målgrupp</legend>
                    ${TARGET_GROUPS.map(group => `<label><input name="malgrupp" type="checkbox" value="${group}"> <span>${group}</span></label>`).join("")}
                </fieldset>
                <label class="modal-field"><span>Beskrivning</span><textarea name="inledning" rows="2"></textarea></label>
                <label class="modal-field"><span>Kriterier, ett per rad</span><textarea name="kriterier" rows="4" required></textarea></label>
                <p class="custom-badge-image-note">Märket använder standardbilden Specialistmärken.</p>
                <p class="detail-planning-status" data-custom-badge-status role="status"></p>
                <div class="modal-actions"><button class="btn-primary" type="submit">Skapa märke</button></div>
            </form>
        `;
        document.body.appendChild(modal);

        const form = modal.querySelector("form");
        const close = () => modal.classList.add("hidden");
        modal.querySelector(".close-popup").addEventListener("click", close);
        modal.addEventListener("click", event => {
            if (event.target === modal) close();
        });
        form.addEventListener("submit", async event => {
            event.preventDefault();
            const status = form.querySelector("[data-custom-badge-status]");
            const submitButton = form.querySelector("button[type='submit']");
            const formData = new FormData(form);
            status.textContent = "Sparar...";
            submitButton.disabled = true;
            try {
                await saveBadge({
                    namn: formData.get("namn"),
                    typ: formData.get("typ"),
                    kategori: formData.get("kategori"),
                    malgrupp: formData.getAll("malgrupp"),
                    inledning: formData.get("inledning"),
                    kriterier: String(formData.get("kriterier") || "").split(/\r?\n/)
                });
                form.reset();
                close();
            } catch (error) {
                status.textContent = error.message;
            } finally {
                submitButton.disabled = false;
            }
        });
        return modal;
    }

    function openCreateDialog() {
        if (!canWrite()) return;
        const modal = ensureCreateDialog();
        const form = modal.querySelector("form");
        form.reset();
        const typeSelect = form.elements.typ;
        const availableTypes = getAvailableTypes();
        const types = [...new Set((availableTypes.length ? availableTypes : DEFAULT_TYPES).map(type => String(type || "").trim()).filter(Boolean))]
            .sort((left, right) => left.localeCompare(right, "sv"));
        typeSelect.replaceChildren(...types.map(type => {
            const option = document.createElement("option");
            option.value = type;
            option.textContent = type;
            return option;
        }));
        form.querySelector("[data-custom-badge-status]").textContent = "";
        modal.classList.remove("hidden");
        form.elements.namn.focus();
    }

    function bindCreateActions() {
        document.querySelectorAll("[data-create-custom-badge]").forEach(button => {
            if (button.dataset.customBadgeBound === "true") return;
            button.dataset.customBadgeBound = "true";
            button.addEventListener("click", openCreateDialog);
        });
        updateActionVisibility();
    }

    function onAuthChange() {
        loaded = false;
        reload();
    }

    window.GTScoutBadges = {
        init(config) {
            if (typeof config?.onChange === "function") listeners.add(config.onChange);
            if (typeof config?.getAvailableTypes === "function") getAvailableTypes = config.getAvailableTypes;
            bindCreateActions();
            if (!initialized) {
                initialized = true;
                auth()?.onChange(onAuthChange);
            }
            ensureLoaded();
        },
        ensureLoaded,
        reload,
        getAllBadges,
        canWrite,
        canDeleteBadge,
        saveBadge,
        deleteBadge,
        openCreateDialog,
        onChange(listener) {
            listeners.add(listener);
            listener({ loaded, badges: getAllBadges(), canWrite: canWrite() });
            return () => listeners.delete(listener);
        }
    };
})();