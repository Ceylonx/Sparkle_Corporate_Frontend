import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_SERVER_API;

export async function getAllCorporatePendingInvoices(id) {
    try {
        const response = await axios.get(`${API_BASE_URL}/order/get-all-pickup-entries-with-customer/${id}`);

        if (response && response.status === 200) {
            return response;
        } else {
            console.error("Error fetching pending invoices");
        }
    } catch (error) {
        console.error("Error fetching fetching pending invoices:", error);
        throw error;
    }
};

export async function getCorporateInvoiceHistoryByCustomer(payload) {
    try {
        const response = await axios.post(`${API_BASE_URL}/pickup-entry/get-corporate-invoice-history-by-customer-id`, payload);

        if (response && response.status === 200) {
            return response;
        } else {
            console.error("Error fetching invoice history");
        }
    } catch (error) {
        console.error("Error fetching fetching invoice history:", error);
        throw error;
    }
};

export async function getInvoicingHistoryByCustomerId(userId, customerId, branchId = 0) {
    try {
        const response = await axios.get(
            `${API_BASE_URL}/pickup-entry/get-invoicing-history-by-customer-id/${userId}/${customerId}/${branchId}`
        );

        if (response && response.status === 200) {
            return response;
        } else {
            console.error("Error fetching invoicing history by customer id");
        }
    } catch (error) {
        console.error("Error fetching invoicing history by customer id:", error);
        throw error;
    }
};

export async function getCorporateInvoiceById(payload) {
    try {
        const response = await axios.post(`${API_BASE_URL}/pickup-entry/get-invoice-by-pickup-entry-id`, payload);

        if (response && response.status === 200) {
            return response;
        } else {
            console.error("Error fetching invoice by id");
        }
    } catch (error) {
        console.error("Error fetching invoice by id:", error);
        throw error;
    }
};

export async function getCorporateInvoiceByInvoiceId(invoice_id) {
    try {
        const response = await axios.post(`${API_BASE_URL}/pickup-entry/get-invoice-by-invoice-id`, { invoice_id });

        if (response && response.status === 200) {
            return response;
        } else {
            console.error("Error fetching invoice by invoice_id");
        }
    } catch (error) {
        console.error("Error fetching invoice by invoice_id:", error);
        throw error;
    }
};

const INVOICE_ID_CANDIDATE_KEYS = [
    "invoice_id",
    "corporate_invoice_no",
    "generated_invoice_no",
    "tax_invoice_no",
    "tax_invoice_number",
    "invoice_no",
    "invoice_ref_no",
];

function isPickupStyleId(s) {
    const t = String(s || "").trim();
    return /^PE_ORDER/i.test(t) || /^PE_/i.test(t);
}

function pickInvoiceIdFromObject(obj) {
    if (!obj || typeof obj !== "object") return "";
    const pickupRef = String(obj.pickup_entry_id ?? "").trim();
    for (const k of INVOICE_ID_CANDIDATE_KEYS) {
        const v = obj[k];
        const t = v != null ? String(v).trim() : "";
        if (!t || isPickupStyleId(t)) continue;
        if (pickupRef && t === pickupRef) continue;
        return t;
    }
    return "";
}

/**
 * Reads sales_corporate_invoices-style invoice number (e.g. INV72) from
 * get-invoice-by-pickup-entry-id responses. Ignores PE_ORDER_* values.
 */
export function pickCorporateSalesInvoiceIdFromGetByPickupResponse(res) {
    const raw = res?.data;
    if (raw == null || typeof raw !== "object") return "";
    const nested = raw.data;
    const merged =
        nested != null && typeof nested === "object" && !Array.isArray(nested) ? { ...raw, ...nested } : raw;

    let found = pickInvoiceIdFromObject(merged);
    if (found) return found;

    const bag = merged.invoice ?? merged.corporate_invoice ?? merged.invoice_row ?? merged.row;
    if (Array.isArray(bag)) {
        for (const row of bag) {
            found = pickInvoiceIdFromObject(row);
            if (found) return found;
        }
    } else {
        found = pickInvoiceIdFromObject(bag);
        if (found) return found;
    }
    return "";
}

export async function createCorporateInvoice(payload) {
    try {
        const response = await axios.post(`${API_BASE_URL}/pickup-entry/pay-invoice`, payload);

        if (response && response.status === 200) {
            return response;
        } else {
            console.error("Error creating invoice");
        }
    } catch (error) {
        console.error("Error creating invoice:", error);
        throw error;
    }
};

