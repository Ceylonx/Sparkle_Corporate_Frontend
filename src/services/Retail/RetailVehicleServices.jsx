import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_SERVER_API;

export async function getAllRetailVehicles() {
    try {
        const response = await axios.get(`${API_BASE_URL}/settings/get-vehicles`);
        if (response && response.status === 200) {
            return response.data;
        }
    } catch (error) {
        console.error("Error fetching vehicles:", error);
    }
    return { success: false, vehicles: [] };
}

export async function createRetailVehicle(payload) {
    try {
        const response = await axios.post(`${API_BASE_URL}/settings/create-vehicle`, payload);
        if (response && (response.status === 200 || response.status === 201)) {
            return response.data;
        }
    } catch (error) {
        console.error("Error creating vehicle:", error);
    }
    return { success: false };
}

export async function updateRetailVehicle(id, payload) {
    try {
        const response = await axios.put(`${API_BASE_URL}/settings/update-vehicle/${id}`, payload);
        if (response && response.status === 200) {
            return response.data;
        }
    } catch (error) {
        console.error("Error updating vehicle:", error);
    }
    return { success: false };
}

export async function deleteRetailVehicle(id) {
    try {
        const response = await axios.delete(`${API_BASE_URL}/settings/delete-vehicle/${id}`);
        if (response && response.status === 200) {
            return response.data;
        }
    } catch (error) {
        console.error("Error deleting vehicle:", error);
    }
    return { success: false };
}
