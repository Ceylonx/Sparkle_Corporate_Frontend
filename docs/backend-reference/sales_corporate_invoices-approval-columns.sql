-- GET get-invoicing-history-by-customer-id: `customerId` in the URL is often the corporate **code** (e.g. CORP56)
-- while `sales_corporate_invoices.customer_id` usually stores **customer_auto_id** (numeric). The API must
-- resolve the code via `sales_corporate_customers` (see `corporate_pickup_entry_controller.js`); otherwise
-- MySQL can coerce the comparison and return the wrong invoice rows / wrong `approval_status`.

-- Optional migration: add / align columns on sales_corporate_invoices for tax invoice preview approval.
-- Run only if these columns are missing; adjust types to match your DB (MySQL example).

-- ALTER TABLE sales_corporate_invoices
--   ADD COLUMN approval_status VARCHAR(32) NULL DEFAULT 'Created' AFTER /* appropriate column */,
--   ADD COLUMN checked_by_user VARCHAR(255) NULL,
--   ADD COLUMN approved_by_user VARCHAR(255) NULL,
--   ADD COLUMN checked_by_signature LONGTEXT NULL,
--   ADD COLUMN activity_log JSON NULL;

-- Ensure pickup_entry_id exists and is indexed for WHERE ... IN (...)
-- CREATE INDEX idx_sales_corporate_invoices_pickup_entry_id ON sales_corporate_invoices (pickup_entry_id);