export async function getAllCorporatePeriodInvoicingCustomers(id, branchIdOrOptions = 0, maybeOptions = {}) {
    try {
        const hasBranchPath = typeof branchIdOrOptions !== "object";
        const options = hasBranchPath ? maybeOptions : branchIdOrOptions;
        const branchId = hasBranchPath ? branchIdOrOptions : null;
        const params = {
            type: "Period",
            limit: options?.limit,
            offset: options?.offset,
            search: options?.search,
            start_date: options?.start_date,
            end_date: options?.end_date,
        };
        Object.keys(params).forEach((key) => {
            if (params[key] === undefined || params[key] === null || params[key] === "") {
                delete params[key];
            }
        });
        const path = branchId === null
            ? `${API_BASE_URL}/pickup-entry/get-all-in-invoicing-pickup-entries-period-cus/${id}`
            : `${API_BASE_URL}/pickup-entry/get-all-in-invoicing-pickup-entries-period-cus/${id}/${branchId}`;
        const response = await axios.get(
            path,
            { params }
        );

        if (response && response.status === 200) {
            return response;
        } else {
            console.error("Error fetching period invoicing customers");
        }
    } catch (error) {
        console.error("Error fetching period invoicing customers:", error);
        throw error;
    }
};

export async function getAllCorporateDailyInvoicingCustomers(id, branchIdOrOptions = 0, maybeOptions = {}) {
    try {
        const hasBranchPath = typeof branchIdOrOptions !== "object";
        const options = hasBranchPath ? maybeOptions : branchIdOrOptions;
        const branchId = hasBranchPath ? branchIdOrOptions : null;
        const params = {
            type: "Daily",
            limit: options?.limit,
            offset: options?.offset,
            search: options?.search,
            start_date: options?.start_date,
            end_date: options?.end_date,
        };
        Object.keys(params).forEach((key) => {
            if (params[key] === undefined || params[key] === null || params[key] === "") {
                delete params[key];
            }
        });
        const path = branchId === null
            ? `${API_BASE_URL}/pickup-entry/get-all-in-invoicing-pickup-entries-daily-cus/${id}`
            : `${API_BASE_URL}/pickup-entry/get-all-in-invoicing-pickup-entries-daily-cus/${id}/${branchId}`;
        const response = await axios.get(
            path,
            { params }
        );

        if (response && response.status === 200) {
            return response;
        } else {
            console.error("Error fetching daily invoicing customers");
        }
    } catch (error) {
        console.error("Error fetching daily invoicing customers:", error);
        throw error;
    }
};

export async function getPickupEntriesByCustomerId(userId, customerId, type = "daily") {
    try {
        const endpoint = type === "daily" 
            ? `${API_BASE_URL}/pickup-entry/get-pending-pickup-entries-daily/${userId}/${customerId}`
            : `${API_BASE_URL}/pickup-entry/get-pending-pickup-entries-period/${userId}/${customerId}`;
        
        const response = await axios.get(endpoint);

        if (response && response.status === 200) {
            return response;
        } else {
            console.error("Error fetching pickup entries");
        }
    } catch (error) {
        console.error("Error fetching pickup entries:", error);
        throw error;
    }
};

export async function generateCorporateInvoice(payload) {
    try {
        console.log("Generating corporate invoice with payload:", JSON.stringify(payload, null, 2));
        const response = await axios.post(`${API_BASE_URL}/pickup-entry/generate-corporate-invoice`, payload);

        if (response && response.status === 200) {
            console.log("Invoice generated successfully:", response.data);
            return response;
        } else {
            console.error("Error generating invoice: Unexpected response status", response.status);
            throw new Error(`Failed to generate invoice: ${response.status} ${response.statusText}`);
        }
    } catch (error) {
        if (error.response) {
            console.error("Error generating invoice - Status:", error.response.status);
            console.error("Error generating invoice - Data:", error.response.data);
            console.error("Error generating invoice - Headers:", error.response.headers);
        } else if (error.request) {
            console.error("Error generating invoice - No response received:", error.request);
        } else {
            console.error("Error generating invoice:", error.message);
        }
        throw error;
    }
};

export async function trackPickupEntryById(userId, pickupEntryId, branchId = 0) {
    try {
        const response = await axios.get(
            `${API_BASE_URL}/pickup-entry/track-pickup-entry-by-id/${userId}/${pickupEntryId}`
        );

        if (response && response.status === 200) {
            return response;
        } else {
            console.error("Error tracking pickup entry by id");
        }
    } catch (error) {
        console.error("Error tracking pickup entry by id:", error);
        throw error;
    }
};

