const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const readScript = name => fs.readFileSync(path.join(__dirname, "..", "js", name), "utf8");
const recipe = { id: "recipe-1", namn: "Soppa", ingredienser: ["Potatis"], instruktioner: "Koka." };

function createCookbook(responses = [], signedIn = true, onRetry = () => {}) {
    const requests = [];
    const delays = [];
    const storage = new Map();
    const client = {
        from(table) {
            assert.equal(table, "kokbok_recept");
            return {
                async upsert(row, options) {
                    requests.push({ row: structuredClone(row), options: structuredClone(options) });
                    const response = responses.shift();
                    if (response instanceof Error) throw response;
                    return response || { error: null };
                }
            };
        }
    };
    const context = vm.createContext({
        window: { GTScoutAuth: {
            getClient: () => client,
            getState: () => ({ karId: "kar-1" }),
            getUser: () => signedIn ? { id: "leader-1" } : null,
            isSignedIn: () => signedIn,
            isLeader: () => signedIn
        } },
        localStorage: {
            getItem: key => storage.get(key) ?? null,
            setItem: (key, value) => storage.set(key, value)
        },
        crypto: globalThis.crypto,
        setTimeout(callback, delay) { delays.push(delay); onRetry(context.window.GTScoutAuth); callback(); }
    });
    vm.runInContext(readScript("kokbok-sync.js"), context);
    return { cookbook: context.window.GTScoutCookbook, requests, delays, storage };
}

test("recipe save succeeds without retrying a successful write", async () => {
    const { cookbook, requests, delays } = createCookbook();
    const result = await cookbook.save(recipe);
    assert.equal(result.recipe.namn, recipe.namn);
    assert.equal(requests.length, 1);
    assert.equal(delays.length, 0);
});

for (const message of ["Load failed", "Failed to fetch", "NetworkError when attempting to fetch resource."]) {
    for (const thrown of [false, true]) {
        test(`recipe save retries ${thrown ? "a rejected" : "a returned"} ${message} once with the same row`, async () => {
            const error = thrown ? new TypeError(message) : { message: `TypeError: ${message}`, code: "", details: "" };
            const { cookbook, requests, delays, storage } = createCookbook([thrown ? error : { error }]);
            const result = await cookbook.save({ ...recipe, id: undefined });
            assert.equal(requests.length, 2);
            assert.deepEqual(requests[0], requests[1]);
            assert.equal(requests[0].options.onConflict, "id");
            assert.equal(requests[0].row.kar_id, "kar-1");
            assert.equal(result.recipe.id, requests[0].row.id);
            assert.equal(delays.length, 1);
            assert.ok(delays[0] > 0);
            assert.equal(JSON.parse(storage.get("gtscout_kokbok_recept")).length, 1);
        });
    }
}

test("recipe save stops after one retry and preserves local edits on persistent network failure", async () => {
    const error = { message: "TypeError: Load failed", code: "" };
    const { cookbook, requests, storage } = createCookbook([{ error }, { error }]);
    await assert.rejects(cookbook.save(recipe), failure => failure === error);
    assert.equal(requests.length, 2);
    assert.equal(cookbook.getAll()[0].instruktioner, recipe.instruktioner);
    assert.equal(JSON.parse(storage.get("gtscout_kokbok_recept"))[0].namn, recipe.namn);
});

for (const error of [
    { code: "42501", message: "Permission denied" },
    { code: "23514", message: "Check constraint violated" },
    { code: "42501", message: "TypeError: Load failed" },
    new TypeError("Invalid input"),
    { message: "Request aborted" }
]) {
    test(`recipe save does not retry non-network errors: ${error.message}`, async () => {
        const { cookbook, requests, delays } = createCookbook([error instanceof Error ? error : { error }]);
        await assert.rejects(cookbook.save(recipe), failure => failure === error);
        assert.equal(requests.length, 1);
        assert.equal(delays.length, 0);
    });
}

test("recipe save remains local without a signed-in leader", async () => {
    const { cookbook, requests } = createCookbook([], false);
    const result = await cookbook.save(recipe);
    assert.equal(result.localOnly, true);
    assert.equal(requests.length, 0);
});

for (const change of ["logout", "user", "kar", "role"]) {
    test(`recipe save does not retry after an auth change: ${change}`, async () => {
        const error = { message: "TypeError: Load failed", code: "" };
        const { cookbook, requests } = createCookbook([{ error }], true, auth => {
            if (change === "logout" || change === "role") auth.isLeader = () => false;
            if (change === "logout") { auth.isSignedIn = () => false; auth.getUser = () => null; }
            if (change === "user") auth.getUser = () => ({ id: "another-leader" });
            if (change === "kar") auth.getState = () => ({ karId: "another-kar" });
        });
        await assert.rejects(cookbook.save(recipe), failure => failure === error);
        assert.equal(requests.length, 1);
    });
}

for (const fails of [false, true]) {
    test(`recipe form prevents duplicate submissions and restores saving after ${fails ? "failure" : "success"}`, async () => {
        let finish;
        const pending = new Promise((resolve, reject) => {
            finish = () => fails ? reject(new Error("TypeError: Load failed")) : resolve({});
        });
        const button = { disabled: false };
        const status = { textContent: "Previous error" };
        let saves = 0;
        let closed = false;
        const context = vm.createContext({
            recipeForm: { querySelector: () => button },
            recipeFormStatus: status,
            editingRecipeId: recipe.id,
            readIngredientRows: () => [{ namn: "Potatis", mangder: { "4": "1 kg" } }],
            document: { getElementById: () => ({ value: "Soppa" }) },
            window: { GTScoutCookbook: {
                save: () => { saves++; return pending; },
                getAll: () => [recipe]
            } },
            populateRecipeFilters() {},
            renderRecipes() {},
            closeRecipeModal() { closed = true; },
            setRecipeStatus() {}
        });
        const source = readScript("kokbok.js");
        vm.runInContext(source.slice(source.indexOf("async function saveRecipe("), source.indexOf("async function deleteRecipe(")), context);
        const saving = context.saveRecipe({ preventDefault() {} });
        assert.equal(button.disabled, true);
        assert.equal(status.textContent, "Sparar recept…");
        await context.saveRecipe({ preventDefault() {} });
        assert.equal(saves, 1);
        finish();
        await saving;
        assert.equal(button.disabled, false);
        assert.equal(closed, !fails);
        if (fails) assert.equal(status.textContent, "TypeError: Load failed");
    });
}
