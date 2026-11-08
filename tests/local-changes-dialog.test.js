const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const settle = () => new Promise(resolve => setImmediate(resolve));

function createDialog(storage = new Map()) {
    const keyListeners = new Set();
    const authListeners = new Set();
    const openWaiters = new Set();
    let signedIn = true;
    const document = {
        activeElement: null,
        addEventListener(name, callback) { if (name === "keydown") keyListeners.add(callback); },
        removeEventListener(name, callback) { if (name === "keydown") keyListeners.delete(callback); },
        createElement(tag) {
            const node = {
                tag, children: [], attributes: {}, handlers: {}, className: "", ownText: "",
                get textContent() { return this.ownText + this.children.map(child => child.textContent).join(""); },
                set textContent(text) { this.ownText = String(text); this.children = []; },
                setAttribute(key, value) { this.attributes[key] = value; },
                appendChild(child) { this.children.push(child); child.parent = this; return child; },
                remove() { this.parent.children = this.parent.children.filter(child => child !== this); },
                addEventListener(name, callback) { this.handlers[name] = callback; },
                focus() { document.activeElement = this; },
                querySelectorAll() {
                    return descendants(this).filter(child => ["button", "summary"].includes(child.tag) && !child.classList.contains("hidden"));
                },
                click(target = this) { this.handlers.click?.({ target }); }
            };
            node.classList = {
                contains: name => node.className.split(" ").includes(name),
                add: name => { node.className += ` ${name}`; },
                remove: name => { node.className = node.className.split(" ").filter(value => value !== name).join(" "); }
            };
            return node;
        }
    };
    document.body = document.createElement("body");
    const append = document.body.appendChild;
    document.body.appendChild = function (child) {
        append.call(this, child);
        openWaiters.forEach(resolve => resolve());
        openWaiters.clear();
        return child;
    };
    const previousFocus = document.createElement("button");
    previousFocus.focus();
    const auth = {
        getUser: () => signedIn ? { id: "leader" } : null,
        getState: () => ({ karId: signedIn ? "kar-1" : null, karName: "Testkåren" }),
        isSignedIn: () => signedIn,
        isLeader: () => signedIn,
        onChange(callback) { authListeners.add(callback); callback(); return () => authListeners.delete(callback); }
    };
    const context = vm.createContext({
        window: { GTScoutAuth: auth }, document, console,
        crypto: require("node:crypto").webcrypto,
        TextEncoder,
        sessionStorage: {
            getItem: key => storage.get(key) ?? null,
            setItem: (key, value) => storage.set(key, value)
        }
    });
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", "local-changes-dialog.js"), "utf8"), context);
    return {
        document, previousFocus, keyListeners, authListeners,
        confirm: config => context.window.GTScoutLocalChanges.confirm(config),
        opened: () => document.body.children.length ? Promise.resolve() : new Promise(resolve => openWaiters.add(resolve)),
        modal: () => document.body.children[0],
        button: text => descendants(document.body).find(node => node.tag === "button" && node.textContent === text),
        key(key, shiftKey = false) {
            const event = { key, shiftKey, prevented: false, stopped: false,
                preventDefault() { this.prevented = true; },
                stopImmediatePropagation() { this.stopped = true; } };
            [...keyListeners].forEach(callback => callback(event));
            return event;
        },
        change(kind) {
            if (kind === "user") auth.getUser = () => ({ id: "another-user" });
            if (kind === "kar") auth.getState = () => ({ karId: "another-kar", karName: "Annan kår" });
            if (kind === "role") auth.isLeader = () => false;
            [...authListeners].forEach(callback => callback());
        },
        logout() { signedIn = false; [...authListeners].forEach(callback => callback()); }
    };
}

function descendants(node) {
    return node.children.flatMap(child => [child, ...descendants(child)]);
}

const config = { kind: "recept", items: [{ title: "Pinnbröd", detail: "Bröd · 8 portioner" }] };

