import axios from "axios";

const API_BASE_URL = (import.meta.env.VITE_SERVER_API || "").trim();

/** Search order by ID API. Use env VITE_ORDER_SEARCH_API to override; otherwise use same base as VITE_SERVER_API. */
const SEARCH_ORDER_BY_ID_URL = (import.meta.env.VITE_ORDER_SEARCH_API || "").trim() || (API_BASE_URL ? `${API_BASE_URL.replace(/\/$/, "")}/order/search-order-by-id` : "");

/** Find Order Status: track order by ID. Use env VITE_TRACK_ORDER_API to override. */
const TRACK_ORDER_BY_ID_URL = (import.meta.env.VITE_TRACK_ORDER_API || "").trim() || (API_BASE_URL ? `${API_BASE_URL.replace(/\/$/, "")}/order/track-order-by-id` : "");
export async function getAllRetailOrders(payload) {
    try {
        const response = await axios.post(`${API_BASE_URL}/order/get-all-orders`, payload);

        if (response && response.status === 200) {
            return response;
        } else {
            console.error("Error fetching orders");
        }
    } catch (error) {
        console.error("Error fetching fetching orders:", error);
        throw error;
    }
};

export async function getAllRetailOrdersAllBranches(payload) {
    try {
        const response = await axios.post(`${API_BASE_URL}/order/get-all-orders-all-branches`, payload);

        if (response && response.status === 200) {
            return response;
        } else {
            console.error("Error fetching orders (all branches)");
        }
    } catch (error) {
        console.error("Error fetching orders (all branches):", error);
        throw error;
    }
};

export async function getRetailOrderById(payload) {
    const response = await axios.post(`${API_BASE_URL}/order/get-order-by-id`, payload);

    console.log("response", response);

    if (response && response.status === 200) {
        return response.data;
    }
    console.error("Error fetching retail order");
    return undefined;
};

export async function getRetailOrderByIdToEdit(payload) {
    const response = await axios.post(`${API_BASE_URL}/order/get-order-by-id-to-edit`, payload);

    console.log("getRetailOrderByIdToEdit response", response);

    if (response && response.status === 200) {
        return response.data;
    }
    console.error("Error fetching retail order for edit");
    return undefined;
};

/** Dispatch note search: use this URL for outlet dispatch note search. */
export const SEARCH_ORDER_BY_ID_DISPATCH_URL = (import.meta.env.VITE_ORDER_SEARCH_API || "").trim() || (API_BASE_URL ? `${API_BASE_URL.replace(/\/$/, "")}/order/search-order-by-id` : "");

/**
 * Search orders by ID/text. Uses VITE_SERVER_API base + /order/search-order-by-id
 * Body: { user_id, branch_id, searchText, offset, current_status? }.
 * branch_id: use -1 for "All Branches", otherwise the selected branch id (e.g. 1).
 * current_status: optional - e.g. "Order Entry", "Service Order", "Outlet Transfer Note", "Receive to Sorting", "Outlet Dispatch Note", "Outlet Received Note", "Pending Invoiced Order", "Already Invoiced Order".
 * urlOverride: optional - when provided (e.g. for dispatch note), use this URL instead of default.
 */
export async function searchOrderById(user_id, searchText, offset = 0, branch_id = -1, limit = 50, current_status, urlOverride = null) {
    try {
        const bid = branch_id == null || (typeof branch_id === "string" && branch_id.trim() === "") ? -1 : Number(branch_id);
        // Never send null/NaN (JSON.stringify(NaN) === null); use -1 for "all branches" when invalid
        const safeBranchId = Number.isFinite(bid) ? bid : -1;
        const body = { user_id, branch_id: safeBranchId, searchText, offset };
        if (current_status != null && String(current_status).trim() !== "") {
            body.current_status = String(current_status).trim();
        }
        const url = (urlOverride != null && String(urlOverride).trim() !== "") ? String(urlOverride).trim() : SEARCH_ORDER_BY_ID_URL;
        const response = await axios.post(url, body, {
            headers: { "Content-Type": "application/json" },
        });
        if (response && response.status >= 200 && response.status < 300) {
            return response;
        }
        console.error("Error searching orders by id", response?.status);
        return null;
    } catch (error) {
        console.error("Error searching orders by id:", error);
        throw error;
    }
}

