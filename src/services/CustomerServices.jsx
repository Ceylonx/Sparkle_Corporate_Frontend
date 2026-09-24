import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_SERVER_API;

export async function getAllCustomers(payload) {
    try {
        const response = await axios.post(`${API_BASE_URL}/customer/get-all-customers`, payload);

        if (response && response.status === 200) {
            return response;
        } else {
            console.error("Error fetching customers");
        }
    } catch (error) {
        console.error("Error fetching fetching customers:", error);
        throw error;
    }
};

export async function getAllCorporateCustomers(userId, offset) {
    try {
        let url = `${API_BASE_URL}/customer/get-all-corporate-customers/${userId}`;
        if (offset !== undefined) {
            url += `?offset=${offset}`;
        }
        const response = await axios.get(url);

        if (response && response.status === 200) {
            return response;
        } else {
            console.error("Error fetching corporate customers");
        }
    } catch (error) {
        console.error("Error fetching corporate customers:", error);
        throw error;
    }
};

export async function getCustomerById(payload) {
    try {
        const response = await axios.post(`${API_BASE_URL}/customer/get-customer-by-id`, payload);

        if (response && response.status === 200) {
            return response;
        } else {
            console.error("Error fetching customer by ID");
        }
    } catch (error) {
        console.error("Error fetching fetching customer by ID:", error);
        throw error;
    }
};
export async function getViewCustomerById(payload) {
    try {
        const response = await axios.post(`${API_BASE_URL}/view-customer/view-customer-by-id`, payload);

        if (response && response.status === 200) {
            return response;
        } else {
            console.error("Error fetching view customer by ID");
        }
    } catch (error) {
        console.error("Error fetching fetching customer by ID:", error);
        throw error;
    }
};
export async function createCustomer(payload) {
    const response = await axios.post(`${API_BASE_URL}/customer/create-customer`, payload);

    if (response && response.status === 201) {
        return response.data;
    } else {
        console.error("Error creating customer");
    }
};

export async function createCorporateCustomer(payload) {
    const response = await axios.post(`${API_BASE_URL}/customer/create-corporate-customer`, payload);

    if (response && response.status === 201 || response.status === 200) {
        return response.data;
    } else {
        console.error("Error creating corporate customer");
    }
};

export async function updateCustomer(payload) {
    const response = await axios.put(`${API_BASE_URL}/customer/update-customer`, payload);

    if (response && response.status === 200) {
        return response.data;
    } else {
        console.error("Error updating customer");
    }
};

export async function deactivateCustomer(payload) {
    const response = await axios.put(`${API_BASE_URL}/customer/deactivate-customer`, payload);

    if (response && response.status === 200) {
        return response.data;
    } else {
        console.error("Error deactivating customer");
    }
};

export async function activateCustomer(payload) {
    const response = await axios.put(`${API_BASE_URL}/customer/activate-customer`, payload);

    if (response && response.status === 200) {
        return response.data;
    } else {
        console.error("Error activating customer");
    }
};
/**
 * Single customer object from get-corporate-customer-by-id axios response, or null.
 * Matches CorporateCustomerViewDialog / CorporateCustomerUpdateForm parsing (nested or flat body).
 */
export function unwrapCorporateCustomerGetByIdResponse(axiosResponse) {
    const body = axiosResponse?.data;
    if (body == null || typeof body !== "object" || Array.isArray(body)) return null;
    let row = body.customer ?? body.data;
    if (Array.isArray(row)) {
        row = row.find((x) => x != null && typeof x === "object" && !Array.isArray(x)) ?? null;
    }
    if (row != null && typeof row === "object" && !Array.isArray(row)) return row;
    if (
        body.customer_auto_id != null ||
        body.customer_id != null ||
        String(body.customer_company_name ?? "").trim() !== "" ||
        String(body.company_name ?? "").trim() !== ""
    ) {
        return body;
    }
    return null;
}

export async function getCorporateCustomerById(payload) {
    try {
        const response = await axios.post(`${API_BASE_URL}/customer/get-corporate-customer-by-id`, payload);

        if (response && response.status === 200) {
            return response;
        } else {
            console.error("Error fetching corporate customer by ID");
        }
    } catch (error) {
        console.error("Error fetching corporate customer by ID:", error);
        throw error;
    }
};

export async function updateCorporateCustomer(payload) {
    try {
        const response = await axios.put(`${API_BASE_URL}/customer/update-corporate-customer`, payload);

        if (response && (response.status === 200 || response.status === 201)) {
            return response.data;
        } else {
            console.error("Error updating corporate customer");
        }
    } catch (error) {
        console.error("Error updating corporate customer:", error);
        throw error;
    }
};

export async function deactiveCorporateCustomer(payload) {
    try {
        const response = await axios.put(`${API_BASE_URL}/customer/deactive-corporate-customer`, payload);

        if (response && (response.status === 200 || response.status === 201)) {
            return response.data;
        } else {
            console.error("Error deactivating corporate customer");
        }
    } catch (error) {
        console.error("Error deactivating corporate customer:", error);
        throw error;
    }
};

export async function activeCorporateCustomer(payload) {
    try {
        const response = await axios.put(`${API_BASE_URL}/customer/active-corporate-customer`, payload);

        if (response && (response.status === 200 || response.status === 201)) {
            return response.data;
        } else {
            console.error("Error activating corporate customer");
        }
    } catch (error) {
        console.error("Error activating corporate customer:", error);
        throw error;
    }
};

