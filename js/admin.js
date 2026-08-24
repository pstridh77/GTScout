/**
 * Adminvy för att hantera kårer och användare.
 * Kräver inloggad admin – i övriga lägen är menyvalet dolt.
 */
(function () {
    const ROLE_OPTIONS = [
        { value: "gast", label: "Gäst" },
        { value: "ledare", label: "Ledare" },
        { value: "admin", label: "Admin" }
    ];

    let karer = [];
    let profiles = [];
    let modal = null;

    const auth = () => window.GTScoutAuth;
    const client = () => auth()?.getClient() || null;

    function escapeHtml(value) {
        return String(value ?? "").replace(/[&<>"']/g, char => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
        }[char]));
    }

    function setMessage(text, isError) {
        const el = document.getElementById("adminMessage");
        if (!el) return;
        el.textContent = text || "";
        el.classList.toggle("hidden", !text);
        el.classList.toggle("auth-message--error", Boolean(isError));
    }

    function buildModal() {
        if (modal) return modal;

        modal = document.createElement("div");
        modal.id = "adminModal";
        modal.className = "modal hidden";
        modal.innerHTML = `
            <div class="modal-content modal-content--wide" role="dialog" aria-modal="true" aria-labelledby="adminModalTitle">
                <h2 id="adminModalTitle">Administration</h2>
                <p id="adminMessage" class="auth-message hidden"></p>

                <section class="admin-section">
                    <h3>Kårer</h3>
                    <div id="adminKarList" class="admin-list"></div>
                    <div class="admin-add-row">
                        <input id="adminNewKarNamn" type="text" placeholder="Kårens namn">
                        <input id="adminNewKarOrt" type="text" placeholder="Ort">
                        <button id="adminAddKarBtn" class="btn-secondary" type="button">Lägg till kår</button>
                    </div>
                </section>

                <section class="admin-section">
                    <h3>Användare</h3>
                    <p class="auth-note">Nya konton skapas i Supabase (Authentication &gt; Users). Här sätter du roll och kårtillhörighet.</p>
                    <div id="adminUserList" class="admin-list"></div>
                </section>

                <div class="modal-actions">
                    <button id="adminCloseBtn" class="btn-secondary" type="button">Stäng</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        modal.addEventListener("click", event => {
            if (event.target === modal) closeModal();
        });
        document.getElementById("adminCloseBtn").addEventListener("click", closeModal);
        document.getElementById("adminAddKarBtn").addEventListener("click", addKar);
        document.getElementById("adminKarList").addEventListener("click", onKarListClick);
        document.getElementById("adminUserList").addEventListener("click", onUserListClick);

        return modal;
    }

    /* ── Data ────────────────────────────────────────────────────────────── */

    async function loadData() {
        const db = client();
        if (!db) return;

        const [karResult, profileResult] = await Promise.all([
            db.from("kar").select("id, namn, ort").order("namn"),
            db.from("profiles").select("id, email, full_name, role, kar_id").order("email")
        ]);

        if (karResult.error) throw karResult.error;
        if (profileResult.error) throw profileResult.error;

        karer = karResult.data || [];
        profiles = profileResult.data || [];
    }

    async function addKar() {
        const namnInput = document.getElementById("adminNewKarNamn");
        const ortInput = document.getElementById("adminNewKarOrt");
        const namn = namnInput.value.trim();
        if (!namn) {
            setMessage("Ange ett namn på kåren.", true);
            return;
        }
        const { error } = await client().from("kar").insert({ namn, ort: ortInput.value.trim() || null });
        if (error) {
            setMessage(error.message, true);
            return;
        }
        namnInput.value = "";
        ortInput.value = "";
        await refresh("Kåren lades till.");
    }

    async function saveKar(id) {
        const row = document.querySelector(`[data-kar-row="${id}"]`);
        if (!row) return;
        const namn = row.querySelector("[data-field='namn']").value.trim();
        if (!namn) {
            setMessage("Kårens namn får inte vara tomt.", true);
            return;
        }
        const ort = row.querySelector("[data-field='ort']").value.trim();
        const { error } = await client().from("kar").update({ namn, ort: ort || null }).eq("id", id);
        if (error) {
            setMessage(error.message, true);
            return;
        }
        await refresh("Kåren sparades.");
    }

    async function deleteKar(id) {
        const kar = karer.find(item => item.id === id);
        if (!window.confirm(`Ta bort kåren "${kar?.namn || ""}"? Användare i kåren blir utan kårtillhörighet.`)) return;
        const { error } = await client().from("kar").delete().eq("id", id);
        if (error) {
            setMessage(error.message, true);
            return;
        }
        await refresh("Kåren togs bort.");
    }

    async function saveProfile(id) {
        const row = document.querySelector(`[data-profile-row="${id}"]`);
        if (!row) return;
        const role = row.querySelector("[data-field='role']").value;
        const karValue = row.querySelector("[data-field='kar']").value;

        if (id === auth().getUser()?.id && role !== "admin") {
            setMessage("Du kan inte ta bort din egen adminroll.", true);
            return;
        }

        const { error } = await client()
            .from("profiles")
            .update({ role, kar_id: karValue || null })
            .eq("id", id);
        if (error) {
            setMessage(error.message, true);
            return;
        }
        await refresh("Användaren sparades.");
    }

    /* ── Rendering ───────────────────────────────────────────────────────── */

    function renderKarer() {
        const list = document.getElementById("adminKarList");
        if (!karer.length) {
            list.innerHTML = `<p class="admin-empty">Inga kårer upplagda ännu.</p>`;
            return;
        }
        list.innerHTML = karer.map(kar => `
            <div class="admin-row" data-kar-row="${escapeHtml(kar.id)}">
                <input type="text" data-field="namn" value="${escapeHtml(kar.namn)}" aria-label="Kårens namn">
                <input type="text" data-field="ort" value="${escapeHtml(kar.ort || "")}" placeholder="Ort" aria-label="Ort">
                <button class="btn-secondary" type="button" data-action="save-kar" data-id="${escapeHtml(kar.id)}">Spara</button>
                <button class="btn-danger" type="button" data-action="delete-kar" data-id="${escapeHtml(kar.id)}">Ta bort</button>
            </div>
        `).join("");
    }

    function renderUsers() {
        const list = document.getElementById("adminUserList");
        if (!profiles.length) {
            list.innerHTML = `<p class="admin-empty">Inga användare synliga för din kår.</p>`;
            return;
        }
        const ownKarId = auth().getState().karId;
        const karOptions = karer.filter(kar => kar.id === ownKarId);

        list.innerHTML = profiles.map(profile => `
            <div class="admin-row admin-row--user" data-profile-row="${escapeHtml(profile.id)}">
                <span class="admin-user-name">
                    ${escapeHtml(profile.email)}
                    ${profile.full_name ? `<small>${escapeHtml(profile.full_name)}</small>` : ""}
                </span>
                <select data-field="role" aria-label="Roll">
                    ${ROLE_OPTIONS.map(option => `
                        <option value="${option.value}" ${profile.role === option.value ? "selected" : ""}>${option.label}</option>
                    `).join("")}
                </select>
                <select data-field="kar" aria-label="Kår">
                    <option value="" ${!profile.kar_id ? "selected" : ""}>Ingen kår</option>
                    ${karOptions.map(kar => `
                        <option value="${escapeHtml(kar.id)}" ${profile.kar_id === kar.id ? "selected" : ""}>${escapeHtml(kar.namn)}</option>
                    `).join("")}
                </select>
                <button class="btn-secondary" type="button" data-action="save-profile" data-id="${escapeHtml(profile.id)}">Spara</button>
            </div>
        `).join("");
    }

    function onKarListClick(event) {
        const button = event.target.closest("button[data-action]");
        if (!button) return;
        if (button.dataset.action === "save-kar") saveKar(button.dataset.id);
        if (button.dataset.action === "delete-kar") deleteKar(button.dataset.id);
    }

    function onUserListClick(event) {
        const button = event.target.closest("button[data-action='save-profile']");
        if (button) saveProfile(button.dataset.id);
    }

    async function refresh(message) {
        try {
            await loadData();
            renderKarer();
            renderUsers();
            setMessage(message || "", false);
        } catch (error) {
            setMessage(error.message || "Kunde inte hämta data.", true);
        }
    }

    /* ── Öppna/stäng ─────────────────────────────────────────────────────── */

    async function openModal() {
        if (!auth()?.isAdmin()) return;
        buildModal().classList.remove("hidden");
        setMessage("Hämtar data...", false);
        await refresh("");
    }

    function closeModal() {
        modal?.classList.add("hidden");
    }

    function initButtons() {
        document.querySelectorAll("[data-admin-panel]").forEach(button => {
            if (button.dataset.adminBound === "true") return;
            button.dataset.adminBound = "true";
            button.addEventListener("click", () => {
                button.closest(".site-menu-dropdown, .planning-actions-dropdown")?.classList.add("hidden");
                openModal();
            });
        });
    }

    function syncVisibility(state) {
        document.querySelectorAll("[data-admin-panel]").forEach(button => {
            button.classList.toggle("hidden", state.role !== "admin");
        });
        if (state.role !== "admin") closeModal();
    }

    function init() {
        initButtons();
        if (!auth()) return;
        auth().onChange(syncVisibility);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
