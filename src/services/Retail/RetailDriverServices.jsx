import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_SERVER_API;

export async function getAllRetailDrivers() {
    try {
        const response = await axios.get(`${API_BASE_URL}/settings/get-drivers`);
        if (response && response.status === 200) {
            return response.data;
        }
    } catch (error) {
        console.error("Error fetching drivers:", error);
    }
    return { success: false, drivers: [] };
}

export async function createRetailDriver(payload) {
    try {
        const response = await axios.post(`${API_BASE_URL}/settings/create-driver`, payload);
        if (response && (response.status === 200 || response.status === 201)) {
            return response.data;
        }
    } catch (error) {
        console.error("Error creating driver:", error);
    }
    return { success: false };
}

export async function deleteRetailDriver(id) {
    try {
        const response = await axios.delete(`${API_BASE_URL}/settings/delete-driver/${id}`);
        if (response && response.status === 200) {
            return response.data;
        }
    } catch (error) {
        console.error("Error deleting driver:", error);
    }
    return { success: false };
}

export async function updateRetailDriver(id, payload) {
    try {
        const response = await axios.put(`${API_BASE_URL}/settings/update-driver/${id}`, payload);
        if (response && response.status === 200) {
            return response.data;
        }
    } catch (error) {
        console.error("Error updating driver:", error);
    }
    return { success: false };
}
