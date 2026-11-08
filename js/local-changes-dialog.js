(function () {
    const KEPT_STORAGE_KEY = "gtscout_local_changes_kept";
    let queue = Promise.resolve();
    let nextId = 0;

    function readKept() {
        try {
            const value = JSON.parse(sessionStorage.getItem(KEPT_STORAGE_KEY) || "{}");
            if (!value || typeof value !== "object" || Array.isArray(value)) {
                throw new Error("Ogiltigt format för lokala dialogval.");
            }
            return value;
        } catch (error) {
            console.error("Kunde inte läsa tidigare val för lokala poster", error);
            return {};
        }
    }

    async function fingerprint(config) {
        const serialize = value => JSON.stringify(value, (_key, item) =>
            item && typeof item === "object" && !Array.isArray(item)
                ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
        const data = JSON.stringify([
            config.items.map(serialize).sort(),
            (config.localData || []).map(item => {
                const content = { ...item };
                delete content.local_only;
                delete content.keep_local;
                delete content.local_kar_id;
                delete content.updated_at;
                return serialize(content);
            }).sort()
        ]);
        const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(data));
        return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
    }

    function element(tag, text, className) {
        const node = document.createElement(tag);
        if (text !== undefined) node.textContent = text;
        if (className) node.className = className;
        return node;
    }

    function addText(parent, label, text) {
        const value = String(text);
        const preview = element("p", `${label}${value.length > 160 ? `${value.slice(0, 160)}…` : value}`, "sync-local-text");
        parent.appendChild(preview);
        if (value.length > 160) {
            const details = element("details");
            details.appendChild(element("summary", "Visa hela texten"));
            details.appendChild(element("p", value, "sync-local-text"));
            parent.appendChild(details);
        }
    }

    function show(config) {
        if (!config.isCurrent()) return Promise.resolve("cancel");
        const id = `localChangesDialog${++nextId}`;
        const previousFocus = document.activeElement;
        const modal = element("div", undefined, "modal sync-local-modal");
        modal.setAttribute("role", "dialog");
        modal.setAttribute("aria-modal", "true");
        modal.setAttribute("aria-labelledby", `${id}Title`);
        modal.setAttribute("aria-describedby", `${id}Message`);
        const content = element("div", undefined, "modal-content sync-local-content");
        const close = element("button", "×", "close-popup");
        close.type = "button";
        close.setAttribute("aria-label", "Stäng och behåll lokalt");
        const title = element("h2", `Hantera lokala ${config.kind} (${config.items.length})`);
        title.id = `${id}Title`;
        const message = element("p",
            "Dessa poster finns i den här webbläsaren men saknas i databasen eller skiljer sig från kårens version. Välj vad du vill göra med posterna i listan.",
            "sync-upload-dialog-message");
        message.id = `${id}Message`;
        const target = element("p", `Sparas till: ${config.karName || "din kår"}`);
        const list = element("ul", undefined, "sync-local-list");
        for (const item of config.items) {
            const row = element("li");
            row.appendChild(element("strong", item.title));
            if (item.detail) row.appendChild(element("p", item.detail));
            if (item.text !== undefined) addText(row, item.remoteText !== undefined ? "Lokalt: " : "", item.text);
            if (item.remoteText !== undefined) {
                row.appendChild(element("p", "Skiljer sig från kårens anteckning", "detail-note-warning"));
                addText(row, "I kårens databas: ", item.remoteText);
                row.appendChild(element("p", "Vid sparning ersätter den lokala texten kårens anteckning.", "detail-note-warning"));
            }
            list.appendChild(row);
        }
        const help = element("div", undefined, "sync-local-help");
        help.appendChild(element("p", "Behåll lokalt: Poster sparas bara i den här webbläsaren. Vid utloggning rensas lokal kårdata."));
        help.appendChild(element("p", "Ta bort lokala poster: Tar bort posterna i listan. Kårens databasposter påverkas inte."));
        help.appendChild(element("p", "Spara i kårens databas: Sparar posterna till den angivna kåren."));
        const actions = element("div", undefined, "modal-actions sync-local-actions");
        const keep = element("button", "Behåll lokalt", "btn-secondary");
        const remove = element("button", "Ta bort lokala poster", "btn-danger");
        const upload = element("button", "Spara i kårens databas", "btn-primary");
        for (const button of [keep, remove, upload]) {
            button.type = "button";
            actions.appendChild(button);
        }
        content.appendChild(close);
        content.appendChild(title);
        content.appendChild(message);
        content.appendChild(target);
        content.appendChild(list);
        content.appendChild(help);
        content.appendChild(actions);
        modal.appendChild(content);
        document.body.appendChild(modal);

        return new Promise(resolve => {
            let deleting = false;
            let finished = false;
            let unsubscribe = null;
            function finish(action) {
                if (finished) return;
                finished = true;
                document.removeEventListener("keydown", onKeydown, true);
                unsubscribe?.();
                modal.remove();
                previousFocus?.focus();
                resolve(config.isCurrent() ? action : "cancel");
            }
            function onKeydown(event) {
                if (event.key === "Escape") {
                    event.preventDefault();
                    event.stopImmediatePropagation();
                    finish("cancel");
                } else if (event.key === "Tab") {
                    const focusable = [...content.querySelectorAll("button:not(.hidden), summary")];
                    const index = focusable.indexOf(document.activeElement);
                    if (event.shiftKey && index <= 0) {
                        event.preventDefault();
                        focusable.at(-1).focus();
                    } else if (!event.shiftKey && (index === -1 || index === focusable.length - 1)) {
                        event.preventDefault();
                        focusable[0].focus();
                    }
                }
            }
            close.addEventListener("click", () => finish("cancel"));
            modal.addEventListener("click", event => {
                if (event.target === modal) finish("cancel");
            });
            keep.addEventListener("click", () => {
                if (!deleting) {
                    finish("cancel");
                    return;
                }
                deleting = false;
                title.textContent = `Hantera lokala ${config.kind} (${config.items.length})`;
                message.textContent = "Välj vad du vill göra med posterna i listan.";
                keep.textContent = "Behåll lokalt";
                remove.textContent = "Ta bort lokala poster";
                upload.classList.remove("hidden");
            });
            remove.addEventListener("click", () => {
                if (deleting) {
                    finish("delete");
                    return;
                }
                deleting = true;
                title.textContent = "Ta bort lokala poster?";
                message.textContent = `De ${config.items.length} lokala posterna i listan tas bort från den här webbläsaren. Det går inte att ångra. Kårens databasposter påverkas inte.`;
                keep.textContent = "Tillbaka";
                remove.textContent = "Ja, ta bort lokala poster";
                upload.classList.add("hidden");
                keep.focus();
            });
            upload.addEventListener("click", () => finish("upload"));
            document.addEventListener("keydown", onKeydown, true);
            unsubscribe = window.GTScoutAuth?.onChange(() => {
                if (!config.isCurrent()) finish("cancel");
            });
            if (finished) unsubscribe?.();
            else keep.focus();
        });
    }

    window.GTScoutLocalChanges = {
        confirm(config) {
            const auth = window.GTScoutAuth;
            const userId = auth?.getUser()?.id;
            const karId = auth?.getState().karId;
            const current = {
                ...config,
                karName: auth?.getState().karName,
                isCurrent: () => auth?.isSignedIn() && auth?.isLeader()
                    && auth?.getUser()?.id === userId && auth?.getState().karId === karId
                    && (!config.isCurrent || config.isCurrent())
            };
            // Moduler kan fråga samtidigt; visa en lista åt gången.
            const result = queue.then(async () => {
                if (!current.isCurrent()) return "cancel";
                const key = JSON.stringify([window.GTSCOUT_SUPABASE_CONFIG?.url || "", userId, karId, config.kind]);
                let signature = null;
                try {
                    signature = await fingerprint(current);
                } catch (error) {
                    console.error("Kunde inte jämföra lokala poster med tidigare dialogval", error);
                }
                if (!current.isCurrent()) return "cancel";
                if (signature && readKept()[key] === signature) return "cancel";
                const action = await show(current);
                if (action === "cancel" && signature && current.isCurrent()) {
                    try {
                        sessionStorage.setItem(KEPT_STORAGE_KEY, JSON.stringify({ ...readKept(), [key]: signature }));
                    } catch (error) {
                        console.error("Kunde inte komma ihåg valet att behålla lokala poster", error);
                    }
                }
                return action;
            });
            queue = result.catch(error => console.error("Kunde inte visa dialog för lokala poster", error));
            return result;
        }
    };
})();
