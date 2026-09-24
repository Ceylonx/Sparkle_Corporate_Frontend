/**
 * Transfer Note (To Production) has parent permissions SalesRetail_To_Production_*
 * and optional granular sub-tabs: Outlet_Transfer_Note, Receive_to_Sorting, Work_in_Progress.
 * When any granular token exists, each sub-tab uses only its own tokens (or is hidden);
 * otherwise behaviour falls back to the parent To_Production_* flags (legacy).
 */

const OUTLET_PREFIX = "SalesRetail_Outlet_Transfer_Note_";
const RECEIVE_PREFIX = "SalesRetail_Receive_to_Sorting_";
const WIP_PREFIX = "SalesRetail_Work_in_Progress_";

const GRANULAR_PREFIXES = [OUTLET_PREFIX, RECEIVE_PREFIX, WIP_PREFIX];

const PARENT = {
    view: ["SalesRetail_To_Production_View", "SalesRetail To Production View"],
    create: ["SalesRetail_To_Production_Create", "SalesRetail To Production Create"],
    approve: ["SalesRetail_To_Production_Approve", "SalesRetail To Production Approve"],
    edit: ["SalesRetail_To_Production_Edit", "SalesRetail To Production Edit"],
    delete: ["SalesRetail_To_Production_Delete", "SalesRetail To Production Delete"],
};

/** @param {string} permissions */
export function parsePermissionTokens(permissions) {
    const stored = permissions || "";
    if (typeof stored !== "string") return [];
    const t = stored.trim();
    const out = new Set();
    if (t.startsWith("[")) {
        try {
            const j = JSON.parse(t);
            if (Array.isArray(j)) {
                j.forEach((x) => {
                    const s = String(x).trim();
                    if (s) out.add(s);
                });
                const re = /SalesRetail(?:_[A-Za-z0-9]+)+_(?:View|Create|Edit|Delete|Approve|Send|Receive)/gi;
                let m;
                while ((m = re.exec(t)) !== null) {
                    out.add(m[0]);
                }
                return [...out].filter(Boolean);
            }
        } catch {
            // fall through to split / regex
        }
    }
    t.split(/[,;\n\r\t]+/)
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach((s) => out.add(s));
    // Recover SalesRetail_* tokens if the API glued or formatted oddly
    const re = /SalesRetail(?:_[A-Za-z0-9]+)+_(?:View|Create|Edit|Delete|Approve|Send|Receive)/gi;
    let m;
    while ((m = re.exec(t)) !== null) {
        out.add(m[0]);
    }
    return [...out].filter(Boolean);
}

/** @param {string} raw @param {string} frag */
function rawIncludesCi(raw, frag) {
    return String(raw).toLowerCase().includes(String(frag).toLowerCase());
}

/** @param {string[]} tokens @param {string} prefix */
function hasTokenStartingWith(tokens, prefix) {
    const pl = prefix.toLowerCase();
    return tokens.some((tok) => String(tok).trim().toLowerCase().startsWith(pl));
}

/** True if `tokens` contains the exact `${prefix}${suffix}` token (case-insensitive). */
function tokenEqualsPrefix(tokens, prefix, suffix) {
    const want = `${prefix}${suffix}`.toLowerCase();
    return tokens.some((tok) => String(tok).trim().toLowerCase() === want);
}

/**
 * True if the role has an exact SalesRetail_*_Edit token (and optional spaced legacy form).
 * @param {string} rawPermissions
 * @param {string[]} tokens
 * @param {string} underscorePermission e.g. "SalesRetail_Outlet_Dispatch_Note_Edit"
 */
export function hasSalesRetailGranularEditPermission(rawPermissions = "", tokens = [], underscorePermission) {
    const canon = String(underscorePermission).trim().toLowerCase();
    const spaced =
        /^salesretail_/i.test(underscorePermission) &&
        `salesretail ${String(underscorePermission)
            .trim()
            .replace(/^salesretail_/i, "")
            .replace(/_/g, " ")
            .toLowerCase()}`;
    for (const tok of tokens) {
        const t = String(tok).trim().toLowerCase();
        if (t === canon || (spaced && t === spaced)) return true;
    }
    const raw = String(rawPermissions || "").toLowerCase();
    const boundaryOk = (haystack, needle) => {
        if (!needle || !haystack) return false;
        let start = 0;
        while (start <= haystack.length) {
            const i = haystack.indexOf(needle, start);
            if (i === -1) return false;
            const before = i === 0 ? "\0" : haystack[i - 1];
            const afterIdx = i + needle.length;
            const after = afterIdx >= haystack.length ? "\0" : haystack[afterIdx];
            const delim = (c) => c === "\0" || /[^a-z0-9_]/i.test(c);
            if (delim(before) && delim(after)) return true;
            start = i + 1;
        }
        return false;
    };
    if (boundaryOk(raw, canon)) return true;
    if (spaced) {
        const normSpaced = raw.replace(/\s+/g, " ");
        if (normSpaced.includes(spaced)) return true;
    }
    return false;
}

