import axios from "axios";

const API_BASE_URL = (import.meta.env.VITE_SERVER_API || "").trim();

const buildInvoiceQuery = (filters = {}) => {
    const params = new URLSearchParams();
    const searchText = filters.searchText ?? filters.search_text ?? filters.search ?? "";
    const fromDate = filters.from_date ?? filters.fromDate ?? "";
    const toDate = filters.to_date ?? filters.toDate ?? "";
    if (String(searchText).trim() !== "") params.set("searchText", String(searchText).trim());
    if (String(fromDate).trim() !== "") params.set("from_date", String(fromDate).trim());
    if (String(toDate).trim() !== "") params.set("to_date", String(toDate).trim());
    return params.toString();
};

/**
 * Get pending invoice orders. Uses get-all-pending-invoice-orders/:user_id/:branch_id/:offset.
 * For all branches use branch_id 0.
 */
export async function getAllRetailPendingInvoices(id, branch_id, offset = 0, filters = {}) {
    try {
        const safeBranchId = branch_id != null && branch_id !== "" ? Number(branch_id) : 0;
        const safeOffset = offset != null ? Number(offset) : 0;
        const query = buildInvoiceQuery(filters);
        const url = `${API_BASE_URL}/production/get-all-pending-invoice-orders/${id}/${safeBranchId}/${safeOffset}${query ? `?${query}` : ""}`;
        
        console.log("getAllRetailPendingInvoices: Calling API with:");
        console.log("  - user_id:", id);
        console.log("  - branch_id:", safeBranchId);
        console.log("  - offset:", safeOffset);
        console.log("  - Full URL:", url);
        
        const response = await axios.get(url);
        
        console.log("getAllRetailPendingInvoices: API response status:", response?.status);
        console.log("getAllRetailPendingInvoices: API response data:", response?.data);

        if (response && response.status === 200) {
            return response;
        } else {
            console.error("Error fetching pending invoices - non-200 status");
        }
    } catch (error) {
        console.error("Error fetching pending invoices:", error);
        console.error("Error response:", error?.response?.data);
        console.error("Error URL:", error?.config?.url);
        throw error;
    }
};

/** @deprecated Use getPendingInvoiceOrdersAllBranches for pending orders across all branches. */
export async function getAllRetailPendingInvoicesAllBranches(id, offset = 0, filters = {}) {
    return getAllRetailPendingInvoices(id, 0, offset, filters);
}

/**
 * Get all pending invoice orders across all branches.
 * URL: get-all-pending-invoice-orders-all-branches/{user_id}/{offset}
 * No branch_id is sent when using this endpoint.
 * Response includes total_orders_count and orders for the requested page (15 per offset).
 */
export async function getPendingInvoiceOrdersAllBranches(userId, offset = 0, filters = {}) {
    try {
        const safeId = (userId ?? "").toString().trim();
        const safeOffset = offset != null ? Number(offset) : 0;
        const query = buildInvoiceQuery(filters);
        const url = `${API_BASE_URL}/production/get-all-pending-invoice-orders-all-branches/${safeId}/${safeOffset}${query ? `?${query}` : ""}`;
        const response = await axios.get(url);
        if (response && response.status === 200) {
            return response;
        }
        console.error("getPendingInvoiceOrdersAllBranches: non-200 status");
        return response;
    } catch (error) {
        console.error("Error fetching pending invoice orders (all branches):", error);
        throw error;
    }
}

export async function createRetailInvoice(payload) {
    const response = await axios.post(`${API_BASE_URL}/production/print-invoice`, payload);

    if (response && response.status === 200) {
        return response;
    } else {
        console.error("Error creating invoice");
    }
};

export const INVOICED_ORDERS_PAGE_SIZE = 15;

/**
 * Get already invoiced orders. Uses get-all-invoiced-orders/{user_id}/{offset}/{branch_id}.
 * @param {string} id - user_id
 * @param {number} offset - pagination offset (0, 15, 30, ...)
 * @param {number} branch_id - branch ID (use -1 for all branches)
 */
export async function getAllRetailInvoices(id, offset = 0, branch_id = -1, filters = {}) {
    try {
        const safeId = id ?? "";
        const safeOffset = offset != null ? Number(offset) : 0;
        const safeBranchId = branch_id != null && branch_id !== "" ? Number(branch_id) : -1;
        const query = buildInvoiceQuery(filters);
        const url = `${API_BASE_URL}/production/get-all-invoiced-orders/${safeId}/${safeOffset}/${safeBranchId}${query ? `?${query}` : ""}`;
        
        const response = await axios.get(url);

        if (response && response.status === 200) {
            return response;
        } else {
            console.error("Error fetching invoices");
        }
    } catch (error) {
        console.error("Error fetching invoices:", error);
        throw error;
    }
};