/**
 * Load multiple pickup entries using the existing track endpoint (one HTTP call per id).
 * Use for period invoice preview when the API has no single batch route.
 * @returns {Promise<Array<{ pickupEntryId: string, status: 'fulfilled'|'rejected', response?: any, reason?: any }>>}
 */
export async function trackPickupEntriesByIds(userId, pickupEntryIds, branchId = 0) {
    const ids = [...new Set((pickupEntryIds || []).map((id) => String(id).trim()).filter(Boolean))];
    if (!ids.length) return [];
    const settled = await Promise.allSettled(ids.map((id) => trackPickupEntryById(userId, id, branchId)));
    return settled.map((r, i) => ({
        pickupEntryId: ids[i],
        status: r.status,
        response: r.status === "fulfilled" ? r.value : null,
        reason: r.status === "rejected" ? r.reason : null,
    }));
}

/**
 * Persist tax invoice preview draft: approval fields + activity_log (JSON array).
 * Backend route should accept the same shape as delivery-note approval updates.
 * @param {object} payload
 * @param {string} payload.user_id
 * @param {string} payload.invoice_id — DB sales_corporate_invoices.invoice_id (e.g. INV72), not PE_ORDER_*
 * @param {string} [payload.pickup_entry_ids] — optional; pickup keys for logging / legacy backends
 * @param {string} [payload.customer_auto_id]
 * @param {string} payload.approval_status — Created | Checked | Approved
 * @param {string|null} [payload.checked_by_user]
 * @param {string|null} [payload.checked_by_signature] — data URL
 * @param {string|null} [payload.approved_by_user]
 * @param {Array<object>} [payload.activity_log]
 */
export async function updateCorporateTaxInvoicePreviewApproval(payload) {
    try {
        const response = await axios.put(
            `${API_BASE_URL}/pickup-entry/update-corporate-tax-invoice-preview-approval`,
            payload
        );
        if (response && response.status === 200) {
            return response.data;
        }
        throw new Error("Unexpected response updating tax invoice preview approval");
    } catch (error) {
        console.error("Error updating corporate tax invoice preview approval:", error);
        throw error;
    }
}

/**
 * Raw `approval_status` from invoice-history API rows (`sales_corporate_invoices`).
 * Do not use `invoice_tax_approval_status` here — it may be stale or from another merge path.
 */
export function pickSalesCorporateInvoiceApprovalStatus(invoice) {
    if (!invoice || typeof invoice !== "object") return null;
    const v = invoice.invoice_approval_status ?? invoice.approval_status;
    if (v == null || String(v).trim() === "") return null;
    return String(v).trim();
}

/** Tax invoice preview workflow for list UIs: Created, Checked, Approved */
export function normalizePreviewApprovalStatus(raw) {
    const s = String(raw ?? "")
        .trim()
        .toLowerCase();
    if (s === "approved") return "Approved";
    if (s === "checked") return "Checked";
    return "Created";
}

/**
 * Generated Invoices table STATUS — reads only `record.approval_status` (invoice row).
 * Map: Created / Checked / Approved (case-insensitive); null/unknown → Created.
 */
export function getGeneratedInvoiceApprovalStatusLabel(record) {
    if (!record || typeof record !== "object") return "Created";
    const trimmed = pickSalesCorporateInvoiceApprovalStatus(record);
    if (trimmed == null) return "Created";
    const s = trimmed.toLowerCase();
    if (s === "approved") return "Approved";
    if (s === "checked") return "Checked";
    if (s === "created") return "Created";
    return "Created";
}

export function getGeneratedInvoiceApprovalStatusBadgeClass(label) {
    if (label === "Approved") return "bg-green-100 text-green-700 border border-green-300";
    if (label === "Checked") return "bg-blue-100 text-blue-700 border border-blue-300";
    return "bg-yellow-50 text-yellow-700 border border-yellow-300";
}

/** @deprecated Prefer getGeneratedInvoiceApprovalStatusLabel — same behavior. */
export function formatGeneratedInvoiceApprovalStatus(inv) {
    return getGeneratedInvoiceApprovalStatusLabel(inv);
}

/**
 * Pick raw preview-approval from API objects. Do NOT use generic `approval_status` —
 * that is pickup/order approval elsewhere and does not reflect tax invoice preview workflow.
 */
export function pickTaxInvoicePreviewApprovalRaw(inv) {
    if (!inv || typeof inv !== "object") return "";
    return (
        inv.tax_invoice_preview_approval_status ??
        inv.tax_invoice_preview_status ??
        inv.corporate_tax_invoice_preview_approval ??
        inv.preview_approval_status ??
        inv.corporate_tax_invoice_approval_status ??
        inv.tax_invoice_preview_approval ??
        ""
    );
}

