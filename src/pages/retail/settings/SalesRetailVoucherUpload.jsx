import { HiOutlineArrowCircleLeft } from "react-icons/hi";
import { useNavigate } from "react-router-dom";
import FileInput from "../../../components/ui/FileInput";
import { useState } from "react";
import { createRetailVoucher } from "../../../services/Retail/RetailVoucherServices";
import { BeatLoader } from "react-spinners";
import Swal from "sweetalert2";
import * as XLSX from "xlsx";
import { usePagePermission } from "../../../utils/usePagePermission";
import PermissionDenied from "../../../components/ui/PermissionDenied";

const COLUMNS = ["voucher_id", "voucher_code", "value", "balance", "issued_to", "issued_date", "expire_date", "validity_period", "status", "created_at"];

function formatDate(val) {
    if (val == null || val === "") return "";
    if (typeof val === "string") return val.split("T")[0].trim();
    if (typeof val === "number" && val > 0) {
        const date = new Date((val - 25569) * 86400 * 1000);
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, "0");
        const d = String(date.getDate()).padStart(2, "0");
        return `${y}-${m}-${d}`;
    }
    return String(val).trim();
}

/** Get status from a row: check "status" and any key that lowercases to "status" */
function getStatusFromRow(row) {
    if (row.status != null && String(row.status).trim() !== "") return String(row.status).trim();
    const key = Object.keys(row || {}).find((k) => String(k).trim().toLowerCase() === "status");
    if (key != null && row[key] != null && String(row[key]).trim() !== "") return String(row[key]).trim();
    return "";
}

function parseFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = e.target?.result;
                const isCsv = file.name.toLowerCase().endsWith(".csv");
                const wb = isCsv ? XLSX.read(data, { type: "string" }) : XLSX.read(data, { type: "array" });
                const sheet = wb.Sheets[wb.SheetNames[0]];
                const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
                if (!rows.length) {
                    resolve([]);
                    return;
                }
                const header = rows[0].map((h) => (h != null ? String(h).trim().toLowerCase() : ""));
                const dataRows = [];
                for (let i = 1; i < rows.length; i++) {
                    const row = rows[i];
                    const obj = {};
                    header.forEach((col, j) => {
                        const key = COLUMNS.find((c) => c.toLowerCase() === col) || col;
                        obj[key] = row[j] != null ? row[j] : "";
                    });
                    dataRows.push(obj);
                }
                resolve(dataRows);
            } catch (err) {
                reject(err);
            }
        };
        reader.onerror = () => reject(new Error("Failed to read file"));
        if (file.name.toLowerCase().endsWith(".csv")) {
            reader.readAsText(file);
        } else {
            reader.readAsArrayBuffer(file);
        }
    });
}

