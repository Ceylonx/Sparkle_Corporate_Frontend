import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_SERVER_API;

export async function getAllRetailBackToOutletOrders(id, branchId, offset = 0) {
    try {
        const response = await axios.get(`${API_BASE_URL}/production/get-all-pending-backToOutlet-orders/${id}/${branchId}/${offset}`);

        if (response && response.status === 200) {
            return response;
        } else {
            console.error("Error fetching back to outlet orders");
        }
    } catch (error) {
        console.error("Error fetching back to outlet orders:", error);
        throw error;
    }
};

/**
 * Get all pending back-to-outlet (Outlet Dispatch Note) orders across all branches.
 * Used when "All Branches" is selected in Outlet Dispatch Note.
 * URL: get-all-pending-backToOutlet-orders-all-branches/{user_id}/{offset}
 */
export async function getAllRetailBackToOutletOrdersAllBranches(id, offset = 0) {
    try {
        const response = await axios.get(`${API_BASE_URL}/production/get-all-pending-backToOutlet-orders-all-branches/${id}/${offset}`);

        if (response && response.status === 200) {
            return response;
        } else {
            console.error("Error fetching back to outlet orders (all branches)");
        }
    } catch (error) {
        console.error("Error fetching back to outlet orders (all branches):", error);
        throw error;
    }
};

export async function markAsSendBackToOutletOrder(payload) {
    const response = await axios.post(`${API_BASE_URL}/production/send-back-to-outlet`, payload);

    if (response && response.status === 200) {
        return response.data;
    } else {
        console.error("Error marking back to outlet order as sent");
    }
};

export async function getAllRetailRecieveBackToOutletOrders(id, branchId, offset = 0) {
    try {
        const response = await axios.get(`${API_BASE_URL}/production/get-all-pending-confirm-backToOutlet-orders/${id}/${branchId}/${offset}`);

        if (response && response.status === 200) {
            return response;
        } else {
            console.error("Error fetching back to outlet orders");
        }
    } catch (error) {
        console.error("Error fetching back to outlet orders received:", error);
        throw error;
    }
};
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
 * Get all pending confirm back-to-outlet (Outlet Received Note) orders across all branches.
 * Used when "All Branches" is selected in Outlet Received Note. Response includes total_count; page count = total_count / 15.
 * URL: get-all-pending-confirm-backToOutlet-orders-all-branches/{user_id}/{offset}
 */

export async function getAllRetailRecieveBackToOutletOrdersAllBranches(id, offset = 0) {
    try {
        const response = await axios.get(`${API_BASE_URL}/production/get-all-pending-confirm-backToOutlet-orders-all-branches/${id}/${offset}`);

        if (response && response.status === 200) {
            return response;
        } else {
            console.error("Error fetching back to outlet orders (all branches)");
        }
    } catch (error) {
        console.error("Error fetching back to outlet orders received (all branches):", error);
        throw error;
    }
};

export async function getAllRetailCompletedBackToOutletOrders(id, branchId, offset = 0) {
    try {
        const response = await axios.get(`${API_BASE_URL}/production/get-all-confirmed-sent-backToOutlet-orders/${id}/${branchId}/${offset}`);

        if (response && response.status === 200) {
            return response;
        } else {
            console.error("Error fetching back to outlet orders");
        }
    } catch (error) {
        console.error("Error fetching back to outlet orders received:", error);
        throw error;
    }
};

export async function getAllRetailCompletedBackToOutletOrdersAllBranches(id, offset = 0) {
    try {
        const response = await axios.get(`${API_BASE_URL}/production/get-all-confirmed-sent-backToOutlet-orders-all-branches/${id}/${offset}`);

        if (response && response.status === 200) {
            return response;
        } else {
            console.error("Error fetching back to outlet orders (all branches)");
        }
    } catch (error) {
        console.error("Error fetching back to outlet orders received (all branches):", error);
        throw error;
    }
};

export async function markAsReceivedBackToOutletOrder(payload) {
    const response = await axios.post(`${API_BASE_URL}/production/confirm-sent-backToOutlet`, payload);

    if (response && response.status === 200) {
        return response.data;
    } else {
        console.error("Error marking back to outlet order as received");
    }
};

export async function markBulkAsSendBackToOutletOrder(payload) {
    const response = await axios.post(`${API_BASE_URL}/production/send-back-to-outlet-bulk`, payload);

    if (response && response.status === 200) {
        return response.data;
    } else {
        console.error("Error marking back to outlet order as sent");
    }
};

export async function markBulkAsReceivedBackToOutletOrder(payload) {
    const response = await axios.post(`${API_BASE_URL}/production/confirm-sent-backToOutlet-bulk`, payload);

    if (response && response.status === 200) {
        return response.data;
    } else {
        console.error("Error marking back to outlet order as received");
    }
};

export async function markItemAsDamaged(payload) {
    try {
        const response = await axios.post(`${API_BASE_URL}/order/mark-item-as-damaged`, payload);

        if (response && response.status === 200) {
            return response.data;
        } else {
            console.error("Error marking item as damaged");
            throw new Error("Error marking item as damaged");
        }
    } catch (error) {
        console.error("Error marking item as damaged:", error);
        throw error;
    }
};

export async function markItemAsReturned(payload) {
    try {
        const response = await axios.post(`${API_BASE_URL}/order/mark-item-as-returned`, payload);

        if (response && response.status === 200) {
            return response.data;
        } else {
            console.error("Error marking item as returned");
            throw new Error("Error marking item as returned");
        }
    } catch (error) {
        console.error("Error marking item as returned:", error);
        throw error;
    }
};

export async function unmarkItemAsReturned(payload) {
    try {
        const response = await axios.post(`${API_BASE_URL}/order/unmark-item-as-returned`, payload);

        if (response && response.status === 200) {
            return response.data;
        } else {
            console.error("Error reverting item return status");
            throw new Error("Error reverting item return status");
        }
    } catch (error) {
        console.error("Error reverting item return status:", error);
        throw error;
    }
};

export async function getNextDispatchNoteNumber(userId) {
    try {
        const response = await axios.get(`${API_BASE_URL}/production/next-dispatch-note-number/${userId}`);
        if (response && response.status === 200) {
            return response.data;
        }
    } catch (error) {
        console.error("Error fetching next dispatch note number:", error);
    }
    return { success: false, nextNo: "DN - 01" };
}

export async function useDispatchNoteNumber(payload) {
    try {
        const response = await axios.post(`${API_BASE_URL}/production/use-dispatch-note-number`, payload);
        if (response && response.status === 200) {
            return response.data;
        }
    } catch (error) {
        console.error("Error using dispatch note number:", error);
    }
    return { success: false };
}