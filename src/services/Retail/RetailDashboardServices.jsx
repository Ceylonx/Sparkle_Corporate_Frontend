import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_SERVER_API;

export async function getRetailDashboardPendingOrders(payload) {
    const response = await axios.post(`${API_BASE_URL}/dashboard/get-pending-orders`, payload);

    if (response && response.status === 200) {
        return response.data;
    } else {
        console.error("Error fetching pending orders");
    }
};

export async function getRetailDashboardTotalOrders(payload) {
    const response = await axios.post(`${API_BASE_URL}/dashboard/get-total-orders-today`, payload);

    if (response && response.status === 200) {
        return response.data;
    } else {
        console.error("Error fetching total orders");
    }
};

export async function getRetailDashboardReadyForPickupOrders(payload) {
    const response = await axios.post(`${API_BASE_URL}/dashboard/get-ready-for-pickup-orders`, payload);

    if (response && response.status === 200) {
        return response.data;
    } else {
        console.error("Error fetching ready for pickup orders");
    }
};

export async function getRetailDashboardReleaseTodayOrders(payload) {
    const response = await axios.post(`${API_BASE_URL}/dashboard/get-release-today-orders`, payload);

    if (response && response.status === 200) {
        return response.data;
    } else {
        console.error("Error fetching release today orders");
    }
};

export async function getRetailDashboardExpressOrders(payload) {
    const response = await axios.post(`${API_BASE_URL}/dashboard/get-express-orders`, payload);

    if (response && response.status === 200) {
        return response.data;
    } else {
        console.error("Error fetching express orders");
    }
};

export async function getRetailDashboardTodaySummary(payload) {
    const response = await axios.post(`${API_BASE_URL}/dashboard/get-today-summary`, payload);

    if (response && response.status === 200) {
        return response.data;
    } else {
        console.error("Error fetching today summary");
    }
};

export async function getRetailDashboardRecentActivity(payload) {
    const response = await axios.post(`${API_BASE_URL}/dashboard/get-recent-activity`, payload);

    if (response && response.status === 200) {
        return response.data;
    } else {
        console.error("Error fetching recent activities");
    }
};

export async function getRetailDashboardTotalCustomers(payload) {
    const response = await axios.post(`${API_BASE_URL}/dashboard/get-total-customers`, payload);

    if (response && response.status === 200) {
        return response.data;
    } else {
        console.error("Error fetching total customers");
    }
};

export async function getRetailDashboardNewCustomersToday(payload) {
    const response = await axios.post(`${API_BASE_URL}/dashboard/get-new-customers-today`, payload);

    if (response && response.status === 200) {
        return response.data;
    } else {
        console.error("Error fetching new customers today");
    }
};

export async function getRetailDashboardTopCustomers(payload) {
    const response = await axios.post(`${API_BASE_URL}/dashboard/get-top-customers`, payload);

    if (response && response.status === 200) {
        return response.data;
    } else {
        console.error("Error fetching top customers");
    }
};

export async function getRetailDashboardInvoiceSummaries(payload) {
    const response = await axios.post(`${API_BASE_URL}/dashboard/get-invoice-summaries`, payload);

    if (response && response.status === 200) {
        return response.data;
    } else {
        console.error("Error fetching invoice summaries");
    }
};

export async function getRetailDashboardOrderTypeCounts(payload) {
    const response = await axios.post(`${API_BASE_URL}/dashboard/get-order-types-counts-to-dashboard`, payload);

    if (response && response.status === 200) {
        return response.data;
    } else {
        console.error("Error fetching order type counts");
    }
};

// Day end details for retail (used in Day End dialog)
export async function getRetailDayEndDetails(payload) {
    const body = payload && typeof payload === "object" ? payload : {};
    if (!body.user_id) {
        console.error("Day end details requires user_id in payload");
        throw new Error("User ID is required for day end details.");
    }
    const response = await axios.post(`${API_BASE_URL}/attendence/day-end-details`, body, {
        headers: { "Content-Type": "application/json" },
    });
    if (response && response.status === 200) {
        return response.data;
    }
    console.error("Error fetching day end details");
    return response?.data;
}