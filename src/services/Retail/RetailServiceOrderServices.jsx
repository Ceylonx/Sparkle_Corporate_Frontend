import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_SERVER_API;

export async function getAllRetailServiceOrders(id) {
    try {
        const response = await axios.get(`${API_BASE_URL}/order/get-all-service-orders/${id}`);

        if (response && response.status === 200) {
            return response;
        } else {
            console.error("Error fetching service orders");
        }
        console.log("getAllRetailServiceOrders: Response:", response);
    } catch (error) {
        console.error("Error fetching service orders:", error);
        throw error;
    }
};

export async function markAsCompletedServiceOrder(payload) {
    const response = await axios.post(`${API_BASE_URL}/production/mark-as-completed`, payload);

    if (response && response.status === 200) {
        return response.data;
    } else {
        console.error("Error marking service order as completed order");
    }
};