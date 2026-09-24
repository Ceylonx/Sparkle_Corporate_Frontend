import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_SERVER_API;

export async function getCorporateMainSummary(payload) {
    try {
        const response = await axios.post(`${API_BASE_URL}/dashboard/get-corporate-dashboard-main-summary`, payload);

        if (response && response.status === 200) {
            return response;
        } else {
            console.error("Error fetching main summary");
        }
    } catch (error) {
        console.error("Error fetching fetching main summary:", error);
        throw error;
    }
};

export async function getTotalCorporateCustomers(payload) {
    try {
        const response = await axios.post(`${API_BASE_URL}/dashboard/get-total-corporate-customers`, payload);

        if (response && response.status === 200) {
            return response;
        } else {
            console.error("Error fetching total corporate customers");
        }
    } catch (error) {
        console.error("Error fetching fetching total corporate customers:", error);
        throw error;
    }
};

export async function getCorporateNewCustomersToday(payload) {
    try {
        const response = await axios.post(`${API_BASE_URL}/dashboard/get-new-corporate-customers-today`, payload);

        if (response && response.status === 200) {
            return response;
        } else {
            console.error("Error fetching new corporate customers today");
        }
    } catch (error) {
        console.error("Error fetching fetching new corporate customers today:", error);
        throw error;
    }
};

export async function getTopCorporateCustomers(payload) {
    try {
        const response = await axios.post(`${API_BASE_URL}/dashboard/get-top-corporate-customers`, payload);

        if (response && response.status === 200) {
            return response;
        } else {
            console.error("Error fetching top corporate customers");
        }
    } catch (error) {
        console.error("Error fetching fetching top corporate customers:", error);
        throw error;
    }
};

export async function getCorporateDailyPeriodCustomers(payload) {
    try {
        const response = await axios.post(`${API_BASE_URL}/dashboard/get-corporate-daily-period-customers`, payload);

        if (response && response.status === 200) {
            return response;
        } else {
            console.error("Error fetching corporate daily and period customers");
        }
    } catch (error) {
        console.error("Error fetching fetching corporate daily and period customers:", error);
        throw error;
    }
};

export async function getCorporateDayEndDetails(payload) {
    const body = payload && typeof payload === "object" ? payload : {};
    if (!body.user_id) {
        console.error("Corporate day end details requires user_id in payload");
        throw new Error("User ID is required for day end details.");
    }
    const response = await axios.post(`${API_BASE_URL}/dashboard/get-corporate-day-end-details`, body);
    if (response && response.status === 200) {
        return response.data;
    }
    console.error("Error fetching corporate day end details");
    return response?.data;
};

export async function dayEndCorporate(payload) {
    const response = await axios.post(`${API_BASE_URL}/dashboard/corporate-day-end`, payload);
    return response.data;
};