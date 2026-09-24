import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@iconify/react/dist/iconify.js";
import { BeatLoader } from "react-spinners";
import { getCorporatePriceListHistory, uploadPriceListsCorporate } from "../../../services/corporate/CorporateSettingsServices";
import { getAllUsers } from "../../../services/UserServices";
import Swal from "sweetalert2";

const CorporateCustomerPriceListUploadDialog = ({ customer, onClose, onUploaded }) => {
    const fileInputRef = useRef(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [historyEntries, setHistoryEntries] = useState([]);
    const [users, setUsers] = useState([]);
    const [selectedFile, setSelectedFile] = useState(null);
    const [corpItemPrefix, setCorpItemPrefix] = useState(null);

    // Some customer payloads use `customer_id`, others use `id` (or `customer_auto_id`).
    // We normalize it so upload works regardless of backend response shape.
    const customerId = customer?.customer_id ?? customer?.id ?? customer?.customer_auto_id ?? null;

    const fetchPriceListHistory = async () => {
        if (!customerId) return;
        try {
            setIsLoading(true);
            const payload = {
                user_id: localStorage.getItem("userId"),
                customer_id: customerId,
            };
            const response = await getCorporatePriceListHistory(payload);
            const list = response?.data?.price_list_history || [];
            setHistoryEntries(Array.isArray(list) ? list : []);
        } catch (error) {
            console.error("Error fetching price list history:", error);
            setHistoryEntries([]);
        } finally {
            setIsLoading(false);
        }
    };

    const fetchUsers = async () => {
        try {
            const response = await getAllUsers();
            setUsers(response?.allUsers || []);
        } catch (error) {
            console.error("Error fetching users:", error);
            setUsers([]);
        }
    };

    useEffect(() => {
        fetchPriceListHistory();
        fetchUsers();
    }, [customerId]);

    const latest = useMemo(() => historyEntries[0] || null, [historyEntries]);

    const resolveUploaderName = (uploaderId) => {
        if (!uploaderId) return "You";
        const user = users.find((u) => String(u.user_id) === String(uploaderId));
        return user?.name || "You";
    };

    const formatFileSize = (size) => {
        const n = Number(size) || 0;
        return `${(n / (1024 * 1024)).toFixed(1)} Mb`;
    };

    const formatDateTime = (raw) => {
        if (!raw) return "-";
        const d = new Date(raw);
        if (Number.isNaN(d.getTime())) return "-";
        return d.toLocaleString([], { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
    };

    const handleChooseFile = () => fileInputRef.current?.click();

    const handleFileChange = (event) => {
        const file = event.target.files?.[0] || null;
        if (event.target) event.target.value = "";
        setSelectedFile(file);
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        e.stopPropagation();
    };

    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const file = e.dataTransfer.files?.[0] || null;
        if (file) {
            const ext = file.name.split('.').pop().toLowerCase();
            if (ext === 'xlsx' || ext === 'xls') {
                setSelectedFile(file);
            } else {
                Swal.fire({
                    icon: "error",
                    title: "Invalid File Type",
                    text: "Only Excel files (.xlsx, .xls) are accepted.",
                    confirmButtonColor: "#1470F9"
                });
            }
        }
    };

    const handleUpload = async () => {
        if (!selectedFile || !customerId || !corpItemPrefix) return;
        try {
            setIsUploading(true);
            const formData = new FormData();
            formData.append("user_id", localStorage.getItem("userId"));
            formData.append("customer_id", customerId);
            formData.append("file", selectedFile);
            formData.append("corp_item_prefix", corpItemPrefix);
            await uploadPriceListsCorporate(formData);
            await Swal.fire({
                icon: "success",
                title: "Upload Successful",
                text: "The price list has been successfully uploaded.",
                confirmButtonColor: "#1470F9",
            });
            setSelectedFile(null);
            await fetchPriceListHistory();
            onUploaded?.();
        } catch (error) {
            console.error("Error uploading corporate price list:", error);
            const errorMessage = error?.response?.data?.message || error?.response?.data?.error || "There was an error uploading the price list. Please try again.";
            await Swal.fire({
                icon: "error",
                title: "Upload Failed",
                text: errorMessage,
                confirmButtonColor: "#1470F9",
            });
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <div className="absolute top-0 left-0 h-screen w-screen z-[90] backdrop-blur-sm bg-black/20">
            <div className="relative top-1/2 left-1/2 w-[90%] max-w-6xl max-h-[92vh] overflow-y-auto transform -translate-x-1/2 -translate-y-1/2 bg-canvas rounded-2xl p-8">
                <div className="flex items-start justify-between">
                    <div>
                        <h2 className="text-3xl font-bold text-primary">Price List Upload</h2>
                        <p className="text-black/50 text-lg mt-1">
                            Easily upload or update your latest product or service price list.
                        </p>
                    </div>
                    <button className="cursor-pointer rounded-full bg-primary/20 p-3 text-primary" onClick={onClose} aria-label="Close">
                        <Icon icon={"mdi:close"} className="size-7" />
                    </button>
                </div>

                {isLoading ? (
                    <div className="flex items-center justify-center py-14">
                        <BeatLoader color="#1470F9" size={12} />
                    </div>
                ) : (
                    <>
                        <div className="bg-primary/20 rounded-xl px-6 py-4 mt-5 grid grid-cols-2 gap-y-2 text-black/60">
                            <p className="col-span-2 text-primary text-xl font-bold">Latest Update</p>
                            <p className="flex items-center gap-x-2">
                                <Icon icon={"mdi:file"} className="text-primary size-5" />
                                {latest?.fileName || "-"}
                            </p>
                            <p className="flex items-center gap-x-2">
                                <Icon icon={"mingcute:time-fill"} className="text-primary size-5" />
                                {formatDateTime(latest?.uploaded_at)}
                            </p>
                            <p className="flex items-center gap-x-2">
                                <Icon icon={"mdi:user"} className="text-primary size-5" />
                                {resolveUploaderName(latest?.uploaded_By)}
                            </p>
                            <p className="flex items-center gap-x-2">
                                <Icon icon={"mdi:database"} className="text-primary size-5" />
                                {formatFileSize(latest?.file_size)}
                            </p>
                        </div>

                        <div 
                            className="mt-5 border border-dashed border-black/40 rounded-2xl p-8 flex flex-col items-center gap-y-3 cursor-pointer"
                            onDragOver={handleDragOver}
                            onDrop={handleDrop}
                            onClick={handleChooseFile}
                        >
                            <Icon icon={"mdi:tray-arrow-up"} className="size-12 text-black/40" />
                            <p className="text-black">Drag & drop an Excel file here, or click to select</p>
                            <p className="text-black text-sm">Accepted formats: .xlsx, .xls</p>
                            {selectedFile ? (
                                <p className="text-black/70">{selectedFile.name} ({(selectedFile.size / (1024 * 1024)).toFixed(2)} MB)</p>
                            ) : null}
                            <div className="w-full mt-2" onClick={(e) => e.stopPropagation()}>
                                <p className="text-black font-semibold mb-1">Item Prefix</p>
                                <input
                                    className="w-full rounded-xl border border-black/20 px-4 py-2 outline-none focus:border-primary cursor-text"
                                    value={corpItemPrefix}
                                    onChange={(e) => setCorpItemPrefix(e.target.value)}
                                    placeholder="e.g., UHN"
                                />
                            </div>
                            <div className="flex items-center gap-x-3" onClick={(e) => e.stopPropagation()}>
                                <button className="cursor-pointer bg-green-700 text-white rounded-full px-8 py-2 font-semibold" onClick={handleChooseFile}>
                                    Select Price List Sheet
                                </button>
                                <button
                                    className="cursor-pointer bg-primary text-white rounded-full px-6 py-2 font-semibold"
                                    onClick={handleUpload}
                                    disabled={!selectedFile || isUploading || !customerId || !corpItemPrefix}
                                >
                                    {isUploading ? <BeatLoader color="#1470F9" size={6} /> : "Submit"}
                                </button>
                            </div>
                            <input ref={fileInputRef} type="file" className="hidden" accept=".xlsx,.xls" onChange={handleFileChange} />
                        </div>

                        <h3 className="text-2xl text-black/60 font-semibold mt-7">Customer Data Upload History</h3>
                        <div className="border border-black/20 rounded-xl overflow-hidden mt-3">
                            <div className="grid grid-cols-4 bg-black/10 font-semibold px-6 py-2">
                                <p>File</p>
                                <p>Upload date</p>
                                <p>Upload by</p>
                                <p>Size</p>
                            </div>
                            {historyEntries.length === 0 ? (
                                <div className="px-6 py-4 text-black/50">No upload history found.</div>
                            ) : (
                                historyEntries.map((entry, index) => (
                                    <div key={`${entry.fileName || "file"}-${index}`} className="grid grid-cols-4 px-6 py-2 text-black/70">
                                        <p className="flex items-center gap-x-2">
                                            <Icon icon={"mdi:file"} className="text-primary size-4" />
                                            {entry.fileName || "-"}
                                        </p>
                                        <p className="flex items-center gap-x-2">
                                            <Icon icon={"mingcute:time-fill"} className="text-primary size-4" />
                                            {formatDateTime(entry.uploaded_at)}
                                        </p>
                                        <p className="flex items-center gap-x-2">
                                            <Icon icon={"mdi:user"} className="text-primary size-4" />
                                            {resolveUploaderName(entry.uploaded_By)}
                                        </p>
                                        <p className="flex items-center gap-x-2">
                                            <Icon icon={"mdi:database"} className="text-primary size-4" />
                                            {formatFileSize(entry.file_size)}
                                        </p>
                                    </div>
                                ))
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default CorporateCustomerPriceListUploadDialog;
