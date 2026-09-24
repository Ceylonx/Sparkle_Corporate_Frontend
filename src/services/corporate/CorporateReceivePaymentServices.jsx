import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_SERVER_API;

export async function getPendingPaymentInvoices(payload) {
    try {
        const response = await axios.post(`${API_BASE_URL}/pickup-entry/get-pending-payment-invoices`, payload);

        if (response && response.status === 200) {
            return response;
        } else {
            console.error("Error fetching pending payment invoices");
        }
    } catch (error) {
        console.error("Error fetching pending payment invoices:", error);
        throw error;
    }
};

export async function getCustomerPayment(payload) {
    try {
        const response = await axios.post(`${API_BASE_URL}/pickup-entry/get-customer-payment`, payload);

        if (response && response.status === 200) {
            return response;
        } else {
            console.error("Error fetching customer payment");
        }
    } catch (error) {
        console.error("Error fetching customer payment:", error);
        throw error;
    }
};

export async function getAllCorporatePendingPayments(payload) {
    try {
        const response = await axios.post(`${API_BASE_URL}/pickup-entry/get-pending-invoices`, payload);

        if (response && response.status === 200) {
            return response;
        } else {
            console.error("Error fetching pending payments");
        }
    } catch (error) {
        console.error("Error fetching fetching pending payments:", error);
        throw error;
    }
};

export async function getCorporateInvoiceByInvoiceId(payload) {
    try {
        const response = await axios.post(`${API_BASE_URL}/pickup-entry/get-corporate-invoice-by-invoice-id`, payload);

        if (response && response.status === 200) {
            return response;
        } else {
            console.error("Error fetching invoice by id");
        }
    } catch (error) {
        console.error("Error fetching invoice by id:", error);
        throw error;
    }
};

export async function createCorporateReceivePayment(payload) {
    try {
        const response = await axios.post(`${API_BASE_URL}/pickup-entry/pay-invoice`, payload);

        if (response && response.status === 200) {
            return response;
        } else {
            console.error("Error receiving payment");
        }
    } catch (error) {
        console.error("Error receiving payment:", error);
        throw error;
    }
};

export async function getAllCorporatePaidInvoices(payload) {
    try {
        const response = await axios.post(`${API_BASE_URL}/pickup-entry/get-paid-invoices`, payload);

        if (response && response.status === 200) {
            return response;
        } else {
            console.error("Error fetching paid invoices");
        }
    } catch (error) {
        console.error("Error fetching fetching paid invoices:", error);
        throw error;
    }
};

export async function getPendingDepositsByCustomerId(customerId, branchId = 0) {
    try {
        const response = await axios.get(
            `${API_BASE_URL}/pickup-entry/get-pending-deposits/${customerId}/${branchId}`
        );

        if (response && response.status === 200) {
            return response;
        } else {
            console.error("Error fetching pending deposits");
        }
    } catch (error) {
        console.error("Error fetching pending deposits:", error);
        throw error;
    }
}

export async function getDepositedReceiptsByCustomerId(customerId, branchId = 0) {
    try {
        const response = await axios.get(
            `${API_BASE_URL}/pickup-entry/get-deposited-receipts/${customerId}/${branchId}`
        );

        if (response && response.status === 200) {
            return response;
        } else {
            console.error("Error fetching deposited receipts");
        }
    } catch (error) {
        console.error("Error fetching deposited receipts:", error);
        throw error;
    }
}

export async function createPaymentReceipt(payload) {
    try {
        const response = await axios.post(`${API_BASE_URL}/pickup-entry/create-payment-receipt`, payload);
        if (response && (response.status === 200 || response.status === 201)) {
            return response.data;
        }
        throw new Error("Unexpected response while creating payment receipt");
    } catch (error) {
        console.error("Error creating payment receipt:", error);
        throw error;
    }
}

export async function updateReceiptApprovalStatus(payload) {
    try {
        const response = await axios.put(`${API_BASE_URL}/pickup-entry/update-receipt-approval-status`, payload);
        if (response && response.status === 200) {
            return response.data;
        }
        throw new Error("Unexpected response while updating receipt approval status");
    } catch (error) {
        console.error("Error updating receipt approval status:", error);
        throw error;
    }
}

export async function getPaymentReceiptByInvoiceId(payload) {
    try {
        const response = await axios.post(`${API_BASE_URL}/pickup-entry/get-payment-receipt-by-invoice-id`, payload);
        if (response && response.status === 200) {
            return response.data;
        }
        throw new Error("Unexpected response while getting payment receipt by invoice id");
    } catch (error) {
        console.error("Error getting payment receipt by invoice id:", error);
        throw error;
    }
}

export async function getPaymentReceiptById(payload) {
    try {
        const response = await axios.post(`${API_BASE_URL}/pickup-entry/get-payment-receipt-by-id`, payload);
        if (response && response.status === 200) {
            return response.data;
        }
        throw new Error("Unexpected response while getting payment receipt by id");
    } catch (error) {
        console.error("Error getting payment receipt by id:", error);
        throw error;
    }
}

export async function getAllPaymentReceipts({ limit = 20, offset = 0, search, start_date, end_date } = {}) {
    try {
        const response = await axios.get(`${API_BASE_URL}/pickup-entry/get-all-payment-receipts`, {
            params: { limit, offset, search, start_date, end_date },
        });

        if (response && response.status === 200) {
            return response;
        }

        console.error("Error fetching payment receipts");
    } catch (error) {
        console.error("Error fetching payment receipts:", error);
        throw error;
    }
}
