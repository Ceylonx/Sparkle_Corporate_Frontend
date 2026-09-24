import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_SERVER_API;
const API_BASE_URL_HR = import.meta.env.VITE_SERVER_API_HR;

export async function getAllCorporatePendingDeliveries(id) {
    try {
        const response = await axios.get(`${API_BASE_URL}/pickup-entry/get-all-in-production-pickup-entries/${id}`);

        if (response && response.status === 200) {
            return response;
        } else {
            console.error("Error fetching pending delivery entries");
        }
    } catch (error) {
        console.error("Error fetching fetching pending delivery entries:", error);
        throw error;
    }
};

export async function getCorporateDeliveryLogs(payload) {
    try {
        const response = await axios.post(`${API_BASE_URL}/pickup-entry/get-pickup-entry-delivery-logs`, payload);

        if (response && response.status === 200) {
            return response;
        } else {
            console.error("Error fetching delivery logs");
        }
    } catch (error) {
        console.error("Error fetching fetching delivery logs:", error);
        throw error;
    }
};

export async function getCorporateDeliveryById(payload) {
    try {
        const response = await axios.post(`${API_BASE_URL}/pickup-entry/get-all-in-delivery-pickup-entry-by-id`, payload);

        if (response && response.status === 200) {
            return response;
        } else {
            console.error("Error fetching in-delivery pickup entry by id");
        }
    } catch (error) {
        console.error("Error fetching in-delivery pickup entry by id:", error);
        throw error;
    }
};

export async function createCorporateDeliveryEntry(payload) {
    try {
        const response = await axios.post(
            `${API_BASE_URL}/pickup-entry/mark-corporate-order-items-as-delivered`,
            payload,
            {
                headers: {
                    "Content-Type": "multipart/form-data",
                },
            }
        );

        if (response && response.status === 200) {
            return response;
        } else {
            console.error("Error creating delivery entry");
        }
    } catch (error) {
        console.error("Error creating delivery entry:", error);
        throw error;
    }
};

export async function getAllCorporateCompletedDeliveries(id) {
    try {
        const response = await axios.get(`${API_BASE_URL}/pickup-entry/get-all-delivered-pickup-entries/${id}`);

        if (response && response.status === 200) {
            return response;
        } else {
            console.error("Error fetching completed delivery entries");
        }
    } catch (error) {
        console.error("Error fetching fetching completed delivery entries:", error);
        throw error;
    }
};

export async function getAllCorporateDrivers() {
    try {
        const response = await axios.get(`${API_BASE_URL_HR}/employees/drivers`);

        if (response && response.status === 200) {
            return response;
        } else {
            console.error("Error fetching drivers");
        }
    } catch (error) {
        console.error("Error fetching fetching drivers:", error);
        throw error;
    }
};

// Delivery Note Workflow

export async function createDeliveryNote(payload) {
    try {
        const response = await axios.post(
            `${API_BASE_URL}/pickup-entry/create-delivery-note`,
            payload,
            {
                headers: {
                    "Content-Type": "multipart/form-data",
                },
            }
        );
        if (response && (response.status === 200 || response.status === 201)) {
            return response;
        }
        throw new Error("Unexpected response creating delivery note");
    } catch (error) {
        console.error("Error creating delivery note:", error);
        throw error;
    }
};

/**
 * @param {string} userId
 * @param {number} [offset]
 * @param {{ status?: 'all' | 'created' | 'approved' | 'active', limit?: number, search?: string }} [options]
 */
export async function getAllDeliveryNotes(userId, offset, options = {}) {
    try {
        const params = new URLSearchParams();
        if (offset !== undefined && offset !== null) {
            params.append("offset", offset);
        }
        if (options.limit !== undefined && options.limit !== null) {
            params.append("limit", options.limit);
        }
        if (options.status) {
            params.append("status", options.status);
        }
        if (options.search) {
            params.append("search", options.search);
        }

        const queryString = params.toString() ? `?${params.toString()}` : "";
        const response = await axios.get(
            `${API_BASE_URL}/pickup-entry/get-all-delivery-notes/${userId}${queryString}`
        );
        if (response && response.status === 200) {
            return response;
        }
        throw new Error("Unexpected response fetching delivery notes");
    } catch (error) {
        console.error("Error fetching delivery notes:", error);
        throw error;
    }
};

export async function getDeliveryNoteById(payload) {
    try {
        const response = await axios.post(`${API_BASE_URL}/pickup-entry/get-delivery-note-by-id`, payload);
        if (response && response.status === 200) {
            return response;
        }
        throw new Error("Unexpected response fetching delivery note by id");
    } catch (error) {
        console.error("Error fetching delivery note by id:", error);
        throw error;
    }
};

export async function updateDeliveryNoteApprovalStatus(payload) {
    try {
        const response = await axios.put(`${API_BASE_URL}/pickup-entry/update-delivery-note-approval-status`, payload);
        if (response && response.status === 200) {
            return response.data;
        }
        throw new Error("Unexpected response updating delivery note approval status");
    } catch (error) {
        console.error("Error updating delivery note approval status:", error);
        throw error;
    }
};

export async function updateDeliveryNote(payload) {
    try {
        const response = await axios.put(`${API_BASE_URL}/pickup-entry/update-delivery-note`, payload);
        if (response && response.status === 200) {
            return response.data;
        }
        throw new Error("Unexpected response updating delivery note");
    } catch (error) {
        console.error("Error updating delivery note:", error);
        throw error;
    }
};

export async function cancelDeliveryNote(payload) {
    try {
        const response = await axios.put(`${API_BASE_URL}/pickup-entry/cancel-delivery-note`, payload);
        if (response && response.status === 200) {
            return response.data;
        }
        throw new Error("Unexpected response cancelling delivery note");
    } catch (error) {
        console.error("Error cancelling delivery note:", error);
        throw error;
    }
};

export async function updateCorporateDeliveryNoteDate(payload) {
    try {
        const response = await axios.put(`${API_BASE_URL}/pickup-entry/update-delivery-note-date`, payload);
        if (response && response.status === 200) {
            return response.data;
        }
        throw new Error("Unexpected response");
    } catch (error) {
        console.error("Error updating corporate delivery note date:", error);
        throw error;
    }
}
