import { useEffect, useState, useMemo, useRef } from "react";
import { useParams } from "react-router-dom";
import { BeatLoader } from "react-spinners";
import { getRetailInvoicesByOrder, getServiceItemsByOrderId, getRetailInvoicesByOrderPublic, getServiceItemsByOrderIdPublic, getAllCustomersPublic, getOrderByIdPublic, getUserByIdPublic } from "../../services/Retail/RetailInvoiceServices";
import { getViewAllItemTypes } from "../../services/Retail/RetailSettingsServices";
import RetailInvoice from "../../components/printables/RetailInvoice";

/**
 * Public invoice view – customer opens the link from the SMS (e.g. /salesCorporate/retail/order/ORDER_NWL_159).
 * Uses the already invoiced bill preview APIs to ensure consistency. No login required.
 */
export default function ViewRetailOrderPublic() {
    const { orderId } = useParams();
    console.log("ViewRetailOrderPublic: render with orderId:", orderId);
    const [invoiceDataRaw, setInvoiceDataRaw] = useState(null); // From getRetailInvoicesByOrder
    const [mergedOrder, setMergedOrder] = useState(null); // From getServiceItemsByOrderId
    const [itemTypes, setItemTypes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [apiBalanceDue, setApiBalanceDue] = useState(null);

    useEffect(() => {
        if (!orderId) {
            setError("Order ID is missing.");
            setLoading(false);
            return;
        }
        let cancelled = false;
        let capturedBalance = null; // Track balance so fallback doesn't overwrite it
        
        const fetchPublicInvoice = async () => {
            try {
                // We'll mimic RetailViewInvoices.jsx logic but passing "public" instead of missing user_id
                // Using a valid string as user_id for public access
                // Use public API to get invoices
                console.log("ViewRetailOrderPublic: Fetching invoices for", orderId);
                const payloadInvoice = { order_id: orderId };
                const invoiceRes = await getRetailInvoicesByOrderPublic(payloadInvoice);
                console.log("ViewRetailOrderPublic: Invoices response", invoiceRes);
                
                if (cancelled) return;
                
                if (!invoiceRes || !invoiceRes.invoices || invoiceRes.invoices.length === 0) {
                    console.warn("ViewRetailOrderPublic: No invoices found");
                    throw new Error("Invoice not found or order not invoiced yet.");
                }

                // Format the invoices array just like RetailViewInvoices
                const formattedInvoices = invoiceRes.invoices.map(item => ({
                    ...item,
                    order_ids: (() => { try { return JSON.parse(item.order_id); } catch { return [item.order_id]; } })(),
                    payment: (() => { try { return typeof item.payment === 'string' ? JSON.parse(item.payment) : item.payment; } catch { return item.payment; } })()
                }));
                const selectedInvoice = formattedInvoices[0];
                setInvoiceDataRaw(selectedInvoice);
                capturedBalance = selectedInvoice.balance_due ?? selectedInvoice.balanceDue ?? selectedInvoice.remaining_amount ?? null;
                setApiBalanceDue(capturedBalance);

                // Now fetch items using getServiceItemsByOrderId based on the first real order ID
                const idList = Array.isArray(selectedInvoice.order_ids) ? selectedInvoice.order_ids : [selectedInvoice.order_ids];
                const firstOrderId = idList[0] || orderId;

                console.log("ViewRetailOrderPublic: Fetching items for", firstOrderId);
                const payloadItems = { order_id: firstOrderId };
                const itemsRes = await getServiceItemsByOrderIdPublic(payloadItems);
                console.log("ViewRetailOrderPublic: Items response", itemsRes);
                
                if (cancelled) return;

                // Extract items from response
                let items = [];
                if (itemsRes?.service_items && Array.isArray(itemsRes.service_items)) items = itemsRes.service_items;
                else if (itemsRes?.items && Array.isArray(itemsRes.items)) items = itemsRes.items;
                else if (Array.isArray(itemsRes)) items = itemsRes;

                // --- Discount Priority Logic ---
                // 1st priority: admin-assigned discount from get-order-by-id-public-view
                // 2nd priority: customer-level discount from get-all-customers-public-view
                let finalDiscount = null;
                try {
                    const orderRes = await getOrderByIdPublic({ user_id: "public", order_id: firstOrderId });
                    const adminDiscount = orderRes?.order?.discount;
                    const isValidDiscount = adminDiscount != null && adminDiscount !== "" && adminDiscount !== "0" && adminDiscount !== 0;
                    if (isValidDiscount) {
                        // Admin-assigned discount — use as-is (e.g. "10%")
                        finalDiscount = String(adminDiscount).trim();
                    } else {
                        // Fall back to customer-level discount
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
                    console.error("ViewRetailOrderPublic: Error fetching discount", discountErr);
                }

                // Build merged order like RetailViewInvoices
                const response = itemsRes || {};
                const orderData = selectedInvoice || {}; // We don't have parent order data here
                
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

                // Update invoiceDataRaw with the correct discount percentage label for RetailInvoice
                if (finalDiscount != null) {
                    setInvoiceDataRaw(prev => ({ ...prev, discount: finalDiscount }));
                }

                let damagedDeduction = 0;
                let returnedDeduction = 0;
                items.forEach(item => {
                    if (item.is_damaged === 1 || item.is_damaged === "1") damagedDeduction += parseFloat(item.price || 0);
                    if (item.is_returned === 1 || item.is_returned === "1") returnedDeduction += parseFloat(item.price || 0);
                });
                merged.damaged_deduction = damagedDeduction;
                merged.returned_deduction = returnedDeduction;
                // Explicitly capture the balance due from all potential fields
                const apiBalance = selectedInvoice.balance_due ?? selectedInvoice.balanceDue ?? selectedInvoice.remaining_amount ?? null;
                selectedInvoice.balance_due = apiBalance;
                merged.balance_due = apiBalance;

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
                        console.error("ViewRetailOrderPublic: Error fetching collector name:", e);
                    }
                }

                // If we get here, we successfully fetched the already-invoiced data
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

            } catch (err) {
                // FALLBACK: If invoice fetch fails, fallback to the pending order API (getViewRetailOrderById)
                console.warn("Invoice fetch failed, falling back to public pending order fetch...", err);
                try {
                    const { getViewRetailOrderById } = await import("../../services/Retail/RetailOrderServices");
                    const fallbackRes = await getViewRetailOrderById({ order_id: orderId }); // using order_id instead of invoice_id since orderId is an order ID!
                    
                    if (cancelled) return;

                    const orderData = fallbackRes?.order ?? (fallbackRes?.order_id != null ? fallbackRes : null);
                    
                    if (orderData) {
                        // If we fall back, we treat orderData as both the invoice info AND the merged items.
                        setInvoiceDataRaw({
                            ...orderData,
                            payment: orderData.payment || [],
                            items: orderData.items || [],
                            balance_due: orderData.balance_due ?? orderData.balanceDue ?? orderData.remaining_amount ?? null
                        });
                        setApiBalanceDue(capturedBalance ?? orderData.balance_due ?? orderData.balanceDue ?? orderData.remaining_amount ?? null);
                        setMergedOrder({
                            ...orderData,
                            balance_due: orderData.balance_due ?? orderData.balanceDue ?? orderData.remaining_amount ?? null
                        });
                        
                        // Try fetching item types
                        try {
                            const itemTypesRes = await getViewAllItemTypes();
                            const list = itemTypesRes?.data?.item_types || itemTypesRes?.data?.itemTypes || itemTypesRes?.item_types || (Array.isArray(itemTypesRes?.data) ? itemTypesRes.data : []);
                            if (!cancelled) setItemTypes(Array.isArray(list) ? list : []);
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
                                console.error("ViewRetailOrderPublic: Error fetching collector name (fallback):", e);
                            }
                        }
                        
                        return; // Successfully fell back!
                    }
                } catch (fallbackErr) {
                    console.error("Fallback public order view also failed:", fallbackErr);
                }

                // If both attempts fail, show the error
                if (!cancelled) {
                    const msg = err?.response?.data?.message || err?.message;
                    setError(msg || "Failed to load order. Please check the link and try again.");
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        fetchPublicInvoice();

        return () => {
            cancelled = true;
        };
    }, [orderId]);

    // Build the exact props needed for <RetailInvoice />
    const { finalData, finalOrder } = useMemo(() => {
        if (!invoiceDataRaw || !mergedOrder) return {};
        
        // Pre-parse payment to ensure it's an array
        let parsedPayment = [];
        if (Array.isArray(invoiceDataRaw.payment)) {
            parsedPayment = invoiceDataRaw.payment;
        } else if (typeof invoiceDataRaw.payment === "string" && invoiceDataRaw.payment.trim() !== "") {
            try {
                parsedPayment = JSON.parse(invoiceDataRaw.payment);
                if (!Array.isArray(parsedPayment)) parsedPayment = [];
            } catch (e) {
                console.error("Failed to parse payment", e);
            }
        }
        
        // If still empty, parsedPayment remains [] (which will result in Amount: 0.00 in the UI)
        // Removed the rootAmount fallback as requested.
        
        // Match the data structure passed in RetailViewInvoices:
        const data = {
            ...invoiceDataRaw,
            invoice_id: invoiceDataRaw.invoice_id || mergedOrder.invoice_id || "",
            order_ids: invoiceDataRaw.order_ids || mergedOrder.order_ids || (invoiceDataRaw.order_id ? [invoiceDataRaw.order_id] : [orderId]),
            collection_date: invoiceDataRaw.collection_date || invoiceDataRaw.created_at || mergedOrder.created_at || "",
            items: mergedOrder.items ?? invoiceDataRaw.items,
            delivery_outlet: mergedOrder.delivery_outlet ?? invoiceDataRaw.delivery_outlet,
            payment: parsedPayment,
            // Use customer discount from mergedOrder (fetched from customer API) — takes priority over raw invoice discount
            discount: mergedOrder.discount ?? invoiceDataRaw.discount,
            // Priority for balance_due: state > raw > fallback keys
            balance_due: invoiceDataRaw.balance_due ?? invoiceDataRaw.balanceDue ?? invoiceDataRaw.remaining_amount ?? mergedOrder.balance_due ?? null
        };

        // Match the order structure passed in RetailViewInvoices: array of items inside merged order
        const orderObj = mergedOrder;

        return { finalData: data, finalOrder: orderObj };
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
                <RetailInvoice
                    ref={null}
                    data={finalData}
                    order={finalOrder}
                    itemTypes={itemTypes}
                    serviceItemsSummary={null}
                    isPublicView={true}
                    apiBalanceDue={apiBalanceDue}
                />
            </div>
        </div>
    );
}
