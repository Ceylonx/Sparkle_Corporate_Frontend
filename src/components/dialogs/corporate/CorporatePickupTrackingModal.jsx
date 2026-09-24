import { useState, useEffect } from "react";
import { Icon } from "@iconify/react";
import { trackCorporatePickupEntryById } from "../../../services/corporate/PickupEntryServices";
import { normalizePickupTrackResponse } from "../../../utils/normalizeCorporatePickupTrackResponse";
import { MdClose } from "react-icons/md";

const CorporatePickupTrackingModal = ({ pickupId, onClose }) => {
    const [searchQuery, setSearchQuery] = useState(pickupId || "");
    const [order, setOrder] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (pickupId) {
            fetchTrackingData(pickupId);
        }
    }, [pickupId]);

    const fetchTrackingData = async (idToFetch) => {
        const userId = localStorage.getItem("userId");
        if (!userId) {
            setError("Please log in first.");
            return;
        }

        setIsLoading(true);
        setError(null);
        setOrder(null);
        try {
            const response = await trackCorporatePickupEntryById(userId, idToFetch);
            const normalized = normalizePickupTrackResponse(response ?? null);
            if (normalized && (normalized.pickup_entry_id != null || normalized.items)) {
                setOrder(normalized);
            } else {
                setError("Pickup entry not found or invalid response");
            }
        } catch (err) {
            setError(err?.response?.data?.message || err?.message || "Error tracking pickup entry");
            console.error("Error fetching pickup tracking:", err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSearchKeyDown = (e) => {
        if (e.key === "Enter" && searchQuery.trim()) {
            fetchTrackingData(searchQuery.trim());
        }
    };

    const formatDate = (dateString) => {
        if (!dateString) return "—";
        const date = new Date(dateString);
        if (isNaN(date)) return "—";
        return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`;
    };

    return (
        <div className="fixed z-50 inset-0 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose}></div>
            
            {/* Modal Content */}
            <div className="relative bg-[#FAFAFA] rounded-2xl w-full max-w-[1000px] max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
                {/* Close Button */}
                <div className="absolute right-6 top-6 z-10">
                    <button 
                        onClick={onClose}
                        className="p-2 rounded-full bg-blue-100 text-blue-500 hover:bg-blue-200 transition-colors"
                    >
                        <MdClose size={20} />
                    </button>
                </div>

                <div className="p-8 pb-4">
                    <h1 className="text-[28px] font-bold text-blue-500 mb-1">Order Tracking</h1>
                    <p className="text-gray-400 text-sm mb-6">Track the live location and status of collection/delivery orders with quick bill preview.</p>
                    
                    {/* Search Bar */}
                    <div className="relative mb-6">
                        <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                            <Icon icon="mdi:magnify" className="text-gray-400 text-xl" />
                        </div>
                        <input
                            type="text"
                            placeholder="Search by Order ID"
                            className="w-full border border-gray-200 rounded-full py-3.5 pl-12 pr-6 text-gray-700 focus:outline-none focus:border-blue-400 transition-colors shadow-sm bg-white"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onKeyDown={handleSearchKeyDown}
                        />
                    </div>
                </div>

                {/* Inner Content scrollable */}
                <div className="px-8 pb-8 overflow-y-auto w-full">
                    {isLoading && (
                        <div className="flex justify-center py-20">
                            <p className="text-gray-500 animate-pulse">Loading tracking information...</p>
                        </div>
                    )}
                    
                    {error && (
                        <div className="bg-red-50 text-red-500 p-6 rounded-xl border border-red-100 text-center mx-4 mb-4">
                            {error}
                        </div>
                    )}

                    {!isLoading && !error && order && (
                        <div className="bg-white rounded-xl shadow-[0_2px_15px_-3px_rgba(0,0,0,0.07)] p-6">
                            {/* Summary Details */}
                            <div className="grid grid-cols-3 gap-6 mb-8 text-[15px]">
                                <div className="flex flex-col gap-y-3">
                                    <div className="flex mb-1">
                                        <span className="text-black font-semibold min-w-[120px]">Order ID :</span>
                                        <span className="text-black">{order.pickup_entry_id}</span>
                                    </div>
                                    <div className="flex">
                                        <span className="text-black font-semibold min-w-[120px]">Company Name :</span>
                                        <span className="text-black">{order.customer_company_name}</span>
                                    </div>
                                </div>
                                <div className="flex flex-col gap-y-3">
                                    <div className="flex mb-1">
                                        <span className="text-black font-semibold min-w-[120px]">Status :</span>
                                        <span className="text-black">{order.status || "Work in Progress"}</span>
                                    </div>
                                    <div className="flex">
                                        <span className="text-black font-semibold min-w-[120px]">Contact Number :</span>
                                        <span className="text-black">{order.customer_phone ? `0${order.customer_phone}` : "—"}</span>
                                    </div>
                                </div>
                                <div className="flex flex-col gap-y-3">
                                    <div className="flex mb-1">
                                        <span className="text-black font-semibold min-w-[120px]">Pickup Date :</span>
                                        <span className="text-black">{formatDate(order.created_at)}</span>
                                    </div>
                                    <div className="flex">
                                        <span className="text-black font-semibold min-w-[120px]">Delivery Date :</span>
                                        <span className="text-black">{formatDate(order.delivery_date)}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Order Items Table */}
                            <div>
                                <h3 className="text-[17px] font-semibold text-black mb-4">Order Items</h3>
                                <div className="overflow-hidden rounded-xl bg-[#F0F5FF]">
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className="bg-[#7CAEF2] text-white uppercase text-[11px] font-semibold tracking-wider">
                                                <th className="py-3.5 px-6 whitespace-nowrap">NO</th>
                                                <th className="py-3.5 px-4">ITEM</th>
                                                <th className="py-3.5 px-4">CATEGORY</th>
                                                <th className="py-3.5 px-4">REMARK</th>
                                                <th className="py-3.5 px-4">PACKING</th>
                                                <th className="py-3.5 px-4 text-center">QTY</th>
                                                <th className="py-3.5 px-4">SERVICE</th>
                                                <th className="py-3.5 px-6 text-center">STATUS</th>
                                            </tr>
                                        </thead>
                                        <tbody className="text-[13px] text-gray-800">
                                            {order.items && order.items.length > 0 ? (
                                                order.items.map((item, idx) => {
                                                    // Extract unique service names
                                                    const services = item.service_types 
                                                        ? Array.from(new Set(item.service_types.map(s => s.service_type_name))).join(", ") 
                                                        : "—";

                                                    return (
                                                        <tr 
                                                            key={item.order_item_auto_id || idx} 
                                                            className={`border-b border-white/40 last:border-0 ${idx % 2 === 0 ? "bg-[#F7FAFD]" : "bg-[#EDF4FA]"}`}
                                                        >
                                                            <td className="py-3.5 px-6 font-medium text-center">{String(idx + 1).padStart(2, "0")}</td>
                                                            <td className="py-3.5 px-4 font-medium">{item.corp_item_name || "—"}</td>
                                                            <td className="py-3.5 px-4">{item.item_category_name || "—"}</td>
                                                            <td className="py-3.5 px-4">{item.corp_item_remark || "—"}</td>
                                                            <td className="py-3.5 px-4">{item.packing_option || "Fold"}</td>
                                                            <td className="py-3.5 px-4 text-center">{item.corp_item_quantity || 0}</td>
                                                            <td className="py-3.5 px-4 truncate max-w-[120px]" title={services}>{services}</td>
                                                            <td className="py-3.5 px-6 whitespace-nowrap">
                                                                <span className="inline-flex items-center justify-center px-4 py-1.5 rounded-full bg-[#D1E4FF] text-[#0061A2] text-xs font-semibold w-24">
                                                                    {item.production_status || "Pending"}
                                                                </span>
                                                            </td>
                                                        </tr>
                                                    );
                                                })
                                            ) : (
                                                <tr>
                                                    <td colSpan="8" className="py-6 text-center text-gray-500">No items found for this order.</td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default CorporatePickupTrackingModal;