/**
 * WIP list row Edit: only when this permission is present (same rule for every role, including superadmin).
 * @param {string} [rawPermissions]
 * @param {string[]} [tokens]
 */
export function hasSalesRetailWorkInProgressEdit(rawPermissions = "", tokens = []) {
    return hasSalesRetailGranularEditPermission(rawPermissions, tokens, "SalesRetail_Work_in_Progress_Edit");
}

/** Dispatch Note → Outlet Dispatch Note tab row Edit */
export function hasSalesRetailOutletDispatchNoteEdit(rawPermissions = "", tokens = []) {
    return hasSalesRetailGranularEditPermission(rawPermissions, tokens, "SalesRetail_Outlet_Dispatch_Note_Edit");
}

const OUTLET_RECEIVED_NOTE_PREFIX = "SalesRetail_Outlet_Received_Note_";

/**
 * True if the role has any token or raw substring for Outlet Received Note (granular dispatch-note subtree).
 * When this is true, the Receive action requires explicit `…_Receive` — not `…_Approve` alone (admin splits those).
 */
function hasGranularOutletReceivedNoteScope(tokens, rawPermissions) {
    const pl = OUTLET_RECEIVED_NOTE_PREFIX.toLowerCase();
    if (tokens.some((tok) => String(tok).trim().toLowerCase().startsWith(pl))) {
        return true;
    }
    return rawIncludesCi(rawPermissions, OUTLET_RECEIVED_NOTE_PREFIX);
}

/** Dispatch Note → Outlet Received Note tab row Edit */
export function hasSalesRetailOutletReceivedNoteEdit(rawPermissions = "", tokens = []) {
    return hasSalesRetailGranularEditPermission(rawPermissions, tokens, "SalesRetail_Outlet_Received_Note_Edit");
}

/**
 * Dispatch Note → Outlet Dispatch tab: Send requires the exact …_Send permission (admin exposes
 * a dedicated SEND column for this row, same as Outlet Transfer Note) - Create alone must not
 * imply Send, or a role with Save-but-no-Send could still mark orders as sent.
 */
export function hasSalesRetailOutletDispatchNoteSend(rawPermissions = "", tokens = []) {
    return hasSalesRetailGranularEditPermission(rawPermissions, tokens, "SalesRetail_Outlet_Dispatch_Note_Send");
}

/** Dispatch Note → Outlet Received tab: row Receive (explicit Receive when granular subtree is used). */
export function hasSalesRetailOutletReceivedNoteReceiveAction(rawPermissions = "", tokens = []) {
    const hasReceive = hasSalesRetailGranularEditPermission(
        rawPermissions,
        tokens,
        "SalesRetail_Outlet_Received_Note_Receive"
    );
    if (hasGranularOutletReceivedNoteScope(tokens, rawPermissions)) {
        return hasReceive;
    }
    return (
        hasReceive ||
        hasSalesRetailGranularEditPermission(rawPermissions, tokens, "SalesRetail_Outlet_Received_Note_Approve") ||
        hasSalesRetailGranularEditPermission(rawPermissions, tokens, "SalesRetail_Back_to_Outlet_Approve")
    );
}

/** Dispatch Note → Ready To Invoice tab: edit with admin `Ready_to_Invoice` **or** legacy `SalesRetail_Invoice_Dispatch_Note_*` (older matrix overlap). */
export function hasSalesRetailInvoiceDispatchNoteEdit(rawPermissions = "", tokens = []) {
    return (
        hasSalesRetailGranularEditPermission(rawPermissions, tokens, "SalesRetail_Ready_to_Invoice_Edit") ||
        hasSalesRetailGranularEditPermission(rawPermissions, tokens, "SalesRetail_Invoice_Dispatch_Note_Edit")
    );
}

