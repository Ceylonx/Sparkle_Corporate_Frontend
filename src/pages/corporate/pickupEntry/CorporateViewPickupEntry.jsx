import { useEffect, useRef, useState, useMemo } from "react";
import { HiOutlineArrowCircleLeft } from "react-icons/hi";
import { useNavigate, useParams } from "react-router-dom";
import { Icon } from "@iconify/react/dist/iconify.js";
import CorporateCollectionNote from "../../../components/printables/CorporateCollectionNote";
import { useReactToPrint } from "react-to-print";
import { getAllCorporateCustomers, getCorporateCustomerById } from "../../../services/CustomerServices";
import { trackCorporatePickupEntryById, updatePickupEntryApprovalStatus, cancelCorporatePickupEntry } from "../../../services/corporate/PickupEntryServices";
import { BeatLoader } from "react-spinners";
import { getAllCorporateItems, getAllCorporateItemCategories, getCorporatePriceListByCustomer, getCorporateTaxes } from "../../../services/corporate/CorporateSettingsServices";
import SignatureCanvas from "react-signature-canvas";
import Swal from "sweetalert2";
import {
    buildCollectionNoteLinesFromApiOrderItems,
    pickCorporateTaxRatePercent,
} from "../../../utils/corporateCollectionNotePricing";
import { normalizePickupTrackResponse } from "../../../utils/normalizeCorporatePickupTrackResponse";

function normalizeCorporateItems(rawItems) {
    return (rawItems ?? []).map((item) => ({
        item_type_id: String(item.corp_item_id ?? item.corp_item_auto_id ?? ""),
        item_type_name: item.corp_item_name ?? item.item_type_name ?? "-",
        corp_item_auto_id: item.corp_item_auto_id,
        item_category_id: item.item_category_id,
        corp_item_id: item.corp_item_id || String(item.corp_item_id ?? item.corp_item_auto_id ?? ""),
        service_type: item.service_type,
        service_types: item.service_types,
    })).filter((item) => item.item_type_id);
}

const formatLogTimestamp = (isoString) => {
    try {
        const date = new Date(isoString);
        const yyyy = date.getFullYear();
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const dd = String(date.getDate()).padStart(2, '0');
        let hours = date.getHours();
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12;
        hours = hours ? hours : 12;
        return `${yyyy}-${mm}-${dd} ${hours}:${minutes} ${ampm}`;
    } catch (_) {
        return isoString;
    }
};