test("dialog lists every item, the target kar, details and complete conflict texts as safe text", async () => {
    const page = createDialog();
    const longText = "<script>alert(1)</script>" + "Lång anteckning ".repeat(30);
    const items = Array.from({ length: 100 }, (_, index) => ({ title: `Post ${index}`, detail: `Detalj ${index}` }));
    items.push({ title: "Elda", text: longText, remoteText: "Kårens anteckning" });
    const result = page.confirm({ kind: "märkesanteckningar", items });
    await page.opened();
    const modal = page.modal();
    assert.equal(modal.attributes.role, "dialog");
    assert.equal(modal.attributes["aria-modal"], "true");
    assert.ok(modal.attributes["aria-labelledby"]);
    assert.ok(modal.attributes["aria-describedby"]);
    const rows = descendants(modal).filter(node => node.tag === "li");
    assert.equal(rows.length, 101);
    assert.match(modal.textContent, /Sparas till: Testkåren/);
    assert.match(modal.textContent, /Post 99Detalj 99/);
    assert.ok(modal.textContent.includes(longText));
    assert.match(modal.textContent, /Visa hela texten/);
    assert.match(modal.textContent, /I kårens databas: Kårens anteckning/);
    assert.match(modal.textContent, /ersätter den lokala texten kårens anteckning/);
    assert.equal(descendants(modal).some(node => node.tag === "script"), false);
    page.button("Behåll lokalt").click();
    assert.equal(await result, "cancel");
});

for (const action of ["keep", "close", "escape", "outside"]) {
    test(`${action} preserves local items, cleans up and restores focus`, async () => {
        const page = createDialog();
        const result = page.confirm(config);
        await page.opened();
        assert.equal(page.document.activeElement, page.button("Behåll lokalt"));
        if (action === "keep") page.button("Behåll lokalt").click();
        if (action === "close") page.button("×").click();
        if (action === "escape") {
            const event = page.key("Escape");
            assert.equal(event.prevented, true);
            assert.equal(event.stopped, true);
        }
        if (action === "outside") page.modal().click();
        assert.equal(await result, "cancel");
        assert.equal(page.document.body.children.length, 0);
        assert.equal(page.keyListeners.size, 0);
        assert.equal(page.authListeners.size, 0);
        assert.equal(page.document.activeElement, page.previousFocus);
    });
}

test("deletion requires confirmation and can be backed out of without deleting", async () => {
    const page = createDialog();
    let resolved = false;
    const result = page.confirm(config).then(action => { resolved = true; return action; });
    await page.opened();
    page.button("Ta bort lokala poster").click();
    await settle();
    assert.equal(resolved, false);
    assert.match(page.modal().textContent, /Det går inte att ångra/);
    assert.equal(page.button("Spara i kårens databas").classList.contains("hidden"), true);
    page.button("Tillbaka").click();
    assert.equal(resolved, false);
    assert.equal(page.button("Spara i kårens databas").classList.contains("hidden"), false);
    page.button("Ta bort lokala poster").click();
    page.button("Ja, ta bort lokala poster").click();
    assert.equal(await result, "delete");
});

test("upload is explicit and Tab stays inside the modal", async () => {
    const page = createDialog();
    const result = page.confirm(config);
    await page.opened();
    page.button("×").focus();
    assert.equal(page.key("Tab", true).prevented, true);
    assert.equal(page.document.activeElement, page.button("Spara i kårens databas"));
    assert.equal(page.key("Tab").prevented, true);
    assert.equal(page.document.activeElement, page.button("×"));
    page.button("Spara i kårens databas").click();
    assert.equal(await result, "upload");
});

test("concurrent modules queue dialogs and logout cancels active and queued decisions", async () => {
    const page = createDialog();
    const first = page.confirm(config);
    const second = page.confirm({ kind: "aktiviteter", items: [{ title: "Lek" }] });
    await page.opened();
    assert.equal(page.document.body.children.length, 1);
    assert.match(page.modal().textContent, /Pinnbröd/);
    page.button("Behåll lokalt").click();
    assert.equal(await first, "cancel");
    await page.opened();
    assert.equal(page.document.body.children.length, 1);
    assert.match(page.modal().textContent, /Lek/);
    const third = page.confirm(config);
    page.logout();
    assert.equal(await second, "cancel");
    assert.equal(await third, "cancel");
    assert.equal(page.document.body.children.length, 0);
});