function finalizeWipEdit(wipActions, rawPermissions, tokens) {
    return { ...wipActions, edit: hasSalesRetailWorkInProgressEdit(rawPermissions, tokens) };
}

/** @param {string[]} tokens */
export function hasAnyGranularTransferNoteToken(tokens) {
    return GRANULAR_PREFIXES.some((p) => hasTokenStartingWith(tokens, p));
}

function parentHas(tokens, keys) {
    return keys.some((k) =>
        PARENT[k].some((label) => tokens.some((tok) => String(tok).trim().toLowerCase() === String(label).toLowerCase()))
    );
}

function buildParentFlags(tokens) {
    return {
        view: parentHas(tokens, ["view"]),
        create: parentHas(tokens, ["create"]),
        approve: parentHas(tokens, ["approve"]),
        edit: parentHas(tokens, ["edit"]),
        delete: parentHas(tokens, ["delete"]),
    };
}

/**
 * Transfer Note → Outlet Transfer Note: user may send only with this exact permission.
 * Uses exact token match + bounded match in raw string (avoids false positives from hasSalesRetailGranularEditPermission edge cases).
 */
export function hasSalesRetailOutletTransferNoteSendAction(rawPermissions = "", tokens = []) {
    const exact = "salesretail_outlet_transfer_note_send";
    for (const tok of tokens) {
        if (String(tok).trim().toLowerCase() === exact) return true;
    }
    const raw = String(rawPermissions || "");
    if (/\bSalesRetail_Outlet_Transfer_Note_Send\b/i.test(raw)) return true;
    const normSpaced = raw.toLowerCase().replace(/\s+/g, " ");
    if (normSpaced.includes("salesretail outlet transfer note send")) return true;
    return false;
}

/**
 * Transfer Note → Receive to Sorting: row/bulk Receive requires this exact permission
 * (not Approve alone — admin roles split Approve vs Receive).
 */
export function hasSalesRetailReceiveToSortingReceiveAction(rawPermissions = "", tokens = []) {
    const exact = "salesretail_receive_to_sorting_receive";
    for (const tok of tokens) {
        if (String(tok).trim().toLowerCase() === exact) return true;
    }
    const raw = String(rawPermissions || "");
    if (/\bSalesRetail_Receive_to_Sorting_Receive\b/i.test(raw)) return true;
    const normSpaced = raw.toLowerCase().replace(/\s+/g, " ");
    if (normSpaced.includes("salesretail receive to sorting receive")) return true;
    return false;
}

/**
 * True if `rawPermissions` (comma/JSON list) contains any of `exactLower` tokens (exact match only).
 */
function permissionRawHasExactAny(rawPermissions, exactLowerSet) {
    const raw = String(rawPermissions || "").trim();
    if (!raw) return false;
    const matchToken = (s) => exactLowerSet.has(String(s).trim().toLowerCase());
    if (raw.startsWith("[")) {
        try {
            const j = JSON.parse(raw);
            if (Array.isArray(j) && j.some((x) => matchToken(String(x)))) return true;
        } catch {
            // fall through
        }
    }
    return raw.split(/[,;\n\r\t]+/).some((p) => matchToken(p));
}

/**
 * Comma/JSON permission list: exact token match only (strips quotes/BOM; JSON non-string entries ignored).
 * Also scans `parsePermissionTokens` for glued / oddly formatted strings, and shallow JSON objects
 * with `permissions` / `data` string or array fields.
 * @param {string} rawPermissions
 * @param {string} requiredToken e.g. `SalesRetail_Invoice_Edit`
 */
