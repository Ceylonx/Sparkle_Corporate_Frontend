import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_SERVER_API;

export async function getAllRetailDiscounts(id) {
    try {
        const response = await axios.get(`${API_BASE_URL}/discount/get-all-discounts/${id}`);

        if (response && response.status === 200) {
            return response;
        } else {
            console.error("Error fetching discounts");
        }
    } catch (error) {
        console.error("Error fetching fetching discounts:", error);
        throw error;
    }
};

export async function getRetailDiscountById(payload) {
    const response = await axios.post(`${API_BASE_URL}/discount/get-discount-by-id`, payload);

    if (response && response.status === 200) {
        return response.data;
    } else {
        console.error("Error fetching discount");
    }
};

export async function createRetailDiscount(payload) {
    const response = await axios.post(`${API_BASE_URL}/discount/create-discount`, payload);

    if (response && response.status === 201) {
        return response.data;
    } else {
        console.error("Error creating discount");
    }
};

export async function updateRetailDiscount(payload) {
    const response = await axios.put(`${API_BASE_URL}/discount/update-discount`, payload);

    if (response && response.status === 200) {
        return response.data;
    } else {
        console.error("Error updating discount");
    }
};

export async function deleteRetailDiscount(payload) {
    const response = await axios.put(`${API_BASE_URL}/discount/delete-discount`, payload);

    if (response && response.status === 200) {
        return response.data;
    } else {
        console.error("Error deleting discount");
    }
};

export async function updateRetailDiscountStatus(payload) {
    const response = await axios.put(`${API_BASE_URL}/discount/update-status`, payload);

    if (response && response.status === 200) {
        return response.data;
    } else {
        console.error("Error updating discount status");
    }
};