const CorporateViewPickupEntry = () => {
    const navigate = useNavigate();
    const collectionNoteRef = useRef(null);
    const sigCanvasRef = useRef(null);
    const { id } = useParams();
    const [isLoading, setIsLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");
    const [customers, setCustomers] = useState([]);
    const [itemTypes, setItemTypes] = useState([]);
    const [order, setOrder] = useState(null);
    const [selectedCustomer, setSelectedCustomer] = useState(null);
    const [approvalStatus, setApprovalStatus] = useState('Created');
    const [createdByName, setCreatedByName] = useState('');
    const [checkedByUser, setCheckedByUser] = useState(null);
    const [checkedBySignature, setCheckedBySignature] = useState(null);
    const [approvedByUser, setApprovedByUser] = useState(null);
    const [approvedBySignature, setApprovedBySignature] = useState(null);
    const [signingForStatus, setSigningForStatus] = useState(null);
    const [activityLog, setActivityLog] = useState([]);
    const [isApprovalLoading, setIsApprovalLoading] = useState(false);
    const [itemCategoryOptions, setItemCategoryOptions] = useState([]);
    const [showSignatureModal, setShowSignatureModal] = useState(false);
    const [customerPriceList, setCustomerPriceList] = useState([]);
    const [customerServiceTypes, setCustomerServiceTypes] = useState([]);
    const [corporateTaxRates, setCorporateTaxRates] = useState({ sscl: 0, vat: 0 });
    /** Customer record from getCorporateCustomerById (reliable tax_type for pricing). */
    const [customerPricingDetail, setCustomerPricingDetail] = useState(null);

    const fetchAllCustomers = async () => {
        try {
            const userId = localStorage.getItem("userId");
            const response = await getAllCorporateCustomers(userId);
            const list = response?.data?.customers
                || response?.data?.corporate_customers
                || response?.data?.allCustomers
                || response?.data?.data
                || [];
            setCustomers(Array.isArray(list) ? list : []);
        } catch (error) {
            console.error("Error fetching customers: ", error);
        }
    };

    const fetchCorporateItems = async () => {
        try {
            const response = await getAllCorporateItems(localStorage.getItem("userId"));
            const corporateItems = normalizeCorporateItems(response?.data?.corporate_items);
            setItemTypes(corporateItems);
        } catch (error) {
            console.error("Error fetching corporate items: ", error);
            setItemTypes([]);
        }
    };

    const fetchItemCategories = async () => {
        try {
            const response = await getAllCorporateItemCategories(localStorage.getItem("userId"));
            const categories = response?.data?.corporate_item_categories || [];
            setItemCategoryOptions(categories.map(cat => ({
                value: cat.item_category_auto_id,
                label: cat.item_category_name
            })));
        } catch (error) {
            console.error("Error fetching item categories: ", error);
            setItemCategoryOptions([
                { value: 1, label: "King" },
                { value: 2, label: "Queen" },
                { value: 3, label: "Single" },
            ]);
        }
    };

    const fetchPickupEntryById = async () => {
        try {
            setIsLoading(true);
            const userId = localStorage.getItem("userId");
            const response = await trackCorporatePickupEntryById(userId, id);
            setOrder(normalizePickupTrackResponse(response ?? null));
        } catch (error) {
            console.error("Error fetching pickup entry details: ", error);
            setErrorMessage("Failed to load pickup entry details.");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchPickupEntryById();
        fetchAllCustomers();
        fetchCorporateItems();
        fetchItemCategories();
    }, [id]);

    useEffect(() => {
        if (order !== null && customers.length > 0) {
            const custObj = customers.find(customer => (customer.customer_id || customer.customer_auto_id || customer.id) === order.customer_id);
            if (custObj) {
                setSelectedCustomer({
                    ...custObj,
                    customer_id: custObj.customer_id || custObj.customer_auto_id || custObj.id,
                    phone_number: custObj.customer_phone || custObj.phone_number
                });
            } else {
                setSelectedCustomer({
                    company_name: order.customer_company_name || order.company_name,
                    customer_id: order.customer_id,
                    customer_name: order.customer_name || order.signed_by || "",
                    phone_number: order.customer_phone || order.phone_number,
                    customer_address: order.customer_address || order.address || ""
                });
            }

            // Hydrate approval workflow state
            setApprovalStatus(order.approval_status || 'Created');
            setCreatedByName(order.created_by_name || order.created_by || '');
            setCheckedByUser(order.checked_by_user || null);
            setCheckedBySignature(order.checked_by_signature || null);
            setApprovedByUser(order.approved_by_user || null);
            setApprovedBySignature(order.approved_by_signature || null);
            setActivityLog(Array.isArray(order.activity_log) ? order.activity_log : []);
        }
    }, [order, customers]);

    // Fetch price list + customer service types directly from order.customer_id
    // This runs as soon as the order is loaded — no dependency on the customers list.
    useEffect(() => {
        if (!order?.customer_id) {
            setCustomerPriceList([]);
            setCustomerServiceTypes([]);
            setCorporateTaxRates({ sscl: 0, vat: 0 });
            setCustomerPricingDetail(null);
            return;
        }
        let cancelled = false;
        const userId = localStorage.getItem("userId");
        const customerId = order.customer_id;

        const loadPricingData = async () => {
            const [priceListRes, customerRes, taxRes] = await Promise.allSettled([
                getCorporatePriceListByCustomer({
                    user_id: userId,
                    customer_id: customerId,
                }),
                getCorporateCustomerById({
                    user_id: userId,
                    customer_auto_id: customerId,
                }),
                getCorporateTaxes(userId, { activeOnly: true }),
            ]);
            if (cancelled) return;

            if (priceListRes.status === "fulfilled") {
                try {
                    const priceListResVal = priceListRes.value;
                    const list =
                        priceListResVal?.data?.price_list ??
                        priceListResVal?.data?.corporate_price_lists ??
                        priceListResVal?.data ??
                        [];
                    setCustomerPriceList(Array.isArray(list) ? list : []);
                    console.log('[Pricing] price_list fetched:', Array.isArray(list) ? list.length : 0, 'entries');
                } catch (err) {
                    console.error("Error parsing price list:", err);
                }
            } else {
                console.error("Error fetching price list:", priceListRes.reason);
            }

            if (customerRes.status === "fulfilled") {
                try {
                    const customerResVal = customerRes.value;
                    const data =
                        customerResVal?.data?.customer ??
                        customerResVal?.data?.data ??
                        customerResVal?.data;
                    setCustomerPricingDetail(data && typeof data === "object" ? data : null);
                    const serviceTypesList =
                        data && Array.isArray(data.service_types) ? data.service_types : [];
                    setCustomerServiceTypes(serviceTypesList);
                    console.log('[Pricing] service_types fetched:', serviceTypesList);
                } catch (err) {
                    console.error("Error parsing customer pricing detail:", err);
                }
            } else {
                console.error("Error fetching customer for pricing:", customerRes.reason);
            }

            if (taxRes.status === "fulfilled") {
                try {
                    const taxes = taxRes.value?.taxes ?? [];
                    setCorporateTaxRates({
                        sscl: pickCorporateTaxRatePercent(taxes, "SSCL"),
                        vat: pickCorporateTaxRatePercent(taxes, "VAT"),
                    });
                } catch (err) {
                    console.error("Error parsing corporate taxes:", err);
                }
            } else {
                console.error("Error fetching corporate taxes:", taxRes.reason);
                setCorporateTaxRates({ sscl: 0, vat: 0 });
            }
        };

        loadPricingData();
        return () => { cancelled = true; };
    }, [order?.customer_id]);

    const handlePrint = useReactToPrint({
        contentRef: collectionNoteRef,
        documentTitle: `Collection note - ${selectedCustomer?.company_name || "Customer"}`
    });

    const handleApprovalAction = async (newStatus, signature = null) => {
        const userId = localStorage.getItem("userId");
        const pickupEntryId = order?.pickup_entry_id;
        if (!userId || !pickupEntryId) return;
        try {
            setIsApprovalLoading(true);
            const result = await updatePickupEntryApprovalStatus({
                user_id: userId,
                pickup_entry_id: pickupEntryId,
                new_status: newStatus,
                signature: signature
            });
            setApprovalStatus(newStatus);
            if (newStatus === 'Checked') {
                setCheckedByUser(result.actor);
                setCheckedBySignature(signature);
            } else if (newStatus === 'Approved') {
                setApprovedByUser(result.actor);
                setApprovedBySignature(signature);
            }
            // Append to local activity log
            setActivityLog(prev => [...prev, {
                type: newStatus,
                user: result.actor,
                timestamp: new Date().toISOString(),
                changes: []
            }]);

            if (newStatus === 'Checked') {
                Swal.fire({
                    icon: "success",
                    title: "Order Checked Successfully!",
                    confirmButtonColor: "#1470F9",
                }).then(() => {
                    navigate("/salesCorporate/corporate/pickup-entry");
                });
            } else if (newStatus === 'Approved') {
                Swal.fire({
                    icon: "success",
                    title: "Order Approved Successfully!",
                    confirmButtonColor: "#1470F9",
                }).then(() => {
                    navigate("/salesCorporate/corporate/pickup-entry");
                });
            }
        } catch (error) {
            Swal.fire({
                icon: "error",
                title: "Error",
                text: error?.response?.data?.message ?? `Failed to mark as ${newStatus}`,
                confirmButtonColor: "#1470F9",
            });
        } finally {
            setIsApprovalLoading(false);
        }
    };

    const handleConfirmSignature = () => {
        if (!sigCanvasRef.current || sigCanvasRef.current.isEmpty()) {
            Swal.fire({
                icon: "warning",
                title: "Signature Required",
                text: "Please draw your signature first.",
                confirmButtonColor: "#1470F9",
            });
            return;
        }
        const signatureBase64 = sigCanvasRef.current.getCanvas().toDataURL("image/png");
        setShowSignatureModal(false);
        if (signingForStatus === 'Checked') {
            setCheckedBySignature(signatureBase64);
            handleApprovalAction('Checked', signatureBase64);
        } else if (signingForStatus === 'Approved') {
            setApprovedBySignature(signatureBase64);
            handleApprovalAction('Approved', signatureBase64);
        }
    };

    const handleCancelOrder = async () => {
        const userId = localStorage.getItem("userId");
        const pickupEntryId = order?.pickup_entry_id;
        if (!userId || !pickupEntryId) return;

        const result = await Swal.fire({
            title: "Are you sure?",
            text: "Are you sure you want to cancel this order?",
            icon: "warning",
            showCancelButton: true,
            confirmButtonColor: "#d33",
            cancelButtonColor: "#3085d6",
            confirmButtonText: "Yes, cancel it!",
        });

        if (result.isConfirmed) {
            try {
                setIsLoading(true);
                const response = await cancelCorporatePickupEntry({
                    user_id: userId,
                    pickup_entry_id: pickupEntryId
                });

                if (response?.success) {
                    Swal.fire({
                        icon: "success",
                        title: "Cancelled!",
                        text: "Order has been cancelled successfully.",
                        timer: 1500,
                        confirmButtonColor: "#1470F9",
                    }).then(() => {
                        navigate("/salesCorporate/corporate/pickup-entry");
                    });
                } else {
                    throw new Error(response?.message || "Failed to cancel order");
                }
            } catch (error) {
                Swal.fire({
                    icon: "error",
                    title: "Error",
                    text: error?.response?.data?.message ?? error.message ?? "Failed to cancel order.",
                    confirmButtonColor: "#1470F9",
                });
            } finally {
                setIsLoading(false);
            }
        }
    };

    // Prepare data formatted for printable Collection Note
    const printableData = useMemo(() => {
        if (!order) return {};
        const checkedLog = activityLog.find(l => l.type === 'Checked');
        const approvedLog = activityLog.find(l => l.type === 'Approved');
        return {
            pickup_entry_id: order.pickup_entry_id,
            collection_date: order.created_at ? new Date(order.created_at).toISOString().split("T")[0].replace(/-/g, "/") : 'YYYY/MM/DD',
            place_of_supply: order.place_of_supply || "",
            room_no: order.room_no || "",
            gate_pass_no: order.gate_pass_no || "",
            service_type: order.service_type || "WASHING",
            delivery_type: order.delivery_type?.trim() || order.deliveryType?.trim() || "NORMAL",
            checked_by_user: checkedByUser || (checkedBySignature ? localStorage.getItem("userName") : null) || order.checked_by_user,
            checked_by_signature: checkedBySignature || order.checked_by_signature,
            checked_at: checkedLog ? checkedLog.timestamp : order.checked_at,
            approved_by_user: approvedByUser || (approvedBySignature ? localStorage.getItem("userName") : null) || order.approved_by_user,
            approved_by_signature: approvedBySignature || order.approved_by_signature,
            approved_at: approvedLog ? approvedLog.timestamp : order.approved_at,
            signature_url: order.signature_url,
            signed_by: order.signed_by,
            notes: order.notes,
            terms_and_conditions: order.terms_and_conditions,
            status: order.status || 'Active',
            created_at: order.created_at,
            updated_at: order.updated_at
        };
    }, [order, checkedByUser, checkedBySignature, approvedByUser, approvedBySignature, activityLog]);

    const orderItemsFormatted = useMemo(() => {
        if (!order?.items) return [];
        const taxType =
            customerPricingDetail?.tax_type ??
            selectedCustomer?.tax_type ??
            order?.tax_type;
        const vatNumber =
            customerPricingDetail?.customer_vat_number ??
            customerPricingDetail?.vat_number ??
            customerPricingDetail?.vat_no ??
            selectedCustomer?.customer_vat_number ??
            selectedCustomer?.vat_number ??
            selectedCustomer?.vat_no ??
            order?.customer_vat_number ??
            order?.vat_number ??
            order?.vat_no;
        return buildCollectionNoteLinesFromApiOrderItems({
            items: order.items,
            customerPriceList,
            deliveryTypeRaw: order.delivery_type ?? order.deliveryType,
            customerServiceTypes,
            corporateTaxRates,
            itemTypes,
            taxType,
            vatNumber,
            customer: selectedCustomer ?? customerPricingDetail,
            deliveryPercentageFallback:
                order.delivery_percentage ?? order.deliveryPercentage,
        });
    }, [
        order,
        customerPriceList,
        customerServiceTypes,
        corporateTaxRates,
        customerPricingDetail,
        selectedCustomer,
        itemTypes,
    ]);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-40">
                <BeatLoader color="#1470F9" size={20} />
            </div>
        );
    }

    return (
        <div>
            <div className="flex flex-row gap-x-3 items-center">
                <HiOutlineArrowCircleLeft className="size-6 text-primary cursor-pointer" onClick={() => navigate(`/salesCorporate/corporate/pickup-entry`)} />
                <h1 className="text-3xl text-primary font-bold">View Order Details</h1>
            </div>
            <p className="text-black/50 text-xl">View collection order details, printable note, and logs.</p>

            {/* Cancelled Banner */}
            {/* {order?.status === 'Deactive' && (
                <div className="flex items-center gap-x-3 bg-red-50 border border-red-300 text-red-700 rounded-xl px-5 py-3 mt-1">
                    <Icon icon="mdi:cancel" className="text-2xl shrink-0" />
                    <div>
                        <p className="font-bold text-base">This order has been Cancelled</p>
                        <p className="text-sm text-red-500">This collection order is no longer active and has been removed from all pending workflows.</p>
                    </div>
                </div>
            )} */}

            <div className="grid grid-cols-4 mt-5">
                <main className="col-span-3 border-r border-black/20 pe-3">
                    {order && selectedCustomer ? (
                        <CorporateCollectionNote 
                            ref={collectionNoteRef} 
                            orderItems={orderItemsFormatted} 
                            data={printableData} 
                            customer={selectedCustomer} 
                            itemTypes={itemTypes} 
                            itemCategories={itemCategoryOptions} 
                            priceList={customerPriceList}
                            serviceTypes={customerServiceTypes}
                        />
                    ) : (
                        <div className="text-center py-20 text-black/50">Loading preview data...</div>
                    )}

                    <div className="flex flex-col my-5 gap-y-2">
                        {errorMessage && (
                            <p className="text-red-500 font-medium text-base text-center">{errorMessage}</p>
                        )}
                        <div className="flex flex-row text-xl justify-between items-center gap-x-4">
                            <button
                                type="button"
                                className="font-semibold text-primary bg-white border border-primary rounded-full py-2 w-1/4 cursor-pointer"
                                onClick={() => navigate("/salesCorporate/corporate/pickup-entry")}
                            >
                                Back
                            </button>

                            {/* Cancel Order — centered */}
                            {!order?.has_approved_invoice && order?.status !== 'Deactive' ? (
                                <button
                                    type="button"
                                    className="font-semibold text-red-500 bg-white border border-red-500 hover:bg-red-50 rounded-full py-2 w-1/4 cursor-pointer transition-colors"
                                    onClick={handleCancelOrder}
                                >
                                    Cancel Order
                                </button>
                            ) : (
                                <div className="w-1/4" />
                            )}

                            <button
                                type="button"
                                className="font-semibold text-white bg-primary rounded-full py-2 w-1/4 cursor-pointer"
                                onClick={handlePrint}
                                disabled={!order}
                            >
                                Print Note
                            </button>
                        </div>
                    </div>
                </main>

                <aside className="px-6 flex flex-col gap-y-6 w-full max-w-[350px]">
                    {/* Edit Pickup Button */}
                    <button
                        disabled={approvalStatus === 'Approved' || order?.status === 'Deactive'}
                        onClick={() => navigate(`/salesCorporate/corporate/pickup-entry/update-order/${id}`)}
                        className={`font-bold py-3 rounded-full text-lg shadow-sm transition-colors w-full ${approvalStatus === 'Approved' || order?.status === 'Deactive' ? 'bg-black/10 text-black/40 cursor-not-allowed' : 'bg-[#E5EFFE] text-[#000000] hover:bg-[#d4e4fd] cursor-pointer'}`}
                    >
                        {approvalStatus === 'Approved' ? '🔒 Locked' : order?.status === 'Deactive' ? '🚫 Cancelled' : 'Edit Collection Order'}
                    </button>
                    
                    {/* Created By */}
                    <div className="flex flex-col gap-y-2 text-[15px]">
                        <p className="font-semibold text-black">Created By :</p>
                        <div className="flex flex-row items-center gap-x-2">
                            <Icon icon="mdi:check-circle" className="text-[#00E676] text-xl" />
                            <span className="text-black/70 text-sm truncate">{createdByName || '—'}</span>
                        </div>
                    </div>

                    {/* Checked By */}
                    <div className="flex flex-col gap-y-2 text-[15px]">
                        <p className="font-semibold text-black">Checked By :</p>
                        {checkedByUser ? (
                            <div className="flex flex-row items-center gap-x-2">
                                <Icon icon="mdi:check-circle" className="text-[#1470F9] text-xl" />
                                <span className="text-black/70 text-sm truncate">{checkedByUser}</span>
                            </div>
                        ) : (
                            <button
                                disabled={approvalStatus !== 'Created' || isApprovalLoading || order?.status === 'Deactive' || order?.status === 'Cancelled' || order?.status === 'Inactive'}
                                onClick={() => {
                                    handleApprovalAction('Checked', null);
                                }}
                                className={`border font-medium py-2.5 rounded-full shadow-sm transition-colors bg-white w-full text-lg ${approvalStatus === 'Created' && !isApprovalLoading && order?.status !== 'Deactive' && order?.status !== 'Cancelled' && order?.status !== 'Inactive' ? 'border-[#1470F9] text-[#1470F9] hover:bg-blue-50 cursor-pointer' : 'border-black/20 text-black/30 cursor-not-allowed'}`}
                            >
                                {isApprovalLoading ? <BeatLoader size={8} color="#1470F9" /> : 'Checked'}
                            </button>
                        )}
                    </div>

                    {/* Approved By */}
                    <div className="flex flex-col gap-y-2 text-[15px]">
                        <p className="font-semibold text-black">Approved By :</p>
                        {approvedByUser ? (
                            <div className="flex flex-row items-center gap-x-2">
                                <Icon icon="mdi:check-circle" className="text-[#00E676] text-xl" />
                                <span className="text-black/70 text-sm truncate">{approvedByUser}</span>
                            </div>
                        ) : (
                            <button
                                disabled={approvalStatus !== 'Checked' || isApprovalLoading || order?.status === 'Deactive' || order?.status === 'Cancelled' || order?.status === 'Inactive'}
                                onClick={() => {
                                    handleApprovalAction('Approved', null);
                                }}
                                className={`border font-medium py-2.5 rounded-full shadow-sm transition-colors w-full text-lg ${approvalStatus === 'Checked' && !isApprovalLoading && order?.status !== 'Deactive' && order?.status !== 'Cancelled' && order?.status !== 'Inactive' ? 'bg-primary text-white hover:bg-blue-600 cursor-pointer' : 'border-black/20 text-black/30 bg-white cursor-not-allowed'}`}
                            >
                                {isApprovalLoading ? <BeatLoader size={8} color="#ffffff" /> : 'Approved'}
                            </button>
                        )}
                    </div>

                    {/* Activity Log */}
                    <div className="flex flex-col gap-y-2 text-[15px]">
                        <p className="font-semibold text-black">Activity Log :</p>
                        <div className="border border-black/70 rounded-xl bg-white shadow-sm overflow-hidden max-h-52 overflow-y-auto">
                            {activityLog.length === 0 ? (
                                <div className="px-4 py-3 text-black/40 text-sm">No activity yet.</div>
                            ) : activityLog.map((log, idx) => {
                                const formattedTime = formatLogTimestamp(log.timestamp);
                                const isNewStyle = !!log.action;
                                return (
                                    <div key={idx} className={`px-4 py-2 text-sm text-black/70 ${idx > 0 ? 'border-t border-black/20' : ''}`}>
                                        {log.description ? (
                                            <>
                                                <span className="font-semibold text-[13px]">{formattedTime}</span>: {log.user} — {log.description}
                                            </>
                                        ) : isNewStyle ? (
                                            <>
                                                <span className="font-semibold text-[13px]">{formattedTime}</span>: {log.user} changed {log.field} from "{log.old ?? '—'}" to "{log.new ?? '—'}"
                                            </>
                                        ) : (
                                            <>
                                                <span className="font-semibold text-[13px]">{formattedTime}</span>: {log.user} {log.type === 'Created' ? 'created the order' : log.type === 'Checked' ? 'checked the order' : log.type === 'Approved' ? 'approved the order' : 'edited the order'}
                                                {log.changes && log.changes.length > 0 && (
                                                    <ul className="list-disc pl-5 mt-1 text-xs">
                                                        {log.changes.map((change, ci) => (
                                                            <li key={ci}>{change}</li>
                                                        ))}
                                                    </ul>
                                                )}
                                            </>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Place of Supply */}
                    <div className="flex flex-col gap-y-1">
                        <label className="text-black font-semibold text-[15px]">Place of Supply :</label>
                        <input 
                            name="place_of_supply" 
                            value={order?.place_of_supply || ""} 
                            disabled={true}
                            readOnly={true}
                            placeholder="No place of supply specified" 
                            className="border border-black/30 rounded-2xl px-4 py-3 w-full focus:outline-none text-black/60 shadow-sm text-sm bg-black/5 cursor-not-allowed"
                        />
                    </div>

                    {/* Enter Note */}
                    {/* <div className="flex flex-col gap-y-1">
                        <label className="text-black font-semibold text-[15px]">Enter Note :</label>
                        <textarea 
                            name="notes" 
                            value={order?.notes || ""} 
                            disabled={true}
                            readOnly={true}
                            placeholder="No note specified" 
                            rows={3}
                            className="border border-black/30 rounded-2xl px-4 py-3 w-full focus:outline-none text-black/60 shadow-sm text-sm resize-none bg-black/5 cursor-not-allowed"
                        />
                    </div> */}

                    {/* Enter Terms & Conditions */}
                    {/* <div className="flex flex-col gap-y-1">
                        <label className="text-black font-semibold text-[15px]">Enter Terms & Conditions :</label>
                        <textarea 
                            name="terms_and_conditions" 
                            value={order?.terms_and_conditions || ""} 
                            disabled={true}
                            readOnly={true}
                            placeholder="No terms & conditions specified" 
                            rows={3}
                            className="border border-black/30 rounded-2xl px-4 py-3 w-full focus:outline-none text-black/60 shadow-sm text-sm resize-none bg-black/5 cursor-not-allowed"
                        />
                    </div> */}
                </aside>
            </div>

            {/* Signature Modal for Checked By Stage */}
            {showSignatureModal && (
                <div className="fixed inset-0 h-screen w-screen z-50 flex items-center justify-center backdrop-blur-sm bg-black/40 p-4">
                    <div className="bg-white rounded-[24px] w-full max-w-[450px] shadow-2xl flex flex-col p-8 transition-all relative">
                        <h2 className="text-xl font-bold text-gray-900 mb-1 text-left">
                            {signingForStatus === 'Approved' ? 'Approved By Signature' : 'Checked By Signature'}
                        </h2>
                        <p className="text-sm text-gray-500 mb-5 text-left leading-relaxed">
                            Please draw your signature in the box below to confirm this request.
                        </p>

                        <div className="w-full h-[180px] border border-dashed border-gray-300 rounded-xl overflow-hidden bg-white mb-3">
                            <SignatureCanvas
                                ref={sigCanvasRef}
                                penColor="black"
                                canvasProps={{
                                    className: "w-full h-full cursor-crosshair"
                                }}
                            />
                        </div>

                        <button
                            type="button"
                            onClick={() => sigCanvasRef.current.clear()}
                            className="text-gray-400 hover:text-gray-600 text-sm underline underline-offset-4 self-start cursor-pointer transition-colors mb-6"
                        >
                            Clear Signature
                        </button>

                        <div className="flex flex-row gap-x-4 w-full">
                            <button
                                type="button"
                                onClick={() => setShowSignatureModal(false)}
                                className="flex-1 py-2.5 border border-gray-300 hover:bg-gray-50 text-gray-700 font-semibold rounded-full text-base cursor-pointer transition-colors text-center"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirmSignature}
                                className="flex-1 py-2.5 bg-primary hover:bg-primary/95 text-white font-semibold rounded-full text-base cursor-pointer transition-colors text-center"
                            >
                                Confirm & Save
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CorporateViewPickupEntry;