function hasExactSalesRetailPermissionToken(rawPermissions, requiredToken) {
    const REQUIRED = String(requiredToken || "").trim();
    if (!REQUIRED) return false;
    const REQUIRED_LC = REQUIRED.toLowerCase();

    const normalizeEntry = (entry) =>
        String(entry ?? "")
            .replace(/\uFEFF/g, "")
            .replace(/\u200B/g, "")
            .trim()
            .replace(/^["'`]+|["'`]+$/g, "")
            .trim();

    const isExact = (entry) => {
        const s = normalizeEntry(entry);
        if (!s) return false;
        return s === REQUIRED || s.toLowerCase() === REQUIRED_LC;
    };

    const scanString = (str) => {
        const raw = String(str ?? "").trim();
        if (!raw) return false;
        if (raw.split(/[,;\n\r\t]+/).some((part) => isExact(part))) return true;
        try {
            const tokens = parsePermissionTokens(raw);
            if (tokens.some((tok) => isExact(tok))) return true;
        } catch {
            /* ignore */
        }
        return false;
    };

    const tryArray = (arr) => Array.isArray(arr) && arr.some((x) => typeof x === "string" && isExact(x));

    const raw = String(rawPermissions ?? "").trim();
    if (!raw) return false;

    if (raw.startsWith("[") || raw.startsWith("{")) {
        try {
            const j = JSON.parse(raw);
            if (tryArray(j)) return true;
            if (j && typeof j === "object" && !Array.isArray(j)) {
                for (const key of ["permissions", "data", "items"]) {
                    const v = j[key];
                    if (typeof v === "string" && hasExactSalesRetailPermissionToken(v, requiredToken)) return true;
                    if (tryArray(v)) return true;
                }
            }
        } catch {
            // fall through to delimiter / token scan on original raw
        }
    }

    return scanString(raw);
}

/**
 * Retail Invoice lists: row Edit only when permissions include exact `SalesRetail_Invoice_Edit`
 * (comma/JSON list; exact token only — strips quotes/BOM; JSON non-string entries ignored).
 */
export function hasSalesRetailInvoiceEditAction(rawPermissions = "") {
    return hasExactSalesRetailPermissionToken(rawPermissions, "SalesRetail_Invoice_Edit");
}

/** Invoice → Already Invoiced Order tab: row Edit (exact admin token only; no legacy `Invoice_Sub`). */
export function hasSalesRetailInvoiceSubEdit(rawPermissions = "", tokens = []) {
    return hasSalesRetailGranularEditPermission(rawPermissions, tokens, "SalesRetail_Invoice_Already_invoiced_Order_Edit");
}

/**
 * Pending Invoiced Order list row Edit: exact `SalesRetail_Invoice_Pending_Invoiced_Order_Edit` only
 * (no legacy `…_Dispatch_Note_…` and no superadmin UI bypass on this tab — see `SalesRetailInvoice.jsx`).
 */
export function hasSalesRetailInvoicePendingListEditAction(rawPermissions = "") {
    return hasExactSalesRetailPermissionToken(rawPermissions, "SalesRetail_Invoice_Pending_Invoiced_Order_Edit");
}

/**
 * Already Invoiced Order list row Edit: exact `SalesRetail_Invoice_Already_invoiced_Order_Edit` only
 * (no legacy `…_Sub_…` and no superadmin row-Edit bypass — see `SalesRetailInvoice.jsx`).
 */
export function hasSalesRetailInvoiceAlreadyInvoicedListEditAction(rawPermissions = "") {
    return hasExactSalesRetailPermissionToken(rawPermissions, "SalesRetail_Invoice_Already_invoiced_Order_Edit");
}

/** Invoice → Sell Vouchers tab: visibility (exact token only, same convention as the tabs above). */
export function hasSalesRetailSellVouchersView(rawPermissions = "") {
    return hasExactSalesRetailPermissionToken(rawPermissions, "SalesRetail_Invoice_Sell_Vouchers_View");
}

/** Invoice → Sell Vouchers tab: Add Voucher / Apply Sell action. */
export function hasSalesRetailSellVouchersCreate(rawPermissions = "") {
    return hasExactSalesRetailPermissionToken(rawPermissions, "SalesRetail_Invoice_Sell_Vouchers_Create");
}

/** Invoice → Sold Vouchers tab: visibility (exact token only, same convention as the tabs above). */
export function hasSalesRetailSoldVouchersView(rawPermissions = "") {
    return hasExactSalesRetailPermissionToken(rawPermissions, "SalesRetail_Invoice_Sold_Vouchers_View");
}

/** Invoice → Sold Vouchers tab: Activate voucher action. */
export function hasSalesRetailSoldVouchersEdit(rawPermissions = "") {
    return hasExactSalesRetailPermissionToken(rawPermissions, "SalesRetail_Invoice_Sold_Vouchers_Edit");
}

/**
 * @param {string[]} tokens
 * @param {boolean} isSuperadmin
 * @param {string} [rawPermissions] original permissions string for substring checks
 * @returns {{
 *   outlet: { view: boolean, create: boolean, edit: boolean, delete: boolean, approve: boolean },
 *   receive: { view: boolean, create: boolean, edit: boolean, delete: boolean, approve: boolean },
 *   wip: { view: boolean, create: boolean, edit: boolean, delete: boolean, approve: boolean },
 * }}
 */
export function getTransferNoteTabActions(tokens, isSuperadmin, rawPermissions = "") {
    const canReceiveToSortingStrict = hasSalesRetailReceiveToSortingReceiveAction(rawPermissions, tokens);

    const parent = buildParentFlags(tokens);
    const hasAnyGranular = hasAnyGranularTransferNoteToken(tokens);
    const hasO = hasTokenStartingWith(tokens, OUTLET_PREFIX);
    const hasR = hasTokenStartingWith(tokens, RECEIVE_PREFIX);
    const hasW = hasTokenStartingWith(tokens, WIP_PREFIX);

    const tokenEquals = (prefix, suffix) => {
        const want = `${prefix}${suffix}`.toLowerCase();
        return tokens.some((tok) => String(tok).trim().toLowerCase() === want);
    };

    /** Outlet transfer note: Send action uses explicit Send when granular tokens exist (Save/Create alone is not enough). */
    const fromOutletGranularPrefix = (prefix) => ({
        view: hasTokenStartingWith(tokens, prefix),
        create: tokenEquals(prefix, "Send"),
        edit: tokenEquals(prefix, "Edit"),
        delete: tokenEquals(prefix, "Delete"),
        approve: tokenEquals(prefix, "Approve"),
    });

    /** Receive to Sorting: UI "Receive" / bulk receive uses explicit …_Receive only (not Approve alone). */
    const fromReceiveGranularPrefix = (prefix) => ({
        view: hasTokenStartingWith(tokens, prefix),
        create: tokenEquals(prefix, "Create"),
        edit: tokenEquals(prefix, "Edit"),
        delete: tokenEquals(prefix, "Delete"),
        approve: canReceiveToSortingStrict,
    });

    const fromPrefix = (prefix) => ({
        view: hasTokenStartingWith(tokens, prefix),
        create: tokenEquals(prefix, "Create"),
        edit: tokenEquals(prefix, "Edit"),
        delete: tokenEquals(prefix, "Delete"),
        approve: tokenEquals(prefix, "Approve"),
    });

    if (!hasAnyGranular) {
        const legacy = {
            view: parent.view,
            create: parent.create,
            edit: parent.edit,
            delete: parent.delete,
            approve: parent.approve,
        };
        return {
            outlet: { ...legacy, create: hasSalesRetailOutletTransferNoteSendAction(rawPermissions, tokens) },
            receive: { ...legacy, approve: canReceiveToSortingStrict || legacy.approve },
            wip: finalizeWipEdit({ ...legacy }, rawPermissions, tokens),
        };
    }

    const outletRow = hasO ? fromOutletGranularPrefix(OUTLET_PREFIX) : { ...parent, view: parent.view };

    return {
        outlet: {
            ...outletRow,
            create: hasSalesRetailOutletTransferNoteSendAction(rawPermissions, tokens),
        },
        receive: hasR
            ? fromReceiveGranularPrefix(RECEIVE_PREFIX)
            : { ...parent, view: parent.view, approve: canReceiveToSortingStrict || parent.approve },
        wip: finalizeWipEdit(
            hasW ? fromPrefix(WIP_PREFIX) : { ...parent, view: parent.view },
            rawPermissions,
            tokens
        ),
    };
}

function roleMentionsWorkInProgressScope(tokens, rawPermissions = "") {
    const raw = String(rawPermissions || "");
    if (rawIncludesCi(raw, "SalesRetail_Work_in_Progress_") || rawIncludesCi(raw, "SalesRetail Work in Progress")) {
        return true;
    }
    return tokens.some((tok) => {
        const s = String(tok);
        return s.includes("Work_in_Progress") || s.includes("Work in Progress");
    });
}

/**
 * Each sub-tab requires its own granular token - the parent's own View/Create/Approve flags
 * grant nothing by themselves (checking only the parent in the admin matrix is now a blocked,
 * incomplete configuration; see getRetailParentsMissingChildSelection on the admin side).
 * @param {string[]} tokens
 * @param {boolean} isSuperadmin
 * @returns {{ outlet: boolean, receive: boolean, wip: boolean }}
 */
export function getTransferNoteTabVisibility(tokens, isSuperadmin) {
    return {
        outlet: hasTokenStartingWith(tokens, OUTLET_PREFIX),
        receive: hasTokenStartingWith(tokens, RECEIVE_PREFIX),
        wip: hasTokenStartingWith(tokens, WIP_PREFIX),
    };
}

/**
 * Page shell: allow access only when at least one granular Transfer Note sub-token is present -
 * the parent's own View flag alone no longer grants entry, since that would show a page with
 * no visible sub-tabs (see getTransferNoteTabVisibility above).
 * @param {string[]} tokens
 * @param {boolean} isSuperadmin
 * @param {string} [rawPermissions]
 */
export function canAccessTransferNoteManagement(tokens, isSuperadmin, rawPermissions = "") {
    if (hasAnyGranularTransferNoteToken(tokens)) return true;
    return roleMentionsWorkInProgressScope(tokens, rawPermissions);
}

/**
 * Dispatch Note (Back to Outlet) has parent permissions SalesRetail_Back_to_Outlet_*
 * and granular sub-tabs: Outlet_Dispatch_Note, Outlet_Received_Note, Ready_to_Invoice.
 * Mirrors the Transfer Note visibility logic above - each sub-tab requires its own token.
 */
const OUTLET_DISPATCH_PREFIX = "SalesRetail_Outlet_Dispatch_Note_";
const READY_TO_INVOICE_PREFIX = "SalesRetail_Ready_to_Invoice_";

const DISPATCH_GRANULAR_PREFIXES = [OUTLET_DISPATCH_PREFIX, OUTLET_RECEIVED_NOTE_PREFIX, READY_TO_INVOICE_PREFIX];

/** @param {string[]} tokens */
export function hasAnyGranularDispatchNoteToken(tokens) {
    return DISPATCH_GRANULAR_PREFIXES.some((p) => hasTokenStartingWith(tokens, p));
}

/**
 * Each sub-tab requires its own granular token - see getTransferNoteTabVisibility above for why
 * the parent's own flags no longer act as a fallback.
 * @param {string[]} tokens
 * @param {boolean} isSuperadmin
 * @returns {{ outletDispatch: boolean, outletReceived: boolean, readyToInvoice: boolean }}
 */
export function getDispatchNoteTabVisibility(tokens, isSuperadmin) {
    return {
        outletDispatch: hasTokenStartingWith(tokens, OUTLET_DISPATCH_PREFIX),
        outletReceived: hasTokenStartingWith(tokens, OUTLET_RECEIVED_NOTE_PREFIX),
        readyToInvoice: hasTokenStartingWith(tokens, READY_TO_INVOICE_PREFIX),
    };
}

/**
 * Page shell: allow access only when at least one granular Dispatch Note sub-token is present.
 * @param {string[]} tokens
 * @param {boolean} isSuperadmin
 */
export function canAccessDispatchNoteManagement(tokens, isSuperadmin) {
    return hasAnyGranularDispatchNoteToken(tokens);
}

/**
 * Settings has parent permission SalesRetail_Settings_* and 6 granular sub-tabs: Price_List,
 * Items, Receipt, Discount, Drivers_Vehicles, Other_Settings. Each sub-tab requires its own
 * token - same no-parent-fallback rule as Transfer Note / Dispatch Note above.
 */
const SETTINGS_PRICE_LIST_PREFIX = "SalesRetail_Settings_Price_List_";
const SETTINGS_ITEMS_PREFIX = "SalesRetail_Settings_Items_";
const SETTINGS_RECEIPT_PREFIX = "SalesRetail_Settings_Receipt_";
const SETTINGS_DISCOUNT_PREFIX = "SalesRetail_Settings_Discount_";
const SETTINGS_DRIVERS_PREFIX = "SalesRetail_Settings_Drivers_Vehicles_";
const SETTINGS_OTHER_PREFIX = "SalesRetail_Settings_Other_Settings_";

const SETTINGS_GRANULAR_PREFIXES = [
    SETTINGS_PRICE_LIST_PREFIX,
    SETTINGS_ITEMS_PREFIX,
    SETTINGS_RECEIPT_PREFIX,
    SETTINGS_DISCOUNT_PREFIX,
    SETTINGS_DRIVERS_PREFIX,
    SETTINGS_OTHER_PREFIX,
];

/** @param {string[]} tokens */
export function hasAnyGranularSettingsToken(tokens) {
    return SETTINGS_GRANULAR_PREFIXES.some((p) => hasTokenStartingWith(tokens, p));
}

/**
 * @param {string[]} tokens
 * @returns {{ priceList: boolean, items: boolean, receipt: boolean, discount: boolean, drivers: boolean, otherSettings: boolean }}
 */
export function getSettingsTabVisibility(tokens) {
    return {
        priceList: hasTokenStartingWith(tokens, SETTINGS_PRICE_LIST_PREFIX),
        items: hasTokenStartingWith(tokens, SETTINGS_ITEMS_PREFIX),
        receipt: hasTokenStartingWith(tokens, SETTINGS_RECEIPT_PREFIX),
        discount: hasTokenStartingWith(tokens, SETTINGS_DISCOUNT_PREFIX),
        drivers: hasTokenStartingWith(tokens, SETTINGS_DRIVERS_PREFIX),
        otherSettings: hasTokenStartingWith(tokens, SETTINGS_OTHER_PREFIX),
    };
}

/**
 * Per sub-tab action flags (view/create/edit/delete/approve), each from that sub-tab's own tokens only.
 * @param {string[]} tokens
 * @returns {{
 *   priceList: {view: boolean, create: boolean, edit: boolean, delete: boolean, approve: boolean},
 *   items: {view: boolean, create: boolean, edit: boolean, delete: boolean, approve: boolean},
 *   receipt: {view: boolean, create: boolean, edit: boolean, delete: boolean, approve: boolean},
 *   discount: {view: boolean, create: boolean, edit: boolean, delete: boolean, approve: boolean},
 *   drivers: {view: boolean, create: boolean, edit: boolean, delete: boolean, approve: boolean},
 *   otherSettings: {view: boolean, create: boolean, edit: boolean, delete: boolean, approve: boolean},
 * }}
 */
export function getSettingsTabActions(tokens) {
    const fromPrefix = (prefix) => ({
        view: hasTokenStartingWith(tokens, prefix),
        create: tokenEqualsPrefix(tokens, prefix, "Create"),
        edit: tokenEqualsPrefix(tokens, prefix, "Edit"),
        delete: tokenEqualsPrefix(tokens, prefix, "Delete"),
        approve: tokenEqualsPrefix(tokens, prefix, "Approve"),
    });
    return {
        priceList: fromPrefix(SETTINGS_PRICE_LIST_PREFIX),
        items: fromPrefix(SETTINGS_ITEMS_PREFIX),
        receipt: fromPrefix(SETTINGS_RECEIPT_PREFIX),
        discount: fromPrefix(SETTINGS_DISCOUNT_PREFIX),
        drivers: fromPrefix(SETTINGS_DRIVERS_PREFIX),
        otherSettings: fromPrefix(SETTINGS_OTHER_PREFIX),
    };
}

/**
 * Page shell: allow access only when at least one granular Settings sub-token is present.
 * @param {string[]} tokens
 */
export function canAccessSettingsManagement(tokens) {
    return hasAnyGranularSettingsToken(tokens);
}

/**
 * True when the role holds only the View action for the given prefix - no Create/Edit/Delete/
 * Approve/Send/Receive of its own. Used to lock the branch filter on a tab to the user's Day
 * Start branch: a role that can only look at that tab shouldn't be able to browse other
 * branches' data through the filter, while anyone with an actual write action on the tab keeps
 * today's behaviour.
 * @param {string[]} tokens
 * @param {string} prefix e.g. "SalesRetail_Service_" or "SalesRetail_Outlet_Dispatch_Note_"
 */
export function isRetailViewOnlyForPrefix(tokens, prefix) {
    const hasView = tokenEqualsPrefix(tokens, prefix, "View");
    if (!hasView) return false;
    const elevatedSuffixes = ["Create", "Edit", "Delete", "Approve", "Send", "Receive"];
    return !elevatedSuffixes.some((suffix) => tokenEqualsPrefix(tokens, prefix, suffix));
}
