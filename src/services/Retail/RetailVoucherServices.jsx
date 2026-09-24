import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_SERVER_API;

export async function getAllRetailVouchers(id) {
    try {
        const response = await axios.get(`${API_BASE_URL}/voucher/get-all-vouchers/${id}`);

        if (response && response.status === 200) {
            return response;
        } else {
            console.error("Error fetching vouchers");
        }
    } catch (error) {
        console.error("Error fetching fetching vouchers:", error);
        throw error;
    }
};

export async function getRetailVoucherById(payload) {
    const response = await axios.post(`${API_BASE_URL}/voucher/get-voucher-by-id`, payload);

    if (response && response.status === 200) {
        return response.data;
    } else {
        console.error("Error fetching voucher");
    }
};

export async function createRetailVoucher(payload) {
    const response = await axios.post(`${API_BASE_URL}/voucher/create-voucher`, payload);

    if (response && response.status === 201) {
        return response.data;
    } else {
        console.error("Error creating voucher");
    }
};

export async function updateRetailVoucher(payload) {
    const response = await axios.put(`${API_BASE_URL}/voucher/update-voucher`, payload);

    if (response && response.status === 200) {
        return response.data;
    } else {
        console.error("Error updating voucher");
    }
};

export async function changeRetailVoucherStatus(payload) {
    const response = await axios.put(`${API_BASE_URL}/voucher/change-voucher-status`, payload);

    if (response && response.status === 200) {
        return response.data;
    } else {
        console.error("Error updating voucher status");
    }
};

export async function deleteRetailVoucher(payload) {
    const response = await axios.put(`${API_BASE_URL}/voucher/delete-voucher`, payload);

    if (response && response.status === 200) {
        return response.data;
    } else {
        console.error("Error deleting voucher");
    }
};
