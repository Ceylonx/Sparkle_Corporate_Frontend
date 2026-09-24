import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_SERVER_API;

export async function getAllRetailPendingProductions(id, branchId, offset = 0) {
    console.log("test");
    try {
        
        const response = await axios.get(`${API_BASE_URL}/production/get-all-pending-productions/${id}/${branchId}/${offset}`);

        console.log("getAllRetailPendingProductions: Response:", response);

        if (response && response.status === 200) {
            return response;
        } else {
            console.error("Error fetching pending productions");
        }
    } catch (error) {
        console.error("Error fetching fetching pending productions:", error);
        throw error;
    }
};

export async function getAllRetailPendingProductionsAllBranches(id, offset = 0) {
    try {
        const response = await axios.get(`${API_BASE_URL}/production/get-all-pending-productions-all-branches/${id}/${offset}`);

        if (response && response.status === 200) {
            return response;
        } else {
            console.error("Error fetching pending productions (all branches)");
        }
    } catch (error) {
        console.error("Error fetching pending productions (all branches):", error);
        throw error;
    }
};

export async function sendToProductionOrder(payload) {
    const response = await axios.post(`${API_BASE_URL}/production/send-to-production`, payload);

    if (response && response.status === 200) {
        return response.data;
    } else {
        console.error("Error sending to production");
    }
};

export async function getAllRetailPendingProductionsReceived(id, branchId, offset = 0) {
    try {
        const response = await axios.get(`${API_BASE_URL}/production/get-all-pending-confirm-production-received-orders/${id}/${branchId}/${offset}`);
        console.log("getAllRetailPendingProductionsReceived: Response:", response);

        if (response && response.status === 200) {
            return response;
        } else {
            console.error("Error fetching receive productions");
        }
    } catch (error) {
        console.error("Error fetching to receive productions:", error);
        throw error;
    }
};

export async function getAllRetailPendingProductionsReceivedAllBranches(id, offset = 0) {
    try {
        const response = await axios.get(`${API_BASE_URL}/production/get-all-pending-confirm-production-received-orders-all-branches/${id}/${offset}`);

        if (response && response.status === 200) {
            return response;
        } else {
            console.error("Error fetching receive productions (all branches)");
        }
    } catch (error) {
        console.error("Error fetching receive productions (all branches):", error);
        throw error;
    }
};

export async function receiveToProductionOrder(payload) {
    const response = await axios.post(`${API_BASE_URL}/production/confirm-received-to-production`, payload);

    if (response && response.status === 200) {
        return response.data;
    } else {
        console.error("Error receiving to production");
    }
};

export async function sendBulkToProductionOrder(payload) {
    const response = await axios.post(`${API_BASE_URL}/production/send-to-production-bulk`, payload);

    if (response && response.status === 200) {
        return response.data;
    } else {
        console.error("Error sending to production");
    }
};

export async function receiveBulkToProductionOrder(payload) {
    const response = await axios.post(`${API_BASE_URL}/production/confirm-received-to-production-bulk`, payload);

    if (response && response.status === 200) {
        return response.data;
    } else {
        console.error("Error receiving to production");
    }
};