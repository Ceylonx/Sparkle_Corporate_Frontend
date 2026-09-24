import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_SERVER_API;

export async function getAllServiceTypes() {
    try {
        const response = await axios.get(`${API_BASE_URL}/service-type/get-all-service-types`);

        if (response && response.status === 200) {
            return response;
        } else {
            console.error("Error fetching service types");
        }
    } catch (error) {
        console.error("Error fetching fetching service types:", error);
        throw error;
    }
};
export async function getViewAllServiceTypes() {
    try {
        const response = await axios.get(`${API_BASE_URL}/view-service-type/get-all-service-types`);

        if (response && response.status === 200) {
            return response;
        } else {
            console.error("Error fetching view service types");
        }
    } catch (error) {
        console.error("Error fetching fetching service types:", error);
        throw error;
    }
};