import React, { useEffect, useState } from 'react';
import logo from "../../assets/logo.png";
import { QRCodeCanvas } from 'qrcode.react';
import { getOutletInfoForBranch } from "../../utils/branchFallbacks";
import axios from "axios";

const ITEMS_PER_PAGE = 8;

const RetailServiceOrderBulk = ({ order, serviceType, itemTypes, foldType, itemsFormatted, serialStart = 1 }) => {
    const [users, setUsers] = useState([]);
    const [publicCollectorName, setPublicCollectorName] = useState("");
    const branchIdToUse = order?.branch_id != null ? order.branch_id : (typeof window !== "undefined" ? localStorage.getItem("selectedBranchId") : null);
    const outletInfo = getOutletInfoForBranch(branchIdToUse) ?? {
        name: typeof window !== "undefined" ? localStorage.getItem("selectedBranchName") || "" : "",
        address: "",
        telephone: "",
    };
    const splitItems = (items, maxPerPage) => {
        const pages = [];
        for (let i = 0; i < items.length; i += maxPerPage) {
            pages.push(items.slice(i, i + maxPerPage));
        }
        return pages;
    };

    const isAllItemsMode = serviceType == null || foldType == null;
    const filteredOrders = isAllItemsMode
        ? (itemsFormatted ?? [])
        : (itemsFormatted?.filter(item => item.service_type_id === serviceType && item.packing_option === foldType) ?? []);
    const totalItems = filteredOrders.length;
    const itemPages = splitItems(filteredOrders, ITEMS_PER_PAGE);
    const lastPage = itemPages[itemPages.length - 1];
    const validPages = itemPages.filter(page => page.length > 0);
    // Only show notes on next page if total items > ITEMS_PER_PAGE and last page has more than 3 items
    const showOnNextPage = totalItems > ITEMS_PER_PAGE && itemPages[itemPages?.length - 1]?.length > 3;

    const packingMap = {
        Fold: "F",
        Hanger: "H"
    };
    const packingOption = [...new Set(filteredOrders?.map(item => packingMap[item.packing_option]).filter(Boolean))].join(",") || "F,H";

    // Fetch all users to map user_id to username
    useEffect(() => {
        const fetchUsers = async () => {
            try {
                const response = await axios.get(`${(import.meta.env.VITE_SERVER_API_ADMIN || "").trim().replace(/\/$/, "")}/user/getAllUsers`);
                if (response?.data?.allUsers) {
                    setUsers(response.data.allUsers);
                }
            } catch (error) {
                console.error("Error fetching users:", error);
            }
        };
        fetchUsers();
    }, []);

    // Fetch collector name for public view if it's an ID
    useEffect(() => {
        const createdById = order?.created_by || order?.user_id;
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
                    console.error("RetailServiceOrderBulk: Error fetching public collector name", e);
                }
            };
            fetchName();
            return () => { cancelled = true; };
        }
    }, [order?.created_by, order?.user_id]);

    // Get collector username from user_id
    const getCollectorName = () => {
        // Prioritize name fetched from public API
        if (publicCollectorName) return publicCollectorName;

        // First check if we have name fields directly
        if (order?.created_by_name || order?.created_by_user_name || order?.user_name) {
            return order.created_by_name || order.created_by_user_name || order.user_name;
        }
        
        // If created_by is a user_id, find the username from users list
        const createdById = order?.created_by;
        if (createdById && users.length > 0) {
            const user = users.find(u => String(u.user_id) === String(createdById));
            if (user?.name) {
                return user.name;
            }
        }
        
        // Fallback to current user or created_by value
        return localStorage.getItem("userName") || createdById || "";
    };

    return (
        <div className=''>
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
                        overflow: hidden;
                    }
                    .print-page-container:first-of-type {
                        page-break-before: auto !important;
                        margin-top: 0 !important;
                        padding-top: 15px !important;
                    }
                    .print-page-container:not(:first-of-type) {
                        page-break-before: always;
                    }
                    .print-page-container:not(:last-child) {
                        page-break-after: always;
                    }
                    .print-page-container:last-child {
                        page-break-after: auto;
                    }
                    .print-page-container:empty {
                        display: none;
                    }
                    .print-content {
                        display: flex;
                        flex-direction: column;
                        flex: 1 0 auto;
                    }
                    .print-content > *:last-child {
                        margin-bottom: 0;
                    }
                    .print-page-container:first-of-type:not(:only-child) .print-content {
                        margin-top: 0 !important;
                        padding-top: 0 !important;
                    }
                    .print-footer {
                        margin-top: auto;
                        padding-top: 4px;
                        flex-shrink: 1;
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
                    .print-page-container.print-page-full {
                        padding: 15px;
                    }
                    .print-page-container.print-page-full .print-content > div {
                        margin-top: 1px !important;
                    }
                    .print-page-container.print-page-full .print-content > div:first-child {
                        margin-top: 0 !important;
                    }
                    .print-page-container.print-page-full .print-content table.border {
                        font-size: 0.55rem;
                        margin-top: 1px;
                        line-height: 1.15;
                    }
                    .print-page-container.print-page-full .print-content table.border th,
                    .print-page-container.print-page-full .print-content table.border td {
                        padding: 1px 4px;
                    }
                    .print-page-container.print-page-full .print-content .gap-y-1 {
                        margin-top: 1px !important;
                        margin-bottom: 0 !important;
                    }

                    .print-page-container.print-page-full .print-content img.w-20 {
                        width: 3rem;
                    }
                    .print-page-container.print-page-full .print-content .text-2xl {
                        font-size: 1rem;
                    }
                    .print-page-container.print-page-full .print-content .text-xl {
                        font-size: 0.85rem;
                    }
                    .print-page-container.print-page-full .print-content .text-xs {
                        font-size: 0.55rem;
                    }
                    .print-page-container.print-page-full .print-content .mt-2 {
                        margin-top: 4px !important;
                    }
                    .print-page-container.print-page-full .print-content .my-1 {
                        margin-top: 2px !important;
                        margin-bottom: 2px !important;
                    }
                    .print-page-container.print-page-full .print-footer {
                        padding-top: 6px;
                        font-size: 0.55rem;
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
            <div id="print-section" className="hidden print:flex print-container flex-col w-full a5-print">
                {itemPages.map((pageItems, pageIndex) => {
                    if (pageItems.length === 0) return null;
                    const isLastPage = pageIndex === itemPages.length - 1;
                    let validPageNumber = 0;
                    for (let i = 0; i <= pageIndex; i++) {
                        if (itemPages[i].length > 0) {
                            validPageNumber++;
                        }
                    }
                    return (
                        <div 
                            key={pageIndex} 
                            className={`print-page-container flex flex-col ${pageItems.length === ITEMS_PER_PAGE ? "print-page-full" : ""}`}
                        >
                            <div className="print-content flex flex-col">
                            {/* Header Section */}
                            <div className="relative flex flex-row items-start justify-between" >
                                <div className="flex flex-col me-auto">
                                    <img src={logo} className="w-32 object-contain" />
                                    <div className="text-sm mt-2 text-black/80">
                                        <p>Outlet Name : {outletInfo?.name || "—"}</p>
                                        <p>Address     : {outletInfo?.address || "—"}</p>
                                        <p>Telephone   : {outletInfo?.telephone || "—"}</p>
                                    </div>
                                </div>

                                <div className="absolute top-0 left-1/2 transform -translate-x-1/2 mt-4">
                                    <h1 className="font-bold text-center text-2xl">Service Order</h1>
                                    {!isAllItemsMode && <h1 className="text-center text-xl">({serviceType === 1 ? "WASHING" : serviceType === 2 ? "PRESSING" : "DRY CLEAN"})</h1>}
                                </div>

                                <div className="flex flex-col text-xs items-end mt-4">
                                    <div className="flex flex-row gap-x-5">
                                        <div className="flex flex-row gap-x-2">
                                            <p className="font-semibold">Date :</p>
                                            <p className="">{order?.created_at ? new Date(order.created_at).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]}</p>
                                        </div>

                                        <div className="flex flex-row gap-x-2">
                                            <p className="font-semibold">Time :</p>
                                            <p className="">{order?.created_at ? new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                                        </div>
                                    </div>
                                    {order.redo_order_reference && (
                                        <div className="flex flex-row gap-x-2 mt-1">
                                            <p className="font-bold text-base">REDO: {order.redo_order_reference}</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className='flex flex-row justify-between mt-2 text-xs'>
                                <div className='border border-black/20 grid grid-cols-2 gap-x-3 p-1'>
                                    <p className='font-semibold'>ORDER NO:</p>
                                    <p>{order.order_id}</p>
                                    <p className='font-semibold'>CUSTOMER ID:</p>
                                    <p className='uppercase'>{order.customer_id}</p>
                                    <p className='font-semibold'>CUSTOMER NAME:</p>
                                    <p className='uppercase'>{order.customer_name}</p>
                                    <p className='font-semibold'>PHONE NO:</p>
                                    <p>{order.phone_number}</p>
                                </div>

                                <div className='border border-black/20 grid grid-cols-2 gap-x-3 p-1'>
                                    <p className='font-semibold'>COLLECTOR:</p>
                                    <p className='uppercase'>{getCollectorName()}</p>
                                    <p className='font-semibold'>DELIVERY TYPE:</p>
                                    <p className='uppercase'>{order.delivery_type}</p>
                                    <p className='font-semibold'>DELIVERY OUTLET:</p>
                                    <p className='uppercase'>
                                        {order.delivery_outlet || localStorage.getItem("selectedBranchName") || "N/A"}
                                    </p>
                                    <p className='font-semibold'>COLLECTION DATE:</p>
                                    <p className='uppercase'>{(order?.created_at
                                        ? new Date(order.created_at)
                                        : new Date()
                                    ).toISOString().split("T")[0]}</p>
                                    <p className='font-semibold'>DELIVERY DATE:</p>
                                    <p className="uppercase">{new Date(order.delivery_date).toISOString().split("T")[0]}</p>
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
                                        {/* <th className='border-r border-black/20'>Qty</th> */}
                                        <th>Bar Code</th>
                                    </tr>
                                </thead>
                                <tbody className='align-top'>
                                    {pageItems.map((item, index) => (
                                        <tr className='text-center align-top'>
                                            <td className='border-r border-black/20 align-top'>{serialStart + (pageIndex * ITEMS_PER_PAGE) + index}</td>
                                            <td className='border-r border-black/20 align-top'>{itemTypes.find(type => type.item_type_id === item.item_type_id)?.item_type_name}</td>
                                            <td className='border-r border-black/20 align-top'>{item.color}</td>
                                            <td className='border-r border-black/20 align-top'>{item.brand}</td>
                                            <td className='border-r border-black/20 align-top whitespace-normal'>{item.remark}</td>
                                            <td className='border-r border-black/20 align-top'>{item.packing_option}</td>
                                            {/* <td className='border-r border-black/20 align-top'>{item.quantity}</td> */}
                                            <td>{item.barcode}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>

                            {/* Summary Section - Total Items = count on this page only */}
                            <div className='flex flex-col gap-y-1 my-1 text-sm' style={{ pageBreakInside: 'avoid' }}>
                                <div className='flex flex-row justify-between font-bold border border-black/20 p-1'>
                                    <p>Total Items</p>
                                    <p>{pageItems.length}</p>
                                </div>
                                <div className='grid grid-cols-11 font-medium border border-dashed text-center text-lg py-2'>
                                    <div className='flex items-center justify-center'>
                                        <QRCodeCanvas value={order.order_id} size={70} />
                                    </div>
                                    <div className='flex flex-col col-span-3 border-l border-r border-dashed'>
                                        <p className='border-b border-dashed flex items-center justify-center'>{order.order_id}</p>
                                        <p className='flex items-center justify-center'>{new Date().toISOString().split("T")[0]}</p>
                                    </div>
                                    <p className='border-r border-dashed flex items-center justify-center'>{pageItems.reduce((sum, item) => {
                                        const fullQty = Number(item.quantity) || 0;
                                        const fullPcs = Number(item.pics_count) || 0;
                                        const perPieceQty = fullPcs > 0 ? fullQty / fullPcs : 0;
                                        return sum + perPieceQty;
                                    }, 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
                                    <p className='border-r border-dashed flex items-center justify-center'>{order.delivery_type === "Normal"
                                        ? "NO"
                                        : order.delivery_type === "One Day"
                                            ? "OD"
                                            : order.delivery_type === "Two Day"
                                                ? "TD"
                                                : order.delivery_type === "Urgent"
                                                    ? "UR"
                                                    : "EX"}
                                    </p>
                                    <p className='border-r border-dashed flex items-center justify-center'>{isAllItemsMode ? "W/P/D" : (serviceType === 1 ? "W" : serviceType === 2 ? "P" : "D")}</p>
                                    <p className='border-r border-dashed flex items-center justify-center'>{packingOption}</p>
                                    <p className='col-span-3 font-bold text-3xl flex items-center justify-center'>{order.order_id}</p>
                                </div>
                            </div>
                            </div>

                            {/* Footer Section - default height but can shrink */}
                            <div className='print-footer flex flex-col text-xxs w-full shrink'>
                                <div className="border border-black h-[100px] min-h-[15px] shrink w-full p-1 mt-1">
                                    <p className="text-xs text-black/70">Comments:</p>
                                </div>
                                <div className='flex flex-row justify-between w-full mt-1 shrink-0'>
                                    <p>Page {validPageNumber} of {showOnNextPage ? validPages.length + 1 : validPages.length}</p>
                                    <p className="ms-auto">POWERED BY CEYLONX CORPORATION</p>
                                </div>
                            </div>
                        </div>
                    );
                })}

                {showOnNextPage &&
                    <div className="print-page-container flex flex-col w-full">
                        <div className="print-content flex flex-col">
                        {/* Header Section */}
                        <div className="relative flex flex-row items-start justify-between mt-3">
                            <div className="flex flex-col me-auto">
                                <img src={logo} className="w-32 object-contain" />
                                <div className="text-sm mt-2 text-black/80">
                                    <p>Outlet Name : {outletInfo?.name || "—"}</p>
                                    <p>Address     : {outletInfo?.address || "—"}</p>
                                    <p>Telephone   : {outletInfo?.telephone || "—"}</p>
                                </div>
                            </div>

                            <div className="absolute top-0 left-1/2 transform -translate-x-1/2 mt-4">
                                <h1 className="font-bold text-center text-2xl">Service Order</h1>
                                {!isAllItemsMode && <h1 className="text-center text-xl">({serviceType === 1 ? "WASHING" : serviceType === 2 ? "PRESSING" : "DRY CLEAN"})</h1>}
                            </div>

                            <div className="flex flex-col text-xs items-end mt-4">
                                <div className="flex flex-row gap-x-5">
                                    <div className="flex flex-row gap-x-2">
                                        <p className="font-semibold">Date :</p>
                                        <p className="">{order?.created_at ? new Date(order.created_at).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]}</p>
                                    </div>

                                    <div className="flex flex-row gap-x-2">
                                        <p className="font-semibold">Time :</p>
                                        <p className="">{order?.created_at ? new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                                    </div>
                                </div>
                                {order.redo_order_reference && (
                                    <div className="flex flex-row gap-x-2 mt-1">
                                        <p className="font-bold text-base">REDO: {order.redo_order_reference}</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className='flex flex-row justify-between mt-2 text-xs'>
                            <div className='border border-black/20 grid grid-cols-2 gap-x-3 p-1'>
                                <p className='font-semibold'>ORDER NO:</p>
                                <p>{order.order_id}</p>
                                <p className='font-semibold'>CUSTOMER ID:</p>
                                <p className='uppercase'>{order.customer_id}</p>
                                <p className='font-semibold'>CUSTOMER NAME:</p>
                                <p className='uppercase'>{order.customer_name}</p>
                                <p className='font-semibold'>PHONE NO:</p>
                                <p>{order.phone_number}</p>
                            </div>

                            <div className='border border-black/20 grid grid-cols-2 gap-x-3 p-1'>
                                <p className='font-semibold'>COLLECTOR:</p>
                                <p className='uppercase'>{getCollectorName()}</p>
                                <p className='font-semibold'>DELIVERY TYPE:</p>
                                <p className='uppercase'>{order?.delivery_type}</p>
                                <p className='font-semibold'>COLLECTION DATE:</p>
                                <p className='uppercase'>{(order?.created_at
                                    ? new Date(order.created_at)
                                    : new Date()
                                ).toISOString().split("T")[0]}</p>
                                <p className='font-semibold'>DELIVERY DATE:</p>
                                <p className="uppercase">
                                    {new Date(order.delivery_date).toISOString().split("T")[0]}
                                </p>
                            </div>
                        </div>

                        {/* Summary Section - Always show on next page when showOnNextPage is true (no items on this page) */}
                        <div className='flex flex-col gap-y-1 my-1 text-sm' style={{ pageBreakInside: 'avoid' }}>
                            <div className='flex flex-row justify-between font-bold border border-black/20 p-1'>
                                <p>Total Items</p>
                                <p>0</p>
                            </div>
                            <div className='grid grid-cols-11 font-medium border border-dashed text-center text-lg py-2'>
                                <div className='flex items-center justify-center'>
                                    <QRCodeCanvas value={order.order_id} size={70} />
                                </div>
                                <div className='flex flex-col col-span-3 border-l border-r border-dashed'>
                                    <p className='border-b border-dashed flex items-center justify-center'>{order.order_id}</p>
                                    <p className='flex items-center justify-center'>{new Date().toISOString().split("T")[0]}</p>
                                </div>
                                <p className='border-r border-dashed flex items-center justify-center'>{filteredOrders.reduce((sum, item) => sum + item.quantity, 0)}</p>
<p className='border-r border-dashed flex items-center justify-center'>{order.delivery_type === "Normal"
                                        ? "NO"
                                        : order.delivery_type === "One Day"
                                            ? "OD"
                                            : order.delivery_type === "Two Day"
                                                ? "TD"
                                                : order.delivery_type === "Urgent"
                                                    ? "UR"
                                                    : "EX"}
                                </p>
                                <p className='border-r border-dashed flex items-center justify-center'>{isAllItemsMode ? "W/P/D" : (serviceType === 1 ? "W" : serviceType === 2 ? "P" : "D")}</p>
                                <p className='border-r border-dashed flex items-center justify-center'>{packingOption}</p>
                                <p className='col-span-3 font-bold text-3xl flex items-center justify-center'>{order.order_id}</p>
                            </div>
                        </div>
                        </div>

                        {/* Footer Section - default height but can shrink */}
                        <div className='print-footer flex flex-col text-xxs w-full mt-auto shrink'>
                            <div className="border border-black h-[100px] min-h-[15px] shrink w-full p-1 mt-1">
                                <p className="text-xs text-black/70">Comments:</p>
                            </div>
                            <div className='flex flex-row justify-between w-full mt-1 shrink-0'>
                                <p>Page {validPages.length + 1} of {showOnNextPage ? validPages.length + 1 : validPages.length}</p>
                                <p className="ms-auto">POWERED BY CEYLONX CORPORATION</p>
                            </div>
                        </div>
                    </div>
                }
            </div >
        </div >
    );
};

export default RetailServiceOrderBulk;