export async function getRetailInvoicesByOrder(payload) {
    const response = await axios.post(`${API_BASE_URL}/production/get-all-invoices-by-order`, payload);

    if (response && response.status === 200) {
        return response.data;
    } else {
        console.error("Error fetching invoices by order");
    }
};

/**
 * Get all invoices by order public view (no login required).
 * URL: public-view/get-all-invoices-by-order-public-view
 * @param {object} payload - { order_id }
 */
export async function getRetailInvoicesByOrderPublic(payload) {
    try {
        console.log("getRetailInvoicesByOrderPublic: Calling API with:", payload);
        const baseUrl = (import.meta.env.VITE_SERVER_API || "").trim();
        const url = `${baseUrl}/public-view/get-all-invoices-by-order-public-view`.replace(/\s/g, "");
        console.log("getRetailInvoicesByOrderPublic: Final URL:", url);
        
        const response = await axios.post(url, payload);

        if (response && response.status === 200) {
            console.log("getRetailInvoicesByOrderPublic: Success response:", response.data);
            return response.data;
        } else {
            console.error("getRetailInvoicesByOrderPublic: Error response status:", response?.status);
            return null;
        }
    } catch (error) {
        console.error("getRetailInvoicesByOrderPublic: Exception:", error);
        throw error;
    }
}

/**
 * Get all service items by order ID for viewing order details.
 * URL: get-all-service-items-by-order-id
 * @param {object} payload - { user_id, order_id }
 */
export async function getServiceItemsByOrderId(payload) {
    try {
        const response = await axios.post(`${API_BASE_URL}/production/get-all-service-items-by-order-id`, payload);

        if (response && response.status === 200) {
            return response.data;
        } else {
            console.error("Error fetching service items by order");
        }
    } catch (error) {
        console.error("Error fetching service items by order:", error);
        throw error;
    }
};

/**
 * Get all service items by order ID public view.
 * URL: public-view/get-all-service-items-by-order-id-public-view
 * @param {object} payload - { order_id }
 */
export async function getServiceItemsByOrderIdPublic(payload) {
    try {
        const response = await axios.post(`${API_BASE_URL}/public-view/get-all-service-items-by-order-id-public-view`, payload);
        if (response && response.status === 200) {
            return response.data;
        }
    } catch (error) {
        console.error("getServiceItemsByOrderIdPublic: Exception:", error);
        throw error;
    }
}

/**
 * Increment the print count of an invoice (reprints show COPY - N).
 * URL: increment-invoice-print-count
 * @param {object} payload - { invoice_id }
 */
export async function incrementRetailInvoicePrintCount(payload) {
    try {
        const response = await axios.post(`${API_BASE_URL}/production/increment-invoice-print-count`, payload);

        if (response && response.status === 200) {
            return response.data;
        } else {
            console.error("Error incrementing invoice print count");
        }
    } catch (error) {
        console.error("Error incrementing invoice print count:", error);
        throw error;
    }
};

/**
 * Update invoice date (superAdmin only).
 * URL: update-invoice-date
 * @param {object} payload - { user_id, id (invoice_id), new_date (format: "YYYY-MM-DD HH:mm:ss") }
 */
export async function updateInvoiceDate(payload) {
    try {
        const response = await axios.post(`${API_BASE_URL}/production/update-invoice-date`, payload);

        if (response && response.status === 200) {
            return response.data;
        } else {
            console.error("Error updating invoice date");
        }
    } catch (error) {
        console.error("Error updating invoice date:", error);
        throw error;
    }
};

/**
 * Get all customers public view.
 * URL: public-view/get-all-customers-public-view
 * @param {object} payload - { customer_type, branch_id }
 */
export async function getAllCustomersPublic(payload) {
    try {
        const response = await axios.post(`${API_BASE_URL}/public-view/get-all-customers-public-view`, payload);
        if (response && response.status === 200) {
            return response.data;
        }
    } catch (error) {
        console.error("getAllCustomersPublic: Exception:", error);
        throw error;
    }
}

/**
 * Get order by ID public view (includes admin-assigned discount).
 * URL: public-view/get-order-by-id-public-view
 * @param {object} payload - { user_id, order_id }
 */
export async function getOrderByIdPublic(payload) {
    try {
        const response = await axios.post(`${API_BASE_URL}/public-view/get-order-by-id-public-view`, payload);
        if (response && response.status === 200) {
            return response.data;
        }
    } catch (error) {
        console.error("getOrderByIdPublic: Exception:", error);
        throw error;
    }
}

/**
 * Get user by ID public view.
 * URL: public-view/get-user-by-id-public-view/{userId}
 * @param {string} userId
 */
export async function getUserByIdPublic(userId) {
    try {
        const response = await axios.get(`${API_BASE_URL}/public-view/get-user-by-id-public-view/${userId}`);
        if (response && response.status === 200) {
            return response.data;
        }
    } catch (error) {
        console.error("getUserByIdPublic: Exception:", error);
        throw error;
    }
}
