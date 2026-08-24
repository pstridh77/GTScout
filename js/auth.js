/**
 * Användarhantering mot Supabase.
 *
 * Modulen är helt frivillig: saknas konfiguration, eller går Supabase inte att nå,
 * körs applikationen vidare i offline-läge mot localStorage med rollen "Gäst".
 */
(function () {
    const SUPABASE_CDN = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js";

    const ROLES = { GUEST: "gast", LEADER: "ledare", ADMIN: "admin" };
    const ROLE_LABELS = { gast: "Gäst", ledare: "Ledare", admin: "Admin" };

    let client = null;
    let session = null;
    let profile = null;
    let karName = "";
    const listeners = new Set();

    function config() {
        const raw = window.GTSCOUT_SUPABASE_CONFIG || {};
        return { url: (raw.url || "").trim(), anonKey: (raw.anonKey || "").trim() };
    }

    function isConfigured() {
        const { url, anonKey } = config();
        return Boolean(url && anonKey);
    }

    function getRole() {
        return profile?.role || ROLES.GUEST;
    }

    function state() {
        return {
            online: Boolean(client),
            signedIn: Boolean(session?.user),
            email: session?.user?.email || "",
            role: getRole(),
            roleLabel: ROLE_LABELS[getRole()] || ROLE_LABELS.gast,
            karId: profile?.kar_id || null,
            karName,
            profile
        };
    }

    function notify() {
        const current = state();
        listeners.forEach(listener => {
            try {
                listener(current);
            } catch (error) {
                console.error("Auth-lyssnare kastade fel", error);
            }
        });
    }

    function loadScript(src) {
        return new Promise((resolve, reject) => {
            const script = document.createElement("script");
            script.src = src;
            script.async = true;
            script.onload = resolve;
            script.onerror = () => reject(new Error("Kunde inte ladda " + src));
            document.head.appendChild(script);
        });
    }

    async function loadProfile() {
        profile = null;
        karName = "";
        if (!client || !session?.user) return;

        const { data, error } = await client
            .from("profiles")
            .select("id, email, full_name, role, kar_id")
            .eq("id", session.user.id)
            .maybeSingle();

        if (error) {
            console.error("Kunde inte hämta profil", error);
            return;
        }
        profile = data || null;

        if (profile?.kar_id) {
            const { data: kar, error: karError } = await client
                .from("kar")
                .select("namn")
                .eq("id", profile.kar_id)
                .maybeSingle();
            if (karError) {
                console.error("Kunde inte hämta kår", karError);
            } else {
                karName = kar?.namn || "";
            }
        }
    }

    async function signIn(email, password) {
        if (!client) throw new Error("Databaskoppling saknas.");
        const { error } = await client.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
    }

    async function signOut() {
        if (!client) return;
        await client.auth.signOut();
    }

    async function resetPassword(email) {
        if (!client) throw new Error("Databaskoppling saknas.");
        const { error } = await client.auth.resetPasswordForEmail(email.trim(), {
            redirectTo: window.location.origin + window.location.pathname
        });
        if (error) throw error;
    }

    /* ── Gränssnitt ──────────────────────────────────────────────────────── */

    function buildUi() {
        const area = document.getElementById("authArea");
        if (!area || area.dataset.ready === "true") return area;

        area.dataset.ready = "true";
        area.innerHTML = `
            <span id="authStatus" class="auth-status">Gäst</span>
            <button id="authActionBtn" class="auth-button" type="button">Logga in</button>
        `;

        const modal = document.createElement("div");
        modal.id = "authModal";
        modal.className = "modal hidden";
        modal.innerHTML = `
            <div class="modal-content" role="dialog" aria-modal="true" aria-labelledby="authModalTitle">
                <h2 id="authModalTitle">Logga in</h2>
                <p class="auth-note">Du kan använda Märkesbiblioteket utan att logga in – då sparas allt lokalt i webbläsaren.</p>
                <label class="modal-field">
                    <span>E-postadress</span>
                    <input id="authEmail" type="email" autocomplete="username" placeholder="namn@kar.se">
                </label>
                <label class="modal-field">
                    <span>Lösenord</span>
                    <input id="authPassword" type="password" autocomplete="current-password">
                </label>
                <p id="authMessage" class="auth-message hidden"></p>
                <div class="modal-actions modal-actions--split">
                    <button id="authResetBtn" class="btn-secondary" type="button">Glömt lösenord</button>
                    <button id="authSubmitBtn" class="btn-primary" type="button">Logga in</button>
                </div>
                <div class="modal-actions">
                    <button id="authCancelBtn" class="btn-secondary" type="button">Avbryt</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        modal.addEventListener("click", event => {
            if (event.target === modal) closeModal();
        });
        document.getElementById("authCancelBtn").addEventListener("click", closeModal);
        document.getElementById("authSubmitBtn").addEventListener("click", submitLogin);
        document.getElementById("authResetBtn").addEventListener("click", submitReset);
        document.getElementById("authPassword").addEventListener("keydown", event => {
            if (event.key === "Enter") submitLogin();
        });
        document.getElementById("authActionBtn").addEventListener("click", () => {
            if (session?.user) {
                signOut();
            } else {
                openModal();
            }
        });

        return area;
    }

    function setMessage(text, isError) {
        const el = document.getElementById("authMessage");
        if (!el) return;
        el.textContent = text || "";
        el.classList.toggle("hidden", !text);
        el.classList.toggle("auth-message--error", Boolean(isError));
    }

    function openModal() {
        if (!client) {
            window.alert("Ingen databaskoppling är konfigurerad. Applikationen körs mot lokalt sparad data.");
            return;
        }
        setMessage("", false);
        const modal = document.getElementById("authModal");
        if (!modal) return;
        modal.classList.remove("hidden");
        document.getElementById("authPassword").value = "";
        document.getElementById("authEmail").focus();
    }

    function closeModal() {
        document.getElementById("authModal")?.classList.add("hidden");
    }

    async function submitLogin() {
        const email = document.getElementById("authEmail").value;
        const password = document.getElementById("authPassword").value;
        if (!email || !password) {
            setMessage("Fyll i både e-postadress och lösenord.", true);
            return;
        }
        const button = document.getElementById("authSubmitBtn");
        button.disabled = true;
        setMessage("Loggar in...", false);
        try {
            await signIn(email, password);
            closeModal();
        } catch (error) {
            setMessage(error.message || "Inloggningen misslyckades.", true);
        } finally {
            button.disabled = false;
        }
    }

    async function submitReset() {
        const email = document.getElementById("authEmail").value;
        if (!email) {
            setMessage("Ange din e-postadress först.", true);
            return;
        }
        try {
            await resetPassword(email);
            setMessage("Ett återställningsmail har skickats.", false);
        } catch (error) {
            setMessage(error.message || "Kunde inte skicka återställningsmail.", true);
        }
    }

    function renderUi() {
        const status = document.getElementById("authStatus");
        const button = document.getElementById("authActionBtn");
        if (!status || !button) return;

        const current = state();
        if (!current.online) {
            status.textContent = "Gäst (lokalt läge)";
            status.title = "Ingen databaskoppling konfigurerad – data sparas i webbläsaren.";
            button.classList.add("hidden");
            return;
        }
        button.classList.remove("hidden");
        if (current.signedIn) {
            const kar = current.karName ? " · " + current.karName : "";
            status.textContent = `${current.roleLabel}: ${current.email}${kar}`;
            status.title = current.karName ? "Kår: " + current.karName : "";
            button.textContent = "Logga ut";
        } else {
            status.textContent = "Gäst";
            status.title = "Inte inloggad – data sparas i webbläsaren.";
            button.textContent = "Logga in";
        }
    }

    /* ── Init ────────────────────────────────────────────────────────────── */

    async function init() {
        buildUi();
        renderUi();

        if (!isConfigured()) {
            notify();
            return;
        }

        try {
            if (!window.supabase?.createClient) {
                await loadScript(SUPABASE_CDN);
            }
            const { url, anonKey } = config();
            client = window.supabase.createClient(url, anonKey);

            const { data } = await client.auth.getSession();
            session = data?.session || null;
            await loadProfile();

            client.auth.onAuthStateChange(async (_event, newSession) => {
                session = newSession;
                await loadProfile();
                renderUi();
                notify();
            });
        } catch (error) {
            console.error("Supabase kunde inte initieras, fortsätter i lokalt läge", error);
            client = null;
            session = null;
            profile = null;
        }

        renderUi();
        notify();
    }

    window.GTScoutAuth = {
        ROLES,
        ROLE_LABELS,
        init,
        getClient: () => client,
        getUser: () => session?.user || null,
        getProfile: () => profile,
        getRole,
        getState: state,
        isOnline: () => Boolean(client),
        isSignedIn: () => Boolean(session?.user),
        isLeader: () => [ROLES.LEADER, ROLES.ADMIN].includes(getRole()),
        isAdmin: () => getRole() === ROLES.ADMIN,
        signIn,
        signOut,
        openLogin: openModal,
        onChange(listener) {
            listeners.add(listener);
            listener(state());
            return () => listeners.delete(listener);
        }
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
