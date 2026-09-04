/**
 * Hämtar och sparar kårägda märken i Supabase.
 */
(function () {
    const DEFAULT_IMAGE = "images/marken/specialistmarken.png";
    const BADGE_IMAGE_BUCKET = "badge-images";
    const MAX_IMAGE_BYTES = 100 * 1024;
    const MAX_IMAGE_DIMENSION = 128;
    const DEFAULT_TYPES = ["Intressemärke", "Deltagandemärke", "Bevismärke"];
    const TARGET_GROUPS = ["Familjescouting", "Spårare", "Upptäckare", "Äventyrare", "Utmanare", "Rover"];

    let badges = [];
    let loaded = false;
    let loadPromise = null;
    let initialized = false;
    let editingBadge = null;
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

    const canEditBadge = canDeleteBadge;

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

    async function getImageDimensions(file) {
        if (typeof window.createImageBitmap === "function") {
            const bitmap = await window.createImageBitmap(file);
            const dimensions = { width: bitmap.width, height: bitmap.height };
            bitmap.close();
            return dimensions;
        }

        return new Promise((resolve, reject) => {
            const image = new Image();
            const objectUrl = URL.createObjectURL(file);
            image.onload = () => {
                URL.revokeObjectURL(objectUrl);
                resolve({ width: image.naturalWidth, height: image.naturalHeight });
            };
            image.onerror = () => {
                URL.revokeObjectURL(objectUrl);
                reject(new Error("Bildfilen kunde inte läsas."));
            };
            image.src = objectUrl;
        });
    }

    async function validateBadgeImage(file) {
        if (!file) return null;
        if (file.type !== "image/png") throw new Error("Bilden måste vara en PNG-fil.");
        if (file.size > MAX_IMAGE_BYTES) throw new Error("Bilden får vara högst 100 KB.");

        const signature = new Uint8Array(await file.slice(0, 8).arrayBuffer());
        const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10];
        if (!pngSignature.every((byte, index) => signature[index] === byte)) {
            throw new Error("Filen är inte en giltig PNG-bild.");
        }

        const dimensions = await getImageDimensions(file);
        if (dimensions.width > MAX_IMAGE_DIMENSION || dimensions.height > MAX_IMAGE_DIMENSION) {
            throw new Error("Bilden får vara högst 128 × 128 pixlar.");
        }
        return dimensions;
    }

    async function uploadBadgeImage(file, badgeId) {
        await validateBadgeImage(file);
        const path = `${getKarId()}/${badgeId}/${crypto.randomUUID()}.png`;
        const storage = client().storage.from(BADGE_IMAGE_BUCKET);
        const { error } = await storage.upload(path, file, {
            cacheControl: "3600",
            contentType: "image/png",
            upsert: false
        });
        if (error) throw new Error(error.message || "Bilden kunde inte laddas upp.");

        const { data } = storage.getPublicUrl(path);
        if (!data?.publicUrl) throw new Error("Bildens publika adress kunde inte skapas.");
        return { path, publicUrl: data.publicUrl };
    }

    async function removeUploadedImage(path) {
        if (!path) return;
        const { error } = await client().storage.from(BADGE_IMAGE_BUCKET).remove([path]);
        if (error) console.error("Kunde inte rensa uppladdad märkesbild", error);
    }

    function getUploadedImagePath(imageUrl) {
        const marker = `/storage/v1/object/public/${BADGE_IMAGE_BUCKET}/`;
        const markerIndex = String(imageUrl || "").indexOf(marker);
        if (markerIndex === -1) return null;
        return decodeURIComponent(String(imageUrl).slice(markerIndex + marker.length));
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
            bild: normalized.bild
        });

        if (error) {
            if (error.code === "23505") throw new Error("Det finns redan ett märke med det namnet i kåren.");
            console.error("Kunde inte spara kårens märke", error);
            throw new Error(error.message || "Märket kunde inte sparas.");
        }

        await reload();
        return normalized;
    }

    async function updateBadge(badge) {
        if (!canEditBadge(badge)) throw new Error("Endast kårens administratör kan redigera märket.");

        const normalized = normalizeBadge({
            ...badge,
            kar_id: getKarId(),
            program: [getKarName()]
        });
        if (!normalized.namn) throw new Error("Ange ett namn på märket.");
        if (normalized.program.length === 0) throw new Error("Kårnamnet kunde inte hämtas.");
        if (!normalized.Typ) throw new Error("Välj en typ för märket.");
        if (normalized.malgrupp.length === 0) throw new Error("Välj minst en målgrupp.");
        if (normalized.kriterier.length === 0) throw new Error("Ange minst ett kriterium.");

        const { error } = await client()
            .from("custom_badges")
            .update({
                namn: normalized.namn,
                kategori: normalized.kategori,
                malgrupp: normalized.malgrupp,
                inledning: normalized.inledning || null,
                kriterier: normalized.kriterier,
                program: normalized.program,
                typ: normalized.Typ,
                bild: normalized.bild
            })
            .eq("id", normalized.id)
            .eq("kar_id", getKarId());

        if (error) {
            if (error.code === "23505") throw new Error("Det finns redan ett märke med det namnet i kåren.");
            console.error("Kunde inte uppdatera kårens märke", error);
            throw new Error(error.message || "Märket kunde inte uppdateras.");
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
                <label class="modal-field custom-badge-image-field">
                    <span>Bild (valfri PNG, max 100 KB och 128 × 128 px)</span>
                    <span class="custom-badge-image-control">
                        <img src="${DEFAULT_IMAGE}" alt="Förhandsvisning" data-custom-badge-preview>
                        <input name="bild" type="file" accept="image/png,.png">
                    </span>
                </label>
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
        form.elements.bild.addEventListener("change", async () => {
            const status = form.querySelector("[data-custom-badge-status]");
            const preview = form.querySelector("[data-custom-badge-preview]");
            const file = form.elements.bild.files[0];
            preview.src = editingBadge?.bild || DEFAULT_IMAGE;
            status.textContent = "";
            if (!file) return;
            try {
                await validateBadgeImage(file);
                const objectUrl = URL.createObjectURL(file);
                preview.onload = () => URL.revokeObjectURL(objectUrl);
                preview.src = objectUrl;
            } catch (error) {
                form.elements.bild.value = "";
                status.textContent = error.message;
            }
        });
        form.addEventListener("submit", async event => {
            event.preventDefault();
            const status = form.querySelector("[data-custom-badge-status]");
            const submitButton = form.querySelector("button[type='submit']");
            const formData = new FormData(form);
            const currentBadge = editingBadge;
            const badgeId = currentBadge?.id || `egen-${crypto.randomUUID()}`;
            const imageFile = form.elements.bild.files[0] || null;
            let uploadedImage = null;
            status.textContent = "Sparar...";
            submitButton.disabled = true;
            try {
                if (imageFile) {
                    status.textContent = "Laddar upp bild...";
                    uploadedImage = await uploadBadgeImage(imageFile, badgeId);
                }
                const nextBadge = {
                    ...currentBadge,
                    id: badgeId,
                    namn: formData.get("namn"),
                    typ: formData.get("typ"),
                    kategori: formData.get("kategori"),
                    malgrupp: formData.getAll("malgrupp"),
                    inledning: formData.get("inledning"),
                    kriterier: String(formData.get("kriterier") || "").split(/\r?\n/),
                    bild: uploadedImage?.publicUrl || currentBadge?.bild || DEFAULT_IMAGE
                };
                if (currentBadge) await updateBadge(nextBadge);
                else await saveBadge(nextBadge);

                if (uploadedImage && currentBadge?.bild) {
                    await removeUploadedImage(getUploadedImagePath(currentBadge.bild));
                }
                form.reset();
                close();
            } catch (error) {
                await removeUploadedImage(uploadedImage?.path);
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
        editingBadge = null;
        form.reset();
        form.querySelector("[data-custom-badge-preview]").src = DEFAULT_IMAGE;
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
        modal.querySelector("#customBadgeTitle").textContent = "Skapa eget märke";
        form.querySelector("button[type='submit']").textContent = "Skapa märke";
        modal.classList.remove("hidden");
        form.elements.namn.focus();
    }

    function openEditDialog(badge) {
        if (!canEditBadge(badge)) return;
        const modal = ensureCreateDialog();
        const form = modal.querySelector("form");
        editingBadge = badge;
        form.reset();
        form.elements.namn.value = badge.namn;
        form.elements.kategori.value = badge.kategori;
        form.elements.inledning.value = badge.inledning;
        form.elements.kriterier.value = badge.kriterier.join("\n");
        form.querySelectorAll("input[name='malgrupp']").forEach(input => {
            input.checked = badge.malgrupp.includes(input.value);
        });
        const availableTypes = [...getAvailableTypes(), badge.Typ];
        const types = [...new Set(availableTypes.map(type => String(type || "").trim()).filter(Boolean))]
            .sort((left, right) => left.localeCompare(right, "sv"));
        form.elements.typ.replaceChildren(...types.map(type => {
            const option = document.createElement("option");
            option.value = type;
            option.textContent = type;
            return option;
        }));
        form.elements.typ.value = badge.Typ;
        form.querySelector("[data-custom-badge-preview]").src = badge.bild || DEFAULT_IMAGE;
        form.querySelector("[data-custom-badge-status]").textContent = "";
        modal.querySelector("#customBadgeTitle").textContent = "Redigera märke";
        form.querySelector("button[type='submit']").textContent = "Spara ändringar";
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
        canEditBadge,
        canDeleteBadge,
        validateBadgeImage,
        uploadBadgeImage,
        saveBadge,
        updateBadge,
        deleteBadge,
        openCreateDialog,
        openEditDialog,
        onChange(listener) {
            listeners.add(listener);
            listener({ loaded, badges: getAllBadges(), canWrite: canWrite() });
            return () => listeners.delete(listener);
        }
    };
})();