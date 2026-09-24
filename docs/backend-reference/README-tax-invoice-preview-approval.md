# Backend: `PUT /api/pickup-entry/update-corporate-tax-invoice-preview-approval`

The Sparkle Sales frontend calls this endpoint from `src/services/corporate/CorporateInvoicingServices.jsx` (`updateCorporateTaxInvoicePreviewApproval`).

## 1. Route (Express)

On the router that is mounted at `/api/pickup-entry` (or your equivalent):

```javascript
router.put(
  '/update-corporate-tax-invoice-preview-approval',
  pickupEntryController.updateCorporateTaxInvoicePreviewApproval
);
```

## 2. Controller

Copy the handler from `pickup-entry-update-corporate-tax-invoice-preview-approval.controller.js` into your pickup-entry controller file.

- Uncomment and fix the `require` for your DB pool (`mysql2/promise` `pool.execute`, or your wrapper).
- Rename `customer_id` / `pickup_entry_id` / `activity_log` columns if your schema differs.
- If you **do not** have an `activity_log` column, remove that column and its bound parameter from the `UPDATE` (the frontend still sends `activity_log`; you can ignore it or add the column — see SQL snippet).

## 3. Request body (JSON)

| Field | Notes |
|--------|--------|
| `pickup_entry_ids` | Required. Comma-separated pickup entry IDs (same batch key as preview). |
| `approval_status` | `Created` \| `Checked` \| `Approved` |
| `checked_by_user` | Optional |
| `approved_by_user` | Optional |
| `checked_by_signature` | Optional (data URL) |
| `customer_auto_id` | Optional; if set, appended as `AND customer_id = ?` for safety |
| `user_id` | Optional; used in response `actor` fallback |
| `activity_log` | Optional JSON array; persisted if column exists |

## 4. Success response (200)

Shape compatible with the React app:

```json
{
  "success": true,
  "message": "Tax invoice preview approval updated successfully.",
  "actor": "Display name of checker or approver",
  "affectedRows": 1
}
```

## 5. Errors

- `400` — missing `pickup_entry_ids`
- `404` — no row matched in `sales_corporate_invoices`
- `500` — DB / server error