const SalesRetailVoucherUpload = () => {
    const { allowed } = usePagePermission("SalesRetail_Invoice_Sell_Vouchers_Create");
    const navigate = useNavigate();
    const [isLoading, setIsLoading] = useState(false);

    if (!allowed) return <PermissionDenied required="SalesRetail_Invoice_Sell_Vouchers_Create" label="Voucher Upload" />;

    const handleVoucherListUpload = async (file) => {
        if (!file) return;
        setIsLoading(true);
        try {
            const rows = await parseFile(file);
            const userId = localStorage.getItem("userId");
            if (!userId) {
                await Swal.fire({ title: "Error", text: "User not logged in.", icon: "error" });
                return;
            }
            const newRows = rows.filter(
                (r) =>
                    (r.voucher_id == null || String(r.voucher_id).trim() === "") &&
                    r.voucher_code != null &&
                    String(r.voucher_code).trim() !== ""
            );
            if (newRows.length === 0) {
                await Swal.fire({
                    title: "No new vouchers",
                    text: "No rows with empty voucher_id and a voucher code were found. Add new rows with voucher_id empty.",
                    icon: "info",
                });
                setIsLoading(false);
                return;
            }
            let created = 0;
            const errors = [];

            for (let i = 0; i < newRows.length; i++) {
                const r = newRows[i];
                const value = r.value != null && r.value !== "" ? Number(r.value) : 0;
                const balance = r.balance != null && r.balance !== "" ? Number(r.balance) : value;
                const voucherCode = String(r.voucher_code || "").trim();
                const issuedTo = String(r.issued_to ?? "").trim();
                const issuedDate = formatDate(r.issued_date) || "";
                const expireDate = formatDate(r.expire_date) || "";
                const validityPeriodRaw = r.validity_period;
                const validityPeriod = validityPeriodRaw != null && validityPeriodRaw !== "" ? (typeof validityPeriodRaw === "number" ? validityPeriodRaw : Number(validityPeriodRaw) || validityPeriodRaw) : undefined;

                if (!voucherCode) {
                    errors.push({ row: i + 2, code: "(empty)", msg: "Missing voucher_code (required)" });
                    continue;
                }
                if (value === 0 && (r.value == null || r.value === "")) {
                    errors.push({ row: i + 2, code: voucherCode, msg: "Missing value (required)" });
                    continue;
                }
                if (validityPeriod === undefined) {
                    errors.push({ row: i + 2, code: voucherCode, msg: "Missing validity_period (required)" });
                    continue;
                }

                const statusFromFile = getStatusFromRow(r);
                const statusValue = statusFromFile !== "" ? statusFromFile : "pending";

                const payload = {
                    user_id: userId,
                    voucher_code: voucherCode,
                    value,
                    balance,
                    issued_to: issuedTo || "",
                    issued_date: issuedDate,
                    expire_date: expireDate,
                    validity_period: validityPeriod,
                    status: statusValue,
                };

                try {
                    await createRetailVoucher(payload);
                    created++;
                } catch (err) {
                    const msg = err.response?.data?.message || err.response?.data?.error || err.message || "Create failed";
                    errors.push({ row: i + 2, code: payload.voucher_code, msg });
                }
            }
            const message =
                errors.length === 0
                    ? `${created} voucher(s) created.`
                    : `${created} created, ${errors.length} failed.${errors.length <= 5 ? "\n" + errors.map((e) => `Row ${e.row} (${e.code}): ${e.msg}`).join("\n") : ""}`;
            await Swal.fire({
                title: errors.length === 0 ? "Upload successful" : "Partially complete",
                text: message,
                icon: errors.length === 0 ? "success" : "warning",
            });
            navigate("/salesCorporate/retail/settings", { state: { openVoucherTab: true } });
        } catch (error) {
            console.error("Error when uploading voucher list:", error);
            const message = error.message || "Failed to parse file or upload.";
            await Swal.fire({ title: "Upload failed", text: message, icon: "error" });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div>
            <div className="flex flex-row gap-x-3 items-center">
                <HiOutlineArrowCircleLeft className="size-6 text-primary cursor-pointer" onClick={() => navigate(`/salesCorporate/retail/settings`)} />
                <h1 className="text-3xl font-bold text-primary">Retail Settings/Vouchers/Upload New Voucher List</h1>
            </div>
            <p className="text-black/50 text-xl">Add new vouchers in bulk. File is parsed here and each new row (empty voucher_id) is sent to the create-voucher API.</p>

            <div className="bg-white rounded-xl mt-5">
                <div className="flex flex-col gap-y-8 px-10 py-5">
                    <div className="flex flex-col gap-x-5">
                        <h3 className="text-3xl font-semibold">Voucher List Upload</h3>
                        <p className="text-xl text-black/50">Download File Template on the Settings page, add new rows (leave voucher_id and created_at empty), then upload here. Required: voucher_code, value, validity_period. Others (issued_to, issued_date, expire_date, etc.) can be empty. Supported: .xlsx, .xls, .csv.</p>
                    </div>

                    {!isLoading && <FileInput button={"Upload Voucher List Sheet"} onUpload={handleVoucherListUpload} accept=".xlsx,.xls,.csv" />}

                    {isLoading && (
                        <div className="flex flex-col items-center justify-center bg-white rounded-xl py-10 border border-primary gap-2">
                            <BeatLoader color="#1470F9" size={20} />
                            <p className="text-black/70">Creating vouchers…</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default SalesRetailVoucherUpload;
