/**
 * Copy into your pickup-entry controller (e.g. services/sales_service/controllers/pickup_entry_controller.js)
 * and wire the route (see companion route snippet).
 *
 * Expects JSON body (from frontend CorporateInvoicingServices.updateCorporateTaxInvoicePreviewApproval):
 * - user_id (string, optional for audit)
 * - pickup_entry_ids (string, comma-separated pickup entry ids — batch key)
 * - customer_auto_id (string, optional — use if your table has customer_id for extra safety)
 * - approval_status (string: Created | Checked | Approved)
 * - checked_by_user (string | null)
 * - approved_by_user (string | null)
 * - checked_by_signature (string | null, data URL)
 *
 * Optional (ignored by default SQL below; add column + SET if you want to persist it):
 * - activity_log (array) — frontend sends this; extend UPDATE if your table stores JSON.
 *
 * Table: sales_corporate_invoices — adjust `pickup_entry_id` / `customer_id` names if needed.
 */

// Uncomment and point at your shared DB pool (mysql2 promise API: pool.execute(sql, params))
// const pool = require('../../config/database');

function toNull(v) {
    if (v === undefined || v === null || v === "") return null;
    return v;
}

exports.updateCorporateTaxInvoicePreviewApproval = async (req, res) => {
    try {
        const body = req.body || {};

        const pickup_entry_ids = toNull(body.pickup_entry_ids);
        if (!pickup_entry_ids) {
            return res.status(400).json({
                success: false,
                message: "pickup_entry_ids is required",
            });
        }

        const ids = String(pickup_entry_ids)
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
        if (ids.length === 0) {
            return res.status(400).json({
                success: false,
                message: "pickup_entry_ids must contain at least one id",
            });
        }

        const approval_status = body.approval_status || null;
        const checked_by_user = body.checked_by_user || null;
        const approved_by_user = body.approved_by_user || null;
        const checked_by_signature = body.checked_by_signature || null;
        const customer_auto_id = body.customer_auto_id || null;

        const inPlaceholders = ids.map(() => "?").join(", ");
        const params = [approval_status, checked_by_user, approved_by_user, checked_by_signature, ...ids];

        let sql = `
      UPDATE sales_corporate_invoices
      SET
        approval_status = ?,
        checked_by_user = ?,
        approved_by_user = ?,
        checked_by_signature = ?
      WHERE pickup_entry_id IN (${inPlaceholders})
    `;

        if (customer_auto_id) {
            sql += ` AND customer_id = ?`;
            params.push(customer_auto_id);
        }

        // Replace `pool` with your mysql2 / pg client.
        const [result] = await pool.execute(sql, params);

        if (!result.affectedRows) {
            return res.status(404).json({
                success: false,
                message: "No matching row in sales_corporate_invoices for the given pickup_entry_ids",
            });
        }

        const user_id = body.user_id || null;
        const actor =
            checked_by_user ||
            approved_by_user ||
            user_id ||
            null;

        return res.status(200).json({
            success: true,
            message: "Tax invoice preview approval updated successfully.",
            actor,
            affectedRows: result.affectedRows,
        });
    } catch (error) {
        console.error("updateCorporateTaxInvoicePreviewApproval:", error);
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to update tax invoice preview approval",
        });
    }
};