/** Preview sidebar log only — never use pickup `activity_log` (order workflow). */
export function pickTaxInvoicePreviewActivityLog(inv) {
    if (!inv || typeof inv !== "object") return [];
    const nested = inv.tax_invoice_preview;
    if (nested && typeof nested === "object" && Array.isArray(nested.activity_log)) {
        return [...nested.activity_log];
    }
    const a =
        inv.tax_invoice_preview_activity_log ??
        inv.tax_invoice_activity_log ??
        inv.preview_activity_log;
    return Array.isArray(a) ? [...a] : [];
}

/** Checked / approved actors for tax invoice preview only — not pickup `checked_by_user`. */
export function pickTaxInvoicePreviewActorFields(inv) {
    if (!inv || typeof inv !== "object") {
        return { checkedByUser: null, checkedBySignature: null, approvedByUser: null };
    }
    const n = inv.tax_invoice_preview && typeof inv.tax_invoice_preview === "object" ? inv.tax_invoice_preview : null;
    return {
        checkedByUser:
            n?.checked_by_user ??
            inv.tax_invoice_preview_checked_by_user ??
            inv.preview_checked_by_user ??
            null,
        checkedBySignature:
            n?.checked_by_signature ??
            inv.tax_invoice_preview_checked_by_signature ??
            inv.preview_checked_by_signature ??
            null,
        approvedByUser:
            n?.approved_by_user ??
            inv.tax_invoice_preview_approved_by_user ??
            inv.preview_approved_by_user ??
            null,
    };
}

/**
 * STATUS for invoice history rows: Pending vs tax approval (Created / Checked / Approved).
 * Generated rows use only `approval_status` on the record.
 */
export function deriveInvoiceHistoryStatusDisplay(inv) {
    if (!inv || typeof inv !== "object") return "Pending";
    const ig = inv.invoice_generated;
    const generated =
        inv.status === "Generated" ||
        ig === 1 ||
        ig === true ||
        Number(ig) === 1 ||
        String(ig ?? "").toLowerCase() === "true";
    if (!generated) return "Pending";
    return getGeneratedInvoiceApprovalStatusLabel(inv);
}

/** True when pickup row has already been invoiced (Generated tab / corporate invoice created). */
export function isCorporateInvoiceAlreadyGenerated(inv) {
    if (!inv || typeof inv !== "object") return false;
    if (inv.status === "Generated") return true;
    const ig = inv.invoice_generated;
    return (
        ig === 1 ||
        ig === true ||
        Number(ig) === 1 ||
        String(ig ?? "").toLowerCase() === "true"
    );
}

export async function cancelInvoice(payload) {
    try {
        const response = await axios.put(
            `${API_BASE_URL}/pickup-entry/cancel-invoice`,
            payload
        );
        if (response && response.status === 200) {
            return response.data;
        }
        throw new Error("Unexpected response cancelling invoice");
    } catch (error) {
        console.error("Error cancelling invoice:", error);
        throw error;
    }
}

/**
 * Fetch a Delivery Note by its integer auto_id (delivery_note_auto_id).
 * Used by the invoice generate page so it can look up CDN data after the
 * pending list navigates using delivery_note_auto_id values.
 * Response shape: { delivery_note: { delivery_note_auto_id, delivery_id, customer_id,
 *   customer_company_name, invoice_id, invoice_generated, items: [...], pickup_entry_id,
 *   pickup_entry: { delivery_type, delivery_percentage, ... } } }
 */
export async function getCorporateDeliveryNoteForInvoice(userId, deliveryNoteAutoId) {
    try {
        const response = await axios.post(
            `${API_BASE_URL}/pickup-entry/get-delivery-note-by-id`,
            { user_id: userId, delivery_note_auto_id: deliveryNoteAutoId }
        );
        if (response && response.status === 200) {
            return response;
        }
        throw new Error("Unexpected response fetching delivery note for invoice");
    } catch (error) {
        console.error("Error fetching delivery note for invoice:", error);
        throw error;
    }
}

export async function updateCorporateInvoiceDate(payload) {
    try {
        const response = await axios.put(`${API_BASE_URL}/pickup-entry/update-corporate-invoice-date`, payload);
        if (response && response.status === 200) {
            return response.data;
        }
        throw new Error("Unexpected response");
    } catch (error) {
        console.error("Error updating corporate invoice date:", error);
        throw error;
    }
}

