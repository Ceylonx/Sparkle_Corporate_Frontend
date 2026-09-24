import React, { useEffect, useState } from 'react';
import logo from "../../assets/logo.png";
import { getBranchesForAttendance } from "../../services/Retail/RetailEmployeeServices";
import { applyBranchFallback } from "../../utils/branchFallbacks";
import axios from "axios";
import { getCustomerById } from "../../services/CustomerServices";

const RetailSalesOrder = React.forwardRef(({ data, orderItems, customer, itemTypes, serviceTypes, createdDate, outletInfo: outletInfoProp, attendanceBranches, mobileResponsive }, ref) => {
    const [outletInfoState, setOutletInfoState] = useState(null);
    const [users, setUsers] = useState([]);
    const [customerFromApi, setCustomerFromApi] = useState(null);
    const [publicCollectorName, setPublicCollectorName] = useState("");
    const normalizedOrderItems = Array.isArray(orderItems)
        ? orderItems
        : (orderItems && typeof orderItems === "object" ? [orderItems] : []);
    const dedupedOrderItems = (() => {
        const seen = new Set();
        const unique = [];
        normalizedOrderItems.forEach((item, index) => {
            const key = item?.item_id != null && item?.item_id !== ""
                ? String(item.item_id)
                : `fallback-${index}`;
            if (seen.has(key)) return;
            seen.add(key);
            unique.push(item);
        });
        return unique;
    })();
    const formatQty = (value) => {
        const n = Number(value);
        if (!Number.isFinite(n)) return value ?? "-";
        return Number(n.toFixed(2)).toString();
    };

    const selectedBranchId = typeof window !== "undefined" ? localStorage.getItem("selectedBranchId") : null;
    const branchIdToUse = data?.branch_id != null ? data.branch_id : selectedBranchId;

    // Fetch customer (with discount) from get-customer-by-id API for bill preview
    useEffect(() => {
        const customerId = data?.customer_id ?? customer?.customer_id;
        if (!customerId) return;

        let cancelled = false;
        const fetchCustomer = async () => {
            try {
                const storedUserId = typeof window !== "undefined" ? localStorage.getItem("userId") : null;
                if (!storedUserId) return;
                const payload = {
                    user_id: storedUserId,
                    customer_id: customerId,
                    customer_type: "Retail",
                };
                const response = await getCustomerById(payload);
                // API shape: { success: true, customer: { customer_id, customer_name, discount, ... } }
                const d = response?.data;
                const apiCustomer = d?.customer ?? response?.customer ?? null;
                const discountValue = apiCustomer?.discount ?? d?.discount ?? response?.discount;
                if (!cancelled) {
                    if (apiCustomer) {
                        setCustomerFromApi({ ...apiCustomer, discount: discountValue });
                    } else if (discountValue !== undefined && discountValue !== null) {
                        setCustomerFromApi({ discount: discountValue });
                    }
                }
            } catch (e) {
                console.error("RetailSalesOrder: failed to fetch customer by id for discount", e);
            }
        };
        fetchCustomer();
        return () => { cancelled = true; };
    }, [data?.customer_id, customer?.customer_id]);

    // API branch shape: branch_id, branch_name, location_address, location_telephone
    const outletInfoFromList = (() => {
        const list = Array.isArray(attendanceBranches) ? attendanceBranches : [];
        if (list.length === 0 || !branchIdToUse) return null;
        const targetId = String(branchIdToUse).trim();
        const branch = list.find((b) => {
            const id = b?.branch_id ?? b?.id;
            return id != null && (Number(id) === Number(targetId) || String(id) === targetId);
        });
        if (!branch) return null;
        const info = {
            name: branch.branch_name ?? branch.name ?? branch.branchName ?? "",
            address: branch.location_address != null && branch.location_address !== "" ? String(branch.location_address) : "",
            telephone: branch.location_telephone != null && branch.location_telephone !== "" ? String(branch.location_telephone) : "",
        };
        return applyBranchFallback(info, branchIdToUse);
    })();

    useEffect(() => {
        if (Array.isArray(attendanceBranches) && attendanceBranches.length > 0) return;
        const useBranchId = data?.branch_id != null ? data.branch_id : selectedBranchId;
        if (!useBranchId) {
            setOutletInfoState({
                name: typeof window !== "undefined" ? localStorage.getItem("selectedBranchName") || "" : "",
                address: "",
                telephone: "",
            });
            return;
        }
        let cancelled = false;
        const userId = typeof window !== "undefined" ? localStorage.getItem("userId") : null;
        if (!userId) {
            setOutletInfoState({
                name: typeof window !== "undefined" ? localStorage.getItem("selectedBranchName") || "" : "",
                address: "",
                telephone: "",
            });
            return;
        }
        getBranchesForAttendance(userId)
            .then((raw) => {
                if (cancelled) return;
                const list = Array.isArray(raw) ? raw : (raw?.branches ?? raw?.data?.branches ?? raw?.data ?? raw?.results ?? []);
                if (!Array.isArray(list) || list.length === 0) return;
                const targetId = String(useBranchId).trim();
                const branch = list.find((b) => {
                    const id = b?.branch_id ?? b?.id;
                    return id != null && (Number(id) === Number(targetId) || String(id) === targetId);
                });
                if (branch) {
                    setOutletInfoState({
                        name: branch.branch_name ?? branch.name ?? branch.branchName ?? "",
                        address: branch.location_address != null && branch.location_address !== "" ? String(branch.location_address) : "",
                        telephone: branch.location_telephone != null && branch.location_telephone !== "" ? String(branch.location_telephone) : "",
                    });
                } else {
                    setOutletInfoState({
                        name: typeof window !== "undefined" ? localStorage.getItem("selectedBranchName") || "" : "",
                        address: "",
                        telephone: "",
                    });
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setOutletInfoState({
                        name: typeof window !== "undefined" ? localStorage.getItem("selectedBranchName") || "" : "",
                        address: "",
                        telephone: "",
                    });
                }
            });
        return () => { cancelled = true; };
    }, [data?.branch_id, attendanceBranches]);

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
        const createdById = data?.created_by || data?.user_id;
        if (!createdById) return;

        // If it already looks like a name (no dashes/not a UUID) and we're not in a public view, 
        // or if we already have it in users, this might be skipped, 
        // but for public view we should always try if we don't have a name.
        
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
                    console.error("RetailSalesOrder: Error fetching public collector name", e);
                }
            };
            fetchName();
            return () => { cancelled = true; };
        }
    }, [data?.created_by, data?.user_id]);

    // Get collector username from user_id
    const getCollectorName = () => {
        // Prioritize name fetched from public API
        if (publicCollectorName) return publicCollectorName;

        // First check if we have name fields directly
        if (data?.created_by_name || data?.created_by_user_name || data?.user_name) {
            return data.created_by_name || data.created_by_user_name || data.user_name;
        }
        
        // Check multiple possible field names for user_id (created_by, user_id, etc.)
        const createdById = data?.created_by || data?.user_id;
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
        
        // Fallback to current user or created_by value
        return localStorage.getItem("userName") || createdById || "";
    };

    const rawOutletInfo = outletInfoFromList || outletInfoState || (outletInfoProp && (String(outletInfoProp.address ?? "").trim() !== "" || String(outletInfoProp.telephone ?? "").trim() !== "") ? outletInfoProp : null);
    const outletInfo = applyBranchFallback(rawOutletInfo, branchIdToUse) ?? rawOutletInfo;

    // Compute remaining amount with discount so bill preview always shows correct value
    const computedRemainingAmount = (() => {
        const total = Number(data?.total_amount) || 0;
        let discountVal = 0;
        const effectiveCustomer = customerFromApi || customer;
        if (data?.discount != null && data.discount !== '') {
            const rawStr = String(data.discount).trim();
            const numericBase = Number(rawStr.replace('%', '').trim());
            const isPercent = rawStr.endsWith('%') || (Number.isFinite(numericBase) && numericBase > 0 && numericBase <= 100);
            discountVal = isPercent
                ? total * (numericBase / 100)
                : (Number(rawStr) || 0);
        } else if (effectiveCustomer?.discount != null && effectiveCustomer?.discount !== '' && Number(effectiveCustomer?.discount) > 0) {
            const numericBase = Number(effectiveCustomer.discount);
            discountVal = total * (numericBase / 100);
        }
        const safeDiscount = Number.isFinite(discountVal) ? discountVal : 0;
        const advance = Number(data?.advance_payment) || 0;
        const cardPaid = (data?.payment || [])
            .filter(p => p?.payment_method === "CARD")
            .reduce((sum, p) => sum + Number(p?.paid_amount || 0), 0);
        const totalPaid = advance + cardPaid;
        return total - safeDiscount - totalPaid;
    })();

    // Prefer remaining_amount from get-order-by-id API when present and valid
    const apiRemaining = (data?.remaining_amount != null && data?.remaining_amount !== "") ? Number(data.remaining_amount) : NaN;
    const displayRemainingAmount = Number.isFinite(apiRemaining) ? apiRemaining : computedRemainingAmount;

    const splitItems = (items, maxPerPage) => {
        const pages = [];
        for (let i = 0; i < items.length; i += maxPerPage) {
            pages.push(items.slice(i, i + maxPerPage));
        }
        return pages;
    };

    const totalItems = dedupedOrderItems.length;
    const itemPages = splitItems(dedupedOrderItems, 8);

    return (
        <div ref={ref}>
            <div className={`print:hidden flex flex-col bg-white w-full rounded-xl my-3 ${mobileResponsive ? "p-4 sm:p-6 md:p-10" : "p-10"}`}>
                {/* Header Section */}
                <div className={mobileResponsive ? "flex flex-col sm:flex-row gap-3" : "flex flex-row"}>
                    <div className="flex flex-col me-auto">
                        <img src={logo} className={mobileResponsive ? "w-24 sm:w-32 object-contain" : "w-32 object-contain"} alt="Sparkle" />
                        <div className="text-sm mt-2 text-black/80">
                            <p>Outlet Name : {outletInfo?.name || localStorage.getItem("selectedBranchName") || "—"}</p>
                            <p>Address     : {outletInfo?.address || "—"}</p>
                            <p>Telephone   : {outletInfo?.telephone || "—"}</p>
                        </div>
                    </div>

                    <div className={`flex flex-col text-xs ${mobileResponsive ? "items-start sm:items-end" : "items-end"}`}>
                        <div className="flex flex-col items-end gap-y-1">
                            <div className={mobileResponsive ? "flex flex-col sm:flex-row gap-x-5 gap-y-0" : "flex flex-row gap-x-5"}>
                                <div className="flex flex-row gap-x-2">
                                    <p className="font-semibold">Printed Date :</p>
                                    <p>{data.created_at ? new Date(data.created_at).toISOString().split("T")[0] : new Date().toISOString().split("T")[0]}</p>
                                </div>

                                <div className="flex flex-row gap-x-2">
                                    <p className="font-semibold">Time :</p>
                                    <p className="">{data.created_at ? new Date(data.created_at).toLocaleTimeString() : new Date().toLocaleTimeString()}</p>
                                </div>

                                <div className="flex flex-row gap-x-2">
                                    <p className="font-semibold">User ID :</p>
                                    <p className="">{localStorage.getItem("employeeId") || "—"}</p>
                                </div>
                            </div>
                            <div className="flex flex-row gap-x-2 mt-1">
                                <p className="font-bold">{Number(data.print_count || 0) === 0 ? "ORIGINAL" : `COPY - ${data.print_count}`}</p>
                            </div>
                        </div>
                        {data.status === "Deactive" && (
                            <div className="flex flex-row gap-x-2 mt-1">
                                <p className="font-bold text-base text-red-600">CANCELLED</p>
                            </div>
                        )}
                        {(data.redo_order_reference || Number(data.total_amount) === 0) && (
                            <div className="flex flex-row gap-x-2 mt-1">
                                <p className="font-bold text-base">REDO{data.redo_order_reference ? `: ${data.redo_order_reference}` : ""}</p>
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex flex-col items-center justify-center">
                    <h1 className={mobileResponsive ? "font-bold text-center text-lg sm:text-2xl mt-1" : "font-bold text-center text-2xl"}>Collection Order</h1>
                </div>

                <div className={mobileResponsive ? "flex flex-col sm:flex-row sm:justify-between gap-3 mt-4 sm:mt-5" : "flex flex-row justify-between mt-5"}>
                    <div className='border border-black/20 grid grid-cols-2 gap-x-3 gap-y-0 p-2 sm:p-1 text-xs sm:text-base min-w-0'>
                        <p className='font-semibold'>ORDER NO:</p>
                        <p className="break-words">{data.order_id}</p>
                        <p className='font-semibold'>CUSTOMER ID:</p>
                        <p className='uppercase break-words'>{customer.customer_id}</p>
                        <p className='font-semibold'>CUSTOMER NAME:</p>
                        <p className='uppercase break-words'>{customer.customer_name}</p>
                        <p className='font-semibold'>PHONE NO:</p>
                        <p className="break-words">{customer.phone_number}</p>
                    </div>

                    <div className='border border-black/20 grid grid-cols-2 gap-x-3 gap-y-0 p-2 sm:p-1 text-xs sm:text-base min-w-0'>
                        <p className='font-semibold'>COLLECTOR:</p>
                        <p className='uppercase break-words'>{getCollectorName()}</p>
                        <p className='font-semibold'>DELIVERY TYPE:</p>
                        <p className='uppercase break-words'>{data.delivery_type}</p>
                        <p className='font-semibold'>DELIVERY OUTLET:</p>
                        <p className='uppercase break-words'>{data.delivery_outlet || localStorage.getItem("selectedBranchName") || "N/A"}</p>
                        <p className='font-semibold'>COLLECTION DATE:</p>
                        <p className='uppercase break-words'>{data.created_at ? new Date(data.created_at).toISOString().split("T")[0] : new Date().toISOString().split("T")[0]}</p>
                        <p className='font-semibold'>DELIVERY DATE:</p>
                        <p className="uppercase break-words">{data.delivery_date ? new Date(data.delivery_date).toISOString().split("T")[0] : new Date().toISOString().split("T")[0]}  5.00 PM</p>
                    </div>
                </div>

                {/* Body Section - scrollable table on mobile */}
                <div className={mobileResponsive ? "overflow-x-auto mt-4 sm:mt-5 w-full rounded-lg border border-black/20" : "mt-5"}>
                <table className={`border-collapse w-full uppercase ${mobileResponsive ? "min-w-[680px] text-xs sm:text-sm" : ""} border border-black/20`}>
                    <thead className="border-b border-black/20 bg-gray-50">
                        <tr>
                            <th className="border-r border-black/20 py-2 px-2 text-center font-semibold whitespace-nowrap w-8">No</th>
                            <th className="border-r border-black/20 py-2 px-2 text-center font-semibold whitespace-nowrap min-w-[72px]">Item</th>
                            <th className="border-r border-black/20 py-2 px-2 text-center font-semibold whitespace-nowrap min-w-[56px]">Color</th>
                            <th className="border-r border-black/20 py-2 px-2 text-center font-semibold whitespace-nowrap min-w-[56px]">Brand</th>
                            <th className="border-r border-black/20 py-2 px-2 text-center font-semibold whitespace-nowrap min-w-[56px]">Remark</th>
                            <th className="border-r border-black/20 py-2 px-2 text-center font-semibold whitespace-nowrap min-w-[56px]">Packing</th>
                            <th className="border-r border-black/20 py-2 px-2 text-center font-semibold whitespace-nowrap min-w-[56px]">UOM</th>
                            <th className="border-r border-black/20 py-2 px-2 text-center font-semibold whitespace-nowrap w-10">Qty</th>
                            <th className="border-r border-black/20 py-2 px-2 text-center font-semibold whitespace-nowrap w-10">Pcs</th>
                            <th className="border-r border-black/20 py-2 px-2 text-center font-semibold whitespace-nowrap min-w-[72px]">Service</th>
                            <th className="border-r border-black/20 py-2 px-2 text-center font-semibold whitespace-nowrap min-w-[64px]">Price</th>
                            <th className="py-2 px-2 text-center font-semibold whitespace-nowrap min-w-[64px]">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        {dedupedOrderItems.map((item, index) => (
                            <tr key={index} className="text-center border-b border-black/10 last:border-b-0 hover:bg-gray-50/50">
                                <td className="border-r border-black/20 py-2 px-2">{index + 1}</td>
                                <td className="border-r border-black/20 py-2 px-2 break-words">{item.item_type_name || itemTypes.find(type => type.item_type_id === item.item_type_id)?.item_type_name || "—"}</td>
                                <td className="border-r border-black/20 py-2 px-2 break-words">{item.color || "—"}</td>
                                <td className="border-r border-black/20 py-2 px-2 break-words">{item.brand || "—"}</td>
                                <td className="border-r border-black/20 py-2 px-2 break-words">{item.remark || "—"}</td>
                                <td className="border-r border-black/20 py-2 px-2 break-words">{item.packing_option || "—"}</td>
                                <td className="border-r border-black/20 py-2 px-2">QTY</td>
                                <td className="border-r border-black/20 py-2 px-2">{formatQty(item.quantity)}</td>
                                <td className="border-r border-black/20 py-2 px-2">{item.pics_count}</td>
                                <td className="border-r border-black/20 py-2 px-2 break-words">{item.service_type_name || serviceTypes.find(type => type.service_type_id === item.service_type_id)?.service_type_name || "—"}</td>
                                <td className="border-r border-black/20 py-2 px-2 whitespace-nowrap">Rs. {Number(item.price).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                <td className="py-2 px-2 whitespace-nowrap font-medium">Rs. {Number(item.total_amount ?? (Number(item.price) * Number(item.quantity))).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            </tr>
                        ))}
                        <tr className="text-center font-bold border-t-2 border-black/20 bg-gray-50/50">
                            <td colSpan="7" className="border-r border-black/20 py-2 px-2 text-left">TOTAL</td>
                            <td className="border-r border-black/20 py-2 px-2">{formatQty(dedupedOrderItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0))}</td>
                            <td className="border-r border-black/20 py-2 px-2">{dedupedOrderItems.reduce((sum, item) => sum + Number(item.pics_count || 0), 0)}</td>
                            <td colSpan="3" className="py-2 px-2 text-left"></td>
                        </tr>
                    </tbody>
                </table>
                </div>

                {/* Summary Section */}
                {data.order_type === "Pickup/Delivery" &&
                    <div className={`flex flex-row justify-between mt-4 sm:mt-5 ${mobileResponsive ? "text-sm" : ""}`}>
                        <p>Delivery Charge</p>
                        <p>Rs. {data.delivery_charge.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                    </div>
                }
                <div className={`flex flex-row justify-between ${data.order_type === "Pickup/Delivery" ? "" : "mt-4 sm:mt-5"} ${mobileResponsive ? "text-sm" : ""}`}>
                    <p>Total Amount</p>
                    <p>Rs. {data.total_amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                </div>

                {(() => {
                    const total = Number(data?.total_amount) || 0;
                    const effectiveCustomer = customerFromApi || customer;
                    // Discount source: order (data.discount) or get-customer-by-id (effectiveCustomer.discount)
                    // Prioritize `data.discount` so real-time input in "Other" tab is immediately visible
                    let rawDiscount;
                    let fromApi = false;
                    
                    if (data?.discount != null && data.discount !== "") {
                        rawDiscount = data.discount;
                    } else if (effectiveCustomer?.discount !== undefined && effectiveCustomer?.discount !== null) {
                        rawDiscount = effectiveCustomer.discount;
                        fromApi = true;
                    }

                    if (rawDiscount == null) {
                        return null;
                    }

                    const rawStr = String(rawDiscount).trim();
                    const discountPercent = rawStr === "" ? NaN : Number(rawStr.replace(/%/g, "").trim());
                    // Customer loyalty discount (fromApi) is always a percentage; the "Other" tab discount
                    // is a percentage only when the user typed it with a trailing '%' — otherwise it's a flat Rs. amount.
                    const isPercent = fromApi || rawStr.endsWith("%");

                    const loyaltyDiscountAmount = isPercent
                        ? total * (discountPercent / 100)
                        : discountPercent;
                    const calculatedLoyaltyDiscount = Number.isFinite(loyaltyDiscountAmount) && loyaltyDiscountAmount >= 0 ? loyaltyDiscountAmount : 0;
                    const hasDiscount = isPercent || Number.isFinite(discountPercent);

                    // For display:
                    let discountDisplay = "";
                    if (fromApi) {
                        discountDisplay = Number.isFinite(Number(effectiveCustomer.discount)) ? `${effectiveCustomer.discount}%` : String(effectiveCustomer.discount);
                    } else {
                        discountDisplay = rawStr.endsWith("%") ? `${discountPercent}%` : `Rs. ${discountPercent.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                    }

                    return (
                        <>
                            <div className={`flex flex-row justify-between ${mobileResponsive ? "text-sm" : ""}`}>
                                <p>Discount :</p>
                                <p>{discountDisplay}</p>
                            </div>
                            <div className={`flex flex-row justify-between ${mobileResponsive ? "text-sm" : ""}`}>
                                <p>Discount Amount</p>
                                <p>Rs. {calculatedLoyaltyDiscount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                            </div>
                        </>
                    );
                })()}

                {data.payment && data.payment.length > 0 ? (
                    data.payment.filter(p => p.payment_method).map((p, idx) => {
                        const amount = p.payment_method === "CASH" && (p.paid_amount === "" || p.paid_amount == null) ? (data.advance_payment ?? 0) : (p.paid_amount ?? 0);
                        return (
                            <React.Fragment key={idx}>
                                <div className={`flex flex-row justify-between ${mobileResponsive ? "text-sm" : ""}`}>
                                    <p>Payment Method</p>
                                    <p>{p.payment_method}</p>
                                </div>
                                <div className={`flex flex-row justify-between ${mobileResponsive ? "text-sm" : ""}`}>
                                    <p>Advanced Amount</p>
                                    <p>Rs. {Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                </div>
                            </React.Fragment>
                        );
                    })
                ) : (
                    <>
                        <div className={`flex flex-row justify-between ${mobileResponsive ? "text-sm" : ""}`}>
                            <p>Payment Method</p>
                            <p>{data.payment_method ?? ""}</p>
                        </div>
                        <div className={`flex flex-row justify-between ${mobileResponsive ? "text-sm" : ""}`}>
                            <p>Advanced Amount</p>
                            <p>Rs. {(data.advance_payment ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                        </div>
                    </>
                )}

                <div className={`flex flex-row justify-between font-bold ${mobileResponsive ? "text-sm mt-2" : ""}`}>
                    <p>Remaining Amount</p>
                    <p>Rs. {(Number.isFinite(displayRemainingAmount) ? displayRemainingAmount : 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                </div>

                <div className={`flex flex-col justify-between font-bold mt-4 sm:mt-5 text-sm ${mobileResponsive ? "text-xs" : ""}`}>
                    <p>NOTES</p>
                    <p className='font-normal break-words'>{data.notes}</p>
                </div>

                <div className={`flex flex-col justify-between font-bold text-sm ${mobileResponsive ? "text-xs" : ""}`}>
                    <p>TERMS & CONDITIONS</p>
                    <p className='font-normal break-words'>{data.terms_and_conditions}</p>
                </div>

                {/* Footer Section */}
                <div className={`flex flex-col items-center mt-4 sm:mt-5 ${mobileResponsive ? "text-[10px] sm:text-xs text-center px-1" : "text-xs"}`}>
                    <p className='font-semibold'>"THIS IS SYSTEM GENERATED"</p>
                    <p className='font-semibold text-sm'>CL Solutions (PVT) LTD</p>
                    <p>Registered address:583/71, Augustine Premathirathne Mawatha, Liyanagemulla, Seeduwa</p>
                    <p>Laundry facility: 391,Avissawella Road,Wellampitiya</p>
                    <div className='flex flex-row'>
                        <p>TEL: 94 114 701 566, EMAIL: info@sparklelaundry.lk, WEB : www.sparklelaundry.lk</p>
                    </div>
                    <div className='flex flex-row justify-between w-full'>
                        <p></p>
                        <p className="ms-auto">POWERED BY CEYLONX CORPORATION</p>
                    </div>
                </div>
            </div>

            {/* Print */}
            <style>{`
                @media print {
                    @page {
                        size: A5 landscape;
                        margin: 0;
                    }
                    #print-section {
                        padding: 0 !important;
                        margin: 0 !important;
                    }
                    .print-page-container {
                        display: flex;
                        flex-direction: column;
                        page-break-inside: avoid;
                        padding: 15px;
                        box-sizing: border-box;
                        height: 100vh;
                        max-height: 100vh;
                        min-height: 100vh;
                    }
                    .print-page-container:first-child {
                        page-break-before: auto !important;
                        margin-top: 0 !important;
                        padding-top: 15px !important;
                    }
                    .print-page-container:not(:first-child) {
                        page-break-before: always;
                    }
                    .print-page-container:not(:last-child) {
                        page-break-after: always;
                    }
                    .print-content {
                        display: flex;
                        flex-direction: column;
                        flex: 1;
                        min-height: 0;
                    }
                    .print-content > *:last-child {
                        margin-bottom: 0;
                    }
                    .print-footer {
                        margin-top: auto;
                        padding-top: 8px;
                        flex-shrink: 0;
                        flex-grow: 0;
                        page-break-inside: avoid !important;
                        page-break-before: avoid !important;
                        page-break-after: avoid !important;
                        orphans: 3;
                        widows: 3;
                        position: relative;
                    }
                    .print-content + .print-footer {
                        page-break-before: avoid !important;
                    }
                    table {
                        page-break-inside: auto;
                    }
                    tr {
                        page-break-inside: avoid;
                        page-break-after: auto;
                    }
                }
            `}</style>
            <div
                ref={ref}
                id="print-section"
                className="hidden print:flex print-container flex-col w-full a5-print"
            >
                {itemPages.map((pageItems, pageIndex) => {
                    const isLastPage = pageIndex === itemPages.length - 1;
                    return (
                        <div
                            key={pageIndex}
                            className="print-page-container flex flex-col w-full"
                        >
                            <div className="print-content flex flex-col flex-1">
                            {/* Header Section */}
                            <div className="relative flex flex-row items-start justify-between" >
                                <div className="flex flex-col">
                                    <img src={logo} className="w-32 object-contain" />
                                    <div className="text-sm mt-2 text-black/80 print:text-black">
                                        <p>Outlet Name : {outletInfo?.name || localStorage.getItem("selectedBranchName") || "—"}</p>
                                        <p>Address     : {outletInfo?.address || "—"}</p>
                                        <p>Telephone   : {outletInfo?.telephone || "—"}</p>
                                    </div>
                                </div>

                                <h1 className="absolute top-0 left-1/2 transform -translate-x-1/2 mt-4 font-bold text-center text-2xl">Collection Order.</h1>

                                <div className="flex flex-col text-xs items-end mt-4">
                                    <div className="flex flex-col items-end gap-y-1">
                                        <div className="flex flex-col items-end">
                                            <div className="flex flex-row gap-x-5">
                                                <div className="flex flex-row gap-x-2">
                                                    <p className="font-semibold">Printed Date :</p>
                                                    <p className="">{data.created_at ? new Date(data.created_at).toISOString().split("T")[0] : new Date().toISOString().split("T")[0]}</p>
                                                </div>

                                                <div className="flex flex-row gap-x-2">
                                                    <p className="font-semibold">Time :</p>
                                                    <p className="">{data.created_at ? new Date(data.created_at).toLocaleTimeString() : new Date().toLocaleTimeString()}</p>
                                                </div>
                                            </div>

                                            <div className="flex flex-row gap-x-2 mt-1">
                                                <p className="font-semibold">Employee ID :</p>
                                                <p className="">{localStorage.getItem("employeeId") || "—"}</p>
                                            </div>
                                        </div>
                                        <div className="flex flex-row gap-x-2 mt-1">
                                            <p className="font-bold">{Number(data.print_count || 0) === 0 ? "ORIGINAL" : `COPY - ${data.print_count}`}</p>
                                        </div>
                                    </div>
                                    {data.status === "Deactive" && (
                                        <div className="flex flex-row gap-x-2 mt-1">
                                            <p className="font-bold text-base text-red-600">CANCELLED</p>
                                        </div>
                                    )}
                                    {(data.redo_order_reference || Number(data.total_amount) === 0) && (
                                        <div className="flex flex-row gap-x-2 mt-1">
                                            <p className="font-bold text-base">REDO{data.redo_order_reference ? `: ${data.redo_order_reference}` : ""}</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className='flex flex-row justify-between mt-3 text-xs'>
                                <div className='border border-black/20 grid grid-cols-2 gap-x-3 p-1'>
                                    <p className='font-semibold'>ORDER NO:</p>
                                    <p>{data.order_id}</p>
                                    <p className='font-semibold'>CUSTOMER ID:</p>
                                    <p className='uppercase'>{customer.customer_id}</p>
                                    <p className='font-semibold'>CUSTOMER NAME:</p>
                                    <p className='uppercase'>{customer.customer_name}</p>
                                    <p className='font-semibold'>PHONE NO:</p>
                                    <p>{customer.phone_number}</p>
                                </div>

                                <div className='border border-black/20 grid grid-cols-2 gap-x-3 p-1'>
                                    <p className='font-semibold'>COLLECTOR:</p>
                                    <p className='uppercase'>{getCollectorName()}</p>
                                    <p className='font-semibold'>DELIVERY TYPE:</p>
                                    <p className='uppercase'>{data.delivery_type}</p>
                                    <p className='font-semibold'>DELIVERY OUTLET:</p>
                                    <p className='uppercase'>{data.delivery_outlet || localStorage.getItem("selectedBranchName") || "N/A"}</p>
                                    <p className='font-semibold'>COLLECTION DATE:</p>
                                    <p className='uppercase'>{data.created_at ? new Date(data.created_at).toISOString().split("T")[0] : new Date().toISOString().split("T")[0]}</p>
                                    <p className='font-semibold'>DELIVERY DATE:</p>
                                    <p className="uppercase">{data.delivery_date ? new Date(data.delivery_date).toISOString().split("T")[0] : new Date().toISOString().split("T")[0]}  5.00 PM</p>
                                </div>
                            </div>

                            {/* Body Section */}
                            <table className='border border-black/20 mt-2 uppercase text-sm' style={{ fontSize: totalItems <= 8 ? '0.7rem' : '0.75rem' }}>
                                <thead className='border border-black/20'>
                                    <tr>
                                        <th className='border-r border-black/20'>No</th>
                                        <th className='border-r border-black/20'>Item</th>
                                        <th className='border-r border-black/20'>Color</th>
                                        <th className='border-r border-black/20'>Brand</th>
                                        <th className='border-r border-black/20'>Remark</th>
                                        <th className='border-r border-black/20'>Packing</th>
                                        <th className='border-r border-black/20'>UOM</th>
                                        <th className='border-r border-black/20'>Qty</th>
                                        <th className='border-r border-black/20'>Pcs</th>
                                        <th className='border-r border-black/20'>Service Type</th>
                                        <th className='border-r border-black/20'>Price</th>
                                        <th>Total</th>
                                    </tr>
                                </thead>
                                <tbody className='align-top'>
                                    {pageItems.map((item, index) => (
                                        <tr key={index} className='text-center align-top'>
                                            <td className='border-r border-black/20 align-top'>{(pageIndex * 8) + index + 1}</td>
                                            <td className='border-r border-black/20 align-top'>{item.item_type_name || itemTypes.find(type => type.item_type_id === item.item_type_id)?.item_type_name}</td>
                                            <td className='border-r border-black/20 align-top'>{item.color}</td>
                                            <td className='border-r border-black/20 align-top'>{item.brand}</td>
                                            <td className='border-r border-black/20 align-top whitespace-normal'>{item.remark}</td>
                                            <td className='border-r border-black/20 align-top'>{item.packing_option}</td>
                                            <td className='border-r border-black/20 align-top'>PCS</td>
                                            <td className='border-r border-black/20 align-top'>{formatQty(item.quantity)}</td>
                                            <td className='border-r border-black/20 align-top'>{item.pics_count}</td>
                                            <td className='border-r border-black/20 align-top'>{item.service_type_name || serviceTypes.find(type => type.service_type_id === item.service_type_id)?.service_type_name}</td>
                                            <td className='border-r border-black/20 align-top'>Rs. {item.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                            <td>Rs. {Number(item.total_amount ?? (Number(item.price) * Number(item.quantity))).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                        </tr>
                                    ))}
                                    {isLastPage && (
                                        <tr className='text-center align-top font-bold border-t-2 border-black/20'>
                                            <td colSpan="7" className='border-r border-black/20 text-right pr-2'>TOTAL</td>
                                            <td className='border-r border-black/20'>{formatQty(dedupedOrderItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0))}</td>
                                            <td className='border-r border-black/20'>{dedupedOrderItems.reduce((sum, item) => sum + Number(item.pics_count || 0), 0)}</td>
                                            <td colSpan="3"></td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>

                            {isLastPage &&
                                <div className='mt-2 text-sm' style={{ pageBreakInside: 'avoid' }}>
                                    {/* Summary Section */}
                                    {data.order_type === "Pickup/Delivery" &&
                                        <div className='flex flex-row justify-between mt-2'>
                                            <p>Delivery Charge</p>
                                            <p>Rs. {data.delivery_charge.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                        </div>
                                    }
                                    <div className='flex flex-row justify-between'>
                                        <p>Total Amount</p>
                                        <p>Rs. {data.total_amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                    </div>
                                    {(() => {
                                        const total = Number(data?.total_amount) || 0;
                                        const effectiveCustomer = customerFromApi || customer;

                                        // Prioritize `data.discount` so real-time input in "Other" tab is immediately visible
                                        let rawDiscount;
                                        let fromApi = false;
                                        
                                        if (data?.discount != null && data.discount !== "") {
                                            rawDiscount = data.discount;
                                        } else if (effectiveCustomer?.discount !== undefined && effectiveCustomer?.discount !== null) {
                                            rawDiscount = effectiveCustomer.discount;
                                            fromApi = true;
                                        }

                                        if (rawDiscount == null) {
                                            return null;
                                        }

                                        const rawStr = String(rawDiscount).trim();
                                        const discountPercent = rawStr === "" ? NaN : Number(rawStr.replace(/%/g, "").trim());
                                        // Customer loyalty discount (fromApi) is always a percentage; the "Other" tab discount
                                        // is a percentage only when the user typed it with a trailing '%' — otherwise it's a flat Rs. amount.
                                        const isPercent = fromApi || rawStr.endsWith("%");

                                        const loyaltyDiscountAmount = isPercent
                                            ? total * (discountPercent / 100)
                                            : discountPercent;
                                        const calculatedLoyaltyDiscount = Number.isFinite(loyaltyDiscountAmount) && loyaltyDiscountAmount >= 0 ? loyaltyDiscountAmount : 0;
                                        const hasDiscount = isPercent || Number.isFinite(discountPercent);

                                        if (!hasDiscount || rawStr === "") {
                                            return null;
                                        }

                                        // For display:
                                        let discountDisplay = "";
                                        if (fromApi) {
                                            discountDisplay = Number.isFinite(Number(effectiveCustomer.discount)) ? `${effectiveCustomer.discount}%` : String(effectiveCustomer.discount);
                                        } else {
                                            discountDisplay = rawStr.endsWith("%") ? `${discountPercent}%` : `Rs. ${discountPercent.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                                        }

                                        return (
                                            <>
                                                <div className='flex flex-row justify-between'>
                                                    <p>Discount :</p>
                                                    <p>{discountDisplay}</p>
                                                </div>
                                                <div className='flex flex-row justify-between'>
                                                    <p>Discount Amount</p>
                                                    <p>Rs. {calculatedLoyaltyDiscount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                                </div>
                                            </>
                                        );
                                    })()}
                                    {data.payment && data.payment.length > 0 ? (
                                        data.payment.filter(p => p.payment_method).map((p, idx) => {
                                            const amount = p.payment_method === "CASH" && (p.paid_amount === "" || p.paid_amount == null) ? (data.advance_payment ?? 0) : (p.paid_amount ?? 0);
                                            return (
                                                <React.Fragment key={idx}>
                                                    <div className='flex flex-row justify-between'>
                                                        <p>Payment Method</p>
                                                        <p>{p.payment_method}</p>
                                                    </div>
                                                    <div className='flex flex-row justify-between'>
                                                        <p>Advanced Amount</p>
                                                        <p>Rs. {Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                                    </div>
                                                </React.Fragment>
                                            );
                                        })
                                    ) : (
                                        <>
                                            <div className='flex flex-row justify-between'>
                                                <p>Payment Method</p>
                                                <p>{data.payment_method ?? ""}</p>
                                            </div>
                                            <div className='flex flex-row justify-between'>
                                                <p>Advanced Amount</p>
                                                <p>Rs. {(data.advance_payment ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                            </div>
                                        </>
                                    )}
                                    <div className='flex flex-row justify-between font-bold'>
                                        <p>Remaining Amount</p>
                                        <p>Rs. {(Number.isFinite(displayRemainingAmount) ? displayRemainingAmount : 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                    </div>

                                    {isLastPage && pageItems.length <= 4 && (
                                        <div style={{ pageBreakInside: 'avoid' }}>
                                            <div className='flex flex-col justify-between font-bold mt-2 text-xs'>
                                                <p>NOTES</p>
                                                <p className='font-normal'>{data.notes}</p>
                                            </div>

                                            <div className='flex flex-col justify-between font-bold mt-2 text-xs'>
                                                <p>TERMS & CONDITIONS</p>
                                                <p className='font-normal'>{data.terms_and_conditions}</p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            }
                            </div>

                            {/* Footer Section - fixed at bottom of page using remaining space */}
                            <div className='print-footer flex flex-col text-xxs items-center'>
                                <p className='font-semibold'>"THIS IS SYSTEM GENERATED"</p>
                                <p className='font-semibold text-xs'>CL Solutions (PVT) LTD</p>
                                <p>Registered address:583/71, Augustine Premathirathne Mawatha, Liyanagemulla, Seeduwa</p>
                                <p>Laundry facility: 391,Avissawella Road,Wellampitiya</p>
                                <div className='flex flex-row'>
                                    <p>TEL: 94 114 701 566, EMAIL: info@sparklelaundry.lk, WEB : www.sparklelaundry.lk</p>
                                </div>
                                <div className='flex flex-row justify-between w-full'>
                                    <p>Page {pageIndex + 1} of {itemPages.length}</p>
                                    <p className="ms-auto">POWERED BY CEYLONX CORPORATION</p>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div >
        </div >
    );
});

export default RetailSalesOrder;