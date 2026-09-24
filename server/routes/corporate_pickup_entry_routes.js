const express = require("express");
const router = express.Router();
const corporatePickupEntryController = require("../controllers/corporate_pickup_entry_controller");

/**
 * POST /api/pickup-entry/get-invoice-by-pickup-entry-id
 */
router.post(
    "/get-invoice-by-pickup-entry-id",
    corporatePickupEntryController.getInvoiceByPickupEntryID
);

/**
 * GET /api/pickup-entry/get-invoicing-history-by-customer-id/:userId/:customerId/:branchId
 * Returns invoice_history from sales_corporate_invoices (includes approval_status).
 */
router.get(
    "/get-invoicing-history-by-customer-id/:userId/:customerId/:branchId",
    corporatePickupEntryController.getInvoicingHistoryByCustomerId
);

/**
 * PUT /api/pickup-entry/update-corporate-tax-invoice-preview-approval
 * (Full path when this router is mounted at /api/pickup-entry in app.js)
 */
router.put(
    "/update-corporate-tax-invoice-preview-approval",
    corporatePickupEntryController.updateCorporateTaxInvoicePreviewApproval
);

module.exports = router;
