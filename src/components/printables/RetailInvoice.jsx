import React, { useEffect, useState } from 'react';
import logo from "../../assets/logo.png";
import { getOutletInfoForBranch } from "../../utils/branchFallbacks";
import axios from "axios";
import { getRetailInvoicesByOrder, getAllRetailPendingInvoices, getRetailInvoicesByOrderPublic } from "../../services/Retail/RetailInvoiceServices";

const RetailInvoice = React.forwardRef(({ data, itemTypes, order, serviceItemsSummary, isPublicView, apiBalanceDue }, ref) => {
    const [users, setUsers] = useState([]);
    const [displayInvoiceId, setDisplayInvoiceId] = useState(data?.invoice_id ?? order?.invoice_id ?? "");
    // printed_at from get-all-invoices-by-order — populated only for already-invoiced orders
    const [printedAtFromApi, setPrintedAtFromApi] = useState(null);
    const [displayCollector, setDisplayCollector] = useState("");
    const [publicCollectorName, setPublicCollectorName] = useState("");

    // invoiceCreatedAt priority:
    // 1. data.created_at — explicitly passed by a view page
    // 2. printed_at from the invoice API — for already-invoiced orders (set async after API call)
    // 3. null — falls back to new Date() for new invoice generation
    const invoiceCreatedAt = (() => {
        if (data?.created_at) {
            const d = new Date(data.created_at);
            if (!isNaN(d.getTime())) return d;
        }
        if (printedAtFromApi) return printedAtFromApi;
        return null;
    })();

    // Invoice date = invoice created date when available, else current date (YYYY-MM-DD) — uses LOCAL date to avoid UTC offset issues
    const invoiceDate = (() => {
        const d = invoiceCreatedAt || new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    })();

    // Printed date and time — always uses LOCAL date methods to avoid UTC timezone mismatch
    const printedDate = (() => {
        const d = invoiceCreatedAt || new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    })();
    const printedTime = (() => {
        const d = invoiceCreatedAt || new Date();
        return d.toLocaleTimeString();
    })();

    const orderIdsToUse = (data?.order_ids && data.order_ids.length > 0)
        ? data.order_ids
        : (order?.order_ids && order.order_ids.length > 0)
            ? order.order_ids
            : (order?.order_id ? [order.order_id] : (data?.order_id ? [data.order_id] : []));

    const branchIdToUse = order?.branch_id ?? data?.branch_id ?? (typeof window !== "undefined" ? localStorage.getItem("selectedBranchId") : null);
    const outletInfo = getOutletInfoForBranch(branchIdToUse) ?? {
        name: typeof window !== "undefined" ? localStorage.getItem("selectedBranchName") || "" : "",
        address: "",
        telephone: "",
    };

    const orderItems = (order?.items && Array.isArray(order.items)) ? order.items : (data?.items && Array.isArray(data.items) ? data.items : []);
    // The backend expands items (e.g., quantity 3 becomes 3 rows), but all expanded rows for a single order-entry line share the same item_id!
    // Group by item_id so we recover exactly the original rows the user added (e.g., 4 rows), instead of showing 7 rows.
    const uniqueItemsById = [];
    const seenItemIds = new Set();
    const itemCounts = {};

    orderItems.forEach((item) => {
        // Fallback to a compound key only if item_id is missing
        const idKey = item.item_id || `${item.item_type_id}|${item.remark}|${item.color}|${item.brand}|${item.packing_option}|${item.price}|${item.service_type_id}`;

        if (!seenItemIds.has(idKey)) {
            seenItemIds.add(idKey);
            itemCounts[idKey] = {
                ...item,
                quantity: Number(item.quantity) || 1,
                damaged_quantity: 0,
                returned_quantity: 0
            };
            uniqueItemsById.push(itemCounts[idKey]);
        }

        // Count damages and returns across all items with this ID
        const isItemDamaged = item.is_damaged === 1 || item.is_damaged === true || Number(item.is_damaged) === 1 || item.isDamaged === true || Number(item.damaged) === 1;
        const isReturned = item.is_returned === 1 || item.is_returned === true || Number(item.is_returned) === 1;

        if (isItemDamaged) {
            itemCounts[idKey].damaged_quantity += 1;
        }
        if (isReturned) {
            itemCounts[idKey].returned_quantity += 1;
        }

        // If the item payload explicitly defines returned_quantity/damaged_quantity (already-invoiced summary), prefer these
        if (item.returned_quantity != null && Number(item.returned_quantity) > 0 && !isReturned) {
            itemCounts[idKey].returned_quantity = Math.max(itemCounts[idKey].returned_quantity, Number(item.returned_quantity));
        }
        if (item.damaged_quantity != null && Number(item.damaged_quantity) > 0 && !isItemDamaged) {
            itemCounts[idKey].damaged_quantity = Math.max(itemCounts[idKey].damaged_quantity, Number(item.damaged_quantity));
        }
    });

    const deliveryCharge = Number(data?.delivery_charge) || 0;
    const fromServiceItems = serviceItemsSummary && typeof serviceItemsSummary.totalBeforeDeductions === "number";
    const normVal = (v) => (v != null && v !== "") ? String(v).trim() : "";
    const normPriceVal = (p) => (p != null && p !== "") ? String(parseFloat(Number(p))) : "";

    const formattedItems = uniqueItemsById.map(item => ({ ...item }));

    // Distribute the summary counts to formattedItems ONLY ONCE
    if (fromServiceItems && serviceItemsSummary) {
        const localRetCounts = { ...(serviceItemsSummary.returnedCountByKey || {}) };
        const localDamCounts = { ...(serviceItemsSummary.damagedCountByKey || {}) };

        formattedItems.forEach(item => {
            const itemKey = item.item_id ? String(item.item_id) : `${normVal(item.item_type_id)}|${normVal(item.remark)}|${normVal(item.color)}|${normVal(item.brand)}|${normVal(item.packing_option)}|${normPriceVal(item.price)}|${normVal(item.service_type_id)}`;
            const pieceCap = Number(item.pics_count) > 0 ? Number(item.pics_count) : (Number(item.quantity) || 1);

            let rowRet = 0;
            if (localRetCounts[itemKey] > 0) {
                rowRet = Math.min(localRetCounts[itemKey], pieceCap);
                localRetCounts[itemKey] -= rowRet;
            }
            // Add explicitly from payload if available and larger
            item.returned_quantity = Math.max(item.returned_quantity || 0, rowRet);

            let rowDam = 0;
            if (localDamCounts[itemKey] > 0) {
                rowDam = Math.min(localDamCounts[itemKey], pieceCap);
                localDamCounts[itemKey] -= rowDam;
            }
            item.damaged_quantity = Math.max(item.damaged_quantity || 0, rowDam);
        });
    }
    // Total Amount must match the sum of the table's Total column exactly (uses same pricePerPiece formula as the table rows).
    const totalBeforeDeductions = deliveryCharge + formattedItems.reduce((sum, item) => sum + item.quantity * parseFloat(item.price), 0);
    const totalReady = deliveryCharge + formattedItems.reduce((sum, item) => {
        const picsCount = Number(item.pics_count) || item.quantity;
        const pricePerPiece = (item.quantity * parseFloat(item.price)) / picsCount;
        const damagedAmount = (item.damaged_quantity || 0) * pricePerPiece;
        const returnedAmount = (item.returned_quantity || 0) * pricePerPiece;
        return sum + (item.quantity * parseFloat(item.price)) - damagedAmount - returnedAmount;
    }, 0);
    // Separate deductions matching table's pricePerPiece formula
    const totalDamagedDeduction = formattedItems.reduce((sum, item) => {
        const picsCount = Number(item.pics_count) || item.quantity;
        const pricePerPiece = (item.quantity * parseFloat(item.price)) / picsCount;
        return sum + (item.damaged_quantity || 0) * pricePerPiece;
    }, 0);
    const totalReturnedDeduction = formattedItems.reduce((sum, item) => {
        const picsCount = Number(item.pics_count) || item.quantity;
        const pricePerPiece = (item.quantity * parseFloat(item.price)) / picsCount;
        return sum + (item.returned_quantity || 0) * pricePerPiece;
    }, 0);

    const totalDamagedFromItems = formattedItems.reduce((sum, item) => {
        return sum + (item.damaged_quantity || 0) * parseFloat(item.price);
    }, 0);
    // Already-invoiced: use damaged_deduction by item_id from API first, then invoice/order level, then compute from is_damaged
    const damagedFromDataItemsByItemId = Array.isArray(data?.items)
        ? data.items.reduce((sum, item) => sum + Number(item.damaged_deduction ?? item.damaged_amount ?? item.total_damaged ?? 0), 0)
        : 0;
    const damagedFromData = Number(data?.damaged_deduction ?? data?.total_damaged ?? data?.damaged_amount ?? order?.damaged_deduction ?? order?.total_damaged ?? 0) || 0;
    const damagedFromDataItems = (Array.isArray(data?.items) && totalDamagedFromItems === 0 && damagedFromDataItemsByItemId === 0)
        ? data.items.reduce((sum, item) => {
            const isDamaged = item.is_damaged === 1 || item.is_damaged === true || Number(item.is_damaged) === 1 || item.isDamaged === true || Number(item.damaged) === 1;
            const qty = Number(item.quantity) || 1;
            return sum + (isDamaged ? qty * (parseFloat(item.price) || 0) : 0);
        }, 0)
        : 0;
    const totalDamagedValue = fromServiceItems ? (serviceItemsSummary.damagedDeduction || 0) : (totalDamagedFromItems || damagedFromDataItemsByItemId || damagedFromData || damagedFromDataItems);

    const totalReturnedFromItems = formattedItems.reduce((sum, item) => {
        return sum + (item.returned_quantity || 0) * parseFloat(item.price);
    }, 0);
    // Already-invoiced: use returned_deduction by item from API first, then order level, then compute from is_returned
    const returnedFromDataItemsByItemId = Array.isArray(data?.items)
        ? data.items.reduce((sum, item) => sum + Number(item.returned_deduction ?? item.returned_amount ?? item.total_returned ?? 0), 0)
        : 0;
    const returnedFromData = Number(data?.returned_deduction ?? data?.total_returned ?? data?.returned_amount ?? order?.returned_deduction ?? order?.total_returned ?? 0) || 0;
    const returnedFromDataItems = (Array.isArray(data?.items) && totalReturnedFromItems === 0 && returnedFromDataItemsByItemId === 0)
        ? data.items.reduce((sum, item) => {
            const isReturned = item.is_returned === 1 || item.is_returned === true || Number(item.is_returned) === 1;
            const qty = Number(item.quantity) || 1;
            const retQty = (item.returned_quantity != null && Number(item.returned_quantity) >= 0) ? Math.min(Number(item.returned_quantity), qty) : (isReturned ? 1 : 0);
            return sum + retQty * (parseFloat(item.price) || 0);
        }, 0)
        : 0;
    const totalReturnedValue = fromServiceItems ? (serviceItemsSummary.returnedDeduction || 0) : (totalReturnedFromItems || returnedFromDataItemsByItemId || returnedFromData || returnedFromDataItems);

    // Discount amount (Rs.) for balance calculation. Use data.discount or fallback to order.discount %.
    const discount = (() => {
        if (data?.discount != null && data.discount !== "" && data.discount !== 0) {
            if (data.discount?.toString().trim().endsWith('%')) {
                // totalReady already includes deliveryCharge — do NOT add it again
                return (parseFloat(String(data.discount).replace('%', '').trim()) / 100) * totalReady;
            }
            return parseFloat(data.discount) || 0;
        }
        if (order?.discount != null && order?.discount !== "" && Number(order?.discount) > 0) {
            return totalReady * Number(order.discount) / 100;
        }
        return 0;
    })();

    // Label for "Discount :" row (e.g. "50%" or Rs. amount). Show below Total Amount. Use data.discount or fallback to order/customer.
    const discountLabel = (() => {
        if (data?.discount != null && data.discount !== "" && data.discount !== 0) {
            return data.discount?.toString().trim().endsWith('%')
                ? `${String(data.discount).replace('%', '').trim()}%`
                : `Rs. ${Number(discount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        }
        if (order?.discount != null && order?.discount !== "" && Number(order?.discount) > 0) {
            return `${order.discount}%`;
        }
        return null;
    })();

    // Only sum payments with a selected payment_method (matches bill preview logic)
    const totalPaid = (Array.isArray(data?.payment) ? data.payment : [])
        .filter(p => p.payment_method !== "" && p.payment_method != null)
        .reduce((sum, p) => {
            const amount = p.paid_amount;
            if (amount === "" || amount === null || amount === undefined) return sum;
            const n = Number(amount);
            return sum + (isNaN(n) ? 0 : Math.max(0, n));
        }, 0);

    // Use the balance_due from API ONLY for the public view path to avoid affecting internal views.
    const isPublic = isPublicView || (typeof window !== "undefined" && window.location.pathname.includes("/salesCorporate/retail/order/"));

    // Calculate Advanced Amount for Display (Original Advance only)
    const displayAdvance = isPublic 
        ? (Number(data?.advanced_payment) || Number(order?.advance_payment) || 0)
        : (Number(order?.advance_payment) || 0);

    // amountDue mirrors the bill preview formula exactly
    const amountDue = Math.round((totalReady - displayAdvance - Number(data.gift_voucher_amount || 0) - discount) * 100) / 100;
    const balance = Math.round((amountDue - totalPaid) * 100) / 100;

    // Priority: Explicit prop > data > order
    const balanceFromApi = apiBalanceDue ?? data?.balance_due ?? order?.balance_due ?? data?.balanceDue ?? order?.balanceDue ?? data?.remaining_amount ?? order?.remaining_amount;
    
    // Show the EXACT value from the API without any calculation for the public view or already invoiced bills.
    // If the value is > 0, prepend a minus sign as requested.
    const isValidApiBalance = balanceFromApi != null && balanceFromApi !== "" && !isNaN(parseFloat(balanceFromApi));
    const displayBalance = ((isPublic || !!(data?.invoice_id || order?.invoice_id)) && isValidApiBalance) 
        ? (parseFloat(balanceFromApi) > 0 ? `-${parseFloat(balanceFromApi).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : parseFloat(balanceFromApi).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })) 
        : balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });


    const splitItems = (items, maxPerPage) => {
        const pages = [];
        for (let i = 0; i < items?.length; i += maxPerPage) {
            pages.push(items.slice(i, i + maxPerPage));
        }
        return pages;
    };

    const itemPages = splitItems(formattedItems, 8);
    const showSummaryOnNextPage = itemPages[itemPages?.length - 1]?.length > 8;
    const showOnNextPage = itemPages[itemPages?.length - 1]?.length > 8;

    // Use invoice_id from data/order when provided (e.g. after print-invoice create).
    // For already-invoiced orders: fetch by order via get-all-invoices-by-order to also get printed_at.
    // For pending (not yet invoiced) orders: get invoice_id from get-all-pending-invoice-orders API.
    useEffect(() => {
        const fromProps = data?.invoice_id ?? order?.invoice_id;
        // Set invoice_id immediately from props so the display doesn't wait for the API
        if (fromProps != null && fromProps !== "") {
            setDisplayInvoiceId(String(fromProps));
        }
        const orderIds = orderIdsToUse;
        const userId = typeof window !== "undefined" ? localStorage.getItem("userId") : null;
        const branchId = order?.branch_id ?? data?.branch_id ?? (typeof window !== "undefined" ? localStorage.getItem("selectedBranchId") : null);
        const isPublic = !userId || userId === "public";

        if (!orderIds || orderIds.length === 0) return;
        const orderIdSet = new Set(Array.isArray(orderIds) ? orderIds : [orderIds]);
        let cancelled = false;
        const fetchInvoiceId = async () => {
            try {
                // Always call get-all-invoices-by-order to extract printed_at for already-invoiced orders
                const orderIdFirst = Array.isArray(orderIds) ? orderIds[0] : orderIds;
                
                let byOrderResponse;
                if (isPublic) {
                    byOrderResponse = await getRetailInvoicesByOrderPublic({ order_id: orderIdFirst });
                } else {
                    byOrderResponse = await getRetailInvoicesByOrder({ user_id: userId, order_id: orderIdFirst });
                }
                const invoices = byOrderResponse?.invoices ?? [];
                const first = invoices[0];
                const idFromOrder = first?.invoice_id ?? first?.invoice_Id;
                if (idFromOrder != null && idFromOrder !== "") {
                    if (!cancelled) setDisplayInvoiceId(String(idFromOrder));
                    // Use printed_at from the invoice as the invoice date/time
                    const printed = first?.printed_at;
                    if (printed && !cancelled) {
                        const d = new Date(printed);
                        if (!isNaN(d.getTime())) setPrintedAtFromApi(d);
                    }
                    // Extract collector name if available
                    if (first?.collector && !cancelled) {
                        setDisplayCollector(String(first.collector));
                    }
                    return;
                }
                // Invoice not found in API — if invoice_id was already from props, stop here
                if (fromProps != null && fromProps !== "") return;
                // 2) Pending order: get invoice_id from get-all-pending-invoice-orders (userId only or userId + branchId)
                const pendingResponse = await getAllRetailPendingInvoices(userId, branchId || undefined);
                const pendingList = pendingResponse?.data?.pending_invoice_orders ?? [];
                const ourOrder = pendingList.find((o) => o && orderIdSet.has(o.order_id));
                const idFromPending = ourOrder?.invoice_id ?? ourOrder?.invoice_Id;
                if (idFromPending != null && idFromPending !== "") {
                    if (!cancelled) setDisplayInvoiceId(String(idFromPending));
                    return;
                }
                const nextFromData = pendingResponse?.data?.next_invoice_id ?? pendingResponse?.data?.invoice_id;
                if (nextFromData != null && nextFromData !== "" && !cancelled) {
                    setDisplayInvoiceId(String(nextFromData));
                    return;
                }
                if (!cancelled && (!fromProps || fromProps === "")) setDisplayInvoiceId("—");
            } catch (err) {
                console.error("Error fetching invoice id:", err);
                if (!cancelled && (!fromProps || fromProps === "")) setDisplayInvoiceId("—");
            }
        };
        fetchInvoiceId();
        return () => { cancelled = true; };
    }, [data?.invoice_id, data?.order_ids, data?.branch_id, order?.invoice_id, order?.branch_id]);

    // Fetch all users to map user_id to username
    useEffect(() => {
        const fetchUsers = async () => {
            try {
                const response = await axios.get(`${(import.meta.env.VITE_SERVER_API_ADMIN || "").trim().replace(/\/$/, "")}/user/getAllUsers`);
                // Handle different response structures
                const usersList = response?.data?.allUsers || response?.data?.users || response?.allUsers || [];
                if (Array.isArray(usersList) && usersList.length > 0) {
                    setUsers(usersList);
                    console.log("Fetched users:", usersList.length);
                }
            } catch (error) {
                console.error("Error fetching users:", error);
            }
        };
        fetchUsers();
    }, []);

    // Fetch collector name for public view if it's an ID
    useEffect(() => {
        const sourceData = order || data;
        const createdById = sourceData?.created_by || sourceData?.user_id;
        if (!createdById) return;

        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(createdById));
        const isNumericId = /^\d+$/.test(String(createdById));
        
        if (isUuid || isNumericId) {
            let cancelled = false;
            const fetchName = async () => {
                try {
                    const baseUrl = (import.meta.env.VITE_SERVER_API || "").trim();
                    const response = await axios.get(`${baseUrl}/public-view/get-user-by-id-public-view/${createdById}`);
                    if (!cancelled && response.data?.success && Array.isArray(response.data.user) && response.data.user[0]) {
                        const name = response.data.user[0].name;
                        if (name) {
                            setPublicCollectorName(name);
                        }
                    }
                } catch (e) {
                    console.error("RetailInvoice: Error fetching public collector name", e);
                }
            };
            fetchName();
            return () => { cancelled = true; };
        }
    }, [data?.created_by, data?.user_id, order?.created_by, order?.user_id]);

    // Get collector username from user_id - same logic as collection order (RetailSalesOrder)
    const getCollectorName = () => {
        // Prioritize name fetched from public API
        if (publicCollectorName) return publicCollectorName;

        // Prioritize "collector" from local state (fetched by this component)
        if (displayCollector) return displayCollector;

        // Prioritize "collector" field if present in props
        if (data?.collector || order?.collector) {
            return data?.collector || order?.collector;
        }

        // Invoice has both order and data props. Check order first (merged order data), then data
        const sourceData = order || data;

        // Then check for other name fields
        if (sourceData?.created_by_name || sourceData?.created_by_user_name || sourceData?.user_name) {
            return sourceData.created_by_name || sourceData.created_by_user_name || sourceData.user_name;
        }

        // Check multiple possible field names for user_id (created_by, user_id, etc.)
        const createdById = sourceData?.created_by || sourceData?.user_id;

        if (createdById && users.length > 0) {
            // Try multiple field names for matching (user_id, id)
            const user = users.find(u =>
                String(u.user_id) === String(createdById) ||
                String(u.id) === String(createdById)
            );

            // Try multiple field names for name (name, username, user_name)
            if (user) {
                const userName = user.name || user.username || user.user_name || user.userName;
                if (userName) {
                    return userName;
                }
            }
        }

        // DO NOT fallback to current user - return empty or the ID if we can't find the user
        // This ensures we show the actual order creator, not the current logged-in user
        return createdById ? `User ${createdById}` : "";
    };

    return (
        <div>
            <div className="print:hidden flex flex-col bg-white w-full p-4 sm:p-10 rounded-xl my-3">
                {/* Header Section */}
                <div className="flex flex-col sm:flex-row gap-y-4 justify-between">
                    <div className="flex flex-col">
                        <img src={logo} className="w-32 object-contain" />
                        <div className="text-sm mt-2 text-black/80">
                            <p>Outlet Name : {outletInfo?.name || "—"}</p>
                            <p>Address     : {outletInfo?.address || "—"}</p>
                            <p>Telephone   : {outletInfo?.telephone || "—"}</p>
                        </div>
                    </div>

                    <div className="flex flex-col text-xs items-start sm:items-end">
                        <div className="flex flex-row gap-x-5">
                            <div className="flex flex-row gap-x-2">
                                <p className="font-semibold">Printed Date :</p>
                                <p className="">{printedDate}</p>
                            </div>

                            <div className="flex flex-row gap-x-2">
                                <p className="font-semibold">Time :</p>
                                <p className="">{printedTime}</p>
                            </div>

                            <div className="flex flex-row gap-x-2">
                                <p className="font-semibold">Employee ID :</p>
                                <p className="">{localStorage.getItem("employeeId") || "—"}</p>
                            </div>
                        </div>
                        {(order?.redo_order_reference || Number(order?.total_amount) === 0) && (
                            <div className="flex flex-row gap-x-2 mt-1">
                                <p className="font-bold text-base">REDO{order.redo_order_reference ? `: ${order.redo_order_reference}` : ""}</p>
                            </div>
                        )}
                    </div>
                </div>

                <h1 className="font-bold text-center text-2xl">Invoice</h1>

                <div className='flex flex-col md:flex-row gap-y-4 justify-between mt-5 text-xs sm:text-sm'>
                    <div className='border border-black/20 grid grid-cols-2 gap-x-3 p-1'>
                        <p className='font-semibold'>INVOICE ID:</p>
                        <p>{displayInvoiceId || "—"}</p>
                        <p className='font-semibold'>ORDER NO:</p>
                        <p>{orderIdsToUse.join(",") || "—"}</p>
                        <p className='font-semibold'>CUSTOMER ID:</p>
                        <p className='uppercase'>{data.customer_id}</p>
                        <p className='font-semibold'>CUSTOMER NAME:</p>
                        <p className='uppercase'>{data.customer_name}</p>
                        <p className='font-semibold'>INVOICE DATE:</p>
                        <p>{invoiceDate}</p>
                        <p className='font-semibold'>PHONE NO:</p>
                        <p>{data.phone_number}</p>
                    </div>

                    <div className='border border-black/20 grid grid-cols-2 gap-x-3 p-1'>
                        <p className='font-semibold'>COLLECTOR:</p>
                        <p className='uppercase'>{getCollectorName()}</p>
                        <p className='font-semibold'>DELIVERY TYPE:</p>
                        <p className='uppercase'>{data.delivery_type}</p>
                        <p className='font-semibold'>DELIVERY OUTLET:</p>
                        <p className='uppercase'>
                            {data?.delivery_outlet || order?.delivery_outlet || localStorage.getItem("selectedBranchName") || "N/A"}
                        </p>
                        <p className='font-semibold'>COLLECTION DATE:</p>
                        <p className='uppercase'>
                            {data.collection_date
                                ? new Date(data.collection_date).toISOString().split("T")[0]
                                : ""}
                        </p>
                        <p className='font-semibold'>DELIVERY DATE:</p>
                        <p className="uppercase">
                            {data.delivery_date
                                ? new Date(data.delivery_date).toISOString().split("T")[0]
                                : ""}
                        </p>
                        {/* hide printed date and time */}
                        {/* <p className='font-semibold'>PRINTED DATE:</p>
                        <p>{printedDate}</p>
                        <p className='font-semibold'>TIME:</p>
                        <p>{printedTime}</p> */}
                    </div>
                </div>

                {/* Body Section */}
                {/* <p className='mt-5 font-semibold'>ITEMS</p> */}
                <div className="overflow-x-auto w-full mt-5">
                    <table className='border border-black/20 uppercase w-full min-w-[700px]'>
                    <thead className='border border-black/20'>
                        <tr>
                            <th className='border-r border-black/20'>No</th>
                            <th className='border-r border-black/20'>Item</th>
                            <th className='border-r border-black/20'>Color</th>
                            <th className='border-r border-black/20'>Brand</th>
                            <th className='border-r border-black/20'>Remark</th>
                            <th className='border-r border-black/20'>Packing</th>
                            <th className='border-r border-black/20'>Qty</th>
                            <th className='border-r border-black/20'>Pcs</th>
                            <th className='border-r border-black/20'>Damaged</th>
                            <th className='border-r border-black/20'>Returned</th>
                            <th className='border-r border-black/20'>Service</th>
                            <th className='border-r border-black/20'>Price</th>
                            <th>Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        {formattedItems.map((item, index) => {
                            const rowReturned = item.returned_quantity || 0;
                            const rowDamaged = item.damaged_quantity || 0;
                            const chargeableQty = item.quantity - rowDamaged - rowReturned;
                            const chargeablePcs = item.pics_count - rowDamaged - rowReturned;
                            const pricePerPiece = (item.quantity * parseFloat(item.price)) / (Number(item.pics_count) || item.quantity);
                            const damagedAmount = rowDamaged * pricePerPiece;
                            const returnedAmount = rowReturned * pricePerPiece;
                            const totalForRow = Math.max(0, (item.quantity * parseFloat(item.price)) - damagedAmount - returnedAmount);
                            const displayQty = item.quantity != null ? (Number.isFinite(Number(item.quantity)) ? parseFloat(Number(item.quantity).toFixed(2)) : item.quantity) : "-";
                            const displayPcs = item.pics_count != null ? (Number.isFinite(Number(item.pics_count)) ? parseFloat(Number(item.pics_count).toFixed(2)) : item.pics_count) : "-";
                            const displayDamaged = rowDamaged > 0 ? (Number.isFinite(Number(rowDamaged)) ? parseFloat(Number(rowDamaged).toFixed(2)) : rowDamaged) : "-";
                            const displayReturned = rowReturned > 0 ? (Number.isFinite(Number(rowReturned)) ? parseFloat(Number(rowReturned).toFixed(2)) : rowReturned) : "-";
                            return (
                                <tr key={index} className='text-center text-xs sm:text-sm'>
                                    <td className='border-r border-black/20'>{index + 1}</td>
                                    <td className='border-r border-black/20'>{itemTypes?.find(type => type.item_type_id === item.item_type_id)?.item_type_name || "-"}</td>
                                    <td className='border-r border-black/20'>{item.color}</td>
                                    <td className='border-r border-black/20'>{item.brand}</td>
                                    <td className='border-r border-black/20'>{item.remark}</td>
                                    <td className='border-r border-black/20'>{item.packing_option}</td>
                                    <td className='border-r border-black/20'>{displayQty}</td>
                                    <td className='border-r border-black/20'>{displayPcs}</td>
                                    <td className='border-r border-black/20'>{displayDamaged}</td>
                                    <td className='border-r border-black/20'>{displayReturned}</td>
                                    <td className='border-r border-black/20'>{item.service_type_id === 1 ? "WASHING" : item.service_type_id === 2 ? "PRESSING" : "DRY CLEAN"}</td>
                                    <td className='border-r border-black/20'>Rs {Number(item.price).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                    <td>Rs {totalForRow.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                </tr>
                            );
                        })}
                        <tr className='text-center text-xs sm:text-sm font-bold'>
                            <td colSpan={6} className='border-r border-t border-black/20 text-right pr-2'>TOTAL</td>
                            <td className='border-r border-t border-black/20'>{formattedItems.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0)}</td>
                            <td className='border-r border-t border-black/20'>{formattedItems.reduce((sum, item) => sum + (Number(item.pics_count) || 0), 0)}</td>
                            <td className='border-r border-t border-black/20'></td>
                            <td className='border-r border-t border-black/20'></td>
                            <td className='border-r border-t border-black/20'></td>
                            <td className='border-r border-t border-black/20'></td>
                            <td className='border-t border-black/20'></td>
                        </tr>
                    </tbody>
                </table>
                </div>

                {/* <p className='mt-5 font-semibold'>ITEMS PENDING IN PRODUCTION:</p>
                <table className='border border-black/20 uppercase'>
                    <thead className='border border-black/20'>
                        <tr>
                            <th className='border-r border-black/20'>No</th>
                            <th className='border-r border-black/20'>Item</th>
                            <th className='border-r border-black/20'>Color</th>
                            <th className='border-r border-black/20'>Brand</th>
                            <th className='border-r border-black/20'>Remark</th>
                            <th className='border-r border-black/20'>Packing</th>
                            <th className='border-r border-black/20'>Qty</th>
                            <th className='border-r border-black/20'>Service</th>
                            <th>Price</th>
                        </tr>
                    </thead>
                    <tbody>
                        {uniquePendingItems.map((item, index) => (
                            <tr key={index} className='text-center'>
                                <td className='border-r border-black/20'>{index + 1}</td>
                                <td className='border-r border-black/20'>{itemTypes.find(type => type.item_type_id === item.item_type_id)?.item_type_name}</td>
                                <td className='border-r border-black/20'>{item.color}</td>
                                <td className='border-r border-black/20'>{item.brand}</td>
                                <td className='border-r border-black/20'>{item.remark}</td>
                                <td className='border-r border-black/20'>{item.packing_option}</td>
                                <td className='border-r border-black/20'>{item.quantity}</td>
                                <td className='border-r border-black/20'>{item.service_type_id === 1 ? "WASHING" : item.service_type_id === 2 ? "PRESSING" : "DRY CLEAN"}</td>
                                <td>Rs {(Number(item.price) * item.quantity).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            </tr>
                        ))}
                    </tbody>
                </table> */}

                {/* Summary Section */}
                {/* {data?.delivery_charge > 0 &&
                    <div className='flex flex-row justify-between mt-5'>
                        <p>Delivery Charge</p>
                        <p>Rs. {data.delivery_charge.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                    </div>
                }
                <div className={`flex flex-row justify-between ${data?.delivery_charge > 0 ? "" : "mt-5"}`}>
                    <p>Total Amount</p>
                    <p>Rs {totalReady.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                </div>
                <div className='flex flex-row justify-between'>
                    <p>Advanced Amount</p>
                    <p>Rs {Number(data?.advanced_payment).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                </div>
                {data?.gift_vouchers?.length > 0 &&
                    <div className='flex flex-row justify-between'>
                        <p>Voucher Redeemed</p>
                        <p>Rs {Number(data?.gift_voucher_amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                    </div>
                }
                {/* <div className='flex flex-row justify-between'>
                    <p>Payment Method</p>
                    <p>{data?.payment_method}</p>
                </div> */}
                {/* 
                {data?.discount !== null && data?.discount !== "" && data?.discount !== 0 &&
                    <div className='flex flex-row justify-between'>
                        <p>Discount</p>
                        <p>Rs {Number(discount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                    </div>
                }
                {data?.payment.map((p, index) => (
                    <div key={index}>
                        <div className='flex flex-row justify-between'>
                            <p>Payment Method</p>
                            <p>{p.payment_method}</p>
                        </div>
                        <div className='flex flex-row justify-between'>
                            <p>Amount</p>
                            <p>Rs. {Number(p.paid_amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                        </div>
                    </div>
                ))}
                <div className='flex flex-row justify-between font-bold'>
                    <p>Balance Due</p>
                    <p>
                        Rs {Number(balance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                </div> */}
                <div className='grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-5 mt-5 text-sm sm:text-base'>
                    <div className='flex flex-col justify-top'>
                        {data?.delivery_charge > 0 &&
                            <div className='flex flex-row justify-between'>
                                <p>Delivery Charge</p>
                                <p>Rs. {data.delivery_charge.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                            </div>
                        }

                        <div className='flex flex-row justify-between'>
                            <p>{(totalDamagedDeduction > 0 || totalReturnedDeduction > 0) ? "Total Amount (Before Deductions)" : "Total Amount"}</p>
                            <p>Rs {totalBeforeDeductions.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                        </div>
                        {totalDamagedDeduction > 0 && (
                            <div className='flex flex-row justify-between text-red-600'>
                                <p>Damaged Items Deduction</p>
                                <p>- Rs {totalDamagedDeduction.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                            </div>
                        )}
                        {totalReturnedDeduction > 0 && (
                            <div className='flex flex-row justify-between text-red-600'>
                                <p>Returned Items Deduction</p>
                                <p>- Rs {totalReturnedDeduction.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                            </div>
                        )}
                        {(totalDamagedDeduction > 0 || totalReturnedDeduction > 0) && (
                            <div className='flex flex-row justify-between font-bold'>
                                <p>Total Amount</p>
                                <p>Rs {totalReady.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                            </div>
                        )}
                        <div className='flex flex-row justify-between'>
                            <p>Discount :</p>
                            <p>{discountLabel ?? "—"}</p>
                        </div>
                        {(discountLabel || (data?.discount != null && data.discount !== "" && data.discount !== 0)) && (
                            <div className='flex flex-row justify-between'>
                                <p>Discount Amount</p>
                                <p>Rs {(Number(discount) || (order?.discount != null && order?.discount !== "" ? totalReady * Number(order.discount) / 100 : 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                            </div>
                        )}
                        <div className='flex flex-row justify-between'>
                            <p>Advanced Amount</p>
                            <p>Rs {Number(displayAdvance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                        </div>
                        {data?.gift_vouchers?.length > 0 &&
                            <div className='flex flex-row justify-between'>
                                <p>Voucher Redeemed</p>
                                <p>Rs {Number(data?.gift_voucher_amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                            </div>
                        }
                        {/* <div className='flex flex-row justify-between'>
                    <p>Payment Method</p>
                    <p>{data?.payment_method}</p>
                </div> */}
                    </div>
                    <div className='flex flex-col'>
                        <div className='flex flex-col'>
                            <div className='flex flex-row justify-between'>
                                <p>Payment Method</p>
                                <p>{Array.isArray(data?.payment) ? data.payment.map(p => p.payment_method).join(', ') : (data?.payment_method || '—')}</p>
                            </div>
                            <div className='flex flex-row justify-between'>
                                <p>Amount</p>
                                <p>Rs. {totalPaid.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                            </div>
                        </div>
                        <div className='flex flex-row justify-between font-bold mt-2 md:mt-0'>
                            <p>Balance Due</p>
                            <p>
                                Rs {displayBalance}
                            </p>
                        </div>
                    </div>
                </div>
                <div className='flex flex-col justify-between font-bold mt-8 text-sm'>
                    <p>NOTES</p>
                    <p className='font-normal'>{data.notes}</p>
                </div>

                <div className='flex flex-col justify-between font-bold text-sm'>
                    <p>TERMS & CONDITIONS</p>
                    <p className='font-normal'>{data.terms_and_conditions}</p>
                </div>

                <div className='flex flex-col text-xs items-center text-center mt-8'>
                    <p className='font-semibold'>"THIS IS SYSTEM GENERATED"</p>
                    <p className='font-semibold text-sm'>CL Solutions (PVT) LTD</p>
                    <p>Registered address:583/71, Augustine Premathirathne Mawatha, Liyanagemulla, Seeduwa</p>
                    <p>Laundry facility: 391,Avissawella Road,Wellampitiya</p>
                    <div className='flex flex-col sm:flex-row items-center gap-1 mt-1'>
                        <p>TEL: 94 114 701 566,</p>
                        <p>EMAIL: info@sparklelaundry.lk,</p>
                        <p>WEB : www.sparklelaundry.lk</p>
                    </div>
                    <div className='flex flex-row justify-between w-full mt-4'>
                        <p></p>
                        <p className="ms-auto">POWERED BY CEYLONX CORPORATION</p>
                    </div>
                </div>
            </div>

            {/* Print */}
            <div ref={ref} id="print-section" className="hidden print:flex print-container flex-col w-full pt-3 px-3 a5-print">
                {itemPages.map((pageItems, pageIndex) => {
                    const isLastPage = pageIndex === itemPages.length - 1;
                    const isSinglePageInvoice = itemPages.length === 1 && !showOnNextPage;
                    return (
                        <div key={pageIndex} className={`flex flex-col aspect-print h-full print-page-fixed-footer pt-1 px-2 ${isSinglePageInvoice ? "print-invoice-single-page" : ""}`}>
                            <div className="print-body-fixed flex flex-col flex-1 min-h-0">
                                {/* Header Section */}
                                <div className="relative flex flex-row items-start justify-between">
                                    <div className="flex flex-col me-auto">
                                        <img src={logo} className="w-32 object-contain" />
                                        <div className="text-sm mt-2 text-black/80">
                                            <p>Outlet Name : {outletInfo?.name || "—"}</p>
                                            <p>Address     : {outletInfo?.address || "—"}</p>
                                            <p>Telephone   : {outletInfo?.telephone || "—"}</p>
                                        </div>
                                    </div>

                                    <h1 className="absolute top-0 left-1/2 transform -translate-x-1/2 mt-4 font-bold text-center text-xl">Invoice</h1>

                                    <div className="flex flex-col text-xxs items-end mt-4">
                                        <div className="flex flex-row gap-x-5">
                                            <div className="flex flex-row gap-x-2">
                                                <p className="font-semibold">Printed Date :</p>
                                                <p className="">{printedDate}</p>
                                            </div>

                                            <div className="flex flex-row gap-x-2">
                                                <p className="font-semibold">Time :</p>
                                                <p className="">{printedTime}</p>
                                            </div>
                                        </div>
                                        <div className="flex flex-row gap-x-2 mt-1">
                                            <p className="font-semibold">Employee ID :</p>
                                            <p className="">{localStorage.getItem("employeeId") || "—"}</p>
                                        </div>
                                        <div className="flex flex-row gap-x-2 mt-1">
                                            <p className="font-bold">{Number(data?.print_count || order?.print_count || 0) === 0 ? "ORIGINAL" : `COPY - ${data?.print_count || order?.print_count}`}</p>
                                        </div>
                                        {(order?.redo_order_reference || Number(order?.total_amount) === 0) && (
                                            <div className="flex flex-row gap-x-2 mt-1">
                                                <p className="font-bold text-base">REDO{order?.redo_order_reference ? `: ${order?.redo_order_reference}` : ""}</p>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className='flex flex-row justify-between mt-1 text-xs'>
                                    <div className='border border-black/20 grid grid-cols-2 gap-x-3 p-1'>
                                        <p className='font-semibold'>INVOICE ID:</p>
                                        <p>{displayInvoiceId || "—"}</p>
                                        <p className='font-semibold'>ORDER NO:</p>
                                        <p>{orderIdsToUse.join(",") || "—"}</p>
                                        <p className='font-semibold'>CUSTOMER ID:</p>
                                        <p className='uppercase'>{data.customer_id}</p>
                                        <p className='font-semibold'>CUSTOMER NAME:</p>
                                        <p className='uppercase'>{data.customer_name}</p>
                                        <p className='font-semibold'>INVOICE DATE:</p>
                                        <p>{invoiceDate}</p>
                                        <p className='font-semibold'>PHONE NO:</p>
                                        <p>{data.phone_number}</p>
                                    </div>

                                    <div className='border border-black/20 grid grid-cols-2 gap-x-3 p-1'>
                                        <p className='font-semibold'>COLLECTOR:</p>
                                        <p className='uppercase'>{getCollectorName()}</p>
                                        <p className='font-semibold'>DELIVERY TYPE:</p>
                                        <p className='uppercase'>{data.delivery_type}</p>
                                        <p className='font-semibold'>DELIVERY OUTLET:</p>
                                        <p className='uppercase'>{data?.delivery_outlet || order?.delivery_outlet || (typeof localStorage !== "undefined" ? localStorage.getItem("selectedBranchName") : null) || "N/A"}</p>
                                        <p className='font-semibold'>COLLECTION DATE:</p>
                                        <p className='uppercase'>{data.collection_date ? new Date(data.collection_date).toISOString().split("T")[0] : ""}</p>
                                        <p className='font-semibold'>DELIVERY DATE:</p>
                                        <p className="uppercase">
                                            {data.delivery_date ? new Date(data.delivery_date).toISOString().split("T")[0] : ""}
                                        </p>
                                        {/* hide printed date and time */}
                                        {/* <p className='font-semibold'>PRINTED DATE:</p>
                                        <p>{printedDate}</p>
                                        <p className='font-semibold'>TIME:</p>
                                        <p>{printedTime}</p> */}
                                    </div>
                                </div>

                                {/* Body Section */}
                                {/* {pageItems.filter(o => o.status === "Received").length > 0 &&
                                <p className='mt-3 font-semibold text-sm'>ITEMS</p>
                            } */}
                                {pageItems.length > 0 &&
                                    <table className='border border-black/20 uppercase text-xs mt-1'>
                                        <thead className='border border-black/20'>
                                            <tr>
                                                <th className='border-r border-black/20'>No</th>
                                                <th className='border-r border-black/20'>Item</th>
                                                <th className='border-r border-black/20'>Color</th>
                                                <th className='border-r border-black/20'>Brand</th>
                                                <th className='border-r border-black/20'>Remark</th>
                                                <th className='border-r border-black/20'>Packing</th>
                                                <th className='border-r border-black/20'>Qty</th>
                                                <th className='border-r border-black/20'>Pcs</th>
                                                <th className='border-r border-black/20'>Damaged</th>
                                                <th className='border-r border-black/20'>Returned</th>
                                                <th className='border-r border-black/20'>Service</th>
                                                <th className='border-r border-black/20'>Price</th>
                                                <th>Total</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {pageItems.map((item, index) => {
                                                const rowReturnedP = item.returned_quantity || 0;
                                                const rowDamagedP = item.damaged_quantity || 0;
                                                const picsCountP = Number(item.pics_count) || item.quantity;
                                                const pricePerPieceP = (item.quantity * parseFloat(item.price)) / picsCountP;
                                                const damagedAmountP = rowDamagedP * pricePerPieceP;
                                                const returnedAmountP = rowReturnedP * pricePerPieceP;
                                                const totalForRow = Math.max(0, (item.quantity * parseFloat(item.price)) - damagedAmountP - returnedAmountP);
                                                const displayQty = item.quantity != null ? (Number.isFinite(Number(item.quantity)) ? parseFloat(Number(item.quantity).toFixed(2)) : item.quantity) : "-";
                                                const displayPcs = item.pics_count != null ? (Number.isFinite(Number(item.pics_count)) ? parseFloat(Number(item.pics_count).toFixed(2)) : item.pics_count) : "-";
                                                const displayDamaged = rowDamagedP > 0 ? (Number.isFinite(Number(rowDamagedP)) ? parseFloat(Number(rowDamagedP).toFixed(2)) : rowDamagedP) : "-";
                                                const displayReturned = rowReturnedP > 0 ? (Number.isFinite(Number(rowReturnedP)) ? parseFloat(Number(rowReturnedP).toFixed(2)) : rowReturnedP) : "-";
                                                return (
                                                    <tr key={index} className='text-center'>
                                                        <td className='border-r border-black/20'>{(pageIndex * 8) + index + 1}</td>
                                                        <td className='border-r border-black/20'>{itemTypes?.find(type => type.item_type_id === item.item_type_id)?.item_type_name || "-"}</td>
                                                        <td className='border-r border-black/20'>{item.color}</td>
                                                        <td className='border-r border-black/20'>{item.brand}</td>
                                                        <td className='border-r border-black/20'>{item.remark}</td>
                                                        <td className='border-r border-black/20'>{item.packing_option}</td>
                                                        <td className='border-r border-black/20'>{displayQty}</td>
                                                        <td className='border-r border-black/20'>{displayPcs}</td>
                                                        <td className='border-r border-black/20'>{displayDamaged}</td>
                                                        <td className='border-r border-black/20'>{displayReturned}</td>
                                                        <td className='border-r border-black/20'>{item.service_type_id === 1 ? "WASHING" : item.service_type_id === 2 ? "PRESSING" : "DRY CLEAN"}</td>
                                                        <td className='border-r border-black/20'>Rs {Number(item.price).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                                        <td>Rs {totalForRow.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                                    </tr>
                                                );
                                            })}
                                            <tr className='text-center font-bold'>
                                                <td colSpan={6} className='border-r border-t border-black/20 text-right pr-2'>TOTAL</td>
                                                <td className='border-r border-t border-black/20'>{pageItems.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0)}</td>
                                                <td className='border-r border-t border-black/20'>{pageItems.reduce((sum, item) => sum + (Number(item.pics_count) || 0), 0)}</td>
                                                <td className='border-r border-t border-black/20'></td>
                                                <td className='border-r border-t border-black/20'></td>
                                                <td className='border-r border-t border-black/20'></td>
                                                <td className='border-r border-t border-black/20'></td>
                                                <td className='border-t border-black/20'></td>
                                            </tr>
                                        </tbody>
                                    </table>
                                }

                                {/* {pageItems.filter(o => o.status === "Pending").length > 0 &&
                                <p className='mt-3 font-semibold text-sm'>ITEMS PENDING IN PRODUCTION:</p>
                            }
                            {pageItems.filter(o => o.status === "Pending").length > 0 &&
                                <table className='border border-black/20 uppercase text-xs'>
                                    <thead className='border border-black/20'>
                                        <tr>
                                            <th className='border-r border-black/20'>No</th>
                                            <th className='border-r border-black/20'>Item</th>
                                            <th className='border-r border-black/20'>Color</th>
                                            <th className='border-r border-black/20'>Brand</th>
                                            <th className='border-r border-black/20'>Remark</th>
                                            <th className='border-r border-black/20'>Packing</th>
                                            <th className='border-r border-black/20'>Qty</th>
                                            <th className='border-r border-black/20'>Service</th>
                                            <th>Price</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {pageItems.filter(o => o.status === "Pending").map((item, index) => (
                                            <tr key={index} className='text-center'>
                                                <td className='border-r border-black/20'>{index + 1}</td>
                                                <td className='border-r border-black/20'>{itemTypes?.find(type => type.item_type_id === item.item_type_id)?.item_type_name || "-"}</td>
                                                <td className='border-r border-black/20'>{item.color}</td>
                                                <td className='border-r border-black/20'>{item.brand}</td>
                                                <td className='border-r border-black/20'>{item.remark}</td>
                                                <td className='border-r border-black/20'>{item.packing_option}</td>
                                                <td className='border-r border-black/20'>{item.quantity}</td>
                                                <td className='border-r border-black/20'>{item.service_type_id === 1 ? "WASHING" : item.service_type_id === 2 ? "PRESSING" : "DRY CLEAN"}</td>
                                                <td>Rs {(Number(item.price) * item.quantity).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            } */}

                                {isLastPage && pageItems.length <= 8 &&
                                    <div className='print-summary-notes-wrapper mt-1 text-sm print:leading-tight'>
                                        {/* Summary Section - compact in print */}
                                        <div className='print-summary-block grid grid-cols-2 gap-x-5'>
                                            <div className='flex flex-col'>
                                                {data?.delivery_charge > 0 &&
                                                    <div className='flex flex-row justify-between'>
                                                        <p>Delivery Charge</p>
                                                        <p>Rs. {data.delivery_charge.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                                    </div>
                                                }

                                                <div className='flex flex-row justify-between'>
                                                    <p>{(totalDamagedDeduction > 0 || totalReturnedDeduction > 0) ? "Total Amount (Before Deductions)" : "Total Amount"}</p>
                                                    <p>Rs {totalBeforeDeductions.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                                </div>
                                                {totalDamagedDeduction > 0 && (
                                                    <div className='flex flex-row justify-between text-red-600'>
                                                        <p>Damaged Items Deduction</p>
                                                        <p>- Rs {totalDamagedDeduction.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                                    </div>
                                                )}
                                                {totalReturnedDeduction > 0 && (
                                                    <div className='flex flex-row justify-between text-red-600'>
                                                        <p>Returned Items Deduction</p>
                                                        <p>- Rs {totalReturnedDeduction.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                                    </div>
                                                )}
                                                {(totalDamagedDeduction > 0 || totalReturnedDeduction > 0) && (
                                                    <div className='flex flex-row justify-between font-bold'>
                                                        <p>Total Amount</p>
                                                        <p>Rs {totalReady.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                                    </div>
                                                )}
                                                <div className='flex flex-row justify-between'>
                                                    <p>Discount :</p>
                                                    <p>{discountLabel ?? "—"}</p>
                                                </div>
                                                {(discountLabel || (data?.discount != null && data.discount !== "" && data.discount !== 0)) && (
                                                    <div className='flex flex-row justify-between'>
                                                        <p>Discount Amount</p>
                                                        <p>Rs {(Number(discount) || (order?.discount != null && order?.discount !== "" ? totalReady * Number(order.discount) / 100 : 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                                    </div>
                                                )}
                                                <div className='flex flex-row justify-between'>
                                                    <p>Advanced Amount</p>
                                                    <p>Rs {Number(displayAdvance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                                </div>
                                                {data?.gift_vouchers?.length > 0 &&
                                                    <div className='flex flex-row justify-between'>
                                                        <p>Voucher Redeemed</p>
                                                        <p>Rs {Number(data?.gift_voucher_amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                                    </div>
                                                }
                                            </div>
                                            <div className='flex flex-col'>
                                                <div className='flex flex-col'>
                                                    <div className='flex flex-row justify-between'>
                                                        <p>Payment Method</p>
                                                        <p>{Array.isArray(data?.payment) ? data.payment.map(p => p.payment_method).join(', ') : (data?.payment_method || '—')}</p>
                                                    </div>
                                                    <div className='flex flex-row justify-between'>
                                                        <p>Amount</p>
                                                        <p>Rs. {totalPaid.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                                    </div>
                                                </div>
                                                <div className='flex flex-row justify-between font-bold'>
                                                    <p>Balance Due</p>
                                                    <p>
                                                        Rs {displayBalance}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>

                                        {isLastPage && pageItems.length <= 8 && (
                                            <div className='text-xs print-compact print-notes-terms-block leading-tight mt-1 print:mt-0.5'>
                                                <div className='flex flex-col font-bold'>
                                                    <p className='mb-0.5'>NOTES</p>
                                                    <p className='font-normal leading-tight'>{data.notes}</p>
                                                </div>
                                                <div className='flex flex-col font-bold mt-1 print:mt-0'>
                                                    <p className='mb-0.5'>TERMS & CONDITIONS</p>
                                                    <p className='font-normal leading-tight'>{data.terms_and_conditions}</p>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                }

                                {/* Footer Section - fixed at page bottom when printing */}
                            </div>
                            <div className='print-footer-fixed mt-auto flex flex-col text-xxs items-center'>
                                <p className='font-semibold'>"THIS IS SYSTEM GENERATED"</p>
                                <p className='font-semibold text-xs'>CL Solutions (PVT) LTD</p>
                                <p>Registered address:583/71, Augustine Premathirathne Mawatha, Liyanagemulla, Seeduwa</p>
                                <p>Laundry facility: 391,Avissawella Road,Wellampitiya</p>
                                <div className='flex flex-row'>
                                    <p>TEL: 94 114 701 566, EMAIL: info@sparklelaundry.lk, WEB : www.sparklelaundry.lk</p>
                                </div>
                                <div className='flex flex-row justify-between w-full'>
                                    <p>Page {pageIndex + 1} of {showOnNextPage ? itemPages.length + 1 : itemPages.length}</p>
                                    <p className="ms-auto">POWERED BY CEYLONX CORPORATION</p>
                                </div>
                            </div>
                        </div>
                    );
                })}

                {showOnNextPage &&
                    <div className="flex flex-col aspect-print h-full print-page-fixed-footer pt-1 px-2">
                        <div className="print-body-fixed flex flex-col flex-1 min-h-0">
                            {/* Header Section */}
                            <div className="relative flex flex-row items-start justify-between">
                                <div className="flex flex-col me-auto">
                                    <img src={logo} className="w-32 object-contain" />
                                    <div className="text-sm mt-2 text-black/80">
                                        <p>Outlet Name : {outletInfo?.name || "—"}</p>
                                        <p>Address     : {outletInfo?.address || "—"}</p>
                                        <p>Telephone   : {outletInfo?.telephone || "—"}</p>
                                    </div>
                                </div>

                                <h1 className="absolute top-0 left-1/2 transform -translate-x-1/2 mt-4 font-bold text-center text-xl">Invoice</h1>

                                <div className="flex flex-col text-xxs items-end mt-4">
                                    <div className="flex flex-row gap-x-5">
                                        <div className="flex flex-row gap-x-2">
                                            <p className="font-semibold">Printed Date :</p>
                                            <p className="">{printedDate}</p>
                                        </div>

                                        <div className="flex flex-row gap-x-2">
                                            <p className="font-semibold">Time :</p>
                                            <p className="">{printedTime}</p>
                                        </div>
                                    </div>
                                    <div className="flex flex-row gap-x-2 mt-1">
                                        <p className="font-semibold">Employee ID :</p>
                                        <p className="">{localStorage.getItem("employeeId") || "—"}</p>
                                    </div>
                                    <div className="flex flex-row gap-x-2 mt-1">
                                        <p className="font-bold">{Number(data?.print_count || order?.print_count || 0) === 0 ? "ORIGINAL" : `COPY - ${data?.print_count || order?.print_count}`}</p>
                                    </div>
                                    {(order?.redo_order_reference || Number(order?.total_amount) === 0) && (
                                        <div className="flex flex-row gap-x-2 mt-1">
                                            <p className="font-bold text-base">REDO{order?.redo_order_reference ? `: ${order?.redo_order_reference}` : ""}</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className='flex flex-row justify-between mt-1 text-xs'>
                                <div className='border border-black/20 grid grid-cols-2 gap-x-3 p-1'>
                                    <p className='font-semibold'>INVOICE ID:</p>
                                    <p>{displayInvoiceId || "—"}</p>
                                    <p className='font-semibold'>ORDER NO:</p>
                                    <p>{orderIdsToUse.join(",") || "—"}</p>
                                    <p className='font-semibold'>CUSTOMER ID:</p>
                                    <p className='uppercase'>{data.customer_id}</p>
                                    <p className='font-semibold'>CUSTOMER NAME:</p>
                                    <p className='uppercase'>{data.customer_name}</p>
                                    <p className='font-semibold'>INVOICE DATE:</p>
                                    <p>{invoiceDate}</p>
                                    <p className='font-semibold'>PHONE NO:</p>
                                    <p>{data.phone_number}</p>
                                </div>

                                <div className='border border-black/20 grid grid-cols-2 gap-x-3 p-1'>
                                    <p className='font-semibold'>COLLECTOR:</p>
                                    <p className='uppercase'>{getCollectorName()}</p>
                                    <p className='font-semibold'>DELIVERY TYPE:</p>
                                    <p className='uppercase'>{data.delivery_type}</p>
                                    <p className='font-semibold'>DELIVERY OUTLET:</p>
                                    <p className='uppercase'>{data?.delivery_outlet || order?.delivery_outlet || (typeof localStorage !== "undefined" ? localStorage.getItem("selectedBranchName") : null) || "N/A"}</p>
                                    <p className='font-semibold'>COLLECTION DATE:</p>
                                    <p className='uppercase'>{data.collection_date ? new Date(data.collection_date).toISOString().split("T")[0] : ""}</p>
                                    <p className='font-semibold'>DELIVERY DATE:</p>
                                    <p className="uppercase">
                                        {data.delivery_date ? new Date(data.delivery_date).toISOString().split("T")[0] : ""}
                                    </p>
                                    <p className='font-semibold'>PRINTED DATE:</p>
                                    <p>{printedDate}</p>
                                    <p className='font-semibold'>TIME:</p>
                                    <p>{printedTime}</p>
                                </div>
                            </div>

                            <div className='print-summary-notes-wrapper'>
                                {showSummaryOnNextPage &&
                                    <div className='mt-1 text-sm print:leading-tight'>
                                        {/* Summary Section - compact in print */}
                                        <div className='print-summary-block grid grid-cols-2 gap-x-5'>
                                            <div className='flex flex-col'>
                                                {data?.delivery_charge > 0 &&
                                                    <div className='flex flex-row justify-between'>
                                                        <p>Delivery Charge</p>
                                                        <p>Rs. {data.delivery_charge.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                                    </div>
                                                }
                                                <div className='flex flex-row justify-between'>
                                                    <p>{(totalDamagedDeduction > 0 || totalReturnedDeduction > 0) ? "Total Amount (Before Deductions)" : "Total Amount"}</p>
                                                    <p>Rs {totalBeforeDeductions.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                                </div>
                                                {totalDamagedDeduction > 0 && (
                                                    <div className='flex flex-row justify-between text-red-600'>
                                                        <p>Damaged Items Deduction</p>
                                                        <p>- Rs {totalDamagedDeduction.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                                    </div>
                                                )}
                                                {totalReturnedDeduction > 0 && (
                                                    <div className='flex flex-row justify-between text-red-600'>
                                                        <p>Returned Items Deduction</p>
                                                        <p>- Rs {totalReturnedDeduction.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                                    </div>
                                                )}
                                                {(totalDamagedDeduction > 0 || totalReturnedDeduction > 0) && (
                                                    <div className='flex flex-row justify-between font-bold'>
                                                        <p>Total Amount</p>
                                                        <p>Rs {totalReady.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                                    </div>
                                                )}

                                                <div className='flex flex-row justify-between'>
                                                    <p>Discount :</p>
                                                    <p>{discountLabel ?? "—"}</p>
                                                </div>
                                                {(discountLabel || (data?.discount != null && data.discount !== "" && data.discount !== 0)) && (
                                                    <div className='flex flex-row justify-between'>
                                                        <p>Discount Amount</p>
                                                        <p>Rs {(Number(discount) || (order?.discount != null && order?.discount !== "" ? totalReady * Number(order.discount) / 100 : 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                                    </div>
                                                )}
                                                <div className='flex flex-row justify-between'>
                                                    <p>Advanced Amount</p>
                                                    <p>Rs {Number(displayAdvance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                                </div>
                                                {data?.gift_vouchers?.length > 0 &&
                                                    <div className='flex flex-row justify-between'>
                                                        <p>Voucher Redeemed</p>
                                                        <p>Rs {Number(data?.gift_voucher_amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                                    </div>
                                                }
                                            </div>
                                            <div className='flex flex-col'>
                                                <div className='flex flex-col'>
                                                    <div className='flex flex-row justify-between'>
                                                        <p>Payment Method</p>
                                                        <p>{Array.isArray(data?.payment) ? data.payment.map(p => p.payment_method).join(', ') : (data?.payment_method || '—')}</p>
                                                    </div>
                                                    <div className='flex flex-row justify-between'>
                                                        <p>Amount</p>
                                                        <p>Rs. {totalPaid.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                                    </div>
                                                </div>
                                                <div className='flex flex-row justify-between font-bold'>
                                                    <p>Balance Due</p>
                                                    <p>
                                                        Rs {displayBalance}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                }

                                <div className='text-xs print-compact print-notes-terms-block leading-tight mt-1 print:mt-0.5'>
                                    <div className='flex flex-col font-bold'>
                                        <p className='mb-0.5'>NOTES</p>
                                        <p className='font-normal leading-tight'>{data.notes}</p>
                                    </div>
                                    <div className='flex flex-col font-bold mt-1 print:mt-0'>
                                        <p className='mb-0.5'>TERMS & CONDITIONS</p>
                                        <p className='font-normal leading-tight'>{data.terms_and_conditions}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Footer Section - fixed at page bottom when printing */}
                        </div>
                        <div className='print-footer-fixed mt-auto flex flex-col text-xxs items-center'>
                            <p className='font-semibold'>"THIS IS SYSTEM GENERATED"</p>
                            <p className='font-semibold text-xs'>CL Solutions (PVT) LTD</p>
                            <p>Registered address:583/71, Augustine Premathirathne Mawatha, Liyanagemulla, Seeduwa</p>
                            <p>Laundry facility: 391,Avissawella Road,Wellampitiya</p>
                            <div className='flex flex-row'>
                                <p>TEL: 94 114 701 566, EMAIL: info@sparklelaundry.lk, WEB : www.sparklelaundry.lk</p>
                            </div>
                            <div className='flex flex-row justify-between w-full'>
                                <p>Page {itemPages.length + 1} of {itemPages.length + 1}</p>
                                <p className="ms-auto">POWERED BY CEYLONX CORPORATION</p>
                            </div>
                        </div>
                    </div>
                }
            </div >
        </div >
    );
});

export default RetailInvoice;