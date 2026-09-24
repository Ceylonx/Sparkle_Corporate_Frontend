import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_SERVER_API;

export async function getAllCorporateSettings(id) {
    try {
        const response = await axios.get(`${API_BASE_URL}/settings/get-corporate-settings/${id}`);

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

export async function updateCorporateSettings(payload) {
    try {
        const response = await axios.put(`${API_BASE_URL}/settings/update-corporate-settings`, payload);

        if (response && response.status === 200) {
            return response.data;
        } else {
            console.error("Error updating settings");
        }
    } catch (error) {
        console.error("Error updating settings:", error);
        throw error;
    }
};

export async function getAllCorporatePriceLists(id) {
    try {
        const response = await axios.get(`${API_BASE_URL}/price-list/get-all-corporate-price-lists/${id}`);

        if (response && response.status === 200) {
            return response;
        } else {
            console.error("Error fetching price lists");
        }
    } catch (error) {
        console.error("Error fetching price lists:", error);
        throw error;
    }
};

export async function getCorporatePriceListByCustomer(payload) {
    try {
        const response = await axios.post(`${API_BASE_URL}/price-list/get-price-list-by-customer-id`, payload);

        if (response && response.status === 200) {
            return response;
        } else {
            console.error("Error fetching price list by customer");
        }
    } catch (error) {
        console.error("Error fetching price list by customer:", error);
        throw error;
    }
};

export async function getAllCorporateCorporatePriceListsByCustomerId(payload) {
    try {
        const response = await axios.post(
            `${API_BASE_URL}/corporate-price-list/get-all-corporate-corporate-price-lists-by-cutomer-id`,
            payload
        );

        if (response && response.status === 200) {
            return response;
        } else {
            console.error("Error fetching corporate price list by customer");
        }
    } catch (error) {
        console.error("Error fetching corporate price list by customer:", error);
        throw error;
    }
};

export async function uploadPriceListsCorporate(payload) {
    try {
        const response = await axios.post(
            `${API_BASE_URL}/price-list/upload-corporate-price-list`,
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

export async function getCorporatePriceListHistory(payload) {
    try {
        const response = await axios.post(`${API_BASE_URL}/price-list/get-price-list-history-by-customer-id`, payload);

        if (response && response.status === 200) {
            return response;
        } else {
            console.error("Error fetching price list history by customer");
        }
    } catch (error) {
        console.error("Error fetching price list history by customer:", error);
        throw error;
    }
};

export async function uploadCorporateDiscountList(payload) {
    try {
        const response = await axios.post(
            `${API_BASE_URL}/settings/upload-corporate-discount-list`,
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
            console.error("Error uploading corporate discount list");
        }
    } catch (error) {
        console.error("Error uploading corporate discount list:", error);
        throw error;
    }
};

export async function uploadCorporateItemsList(payload) {
    try {
        const response = await axios.post(
            `${API_BASE_URL}/corporate-item/upload-corporate-items-list`,
            payload
        );

        if (response && response.status === 200) {
            return response;
        } else {
            console.error("Error uploading corporate items list");
        }
    } catch (error) {
        console.error("Error uploading corporate items list:", error);
        throw error;
    }
};

export async function getAllCorporateItems(id) {
    try {
        const response = await axios.get(`${API_BASE_URL}/corporate-item/get-all-corporate-items/${id}`);

        if (response && response.status === 200) {
            return response;
        } else {
            console.error("Error fetching corporate items");
        }
    } catch (error) {
        console.error("Error fetching corporate items:", error);
        throw error;
    }
};

export async function getCorporateItemById(payload) {
    try {
        const response = await axios.post(`${API_BASE_URL}/corporate-item/get-corporate-item-by-id`, payload);

        if (response && response.status === 200) {
            return response;
        } else {
            console.error("Error fetching corporate item by ID");
        }
    } catch (error) {
        console.error("Error fetching corporate item by ID:", error);
        throw error;
    }
};

export async function createCorporateItem(payload) {
    try {
        const response = await axios.post(`${API_BASE_URL}/corporate-item/create-corporate-item`, payload);

        if (response && response.status === 200) {
            return response;
        } else {
            console.error("Error creating corporate item");
        }
    } catch (error) {
        console.error("Error creating corporate item:", error);
        throw error;
    }
};

export async function updateCorporateItem(payload) {
    try {
        const response = await axios.put(`${API_BASE_URL}/corporate-item/update-corporate-item`, payload);

        if (response && response.status === 200) {
            return response;
        } else {
            console.error("Error updating corporate item");
        }
    } catch (error) {
        console.error("Error updating corporate item:", error);
        throw error;
    }
};

export async function createCorporateDiscount(payload) {
    try {
        const response = await axios.post(`${API_BASE_URL}/settings/create-corporate-discount`, payload);

        if (response && response.status === 200) {
            return response;
        } else {
            console.error("Error creating corporate discount");
        }
    } catch (error) {
        console.error("Error creating corporate discount:", error);
        throw error;
    }
};

export async function updateCorporateDiscountById(payload) {
    try {
        const response = await axios.put(`${API_BASE_URL}/settings/update-corporate-discount-by-id`, payload);

        if (response && response.status === 200) {
            return response;
        } else {
            console.error("Error updating corporate discount");
        }
    } catch (error) {
        console.error("Error updating corporate discount:", error);
        throw error;
    }
};

export async function getAllCorporateDiscounts(id) {
    try {
        const response = await axios.get(`${API_BASE_URL}/settings/get-all-corporate-discounts/${id}`);

        if (response && response.status === 200) {
            return response;
        } else {
            console.error("Error fetching corporate discounts");
        }
    } catch (error) {
        console.error("Error fetching corporate discounts:", error);
        throw error;
    }
};

export async function getAllCorporateRawMaterials(id) {
    try {
        const response = await axios.get(`${API_BASE_URL}/corporate-raw-material/get-all-corporate-raw-materials/${id}`);

        if (response && response.status === 200) {
            return response;
        } else {
            console.error("Error fetching corporate raw materials");
        }
    } catch (error) {
        console.error("Error fetching corporate raw materials:", error);
        throw error;
    }
};

export async function getAllCorporateItemCategories(id) {
    try {
        const response = await axios.get(`${API_BASE_URL}/corporate-item/get-all-corporate-item-categories/${id}`);

        if (response && response.status === 200) {
            return response;
        } else {
            console.error("Error fetching corporate item categories");
        }
    } catch (error) {
        console.error("Error fetching corporate item categories:", error);
        throw error;
    }
};

function normalizeCorporateTaxList(response) {
    const d = response?.data;
    if (!d) return [];
    if (Array.isArray(d.taxes)) return d.taxes;
    if (Array.isArray(d.data)) return d.data;
    if (Array.isArray(d)) return d;
    return [];
}

export async function getCorporateTaxes(userId, { activeOnly = false } = {}) {
    const q = activeOnly ? "?active_only=1" : "";
    const response = await axios.get(`${API_BASE_URL}/settings/get-corporate-taxes/${userId}${q}`);
    if (response?.status === 200) {
        const taxes = normalizeCorporateTaxList(response);
        return { ...response, taxes };
    }
    return response;
}

export async function createCorporateTax(payload) {
    const response = await axios.post(`${API_BASE_URL}/settings/create-corporate-tax`, payload);
    if (response?.status === 200 || response?.status === 201) {
        return response.data;
    }
    throw new Error("Failed to create tax");
}

export async function updateCorporateTax(payload) {
    const response = await axios.put(`${API_BASE_URL}/settings/update-corporate-tax`, payload);
    if (response?.status === 200 || response?.status === 201) {
        return response.data;
    }
    throw new Error("Failed to update tax");
}

export async function deleteCorporateTax(payload) {
    const response = await axios.delete(`${API_BASE_URL}/settings/delete-corporate-tax`, { data: payload });
    if (response?.status === 200 || response?.status === 204) {
        return response.data;
    }
    throw new Error("Failed to delete tax");
}
