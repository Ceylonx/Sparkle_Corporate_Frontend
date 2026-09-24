/**
 * Corporate pickup entry — sales_corporate_invoices.
 */
const fs = require("fs");
const path = require("path");
const pool = require("../config/database");

/** Whitelist only — used in SQL identifier position for customer lookup. */
const CORPORATE_CUSTOMER_TABLES = ["sales_corporate_customers", "corporate_customers"];

function appendHistoryDebug(payload) {
    const line =
        JSON.stringify({
            sessionId: "32ab48",
            hypothesisId: "H-invoice-history",
            timestamp: Date.now(),
            ...payload,
        }) + "\n";
    const paths = [
        path.join(__dirname, "..", "..", "debug-32ab48.log"),
        path.join(__dirname, "..", "..", ".cursor", "debug-32ab48.log"),
        path.join(process.cwd(), "debug-32ab48.log"),
    ];
    for (const logPath of paths) {
        try {
            fs.mkdirSync(path.dirname(logPath), { recursive: true });
            fs.appendFileSync(logPath, line, "utf8");
            return;
        } catch (_) {
            /* try next path */
        }
    }
}

/**
 * Resolve `customer_auto_id` values for invoicing history. UI often passes corporate code (e.g. CORP56)
 * while `sales_corporate_invoices.customer_id` stores numeric FK. Different deployments use different
 * customer table / tenant column names — try each until rows are found.
 */
async function resolveCorporateCustomerAutoIds(uid, cid) {
    const userColumnAttempts = [
        "user_id",
        "sparkle_user_id",
        "sales_user_id",
    ];

    for (const table of CORPORATE_CUSTOMER_TABLES) {
        let tableMissing = false;
        for (const userCol of userColumnAttempts) {
            const sql =
                `SELECT customer_auto_id FROM ${table} WHERE ${userCol} = ? AND ` +
                `(customer_id = ? OR CAST(customer_auto_id AS CHAR) = ?)`;
            try {
                const [r] = await pool.execute(sql, [uid, cid, cid]);
                const rows = r || [];
                if (rows.length === 0) continue;
                const collected = [];
                for (const row of rows) {
                    if (row.customer_auto_id != null && String(row.customer_auto_id).trim() !== "") {
                        collected.push(row.customer_auto_id);
                    }
                }
                return collected;
            } catch (e) {
                const msg = e && e.message ? String(e.message) : "";
                if (e.code === "ER_NO_SUCH_TABLE" || /doesn't exist/i.test(msg)) {
                    tableMissing = true;
                    break;
                }
                if (e.code === "ER_BAD_FIELD_ERROR" || e.errno === 1054) continue;
                throw e;
            }
        }
        if (tableMissing) continue;
    }
    return [];
}

function serializeActivityLog(raw) {
    if (raw == null) return null;
    if (typeof raw === "string") return raw;
    try {
        return JSON.stringify(raw);
    } catch {
        return null;
    }
}

exports.updateCorporateTaxInvoicePreviewApproval = async (req, res) => {
    try {
        const {
            invoice_id,
            customer_auto_id,
            approval_status,
            checked_by_user,
            approved_by_user,
            checked_by_signature,
            approved_by_signature,
            activity_log,
            user_id,
        } = req.body || {};

        const invoiceIdNorm =
            invoice_id != null && String(invoice_id).trim() !== ""
                ? String(invoice_id).trim()
                : null;

        if (!invoiceIdNorm) {
            return res.status(400).json({
                success: false,
                message: "invoice_id is required",
            });
        }

        const statusVal = approval_status || null;
        const checkedBy = checked_by_user || null;
        const approvedBy = approved_by_user || null;
        const checkedSig = checked_by_signature || null;
        const approvedSig = approved_by_signature || null;
        const activityLogVal = serializeActivityLog(activity_log);

        const params = [statusVal, checkedBy, approvedBy, checkedSig, approvedSig, activityLogVal, invoiceIdNorm];

        let sql =
            "UPDATE sales_corporate_invoices SET " +
            "approval_status = ?, " +
            "checked_by_user = ?, " +
            "approved_by_user = ?, " +
            "checked_by_signature = ?, " +
            "approved_by_signature = ?, " +
            "activity_log = ? " +
            "WHERE invoice_id = ?";

        if (customer_auto_id) {
            sql += " AND customer_id = ?";
            params.push(customer_auto_id);
        }

        const [result] = await pool.execute(sql, params);

        if (!result.affectedRows) {
            return res.status(404).json({
                success: false,
                message:
                    "Invoice not found for the given invoice_id. No row where invoice_id matches.",
            });
        }

        const actor = checkedBy || approvedBy || user_id || null;

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

/**
 * POST /api/pickup-entry/get-invoice-by-pickup-entry-id
 */
exports.getInvoiceByPickupEntryID = async (req, res) => {
    try {
        const pickup_entry_id = req.body?.pickup_entry_id;
        const id =
            pickup_entry_id != null && String(pickup_entry_id).trim() !== ""
                ? String(pickup_entry_id).trim()
                : null;

        if (!id) {
            return res.status(400).json({
                success: false,
                message: "pickup_entry_id is required",
            });
        }

        const [rows] = await pool.execute(
            "SELECT * FROM sales_corporate_invoices WHERE pickup_entry_id = ? LIMIT 1",
            [id]
        );

        if (!rows || rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Invoice not found",
            });
        }

        return res.status(200).json({
            success: true,
            data: rows[0],
        });
    } catch (error) {
        console.error("getInvoiceByPickupEntryID:", error);
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to fetch invoice",
        });
    }
};

