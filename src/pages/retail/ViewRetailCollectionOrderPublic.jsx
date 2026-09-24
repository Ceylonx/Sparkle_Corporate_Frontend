import { useEffect, useState, useMemo, useRef } from "react";
import { useParams } from "react-router-dom";
import { BeatLoader } from "react-spinners";
import { getRetailInvoicesByOrderPublic, getServiceItemsByOrderIdPublic, getAllCustomersPublic, getOrderByIdPublic, getUserByIdPublic } from "../../services/Retail/RetailInvoiceServices";
import { getViewAllItemTypes } from "../../services/Retail/RetailSettingsServices";
import { getViewAllServiceTypes } from "../../services/ServiceTypeServices";
import RetailSalesOrder from "../../components/printables/RetailSalesOrder";

/**
 * Public collection order view – customer opens the link from the SMS (e.g. /salesCorporate/retail/collection-order/ORDER_NWL_159).
 * Uses the same APIs as the public invoice view, but renders the Collection Order layout.
 */
export default function ViewRetailCollectionOrderPublic() {
    const { orderId } = useParams();
    console.log("ViewRetailCollectionOrderPublic: render with orderId:", orderId);
    const [invoiceDataRaw, setInvoiceDataRaw] = useState(null); // From getRetailInvoicesByOrder
    const [mergedOrder, setMergedOrder] = useState(null); // From getServiceItemsByOrderId
    const [itemTypes, setItemTypes] = useState([]);
    const [serviceTypes, setServiceTypes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!orderId) {
            setError("Order ID is missing.");
            setLoading(false);
            return;
        }
        let cancelled = false;
        
        const fetchPublicOrder = async () => {
            try {
                // Try fetching using the invoice endpoint first (as requested to mirror the invoice public view)
                console.log("ViewRetailCollectionOrderPublic: Fetching invoices for", orderId);
                const payloadInvoice = { order_id: orderId };
                const invoiceRes = await getRetailInvoicesByOrderPublic(payloadInvoice);
                console.log("ViewRetailCollectionOrderPublic: Invoices response", invoiceRes);
                
                if (cancelled) return;
                
                if (!invoiceRes || !invoiceRes.invoices || invoiceRes.invoices.length === 0) {
                    console.warn("ViewRetailCollectionOrderPublic: No invoices found");
                    throw new Error("Invoice not found or order not invoiced yet.");
                }

                const formattedInvoices = invoiceRes.invoices.map(item => ({
                    ...item,
                    order_ids: (() => { try { return JSON.parse(item.order_id); } catch { return [item.order_id]; } })(),
                    payment: (() => { try { return typeof item.payment === 'string' ? JSON.parse(item.payment) : item.payment; } catch { return item.payment; } })()
                }));
                const selectedInvoice = formattedInvoices[0];
                setInvoiceDataRaw(selectedInvoice);

                const idList = Array.isArray(selectedInvoice.order_ids) ? selectedInvoice.order_ids : [selectedInvoice.order_ids];
                const firstOrderId = idList[0] || orderId;

                console.log("ViewRetailCollectionOrderPublic: Fetching items for", firstOrderId);
                const payloadItems = { order_id: firstOrderId };
                const itemsRes = await getServiceItemsByOrderIdPublic(payloadItems);
                console.log("ViewRetailCollectionOrderPublic: Items response", itemsRes);
                
                if (cancelled) return;

                let items = [];
                if (itemsRes?.service_items && Array.isArray(itemsRes.service_items)) items = itemsRes.service_items;
                else if (itemsRes?.items && Array.isArray(itemsRes.items)) items = itemsRes.items;
                else if (Array.isArray(itemsRes)) items = itemsRes;

                let finalDiscount = null;
                try {
                    const orderRes = await getOrderByIdPublic({ user_id: "public", order_id: firstOrderId });
                    const adminDiscount = orderRes?.order?.discount;
                    const isValidDiscount = adminDiscount != null && adminDiscount !== "" && adminDiscount !== "0" && adminDiscount !== 0;
                    if (isValidDiscount) {
                        finalDiscount = String(adminDiscount).trim();
                    } else {
                        const branchId = selectedInvoice?.branch_id || itemsRes?.branch_id || 1;
                        const customersRes = await getAllCustomersPublic({ customer_type: "Retail", branch_id: branchId });
                        if (customersRes?.success && Array.isArray(customersRes.allCustomers)) {
                            const lookupId = String(itemsRes?.customer_id || selectedInvoice?.customer_id || "").trim();
                            const lookupPhone = String(itemsRes?.phone_number || selectedInvoice?.phone_number || "").trim().replace(/^0+/, "");
                            const currentCustomer = customersRes.allCustomers.find(c => {
                                const cId = String(c.customer_id || "").trim();
                                const cPhone = String(c.phone_number || "").trim().replace(/^0+/, "");
                                return cId === lookupId || (lookupPhone && cPhone === lookupPhone);
                            });
                            if (currentCustomer && currentCustomer.discount != null && Number(currentCustomer.discount) > 0) {
                                finalDiscount = `${currentCustomer.discount}%`;
                            }
                        }
                    }
                } catch (discountErr) {
                    console.error("ViewRetailCollectionOrderPublic: Error fetching discount", discountErr);
                }

                const response = itemsRes || {};
                const orderData = selectedInvoice || {}; 
                
                const merged = {
                    customer_id: orderData.customer_id || response?.customer_id,
                    customer_name: orderData.customer_name || response?.customer_name,
                    phone_number: orderData.phone_number || response?.phone_number,
                    created_at: orderData.created_at || response?.created_at,
                    delivery_type: orderData.delivery_type || response?.delivery_type,
                    delivery_date: orderData.delivery_date || response?.delivery_date,
                    delivery_outlet: orderData.delivery_outlet || response?.delivery_outlet,
                    redo_order_reference: orderData.redo_order_reference || response?.redo_order_reference,
                    created_by: orderData.created_by || orderData.user_id || response?.created_by,
                    user_id: orderData.user_id || orderData.created_by || response?.user_id,
                    created_by_name: orderData.created_by_name || response?.created_by_name,
                    created_by_user_name: orderData.created_by_user_name || response?.created_by_user_name,
                    user_name: orderData.user_name || response?.user_name,
                    order_id: firstOrderId,
                    order_ids: idList,
                    advance_payment: parseFloat(orderData.advance_payment || response?.advance_payment || 0),
                    remaining_amount: parseFloat(orderData.remaining_amount || response?.remaining_amount || 0),
                    delivery_charge: parseFloat(orderData.delivery_charge || response?.delivery_charge || 0),
                    total_amount: parseFloat(orderData.total_amount || response?.total_amount || 0),
                    discount: finalDiscount ?? parseFloat(orderData.discount || response?.discount || 0),
                    damaged_deduction: 0,
                    returned_deduction: 0,
                    items: items,
                    status: response?.status || orderData.status,
                    branch_id: orderData.branch_id || response?.branch_id
                };

                if (finalDiscount != null) {
                    setInvoiceDataRaw(prev => ({ ...prev, discount: finalDiscount }));
                }

                // Fetch collector name if it's missing but created_by is available
                const collectorId = merged.created_by;
                if (collectorId && !merged.created_by_name) {
                    try {
                        const userRes = await getUserByIdPublic(collectorId);
                        if (userRes?.success && Array.isArray(userRes.user) && userRes.user.length > 0) {
                            const name = userRes.user[0].name;
                            if (name) {
                                merged.created_by_name = name;
                            }
                        }
                    } catch (e) {
                        console.error("ViewRetailCollectionOrderPublic: Error fetching collector name:", e);
                    }
                }

                setInvoiceDataRaw(selectedInvoice);
                setMergedOrder(merged);

                // Fetch Item Types
                try {
                    const itemTypesRes = await getViewAllItemTypes();
                    const list = itemTypesRes?.data?.item_types || itemTypesRes?.data?.itemTypes || itemTypesRes?.item_types || (Array.isArray(itemTypesRes?.data) ? itemTypesRes.data : []);
                    if (!cancelled) setItemTypes(Array.isArray(list) ? list : []);
                } catch (e) {
                    console.error("Error fetching public item types:", e);
                }

                // Fetch Service Types
                try {
                    const serviceTypesRes = await getViewAllServiceTypes();
                    const list = serviceTypesRes?.data?.service_types || serviceTypesRes?.data?.serviceTypes || serviceTypesRes?.service_types || (Array.isArray(serviceTypesRes?.data) ? serviceTypesRes.data : []);
                    if (!cancelled) setServiceTypes(Array.isArray(list) ? list : []);
                } catch (e) {
                    console.error("Error fetching public service types:", e);
                }

            } catch (err) {
                // FALLBACK: If invoice fetch fails, fallback to the pending order API (getViewRetailOrderById)
                console.warn("Invoice fetch failed, falling back to public pending order fetch...", err);
                try {
                    const { getViewRetailOrderById } = await import("../../services/Retail/RetailOrderServices");
                    const fallbackRes = await getViewRetailOrderById({ order_id: orderId }); 
                    
                    if (cancelled) return;

                    const orderData = fallbackRes?.order ?? (fallbackRes?.order_id != null ? fallbackRes : null);
                    
                    if (orderData) {
                        setInvoiceDataRaw({
                            ...orderData,
                            payment: orderData.payment || [],
                            items: orderData.items || [],
                            balance_due: orderData.balance_due ?? orderData.balanceDue ?? orderData.remaining_amount ?? null
                        });
                        setMergedOrder({
                            ...orderData,
                            balance_due: orderData.balance_due ?? orderData.balanceDue ?? orderData.remaining_amount ?? null
                        });
                        
                        try {
                            const itemTypesRes = await getViewAllItemTypes();
                            const list = itemTypesRes?.data?.item_types || itemTypesRes?.data?.itemTypes || itemTypesRes?.item_types || (Array.isArray(itemTypesRes?.data) ? itemTypesRes.data : []);
                            if (!cancelled) setItemTypes(Array.isArray(list) ? list : []);
                        } catch (e) {}

                        try {
                            const serviceTypesRes = await getViewAllServiceTypes();
                            const list = serviceTypesRes?.data?.service_types || serviceTypesRes?.data?.serviceTypes || serviceTypesRes?.service_types || (Array.isArray(serviceTypesRes?.data) ? serviceTypesRes.data : []);
                            if (!cancelled) setServiceTypes(Array.isArray(list) ? list : []);
                        } catch (e) {}

                        // Fetch collector name for fallback case
                        const collId = orderData.created_by || orderData.user_id;
                        if (collId && !orderData.created_by_name) {
                            try {
                                const userRes = await getUserByIdPublic(collId);
                                if (userRes?.success && Array.isArray(userRes.user) && userRes.user.length > 0) {
                                    const name = userRes.user[0].name;
                                    if (name) {
                                        orderData.created_by_name = name;
                                    }
                                }
                            } catch (e) {
                                console.error("ViewRetailCollectionOrderPublic: Error fetching collector name (fallback):", e);
                            }
                        }
                        
                        return; // Successfully fell back!
                    }
                } catch (fallbackErr) {
                    console.error("Fallback public order view also failed:", fallbackErr);
                }

                if (!cancelled) {
                    const msg = err?.response?.data?.message || err?.message;
                    setError(msg || "Failed to load order. Please check the link and try again.");
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        fetchPublicOrder();

        return () => {
            cancelled = true;
        };
    }, [orderId]);

    const { finalOrder } = useMemo(() => {
        if (!mergedOrder) return {};
        
        let parsedPayment = [];
        if (invoiceDataRaw && Array.isArray(invoiceDataRaw.payment)) {
            parsedPayment = invoiceDataRaw.payment;
        } else if (invoiceDataRaw && typeof invoiceDataRaw.payment === "string" && invoiceDataRaw.payment.trim() !== "") {
            try {
                parsedPayment = JSON.parse(invoiceDataRaw.payment);
                if (!Array.isArray(parsedPayment)) parsedPayment = [];
            } catch (e) {
                console.error("Failed to parse payment", e);
            }
        }
        
        const orderObj = {
            ...mergedOrder,
            payment: parsedPayment,
        };

        return { finalOrder: orderObj };
    }, [invoiceDataRaw, mergedOrder]);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-100">
                <BeatLoader color="#0d9488" size={24} />
            </div>
        );
    }

    if (error || !mergedOrder) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
                <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md text-center">
                    <h1 className="text-xl font-bold text-gray-800 mb-2">Order not found</h1>
                    <p className="text-gray-600">{error || "This order could not be loaded."}</p>
                    <p className="text-sm text-gray-500 mt-4">
                        Please check the link from your message or contact the outlet.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-100 py-4 sm:py-6 px-2 sm:px-4">
            <div className="max-w-4xl mx-auto min-w-0">
                <RetailSalesOrder
                    ref={null}
                    data={{
                        ...finalOrder,
                        discount: finalOrder.discount != null && finalOrder.discount !== ""
                            ? finalOrder.discount
                            : (finalOrder.customer?.discount != null ? `${finalOrder.customer.discount}%` : finalOrder.discount),
                        discount_remark: finalOrder.discount_remark || (finalOrder.customer?.discount != null ? "Loyalty" : finalOrder.discount_remark)
                    }}
                    orderItems={finalOrder.items || []}
                    customer={{
                        customer_id: finalOrder.customer_id,
                        customer_name: finalOrder.customer_name,
                        phone_number: finalOrder.phone_number,
                    }}
                    itemTypes={itemTypes}
                    serviceTypes={serviceTypes}
                    mobileResponsive={true}
                />
            </div>
        </div>
    );
}
