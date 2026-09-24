import React from 'react';
import logo from "../../assets/logo.png";

function formatHeaderDateSlash(raw) {
    if (raw == null || raw === "") return "";
    
    if (raw instanceof Date) {
        if (Number.isFinite(raw.getTime())) {
            const yyyy = raw.getFullYear();
            const mm = String(raw.getMonth() + 1).padStart(2, "0");
            const dd = String(raw.getDate()).padStart(2, "0");
            return `${yyyy}/${mm}/${dd}`;
        }
        return "";
    }

    // Convert input to a string
    let str = String(raw).trim();
    if (str.includes("T")) {
        str = str.split("T")[0];
    } else if (str.includes(" ")) {
        str = str.split(" ")[0];
    }
    
    // Replace all dashes with forward slashes
    return str.replace(/-/g, "/");
}

function formatDeliveryType(val) {
    if (!val) return "Normal";
    const str = String(val).replace(/_/g, " ").trim().toLowerCase();
    return str.split(/\s+/).map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

const CorporateDeliveryNote = React.forwardRef(({ data, items, customer }, ref) => {
    // 1. Group items by service type
    const serviceTypeGroups = {};
    let grandTotalQty = 0;

    (items || []).forEach(item => {
        const serviceType = item.service_type || "Washing";

        // Normalize service type: keep "Dry Clean" multi-word, others title-cased
        let normalizedServiceType;
        const lower = serviceType.toLowerCase();
        if (lower.includes('dry')) {
            normalizedServiceType = 'Dry Clean';
        } else if (lower.includes('press')) {
            normalizedServiceType = 'Pressing';
        } else {
            normalizedServiceType = serviceType.charAt(0).toUpperCase() + serviceType.slice(1).toLowerCase();
        }

        if (!serviceTypeGroups[normalizedServiceType]) {
            serviceTypeGroups[normalizedServiceType] = [];
        }
        serviceTypeGroups[normalizedServiceType].push(item);
    });

    // Sort the service types in a specific order: Washing first, then Pressing, then Dry Clean, then others
    const sortedServiceTypes = Object.keys(serviceTypeGroups).sort((a, b) => {
        const priority = { "Washing": 1, "Pressing": 2, "Dry Clean": 3 };
        return (priority[a] || 99) - (priority[b] || 99);
    });

    // 2. For each service type, group items by Category within it
    const processedGroups = {};

    sortedServiceTypes.forEach(serviceType => {
        const itemsInService = serviceTypeGroups[serviceType];
        const categoryGroups = {};
        let localNo = 1; // Sequential numbering per table

        itemsInService.forEach(item => {
            const categoryName = item.item_category_name || "ROOM LINEN";

            if (!categoryGroups[categoryName]) {
                categoryGroups[categoryName] = [];
            }

            const qty = Number(item.delivered_qty || item.delivery_quantity || 0);
            grandTotalQty += qty;

            categoryGroups[categoryName].push({
                ...item,
                qty,
                noStr: String(localNo++).padStart(2, '0')
            });
        });

        processedGroups[serviceType] = {
            categories: categoryGroups
        };
    });

    const renderHeader = () => (
        <>
            <div className="flex flex-row">
                <img src={logo} className="w-32 md:w-44 object-contain me-auto print:w-44" alt="Logo" />
                <div className="flex flex-col text-xs items-end gap-y-0.5">
                    <div className="flex flex-row gap-x-5">
                        <div className="flex flex-row gap-x-2">
                            <p className="font-semibold">Printed Date :</p>
                            <p>{(() => {
                                const d = new Date();
                                const yyyy = d.getFullYear();
                                const mm = String(d.getMonth() + 1).padStart(2, "0");
                                const dd = String(d.getDate()).padStart(2, "0");
                                return `${yyyy}-${mm}-${dd}`;
                            })()}</p>
                        </div>
                        <div className="flex flex-row gap-x-2">
                            <p className="font-semibold">Time :</p>
                            <p>{new Date().toLocaleTimeString()}</p>
                        </div>
                    </div>
                    {/* CANCELLED stamp — bold red plain text, right-aligned, shown only for cancelled notes */}
                    {data?.status === 'Deactive' && (
                        <p className="font-bold text-red-600 text-base uppercase tracking-widest mt-0.5">
                            CANCELLED
                        </p>
                    )}
                </div>
            </div>
            <div className="w-full flex -mt-10 md:-mt-14 print:-mt-10">
                <div className="text-left w-[38%] md:w-[38%] print:w-[38%] ms-auto px-3 print:px-2.5">
                    <div className="text-xl md:text-2xl font-bold tracking-wide uppercase print:text-[1.2rem] print:leading-tight text-neutral-900">
                        Delivery Note
                    </div>
                </div>
            </div>
        </>
    );

    const renderInfoBoxes = () => (
        <div className="flex flex-row justify-between mt-10 md:mt-14 print:mt-10 text-[11px] md:text-[12px] leading-snug print:mt-1 print:text-[9px] print:leading-tight w-full items-start">
            {/* Left Box — Our Company (Supplier) */}
            <div className="flex flex-col px-3 pt-0 pb-1 w-[52%] md:w-[52%] print:w-[52%] min-w-0 text-neutral-900 text-left -mt-6 md:-mt-8 print:-mt-6" style={{ textTransform: 'none' }}>
                <div className="font-bold text-[12px] print:text-[10px]">
                    Delivery Note No : {data?.delivery_note_id ?? '—'}
                </div>
                <div className="mt-1.5 font-bold text-[12px] print:text-[10px]">Supplier's Details</div>
                <div className="text-[11px] print:text-[9px] mt-0.5">VAT NO  : 108812540-7000</div>
                <div className="font-bold text-[11px] print:text-[9px]">C L SOLUTIONS ( PVT ) LTD</div>
                <div className="text-[11px] print:text-[9px]">Registered Address : No:583/71, Augustine Premathirathna Road</div>
                <div className="text-[11px] print:text-[9px]">Blue Diamond Road ) Liyanagemulla , Seeduwa</div>
                <div className="text-[11px] print:text-[9px]">Operational Address : No 391 , Avissawella Road , Wellampitiya</div>
                <div className="text-[11px] print:text-[9px]">Hot Line : 011-4701566</div>
                <div className="text-[11px] print:text-[9px]">Hot Line : 0764660661</div>
                <div className="text-[11px] print:text-[9px]">Email : info@sparklelaundry.lk  WEB : www.sparklelaundry.lk</div>
            </div>

            {/* Right Box — Purchaser (Customer) */}
            <div className="flex flex-col px-3 pt-0 pb-1 w-[38%] md:w-[38%] print:w-[38%] min-w-0 text-neutral-900 text-left ms-auto -mt-6 md:-mt-8 print:-mt-6" style={{ textTransform: 'none' }}>
                <div className="font-bold text-[12px] print:text-[10px]">
                    Date of Delivery : {formatHeaderDateSlash(data?.created_at || 'YYYY/MM/DD')}
                </div>
                <div className="mt-1.5 font-bold text-[12px] print:text-[10px]">Purchaser's Details</div>
                <div className="text-[11px] print:text-[9px] mt-0.5">
                    VAT NO  : {(() => { const val = customer?.customer_vat_number || customer?.vat_number || customer?.vat_no || customer?.vat; return val && val !== '00000' && val !== '0000' ? val : '-'; })()}
                </div>
                <div className="font-bold text-[11px] print:text-[9px] uppercase">
                    {customer?.company_name ?? customer?.customer_company_name ?? '—'}
                    {(() => {
                        const brand = String(customer?.place_of_supply || data?.place_of_supply || "").trim();
                        return brand ? ` (${brand})` : "";
                    })()}
                </div>
                <div className="text-[11px] print:text-[9px]">Registered Address : {customer?.customer_address || customer?.address || '—'}</div>
                <div className="text-[11px] print:text-[9px]">Tel : {customer?.customer_phone || customer?.phone_number || customer?.phone || '—'}</div>
                <div className="text-[11px] print:text-[9px]">Email : {customer?.customer_email || customer?.email || '—'}  WEB :</div>
                <div className="mt-1.5 text-[11px] print:text-[9px]">
                    Place of Supply : {customer?.place_of_supply || data?.place_of_supply || '—'}
                </div>
            </div>
        </div>
    );

    const renderGroupedTables = () => {
        const allItems = sortedServiceTypes.flatMap(st => Object.values(processedGroups[st].categories).flat());
        const grandTotalOrderQty = allItems.reduce((sum, item) => sum + Number(item.order_quantity ?? item.order_qty ?? 0), 0);
        const grandTotalTodayQty = allItems.reduce((sum, item) => sum + Number(item.qty ?? item.delivered_qty ?? 0), 0);
        const grandTotalDeliveredQty = allItems.reduce((sum, item) => {
            const todayQty = Number(item.qty ?? item.delivered_qty ?? 0);
            const historicalTotal = Number(item.cumulative_delivered_qty ?? 0);
            return sum + historicalTotal + todayQty;
        }, 0);
        const grandTotalPendingQty = allItems.reduce((sum, item) => {
            const orderQty = Number(item.order_quantity ?? item.order_qty ?? 0);
            const todayQty = Number(item.qty ?? item.delivered_qty ?? 0);
            const historicalTotal = Number(item.cumulative_delivered_qty ?? 0);
            return sum + Math.max(0, orderQty - (historicalTotal + todayQty));
        }, 0);

        return (
            <div className="mt-5">
                <table className="border border-black/20 border-collapse w-full text-xs text-black">
                    <thead>
                        <tr className="border-b border-black/20">
                            <th className="border-r border-black/20 p-2 text-left font-bold bg-white text-black" style={{ width: '13%' }}>Item Code</th>
                            <th className="border-r border-black/20 p-2 text-left font-bold bg-white text-black" style={{ width: '33%' }}>Item Name &amp; Description</th>
                            <th rowSpan={5} className="border-r border-black/20 p-2 text-center font-bold bg-white text-black align-middle" style={{ width: '9%' }}>Uom</th>
                            <th rowSpan={5} className="border-r border-black/20 p-2 text-center font-bold bg-white text-black align-middle" style={{ width: '9%' }}>Order Qty</th>
                            <th rowSpan={5} className="border-r border-black/20 p-2 text-center font-bold bg-white text-black align-middle" style={{ width: '9%' }}>Today's Delivery Qty</th>
                            <th rowSpan={5} className="border-r border-black/20 p-2 text-center font-bold bg-white text-black align-middle" style={{ width: '9%' }}>Total Delivery Qty</th>
                            <th rowSpan={5} className="border-r border-black/20 p-2 text-center font-bold bg-white text-black align-middle" style={{ width: '9%' }}>Pending Qty</th>
                            <th rowSpan={5} className="p-2 text-center font-bold bg-white text-black align-middle" style={{ width: '9%' }}>Remark</th>
                        </tr>
                        <tr className="border-b border-black/20 bg-white text-left">
                            <td className="border-r border-black/20 p-2 font-bold text-xs">Order No</td>
                            <td className="border-r border-black/20 p-2 text-xs font-semibold text-black">{data?.pickup_entry_id || '—'}</td>
                        </tr>
                        <tr className="border-b border-black/20 bg-white text-left">
                            <td className="border-r border-black/20 p-2 font-bold text-xs">Delivery Note No</td>
                            <td className="border-r border-black/20 p-2 text-xs font-semibold text-black">{data?.delivery_note_id || '—'}</td>
                        </tr>
                        <tr className="border-b border-black/20 bg-white text-left">
                            <td className="border-r border-black/20 p-2 font-bold text-xs">Room No</td>
                            <td className="border-r border-black/20 p-2 text-xs font-semibold text-black">{data?.room_no || '—'}</td>
                        </tr>
                        <tr className="border-b border-black/20 bg-white text-left">
                            <td className="border-r border-black/20 p-2 font-bold text-xs">Gate Pass No</td>
                            <td className="border-r border-black/20 p-2 text-xs font-semibold text-black">{data?.gate_pass_no || '—'}</td>
                        </tr>
                    </thead>
                    <tbody>
                        {sortedServiceTypes.map((serviceType, tableIndex) => {
                            const { categories } = processedGroups[serviceType];
                            const isLastTable = tableIndex === sortedServiceTypes.length - 1;
                            const showCategorySubtotal = Object.keys(categories).length > 1;

                            const itemsInService = Object.values(categories).flat();
                            const subTotalOrderQty = itemsInService.reduce((sum, item) => sum + Number(item.order_quantity ?? item.order_qty ?? 0), 0);
                            const subTotalTodayQty = itemsInService.reduce((sum, item) => sum + Number(item.qty ?? item.delivered_qty ?? 0), 0);
                            const subTotalDeliveredQty = itemsInService.reduce((sum, item) => {
                                const todayQty = Number(item.qty ?? item.delivered_qty ?? 0);
                                const historicalTotal = Number(item.cumulative_delivered_qty ?? 0);
                                return sum + historicalTotal + todayQty;
                            }, 0);
                            const subTotalPendingQty = itemsInService.reduce((sum, item) => {
                                const orderQty = Number(item.order_quantity ?? item.order_qty ?? 0);
                                const todayQty = Number(item.qty ?? item.delivered_qty ?? 0);
                                const historicalTotal = Number(item.cumulative_delivered_qty ?? 0);
                                return sum + Math.max(0, orderQty - (historicalTotal + todayQty));
                            }, 0);

                            return (
                                <React.Fragment key={serviceType}>
                                    {tableIndex > 0 && (
                                        <tr style={{ border: 'none' }} className="h-6 bg-transparent">
                                            <td colSpan={8} className="p-0 h-6 bg-transparent" style={{ border: 'none' }}></td>
                                        </tr>
                                    )}
                                    <tr className="border-b border-black/20 bg-white text-left">
                                        <td className="border-r border-black/20 p-2 font-bold text-xs">Service Type</td>
                                        <td colSpan={7} className="p-2 text-xs font-semibold text-black">{serviceType}</td>
                                    </tr>
                                    <tr className="border-b border-black/20 bg-white text-left">
                                        <td className="border-r border-black/20 p-2 font-bold text-xs">Delivery Type</td>
                                        <td colSpan={7} className="p-2 text-xs font-semibold text-black">{formatDeliveryType(data?.delivery_type)}</td>
                                    </tr>
                                    {Object.keys(categories).map((categoryName) => {
                                        const catItems = categories[categoryName];
                                        const catTotalOrderQty = catItems.reduce((sum, item) => sum + Number(item.order_quantity ?? item.order_qty ?? 0), 0);
                                        const catTotalTodayQty = catItems.reduce((sum, item) => sum + Number(item.qty ?? item.delivered_qty ?? 0), 0);
                                        const catTotalDeliveredQty = catItems.reduce((sum, item) => {
                                            const todayQty = Number(item.qty ?? item.delivered_qty ?? 0);
                                            const historicalTotal = Number(item.cumulative_delivered_qty ?? 0);
                                            return sum + historicalTotal + todayQty;
                                        }, 0);
                                        const catTotalPendingQty = catItems.reduce((sum, item) => {
                                            const orderQty = Number(item.order_quantity ?? item.order_qty ?? 0);
                                            const todayQty = Number(item.qty ?? item.delivered_qty ?? 0);
                                            const historicalTotal = Number(item.cumulative_delivered_qty ?? 0);
                                            return sum + Math.max(0, orderQty - (historicalTotal + todayQty));
                                        }, 0);

                                        return (
                                            <React.Fragment key={categoryName}>
                                                <tr className="bg-white text-left border-b border-black/20">
                                                    <td colSpan={8} className="p-2 font-bold text-xs text-black">{categoryName}</td>
                                                </tr>
                                                {catItems.map((item, itemIdx) => {
                                                    const orderQty = Number(item.order_quantity ?? item.order_qty ?? 0);
                                                    const todayQty = Number(item.qty ?? item.delivered_qty ?? 0);
                                                    const historicalTotal = Number(item.cumulative_delivered_qty ?? 0);

                                                    const displayTotalDelivered = historicalTotal + todayQty;

                                                    const displayPending = Math.max(0, orderQty - (historicalTotal + todayQty));

                                                    return (
                                                        <tr key={`${categoryName}-${itemIdx}`} className="border-b border-black/20 last:border-b-0 text-center bg-white text-xs">
                                                            <td className="border-r border-black/20 px-2 py-1.5 align-middle text-left font-mono">{item.corp_item_id || item.item_id || "-"}</td>
                                                            <td className="border-r border-black/20 px-2 py-1.5 align-middle text-left">{item.corp_item_name || item.item_name || "-"}</td>
                                                            <td className="border-r border-black/20 px-2 py-1.5 align-middle text-center">Pcs</td>
                                                            <td className="border-r border-black/20 px-2 py-1.5 align-middle text-center">{orderQty}</td>
                                                            <td className="border-r border-black/20 px-2 py-1.5 align-middle text-center font-normal">{todayQty}</td>
                                                            <td className="border-r border-black/20 px-2 py-1.5 align-middle text-center">{displayTotalDelivered}</td>
                                                            <td className="border-r border-black/20 px-2 py-1.5 align-middle text-center font-normal text-black">{displayPending}</td>
                                                            <td className="px-2 py-1.5 align-middle text-left">{item.remark || item.corp_item_remark || ""}</td>
                                                        </tr>
                                                    );
                                                })}
                                                {showCategorySubtotal && (
                                                    <tr className="bg-white text-black font-normal text-xs text-center border-b border-black/20">
                                                        <td colSpan={3} className="border-r border-black/20 p-2 text-left">Sub Total ({categoryName})</td>
                                                        <td className="border-r border-black/20 p-2 text-center">{catTotalOrderQty}</td>
                                                        <td className="border-r border-black/20 p-2 text-center">{catTotalTodayQty}</td>
                                                        <td className="border-r border-black/20 p-2 text-center">{catTotalDeliveredQty}</td>
                                                        <td className="border-r border-black/20 p-2 text-center">{catTotalPendingQty}</td>
                                                        <td className="p-2"></td>
                                                    </tr>
                                                )}
                                            </React.Fragment>
                                        );
                                    })}
                                    {!showCategorySubtotal && (
                                        <tr className="bg-white text-black font-normal text-xs text-center border-b border-black/20">
                                            <td colSpan={3} className="border-r border-black/20 p-2 text-left">Sub Total</td>
                                            <td className="border-r border-black/20 p-2 text-center">{subTotalOrderQty}</td>
                                            <td className="border-r border-black/20 p-2 text-center">{subTotalTodayQty}</td>
                                            <td className="border-r border-black/20 p-2 text-center">{subTotalDeliveredQty}</td>
                                            <td className="border-r border-black/20 p-2 text-center">{subTotalPendingQty}</td>
                                            <td className="p-2"></td>
                                        </tr>
                                    )}
                                    {isLastTable && (
                                        <>
                                            <tr style={{ border: 'none' }} className="h-4 bg-transparent">
                                                <td colSpan={8} className="p-0 h-4 bg-transparent" style={{ border: 'none' }}></td>
                                            </tr>
                                            <tr className="bg-white text-black font-normal text-xs text-center">
                                                <td colSpan={3} className="border-t border-b border-r border-black/20 p-2 text-left">Total</td>
                                                <td className="border-t border-b border-r border-black/20 p-2 text-center">{grandTotalOrderQty}</td>
                                                <td className="border-t border-b border-r border-black/20 p-2 text-center">{grandTotalTodayQty}</td>
                                                <td className="border-t border-b border-r border-black/20 p-2 text-center">{grandTotalDeliveredQty}</td>
                                                <td className="border-t border-b border-r border-black/20 p-2 text-center">{grandTotalPendingQty}</td>
                                                <td className="border-t border-b border-black/20 p-2"></td>
                                            </tr>
                                        </>
                                    )}
                                </React.Fragment>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        );
    };

    const renderGrandTotals = () => null;

    const renderTermsAndConditions = () => (
        <div className="flex flex-col w-full gap-1 mt-3 text-[9px] print:text-[9px] text-black" style={{ textTransform: 'none' }}>
            <div className="flex flex-col mt-0.5">
                <span className="font-normal text-[9px] print:text-[9px]">Terms and Conditions :</span>
                <p className="mt-0.5 font-normal break-words whitespace-pre-wrap text-neutral-800 text-[9px] print:text-[9px]">
                    Customer must inspect items at time of delivery before signing
                </p>
            </div>
        </div>
    );

    const renderSignatures = () => (
        <>
        <div className="border-t-2 border-[#002A74] w-full mt-3 print:mt-2" />
        <div className="grid grid-cols-3 gap-x-4 w-full mt-3 mb-3 normal-case print:mt-2 print:mb-2 text-center text-black">
            {/* Prepared By */}
            <div className="flex flex-col items-center w-full">
                {(() => {
                    const name = data?.created_by_user || data?.delivered_by_name || data?.delivered_by || '';
                    let dateStr = "";
                    let timeStr = "";
                    const rawDate = data?.created_at || data?.updated_at;
                    if (rawDate) {
                        const d = new Date(rawDate);
                        if (Number.isFinite(d.getTime())) {
                            dateStr = d.toISOString().split("T")[0].replace(/-/g, "/");
                            timeStr = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                        }
                    }
                    return (
                        <>
                            <span className="font-normal text-[9px] print:text-[9px] text-neutral-900 leading-tight min-h-[14px]">
                                {name || "\u00A0"}
                            </span>
                            <span className="text-[8px] print:text-[8px] text-neutral-500 mt-0.5 leading-none">
                                {dateStr ? `${dateStr} : ${timeStr}` : "\u00A0"}
                            </span>
                        </>
                    );
                })()}
                <div className="w-[85%] border-t border-dashed border-[#002A74]/60 mt-8 mb-1.5" />
                <span className="text-[9px] print:text-[9px] text-neutral-900 font-normal">
                    Prepared By
                </span>
            </div>

            {/* Checked By */}
            <div className="flex flex-col items-center w-full">
                {(() => {
                    const name = data?.checked_by_user || '';
                    let dateStr = "";
                    let timeStr = "";
                    if (data?.checked_by_user) {
                        const rawDate = data.checked_at || data.updated_at;
                        if (rawDate) {
                            const d = new Date(rawDate);
                            if (Number.isFinite(d.getTime())) {
                                dateStr = d.toISOString().split("T")[0].replace(/-/g, "/");
                                timeStr = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                            }
                        }
                    }
                    return (
                        <>
                            <span className="font-normal text-[9px] print:text-[9px] text-neutral-900 leading-tight min-h-[14px]">
                                {name || "\u00A0"}
                            </span>
                            <span className="text-[8px] print:text-[8px] text-neutral-500 mt-0.5 leading-none">
                                {dateStr ? `${dateStr} : ${timeStr}` : "\u00A0"}
                            </span>
                        </>
                    );
                })()}
                <div className="w-[85%] border-t border-dashed border-[#002A74]/60 mt-8 mb-1.5" />
                <span className="text-[9px] print:text-[9px] text-neutral-900 font-normal">
                    Checked By
                </span>
            </div>

            {/* Approved By */}
            <div className="flex flex-col items-center w-full">
                {(() => {
                    const name = data?.approved_by_user || '';
                    let dateStr = "";
                    let timeStr = "";
                    if (data?.approved_by_user) {
                        const rawDate = data.approved_at || data.updated_at;
                        if (rawDate) {
                            const d = new Date(rawDate);
                            if (Number.isFinite(d.getTime())) {
                                dateStr = d.toISOString().split("T")[0].replace(/-/g, "/");
                                timeStr = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                            }
                        }
                    }
                    return (
                        <>
                            <span className="font-normal text-[9px] print:text-[9px] text-neutral-900 leading-tight min-h-[14px]">
                                {name || "\u00A0"}
                            </span>
                            <span className="text-[8px] print:text-[8px] text-neutral-500 mt-0.5 leading-none">
                                {dateStr ? `${dateStr} : ${timeStr}` : "\u00A0"}
                            </span>
                        </>
                    );
                })()}
                <div className="w-[85%] border-t border-dashed border-[#002A74]/60 mt-8 mb-1.5" />
                <span className="text-[9px] print:text-[9px] text-neutral-900 font-normal">
                    Approved By
                </span>
            </div>
        </div>
        <div className="border-t-2 border-[#002A74] w-full" />
        </>
    );

    const renderFooter = (pageNumber) => (
        <div className="flex flex-row justify-between items-center w-full text-[8px] print:text-[7.5px] uppercase text-neutral-600 font-normal mt-4 print:mt-2 mb-0 shrink-0">
            {pageNumber === 2 && (
                <p className="ms-auto font-normal text-[8px] print:text-[7.5px] tracking-tight text-right">POWERED BY CEYLONX CORPORATION</p>
            )}
        </div>
    );

    const renderPage2Header = () => (
        <div className="flex flex-col text-black uppercase w-full">
            <div className="flex flex-row">
                <img src={logo} className="w-32 md:w-44 object-contain me-auto print:w-44" alt="Logo" />
            </div>
        </div>
    );

    const renderPage2Content = () => (
        <div className="border border-black/20 p-4 flex flex-col gap-y-3 text-black text-xs rounded-xl bg-white shadow-sm handover-details-panel">
            {/* Title */}
            <h2 className="font-normal text-[9px] print:text-[9px] border-b border-black/10 pb-1.5 text-left tracking-tight">
                Hand Over Details — Goods Received Confirmation
            </h2>

            {/* Section A */}
            <div className="flex flex-col gap-y-1">
                <h3 className="font-normal text-[9px] print:text-[9px] text-left">
                    A. Delivered By (Supplier — Sparkle Laundry Representative)
                </h3>
                <table className="w-full border-collapse border border-black/20 text-[9px] bg-white">
                    <tbody>
                        <tr className="h-8">
                            <td className="border border-black/20 p-1.5 w-1/2 align-top">
                                <span className="font-normal">NAME :</span>
                            </td>
                            <td className="border border-black/20 p-1.5 w-1/2 align-top">
                                <span className="font-normal">DATE :</span>
                            </td>
                        </tr>
                        <tr className="h-10">
                            <td className="border border-black/20 p-1.5 w-1/2 align-top">
                                <span className="font-normal">SIGNATURE :</span>
                            </td>
                            <td className="border border-black/20 p-1.5 w-1/2 align-top">
                                <span className="font-normal">VEHICLE NO/ ROUTE :</span>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>

            {/* Section B */}
            <div className="flex flex-col gap-y-1">
                <h3 className="font-normal text-[9px] print:text-[9px] text-left">
                    B. Received By (Customer / Purchaser Representative)
                </h3>
                <table className="w-full border-collapse border border-black/20 text-[9px] bg-white">
                    <tbody>
                        <tr className="h-8">
                            <td className="border border-black/20 p-1.5 w-1/2 align-top">
                                <span className="font-normal">NAME :</span>
                            </td>
                            <td className="border border-black/20 p-1.5 w-1/2 align-top">
                                <span className="font-normal">NIC/ID NO :</span>
                            </td>
                        </tr>
                        <tr className="h-8">
                            <td className="border border-black/20 p-1.5 w-1/2 align-top">
                                <span className="font-normal">DESIGNATION :</span>
                            </td>
                            <td className="border border-black/20 p-1.5 w-1/2 align-top">
                                <span className="font-normal">DEPARTMENT :</span>
                            </td>
                        </tr>
                        <tr className="h-10">
                            <td className="border border-black/20 p-1.5 w-1/2 align-top">
                                <span className="font-normal">SIGNATURE :</span>
                            </td>
                            <td className="border border-black/20 p-1.5 w-1/2 align-top">
                                <span className="font-normal">OFFICIAL SEAL/STAMP :</span>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>

            {/* Disclaimer */}
            <p className="text-[9px] font-normal normal-case leading-relaxed text-black/80 mt-1 text-left">
                ** I confirm that the above goods/services have been received in good condition, as per the quantities and descriptions listed in this delivery note. **
            </p>
        </div>
    );

    return (
        <div ref={ref}>
            <style dangerouslySetInnerHTML={{__html: `
                @media print {
                    @page {
                        size: A4 portrait !important;
                        margin: 8mm 8mm 20mm 8mm !important;
                        @bottom-right {
                            content: "Page " counter(page) " of " counter(pages);
                            font-size: 9px;
                            color: #4b5563;
                        }
                    }
                    table.print-main-table {
                        width: 100% !important;
                        border-collapse: collapse !important;
                        border: none !important;
                    }
                    thead.print-main-thead {
                        display: table-header-group !important;
                    }
                    tbody.print-main-tbody {
                        display: table-row-group !important;
                    }
                    table.print-main-table > tbody > tr {
                        page-break-inside: auto !important;
                        break-inside: auto !important;
                    }
                    tr.print-block-row {
                        page-break-inside: avoid !important;
                        break-inside: avoid !important;
                    }
                    .handover-details-panel {
                        page-break-inside: avoid !important;
                        break-inside: avoid !important;
                    }
                }
            `}} />

            {/* Screen layout (Preview on page) */}
            <div className="print:hidden flex flex-col gap-y-8 bg-transparent w-full my-3">
                {/* Page 1 Preview */}
                <div className="bg-white w-full p-10 rounded-2xl shadow-sm border border-black/10 flex flex-col justify-between">
                    <div className="flex-1 flex flex-col justify-start">
                        {renderHeader()}
                        {renderInfoBoxes()}
                        {renderGroupedTables()}
                        {renderGrandTotals()}
                        {renderTermsAndConditions()}
                        {renderSignatures()}
                    </div>
                    {renderFooter(1)}
                </div>

                {/* Page 2 Preview */}
                <div className="hidden print:block">
                    <div className="bg-white w-full p-10 rounded-2xl shadow-sm border border-black/10 flex flex-col justify-between">
                        <div className="flex-1 flex flex-col justify-start">
                            {renderHeader()}
                            {renderInfoBoxes()}
                            {renderPage2Content()}
                        </div>
                        {renderFooter(2)}
                    </div>
                </div>
            </div>

            {/* Print layout */}
            <div id="print-section" className="hidden print:block w-full print-container-main bg-white text-[11px] leading-tight">
                <table className="w-full border-none border-collapse print-main-table">
                    <thead className="hidden print:table-header-group print-main-thead">
                        <tr>
                            <td className="border-none p-0">
                                {renderHeader()}
                                {renderInfoBoxes()}
                            </td>
                        </tr>
                    </thead>
                    <tbody className="print-main-tbody">
                        <tr className="print:hidden">
                            <td className="border-none p-0">
                                {renderHeader()}
                                {renderInfoBoxes()}
                            </td>
                        </tr>
                        <tr className="print-block-row">
                            <td className="border-none p-0">
                                {renderGroupedTables()}
                            </td>
                        </tr>
                        <tr className="print-block-row">
                            <td className="border-none p-0">
                                {renderGrandTotals()}
                            </td>
                        </tr>
                        {(() => {
                            const finalTerms = data?.terms_and_conditions || "";
                            if (!finalTerms) return null;
                            return (
                                <tr className="print-block-row">
                                    <td className="border-none p-0">
                                        {renderTermsAndConditions()}
                                    </td>
                                </tr>
                            );
                        })()}
                        <tr className="print-block-row">
                            <td className="border-none p-0">
                                {renderSignatures()}
                            </td>
                        </tr>
                        <tr className="print-block-row">
                            <td className="border-none p-0">
                                {renderPage2Content()}
                            </td>
                        </tr>
                        <tr className="print-block-row">
                            <td className="border-none p-0">
                                {renderFooter(2)}
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    );

});

export default CorporateDeliveryNote;
