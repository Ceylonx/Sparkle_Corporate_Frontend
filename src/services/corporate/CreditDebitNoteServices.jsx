import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_SERVER_API;
const FINANCE_API_BASE_URL = import.meta.env.VITE_FINANCE_API;

export async function getAllCreditDebitNotes() {
    try {
        const response = await axios.get(`${API_BASE_URL}/credit-debit-notes`);
        if (response && response.status === 200) {
            return response.data;
        }
    } catch (error) {
        console.error("Error fetching credit/debit notes:", error);
        throw error;
    }
}

export async function createCreditDebitNote(payload) {
    try {
        const response = await axios.post(`${API_BASE_URL}/credit-debit-notes`, payload);
        if (response && response.status === 200) {
            return response.data;
        }
    } catch (error) {
        console.error("Error creating credit/debit note:", error);
        throw error;
    }
}

export async function getApprovedInvoices() {
    try {
        const response = await axios.get(`${API_BASE_URL}/credit-debit-notes/approved-invoices`);
        if (response && response.status === 200) {
            return response.data;
        }
    } catch (error) {
        console.error("Error fetching approved invoices:", error);
        throw error;
    }
}

export async function getInvoicePreviewDetails(invoiceId) {
    try {
        const response = await axios.get(`${API_BASE_URL}/credit-debit-notes/invoice-preview/${invoiceId}`);
        if (response && response.status === 200) {
            return response.data;
        }
    } catch (error) {
        console.error("Error fetching invoice preview details:", error);
        throw error;
    }
}

export async function getCreditDebitNotesByInvoice(invoiceId) {
    try {
        const response = await axios.get(`${API_BASE_URL}/credit-debit-notes/by-invoice/${invoiceId}`);
        if (response && response.status === 200) {
            return response.data;
        }
    } catch (error) {
        console.error("Error fetching credit/debit notes by invoice:", error);
        throw error;
    }
}

export async function updateCreditDebitNoteStatus(payload) {
    try {
        const response = await axios.put(`${API_BASE_URL}/credit-debit-notes/update-status`, payload);
        if (response && response.status === 200) {
            return response.data;
        }
    } catch (error) {
        console.error("Error updating credit/debit note status:", error);
        throw error;
    }
}

export async function cancelCreditDebitNote(payload) {
    try {
        const response = await axios.put(`${API_BASE_URL}/credit-debit-notes/cancel`, payload);
        if (response && response.status === 200) {
            return response.data;
        }
    } catch (error) {
        console.error("Error cancelling credit/debit note:", error);
        throw error;
    }
}

export async function getAvailableFinanceLedgers() {
    try {
        const response = await axios.get(`${FINANCE_API_BASE_URL}/ledger/finance-ledgers-finance-available`);
        if (response && response.status === 200) {
            return response.data;
        }
    } catch (error) {
        console.error("Error fetching available finance ledgers:", error);
        throw error;
    }
}

export async function getFinanceBankLedgers() {
    try {
        const response = await axios.get(`${FINANCE_API_BASE_URL}/ledger/finance-ledgers-bank-access`);
        if (response && response.status === 200) {
            return response.data;
        }
    } catch (error) {
        console.error("Error fetching finance bank ledgers:", error);
        throw error;
    }
}