/**
 * Fetch a single order by order ID using the search-order-by-id API.
 * Used by Find Order Status: when user enters order ID, returns that order with relevant values.
 * @param {string} user_id
 * @param {string} order_id
 * @param {number} branch_id
 * @param {string} searchText
 * @param {number} offset
 * @returns {Promise<object|null>} Order object or null if not found
 */
export async function searchOrderByOrderId(user_id, order_id, branch_id = -1) {
    if (!order_id || !String(order_id).trim()) return null;
    try {
        const bid = branch_id == null || (typeof branch_id === "string" && branch_id.trim() === "") ? -1 : Number(branch_id);
        const body = { user_id, branch_id: bid, searchText: String(order_id).trim(), offset: 0 };
        const response = await axios.post(SEARCH_ORDER_BY_ID_URL, body);
        if (!response || response.status !== 200) return null;
        const raw = response.data;
        // Single order in various shapes
        if (raw?.order && (raw.order.order_id || raw.order.items != null)) return raw.order;
        if (Array.isArray(raw?.orders) && raw.orders.length > 0) return raw.orders[0];
        if (Array.isArray(raw?.data?.orders) && raw.data.orders.length > 0) return raw.data.orders[0];
        if (Array.isArray(raw?.data) && raw.data.length > 0) return raw.data[0];
        if (Array.isArray(raw) && raw.length > 0) return raw[0];
        if (raw?.data && (raw.data.order_id || raw.data.items != null)) return raw.data;
        if (raw?.order_id != null || raw?.items != null) return raw;
        return null;
    } catch (error) {
        console.error("Error searching order by id:", error);
        return null;
    }
}

/**
 * Find Order Status: fetch order tracking data by order ID.
 * Uses VITE_SERVER_API base + /order/track-order-by-id
 * @param {object} payload - { user_id, order_id }
 * @returns {Promise<object|null>} Order object or null; response may be { order: {...} } or the order directly
 */
export async function trackOrderById(payload) {
    if (!payload?.order_id && !payload?.user_id) return null;
    try {
        const response = await axios.post(TRACK_ORDER_BY_ID_URL, {
            user_id: payload.user_id,
            order_id: payload.order_id,
        });
        if (!response || response.status !== 200) return null;
        const data = response.data;
        if (data?.order && (data.order.order_id != null || data.order.items != null)) return data.order;
        if (data?.order_id != null || data?.items != null) return data;
        return null;
    } catch (err) {
        console.error("Error tracking order by id:", err);
        return null;
    }
}

export async function getViewRetailOrderById(payload) {
    const response = await axios.post(`${API_BASE_URL}/view-order/view-order-by-id`, payload);

    if (response && response.status === 200) {
        return response.data;
    } else {
        console.error("Error fetching retail order");
    }
};

/**
 * Sanitize create-order payload so backend receives correct types and no empty strings where it may expect null/number.
 * Reduces chance of 500 Internal Server Error from type/validation issues.
 */
