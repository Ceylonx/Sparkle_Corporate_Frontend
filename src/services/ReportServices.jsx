import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_SERVER_API;

export async function getCopCusWiseDailySalesReport(payload) {
    try {
        const response = await axios.post(`${API_BASE_URL}/reports/get-corporate-monthly-sales-report`, payload);

        if (response && response.status === 200) {
            return response;
        } else {
            console.error("Error fetching report data");
        }
    } catch (error) {
        console.error("Error fetching fetching report data:", error);
        throw error;
    }
};

export async function getYTDCusWiseSalesReport(payload) {
    try {
        const response = await axios.post(`${API_BASE_URL}/reports/get-corporate-YTD-sales-report`, payload);

        if (response && response.status === 200) {
            return response;
        } else {
            console.error("Error fetching report data");
        }
    } catch (error) {
        console.error("Error fetching fetching report data:", error);
        throw error;
    }
};

export async function getPendingOrderReport(payload) {
    try {
        const response = await axios.post(`${API_BASE_URL}/reports/get-pending-order-report`, payload);

        if (response && response.status === 200) {
            return response;
        } else {
            console.error("Error fetching report data");
        }
    } catch (error) {
        console.error("Error fetching fetching report data:", error);
        throw error;
    }
};

export async function getItemWiseSalesReport(payload) {
    try {
        const response = await axios.post(`${API_BASE_URL}/reports/get-item-wise-sales-report`, payload);

        if (response && response.status === 200) {
            return response;
        } else {
            console.error("Error fetching report data");
        }
    } catch (error) {
        console.error("Error fetching fetching report data:", error);
        throw error;
    }
};

export async function getInvoiceWiseSalesReport(payload) {
    try {
        const response = await axios.post(`${API_BASE_URL}/reports/get-item-wise-sales-report`, payload);

        if (response && response.status === 200) {
            return response;
        } else {
            console.error("Error fetching report data");
        }
    } catch (error) {
        console.error("Error fetching fetching report data:", error);
        throw error;
    }
};