for (const kind of ["user", "kar", "role"]) {
    test(`changing ${kind} cancels the visible dialog and any queued decision`, async () => {
        const page = createDialog();
        const first = page.confirm(config);
        const second = page.confirm(config);
        await page.opened();
        page.change(kind);
        assert.equal(await first, "cancel");
        assert.equal(await second, "cancel");
        assert.equal(page.document.body.children.length, 0);
    });
}

test("keeping unchanged data suppresses queued duplicates and survives module navigation", async () => {
    const storage = new Map();
    const page = createDialog(storage);
    const first = page.confirm(config);
    const duplicate = page.confirm(config);
    await page.opened();
    page.button("Behåll lokalt").click();
    assert.equal(await first, "cancel");
    await settle();
    assert.equal(page.modal(), undefined, "Duplicate dialog must not be displayed");
    assert.equal(await duplicate, "cancel");
    const nextModule = createDialog(storage);
    const repeat = nextModule.confirm(config);
    await settle();
    assert.equal(nextModule.modal(), undefined, "Module navigation must preserve the decision");
    assert.equal(await repeat, "cancel");
    assert.ok(![...storage.values()].some(value => value.includes("Pinnbröd")), "Decision storage must not duplicate local content");
});

test("changed local content and a different module still get their own questions", async () => {
    const page = createDialog();
    const local = { kind: "aktiviteter", items: [{ title: "Lek" }], localData: [{ id: "egen-1", beskrivning: "Först" }] };
    const first = page.confirm(local);
    await page.opened();
    page.button("Behåll lokalt").click();
    await first;
    const changed = page.confirm({ ...local, localData: [{ id: "egen-1", beskrivning: "Ändrat" }] });
    await page.opened();
    assert.match(page.modal().textContent, /Lek/);
    page.button("Behåll lokalt").click();
    await changed;
    const notes = page.confirm({ kind: "märkesanteckningar", items: [{ title: "Elda", text: "Min anteckning" }] });
    await page.opened();
    assert.match(page.modal().textContent, /Min anteckning/);
    page.button("Behåll lokalt").click();
    await notes;
});

test("cache flags and object ordering do not repeat an unchanged local-data question", async () => {
    const storage = new Map();
    const page = createDialog(storage);
    const local = { kind: "planeringar", items: [{ title: "Spårarna" }], localData: [{ id: "plan-1", name: "Spårarna" }] };
    const first = page.confirm(local);
    await page.opened();
    page.button("Behåll lokalt").click();
    await first;
    const nextModule = createDialog(storage);
    const repeat = nextModule.confirm({
        ...local,
        localData: [{ name: "Spårarna", id: "plan-1", local_only: true, keep_local: true, local_kar_id: "kar-1", updated_at: "2026-11-08" }]
    });
    assert.equal(await repeat, "cancel");
    assert.equal(nextModule.modal(), undefined);
});

for (const kind of ["user", "kar"]) {
    test(`a kept decision from another ${kind} does not suppress the question`, async () => {
        const storage = new Map();
        const page = createDialog(storage);
        const first = page.confirm(config);
        await page.opened();
        page.button("Behåll lokalt").click();
        await first;
        const changed = createDialog(storage);
        changed.change(kind);
        const result = changed.confirm(config);
        await changed.opened();
        changed.button("Behåll lokalt").click();
        assert.equal(await result, "cancel");
    });
}

test("all pages using a local-data sync module load the shared dialog first", () => {
    const root = path.join(__dirname, "..");
    for (const name of fs.readdirSync(root).filter(name => name.endsWith(".html"))) {
        const html = fs.readFileSync(path.join(root, name), "utf8");
        const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map(match => match[1].split("?")[0]);
        const modules = scripts.filter(src => /(?:activities|notes|arrangemang|planering|kokbok|arshjul)-sync\.js$/.test(src));
        if (!modules.length) continue;
        const dialogIndex = scripts.indexOf("js/local-changes-dialog.js");
        assert.ok(dialogIndex >= 0, `${name} must load the shared dialog`);
        modules.forEach(src => assert.ok(dialogIndex < scripts.indexOf(src), `${name}: dialog must precede ${src}`));
    }
});