function sanitizeCreateOrderPayload(payload) {
    const empty = (v) => v === "" || v == null || (typeof v === "string" && v.trim() === "");
    const num = (v) => (v === "" || v == null ? 0 : Number(v));
    const strOrNull = (v) => (empty(v) ? null : String(v).trim());

    const items = (payload.items || []).map((item) => ({
        ...item,
        item_type_id: num(item.item_type_id),
        service_type_id: num(item.service_type_id),
        quantity: num(item.quantity),
        price: num(item.price),
        ...(item.pics_count !== undefined && { pics_count: num(item.pics_count) }),
    }));

    const payment = (payload.payment || []).map((p) => ({
        ...p,
        paid_amount: num(p.paid_amount),
        card_type: strOrNull(p.card_type),
        bank: strOrNull(p.bank),
        card_last_4_digits: strOrNull(p.card_last_4_digits),
    }));

    const orderIdTrimmed = empty(payload.order_id) ? null : String(payload.order_id).trim();
    const orderIdForBackend = orderIdTrimmed || `ORDER_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    const out = {
        ...payload,
        status: payload.status ?? "Active",
        branch_id: num(payload.branch_id),
        advance_payment: num(payload.advance_payment),
        total_amount: num(payload.total_amount),
        remaining_amount: num(payload.remaining_amount),
        delivery_charge: num(payload.delivery_charge),
        discount: empty(payload.discount) ? 0 : payload.discount,
        discount_remark: strOrNull(payload.discount_remark),
        redo_order_reference: strOrNull(payload.redo_order_reference),
        card_type: strOrNull(payload.card_type),
        bank: strOrNull(payload.bank),
        items,
        payment,
        order_id: orderIdForBackend,
        commingOrderId: orderIdTrimmed ? String(orderIdTrimmed) : "-1",
    };

    return out;
}

export async function createRetailOrder(payload) {
    const body = sanitizeCreateOrderPayload(payload);
    console.log("=== Sending to Backend ===");
    console.log("Branch ID:", body.branch_id);
    console.log("Delivery Outlet:", body.delivery_outlet);
    console.log("Full Payload:", JSON.stringify(body, null, 2));

    try {
        const response = await axios.post(`${API_BASE_URL}/order/create-order`, body);

        if (response && (response.status === 201 || response.status === 200)) {
            return response.data;
        } else {
            console.error("Error creating retail order: Unexpected status", response.status);
            throw new Error(`Failed to create order: Server returned status ${response.status}`);
        }
    } catch (error) {
        console.error("Error creating retail order:", error);
        if (error.response) {
            const data = error.response.data;
            const status = error.response.status;
            // Log full response for debugging 500s
            console.error("Server response:", status, data);
            let errorMsg =
                (typeof data === "string" ? data : null) ||
                data?.message ||
                data?.error ||
                data?.msg ||
                data?.detail ||
                (Array.isArray(data?.errors) ? data.errors.map((e) => e.message || e.msg || e).join(", ") : null) ||
                `Server error (${status}). Check console for details.`;
            throw new Error(errorMsg);
        } else if (error.request) {
            throw new Error("Network error: No response from server");
        } else {
            throw error;
        }
    }
};

export async function updateRetailOrder(payload) {
    const body = { ...payload, status: payload.status ?? "Active" };
    const response = await axios.put(`${API_BASE_URL}/order/update-order`, body);

    if (response && response.status === 200) {
        return response.data;
    } else {
        console.error("Error updating retail order");
    }
};

export async function deactivateRetailOrder(payload) {
    const response = await axios.put(`${API_BASE_URL}/order/deactivate-order`, payload);

    if (response && response.status === 200) {
        return response.data;
    } else {
        console.error("Error deactivating retail order");
    }
};

export async function getAllOrdersByCustomerId(payload) {
    try {
        const response = await axios.post(`${API_BASE_URL}/order/get-all-orders-by-customer-id`, payload);

        if (response && response.status === 200) {
            return response.data;
        } else {
            console.error("Error fetching customer orders");
        }
    } catch (error) {
        console.error("Error fetching customer orders:", error);
        throw error;
    }
};

export async function getAllBranches(payload) {
    const response = await axios.get(`${API_BASE_URL}/branches/get-all-branches`, payload ? { params: payload } : {});

    if (response && response.status === 200) {
        const data = response.data;
        if (!data) return data;

        const filterFn = (branch) => {
            const name = String(branch.branch_name || branch.name || branch.branchName || "").trim().toLowerCase();
            return name !== "head office";
        };

        if (Array.isArray(data)) {
            return data.filter(filterFn);
        }
        
        // Return a copy to avoid mutating cache/original structures if needed
        const result = { ...data };
        if (result.data && Array.isArray(result.data)) {
            result.data = result.data.filter(filterFn);
        }
        if (result.branches && Array.isArray(result.branches)) {
            result.branches = result.branches.filter(filterFn);
        }
        if (result.results && Array.isArray(result.results)) {
            result.results = result.results.filter(filterFn);
        }
        return result;
    } else {
        console.error("Error fetching branches");
    }
};

export async function incrementRetailOrderPrintCount(payload) {
    try {
        const response = await axios.post(`${API_BASE_URL}/order/increment-print-count`, payload);
        if (response && response.status === 200) {
            return response.data;
        }
    } catch (error) {
        console.error("Error incrementing retail order print count:", error);
        throw error;
    }
};