/**
 * GET /api/pickup-entry/get-invoicing-history-by-customer-id/:userId/:customerId/:branchId
 * Returns rows from sales_corporate_invoices. approval_status is taken only from
 * sales_corporate_invoices.approval_status (no duplicate column in SELECT — avoids mysql2
 * mis-binding when the same field is selected twice).
 *
 * Route param `customerId` is often the corporate **display code** (e.g. CORP56) from the UI,
 * while `sales_corporate_invoices.customer_id` stores **customer_auto_id** (numeric FK).
 * Comparing INT to 'CORP56' coerces to 0 in MySQL and returns the wrong invoices (wrong
 * approval_status). Resolve code → `customer_auto_id` via `sales_corporate_customers` or `corporate_customers` when `userId` is present.
 */
exports.getInvoicingHistoryByCustomerId = async (req, res) => {
    try {
        const { userId, customerId } = req.params;
        if (customerId == null || String(customerId).trim() === "") {
            return res.status(400).json({
                success: false,
                message: "customerId is required",
            });
        }

        const cid = String(customerId).trim();
        const uid =
            userId != null && String(userId).trim() !== "" ? String(userId).trim() : null;

        const matchKeys = new Set([cid]);
        if (uid) {
            const autoIds = await resolveCorporateCustomerAutoIds(uid, cid);
            for (const id of autoIds) matchKeys.add(String(id).trim());
        }

        const strKeys = [...matchKeys].filter((k) => k != null && k !== "");
        const numIds = [...new Set(strKeys.map((x) => Number(x)).filter((n) => Number.isFinite(n)))];
        const parts = [];
        const params = [];
        if (strKeys.length) {
            parts.push(`CAST(sci.customer_id AS CHAR) IN (${strKeys.map(() => "?").join(",")})`);
            params.push(...strKeys);
        }
        if (numIds.length) {
            parts.push(`sci.customer_id IN (${numIds.map(() => "?").join(",")})`);
            params.push(...numIds);
        }

        let rows = [];
        if (parts.length) {
            const [r] = await pool.execute(
                "SELECT sci.* FROM sales_corporate_invoices AS sci WHERE (" +
                    parts.join(" OR ") +
                    ") ORDER BY sci.created_at DESC",
                params
            );
            rows = r;
        }

        appendHistoryDebug({
            message: "getInvoicingHistoryByCustomerId",
            data: {
                cid,
                uid: uid || null,
                matchKeys: [...matchKeys],
                rowCount: (rows || []).length,
                sample: (rows || []).slice(0, 5).map((r) => ({
                    invoice_id: r.invoice_id,
                    customer_id: r.customer_id,
                    approval_status: r.approval_status,
                })),
            },
        });

        const invoice_history = (rows || []).map((row) => {
            const approvalRaw = row.approval_status;
            const approvalFromDb =
                approvalRaw != null && String(approvalRaw).trim() !== ""
                    ? String(approvalRaw).trim()
                    : null;
            return {
                ...row,
                invoice_generated:
                    row.invoice_generated != null ? Number(row.invoice_generated) : 1,
                invoice_tax_approval_status: approvalFromDb,
                approval_status: approvalFromDb,
            };
        });

        return res.status(200).json({
            success: true,
            invoice_history,
        });
    } catch (error) {
        console.error("getInvoicingHistoryByCustomerId:", error);
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to load invoicing history",
        });
    }
};