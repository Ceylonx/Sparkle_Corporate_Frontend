import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_SERVER_API;

export async function getAllPriceLists(id) {
    try {
        const response = await axios.get(`${API_BASE_URL}/price-list/get-all-price-lists/${id}`);

        if (response && response.status === 200) {
            return response;
        } else {
            console.error("Error fetching price list");
        }
    } catch (error) {
        console.error("Error fetching fetching price list:", error);
        throw error;
    }
};

export async function uploadPriceListsRetail(payload) {
    try {
        const response = await axios.post(
            `${API_BASE_URL}/price-list/upload-price-list`,
            payload,
            {
                headers: {
                    "Content-Type": "multipart/form-data",
                },
            }
        );

        if (response && response.status === 200) {
            return response;
        } else {
            console.error("Error uploading price list");
        }
    } catch (error) {
        console.error("Error fetching uploading price list:", error);
        throw error;
    }
};

export async function getPriceListHistory(id) {
    try {
        const response = await axios.get(`${API_BASE_URL}/price-list/get-price-lists-histoty/${id}`);

        if (response && response.status === 200) {
            return response;
        } else {
            console.error("Error fetching price list history");
        }
    } catch (error) {
        console.error("Error fetching fetching price list history:", error);
        throw error;
    }
};

export async function getAllItemTypes(id) {
    try {
        const response = await axios.get(`${API_BASE_URL}/item-type/get-all-item-types/${id}`);

        if (response && response.status === 200) {
            return response;
        } else {
            console.error("Error fetching item types");
        }
    } catch (error) {
        console.error("Error fetching fetching item types:", error);
        throw error;
    }
};
export async function getViewAllItemTypes() {
    try {
        const response = await axios.get(`${API_BASE_URL}/view-item-type/view-item-types`);

        if (response && response.status === 200) {
            return response;
        } else {
            console.error("Error fetching view item types");
        }
    } catch (error) {
        console.error("Error fetching fetching item types:", error);
        throw error;
    }
};

export async function getItemTypeById(payload) {
    try {
        const response = await axios.post(`${API_BASE_URL}/item-type/get-item-type-by-id`, payload);

        if (response && response.status === 200) {
            return response;
        } else {
            console.error("Error fetching item tpye by ID");
        }
    } catch (error) {
        console.error("Error fetching fetching item type by ID:", error);
        throw error;
    }
};

export async function createItemType(payload) {
    const response = await axios.post(`${API_BASE_URL}/item-type/create-item-type`, payload);

    if (response && response.status === 201) {
        return response.data;
    } else {
        console.error("Error creating item type");
    }
};

export async function updateItemType(payload) {
    const response = await axios.put(`${API_BASE_URL}/item-type/update-item-type`, payload);

    if (response && response.status === 200) {
        return response.data;
    } else {
        console.error("Error updating item type");
    }
};

export async function deactivateItemType(payload) {
    const response = await axios.put(`${API_BASE_URL}/item-type/deactivate-item-type`, payload);

    if (response && response.status === 200) {
        return response.data;
    } else {
        console.error("Error deactivating item type");
    }
};

export async function uploadItemTypeWeights(payload) {
    try {
        const response = await axios.post(
            `${API_BASE_URL}/item-type/upload-item-weights`,
            payload,
            {
                headers: {
                    "Content-Type": "multipart/form-data",
                },
            }
        );

        if (response && response.status === 200) {
            return response;
        } else {
            console.error("Error uploading item type weights");
        }
    } catch (error) {
        console.error("Error uploading item type weights:", error);
        throw error;
    }
};

export async function getAllSettings(id) {
    try {
        const response = await axios.get(`${API_BASE_URL}/settings/get-all-settings/${id}`);

        if (response && response.status === 200) {
            return response;
        } else {
            console.error("Error fetching settings");
        }
    } catch (error) {
        console.error("Error fetching settings:", error);
        throw error;
    }
};

export async function updateSettings(payload) {
    const response = await axios.put(`${API_BASE_URL}/settings/update-settings`, payload);

    if (response && response.status === 200) {
        return response.data;
    } else {
        console.error("Error updating settings");
    }
};

export async function dayEndRetail(payload) {
    const response = await axios.post(`${API_BASE_URL}/production/day-end`, payload);
    return response.data;
};