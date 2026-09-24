import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_SERVER_API;

export async function getAllCorporatePickupEntries(id) {
    try {
        const response = await axios.get(`${API_BASE_URL}/pickup-entry/get-all-pickup-entries/${id}`);

        if (response && response.status === 200) {
            return response;
        } else {
            console.error("Error fetching pickup entries");
        }
    } catch (error) {
        console.error("Error fetching fetching pickup entries:", error);
        throw error;
    }
};

export async function getAllCorporateInProductionPickupEntries(id, branchIdOrOptions = 0, isProduction = false) {
    try {
        const isOptionsObject =
            branchIdOrOptions != null &&
            typeof branchIdOrOptions === "object" &&
            !Array.isArray(branchIdOrOptions);

        const url = isOptionsObject
            ? (() => {
                const params = new URLSearchParams();
                const {
                    page,
                    limit,
                    search,
                    isProduction: includeProductionFlag = false,
                } = branchIdOrOptions;

                if (page !== undefined && page !== null) {
                    params.append("page", String(page));
                }
                if (limit !== undefined && limit !== null) {
                    params.append("limit", String(limit));
                }

                const normalizedSearch = typeof search === "string" ? search.trim() : "";
                if (normalizedSearch) {
                    params.append("search", normalizedSearch);
                }
                if (includeProductionFlag) {
                    params.append("isProduction", "true");
                }

                const queryString = params.toString() ? `?${params.toString()}` : "";
                return `${API_BASE_URL}/pickup-entry/get-all-in-production-pickup-entries/${id}${queryString}`;
            })()
            : (
                isProduction
                    ? `${API_BASE_URL}/pickup-entry/get-all-in-production-pickup-entries/${id}/${branchIdOrOptions}?isProduction=true`
                    : `${API_BASE_URL}/pickup-entry/get-all-in-production-pickup-entries/${id}/${branchIdOrOptions}`
            );
        const response = await axios.get(url);

        if (response && response.status === 200) {
            return response;
        } else {
            console.error("Error fetching in-production pickup entries");
        }
    } catch (error) {
        console.error("Error fetching in-production pickup entries:", error);
        throw error;
    }
};

export async function getAllCorporateInPackingPickupEntries(id, offset) {
    try {
        const response = await axios.get(
            `${API_BASE_URL}/pickup-entry/get-all-in-packing-pickup-entries/${id}/${offset}`
        );

        if (response && response.status === 200) {
            return response;
        } else {
            console.error("Error fetching in-packing pickup entries");
        }
    } catch (error) {
        console.error("Error fetching in-packing pickup entries:", error);
        throw error;
    }
};

export async function getAllCorporateInDeliveryPickupEntries(id, offset) {
    try {
        const response = await axios.get(
            `${API_BASE_URL}/pickup-entry/get-all-in-delivery-pickup-entries/${id}/${offset}`
        );

        if (response && response.status === 200) {
            return response;
        } else {
            console.error("Error fetching in-delivery pickup entries");
        }
    } catch (error) {
        console.error("Error fetching in-delivery pickup entries:", error);
        throw error;
    }
};

export async function createCorporatePickupEntry(payload) {
    try {
        const response = await axios.post(`${API_BASE_URL}/pickup-entry/create-pickup-entry`, payload, {
            headers: {
                "Content-Type": "multipart/form-data",
            },
        });

        if (response && (response.status === 200 || response.status === 201)) {
            return response.data;
        }
        console.error("Error creating pickup entry");
        throw new Error("Unexpected response while creating pickup entry");
    } catch (error) {
        console.error("Error creating pickup entry:", error);
        throw error;
    }
};

export async function getCorporatePickupEntryById(payload) {
    try {
        const response = await axios.post(`${API_BASE_URL}/pickup-entry/get-pickup-entry-by-id`, payload);

        if (response && response.status === 200) {
            return response;
        } else {
            console.error("Error fetching pickup entry by id");
        }
    } catch (error) {
        console.error("Error fetching fetching pickup entry by id:", error);
        throw error;
    }
};

export async function updateCorporatePickupEntry(payload) {
    const response = await axios.put(`${API_BASE_URL}/pickup-entry/update-pickup-entry`,
        payload,
        {
            headers: {
                "Content-Type": "multipart/form-data",
            },
        }
    );

    if (response && response.status === 200) {
        return response.data;
    } else {
        console.error("Error updating pickup entry");
    }
};

export async function trackCorporatePickupEntryById(userId, pickupId) {
    try {
        const response = await axios.get(`${API_BASE_URL}/pickup-entry/track-pickup-entry-by-id/${userId}/${pickupId}`);

        if (response && response.status === 200) {
            return response.data;
        } else {
            console.error("Error tracking pickup entry");
        }
    } catch (error) {
        console.error("Error tracking pickup entry:", error);
        throw error;
    }
};

export async function getCorporateInPackingPickupEntryById(payload) {
    try {
        const response = await axios.post(`${API_BASE_URL}/pickup-entry/get-all-in-packing-pickup-entry-by-id`, payload);

        if (response && response.status === 200) {
            return response;
        } else {
            console.error("Error fetching in-packing pickup entry by id");
        }
    } catch (error) {
        console.error("Error fetching in-packing pickup entry by id:", error);
        throw error;
    }
};

export async function markCorporateOrderItemsAsPacked(payload) {
    try {
        const response = await axios.put(`${API_BASE_URL}/pickup-entry/mark-corporate-order-items-as-packed`, payload);

        if (response && (response.status === 200 || response.status === 201)) {
            return response;
        } else {
            console.error("Error marking order items as packed");
        }
    } catch (error) {
        console.error("Error marking order items as packed:", error);
        throw error;
    }
};

export async function updatePickupEntryApprovalStatus(payload) {
    try {
        const response = await axios.put(`${API_BASE_URL}/pickup-entry/update-approval-status`, payload);
        if (response && response.status === 200) {
            return response.data;
        }
        throw new Error("Unexpected response");
    } catch (error) {
        console.error("Error updating approval status:", error);
        throw error;
    }
};

export async function cancelCorporatePickupEntry(payload) {
    try {
        const response = await axios.put(`${API_BASE_URL}/pickup-entry/cancel-pickup-entry`, payload);
        if (response && response.status === 200) {
            return response.data;
        }
        throw new Error("Unexpected response");
    } catch (error) {
        console.error("Error cancelling corporate pickup entry:", error);
        throw error;
    }
};

export async function updateCorporatePickupEntryDate(payload) {
    try {
        const response = await axios.put(`${API_BASE_URL}/pickup-entry/update-pickup-entry-date`, payload);
        if (response && response.status === 200) {
            return response.data;
        }
        throw new Error("Unexpected response");
    } catch (error) {
        console.error("Error updating corporate pickup entry date:", error);
        throw error;
    }
}

