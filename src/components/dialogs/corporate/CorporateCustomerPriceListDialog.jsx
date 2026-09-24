import { useEffect, useMemo, useState } from "react";
import { Icon } from "@iconify/react/dist/iconify.js";
import { BeatLoader } from "react-spinners";
import * as XLSX from "xlsx";
import { getAllCorporateCorporatePriceListsByCustomerId } from "../../../services/corporate/CorporateSettingsServices";
import CorporateCustomerPriceListUploadDialog from "./CorporateCustomerPriceListUploadDialog";

const CorporateCustomerPriceListDialog = ({ customer, onClose }) => {
    const [isLoading, setIsLoading] = useState(false);
    const [showUploadDialog, setShowUploadDialog] = useState(false);
    const [priceList, setPriceList] = useState([]);
    const customerAutoId = customer?.customer_auto_id ?? customer?.id ?? null;

    const fetchPriceList = async () => {
        if (!customerAutoId) return;
        try {
            setIsLoading(true);
            const payload = {
                user_id: localStorage.getItem("userId"),
                customer_auto_id: Number(customerAutoId),
            };
            const response = await getAllCorporateCorporatePriceListsByCustomerId(payload);
            const list = response?.data?.corporate_price_lists || [];
            setPriceList(Array.isArray(list) ? list : []);
        } catch (error) {
            console.error("Error fetching customer price list:", error);
            setPriceList([]);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchPriceList();
    }, [customerAutoId]);

    const tableRows = useMemo(() => {
        return (priceList || [])
            .map((row, index) => {
                const prefix = row?.corp_item_prefix ? String(row.corp_item_prefix).trim() : "";
                return {
                    id: row?.corp_item_id || `row-${index}`,
                    itemName: prefix 
                        ? `${prefix} - ${row?.corp_item_name || "-"}` 
                        : (row?.corp_item_name || "-"),
                    amount: Number(row?.amount ?? 0),
                };
            })
            .filter((row) => row.amount > 0);
    }, [priceList]);

    const formatRs = (amount) => `Rs ${Number(amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const handleExport = async () => {
        const targetCustomerId = customer?.customer_id;
        if (!targetCustomerId) {
            console.error("No customer string ID available for export");
            return;
        }
        try {
            setIsLoading(true);
            const payload = {
                user_id: localStorage.getItem("userId"),
                customer_id: targetCustomerId,
            };
            const response = await getAllCorporateCorporatePriceListsByCustomerId(payload);
            const list = response?.data?.corporate_price_lists || [];

            const dataRows = list.map((row, index) => {
                const price = row?.amount;
                return {
                    "row_id": index + 1,
                    "corp_item_id": row?.corp_item_id || "",
                    "corp_item_name": row?.corp_item_name || "",
                    "amount(tax exclusive)": (price !== null && price !== undefined) ? Number(price) : "",
                };
            });

            const worksheet = XLSX.utils.json_to_sheet(dataRows, {
                header: ["row_id", "corp_item_id", "corp_item_name", "amount(tax exclusive)"],
            });
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Customer Price List");
            XLSX.writeFile(workbook, `${customer?.company_name || "customer"}-price-list.xlsx`);
        } catch (error) {
            console.error("Error exporting customer price list:", error);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <>
            <div className="absolute top-0 left-0 h-screen w-screen z-[80] backdrop-blur-sm bg-black/20">
                <div className="relative top-1/2 left-1/2 w-[98%] max-w-7xl h-[94vh] transform -translate-x-1/2 -translate-y-1/2 bg-canvas rounded-2xl p-8 flex flex-col">
                    <div className="flex items-start justify-between">
                        <div>
                            <h2 className="text-4xl font-bold text-primary">Customer Price List</h2>
                            <p className="text-black/50 text-xl mt-1">{customer?.company_name || "-"}</p>
                        </div>
                        <div className="flex items-center gap-x-3">
                            <button className="cursor-pointer border border-primary text-primary rounded-full px-8 py-2 font-semibold flex items-center gap-x-2" onClick={() => setShowUploadDialog(true)}>
                                <Icon icon={"mdi:tray-arrow-up"} />
                                Upload Price List
                            </button>
                            <button className="cursor-pointer bg-primary text-white rounded-full px-8 py-2 font-semibold flex items-center gap-x-2" onClick={handleExport}>
                                <Icon icon={"mdi:tray-arrow-down"} />
                                Export
                            </button>
                            <button className="cursor-pointer rounded-full bg-primary/20 p-3 text-primary" onClick={onClose} aria-label="Close">
                                <Icon icon={"mdi:close"} className="size-7" />
                            </button>
                        </div>
                    </div>

                    <div className="mt-6 border-b border-primary/50 grid grid-cols-10 text-2xl font-medium pb-2">
                        <p className="col-span-2">Item ID</p>
                        <p className="col-span-4">Item Name</p>
                        <p className="col-span-3">Amount(tax exclusive)</p>
                        <p className="col-span-1">Actions</p>
                    </div>

                    <div className="overflow-y-auto mt-1 grow">
                        {isLoading ? (
                            <div className="flex items-center justify-center py-16">
                                <BeatLoader color="#1470F9" size={12} />
                            </div>
                        ) : tableRows.length === 0 ? (
                            <div className="text-black/50 py-8">No price list found for this customer.</div>
                        ) : (
                            tableRows.map((row, index) => (
                                <div key={`${row.id}-${index}`} className="grid grid-cols-10 border-b border-black/20 py-3 text-xl text-black/60 text-left">
                                    <p className="col-span-2">{row.id}</p>
                                    <p className="col-span-4">{row.itemName}</p>
                                    <p className="col-span-3">{formatRs(row.amount)}</p>
                                    <p className="col-span-1 text-red-500 font-semibold cursor-pointer">Edit</p>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>

            {showUploadDialog ? (
                <CorporateCustomerPriceListUploadDialog
                    customer={customer}
                    onClose={() => setShowUploadDialog(false)}
                    onUploaded={() => {
                        fetchPriceList();
                        setShowUploadDialog(false);
                    }}
                />
            ) : null}
        </>
    );
};

export default CorporateCustomerPriceListDialog;
