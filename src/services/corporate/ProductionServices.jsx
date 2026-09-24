import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_SERVER_API;

export async function getAllCorporatePendingPickupEntries(id) {
    try {
        const response = await axios.get(`${API_BASE_URL}/pickup-entry/get-all-pending-pickup-entries/${id}`);

        if (response && response.status === 200) {
            return response;
        } else {
            console.error("Error fetching pending pickup entries");
        }
    } catch (error) {
        console.error("Error fetching fetching pending pickup entries:", error);
        throw error;
    }
};

export async function corporatePickupEntrySendToProduction(payload) {
    try {
        const response = await axios.put(`${API_BASE_URL}/pickup-entry/pickup-entry-send-to-production`, payload);

        if (response && response.status === 200) {
            return response;
        } else {
            console.error("Error sending pickup entry to production");
        }
    } catch (error) {
        console.error("Error sending pickup entry to production:", error);
        throw error;
    }
};

export async function getInProductionPickupEntryById(payload) {
    try {
        const response = await axios.post(
            `${API_BASE_URL}/pickup-entry/get-all-in-production-pickup-entry-by-id`,
            payload
        );

        if (response && response.status === 200) {
            return response;
        } else {
            console.error("Error fetching in-production pickup entry by id");
        }
    } catch (error) {
        console.error("Error fetching in-production pickup entry by id:", error);
        throw error;
    }
};

export async function changePickupEntryItemsProductionStatus(payload) {
    try {
        const response = await axios.put(
            `${API_BASE_URL}/pickup-entry/change-pickup-entry-items-production-status`,
            payload
        );

        if (response && response.status === 200) {
            return response;
        } else {
            console.error("Error changing pickup entry item production status");
        }
    } catch (error) {
        console.error("Error changing pickup entry item production status:", error);
        throw error;
    }
};