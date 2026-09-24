import React, { useEffect, useState } from 'react';
import logo from "../../assets/logo.png";

function formatDeliveryType(val) {
    if (!val) return "Normal";
    const str = String(val).replace(/_/g, " ").trim().toLowerCase();
    return str.split(/\s+/).map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

const CorporateCollectionNote = React.forwardRef(({ data, orderItems, customer, itemTypes, itemCategories }, ref) => {

    // 1. Group items by service type
    // Rate and orderValue are pre-computed by the parent (CorporateViewPickupEntry) via orderItemsFormatted.
    // We simply use item.rate and item.orderValue directly.
    const serviceTypeGroups = {};
    (orderItems || [])
        .filter(item => Number(item.quantity || 0) > 0)
        .forEach(item => {
        const itemType = itemTypes?.find(type => String(type.item_type_id) === String(item.item_id || item.corp_item_id) || String(type.corp_item_auto_id) === String(item.item_id || item.corp_item_id));
        const serviceType = item.service_type || itemType?.service_type || (itemType?.service_types && itemType.service_types[0]?.service_type_name) || "Washing";

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
        serviceTypeGroups[normalizedServiceType].push({
            ...item,
            itemType
        });
    });

    // Sort the service types in a specific order: Washing first, then Pressing, then Dry Clean, then others
    const sortedServiceTypes = Object.keys(serviceTypeGroups).sort((a, b) => {
        const priority = { "Washing": 1, "Pressing": 2, "Dry Clean": 3 };
        return (priority[a] || 99) - (priority[b] || 99);
    });

    // 2. For each service type, group items by Category within it
    const processedGroups = {};
    let globalNo = 1;
    let grandTotalQuantity = 0;
    let grandTotalValue = 0;

    sortedServiceTypes.forEach(serviceType => {
        const itemsInService = serviceTypeGroups[serviceType];
        const categoryGroups = {};

        itemsInService.forEach(item => {
            const catId = item.item_category_id || item.itemType?.item_category_id;
            const categoryObj = itemCategories?.find(cat => cat.value === Number(catId));
            const categoryName = item.item_category_name || categoryObj?.label || "ROOM LINEN";

            if (!categoryGroups[categoryName]) {
                categoryGroups[categoryName] = [];
            }

            // Use pre-computed rate and orderValue from parent; fall back gracefully
            const qty = Number(item.quantity || 0);
            const rate = Number(item.rate) || 0;
            const orderValue = Number(item.orderValue) || (qty * rate);

            grandTotalQuantity += qty;
            grandTotalValue += orderValue;

            categoryGroups[categoryName].push({
                ...item,
                rate,
                orderValue,
                noStr: String(globalNo++).padStart(2, '0')
            });
        });

        processedGroups[serviceType] = {
            categories: categoryGroups,
            subTotal: Object.values(categoryGroups).flat().reduce((sum, i) => sum + i.orderValue, 0)
        };
    });

    const renderHeader = () => (
        <>
            <div className="flex flex-row">
                <img src={logo} className="w-32 md:w-44 object-contain me-auto print:w-44" />

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

                    {/* CANCELLED stamp — bold red plain text, right-aligned, shown only for cancelled orders */}
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
                        Collection Note
                    </div>
                </div>
            </div>
        </>
    );

    const renderInfoBoxes = () => {
        const dateOfCollection = (() => {
            const rawDate = data?.collection_date || data?.created_at;
            const target = rawDate || new Date();
            
            if (target instanceof Date) {
                if (Number.isFinite(target.getTime())) {
                    const yyyy = target.getFullYear();
                    const mm = String(target.getMonth() + 1).padStart(2, "0");
                    const dd = String(target.getDate()).padStart(2, "0");
                    return `${yyyy}/${mm}/${dd}`;
                }
                return "";
            }

            let str = String(target).trim();
            if (str.includes("T")) {
                str = str.split("T")[0];
            } else if (str.includes(" ")) {
                str = str.split(" ")[0];
            }
            return str.replace(/-/g, "/");
        })();

        return (
            <div className="flex flex-row justify-between mt-10 md:mt-14 print:mt-10 text-[11px] md:text-[12px] leading-snug print:mt-1 print:text-[9px] print:leading-tight w-full items-start">
                {/* Left Box — Our Company (Supplier) */}
                <div className="flex flex-col px-3 pt-0 pb-1 w-[52%] md:w-[52%] print:w-[52%] min-w-0 text-neutral-900 text-left -mt-6 md:-mt-8 print:-mt-6" style={{ textTransform: 'none' }}>
                    <div className="font-bold text-[12px] print:text-[10px]">
                        Collection Note No : {data.pickup_entry_id ?? '—'}
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
                        Date of Collection : {dateOfCollection}
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
                    <div className="text-[11px] print:text-[9px]">Tel : {customer?.phone_number || customer?.customer_phone || customer?.phone || '—'}</div>
                    <div className="text-[11px] print:text-[9px]">Email : {customer?.customer_email || customer?.email || '—'}  WEB :</div>
                    <div className="mt-1.5 text-[11px] print:text-[9px]">
                        Place of Supply : {customer?.place_of_supply || data?.place_of_supply || '—'}
                    </div>
                </div>
            </div>
        );
    };
 
    const renderCollectionNoteHeader = (isPrint = false) => (
        <div className={isPrint ? "print-header-layout" : ""}>
            {renderHeader()}
            {renderInfoBoxes()}
        </div>
    );

    const renderGroupedTables = () => {
        const allItems = sortedServiceTypes.flatMap(st => serviceTypeGroups[st]);
        const grandTotalRate = allItems.reduce((sum, item) => sum + Number(item.rate || 0), 0);

        return (
            <div className="mt-5">
                <table className="border border-black/20 border-collapse w-full text-xs text-black">
                    <thead>
                        <tr className="border-b border-black/20">
                            <th className="border-r border-black/20 p-2 text-left font-bold bg-white text-black">Item Code</th>
                            <th className="border-r border-black/20 p-2 text-left font-bold bg-white text-black">Item Name &amp; Description</th>
                            <th rowSpan={3} className="border-r border-black/20 p-2 text-center font-bold bg-white text-black align-middle">Uom</th>
                            <th rowSpan={3} className="border-r border-black/20 p-2 text-center font-bold bg-white text-black align-middle">Order Qty</th>
                            <th rowSpan={3} className="border-r border-black/20 p-2 text-center font-bold bg-white text-black align-middle">Rate</th>
                            <th rowSpan={3} className="border-r border-black/20 p-2 text-center font-bold bg-white text-black align-middle">Order Value</th>
                            <th rowSpan={3} className="p-2 text-center font-bold bg-white text-black align-middle">Remark</th>
                        </tr>
                        <tr className="border-b border-black/20 bg-white text-left">
                            <td className="border-r border-black/20 p-2 font-bold text-xs">Room No</td>
                            <td className="border-r border-black/20 p-2 text-xs font-semibold text-black">{data.room_no || '---'}</td>
                        </tr>
                        <tr className="border-b border-black/20 bg-white text-left">
                            <td className="border-r border-black/20 p-2 font-bold text-xs">Gate Pass No</td>
                            <td className="border-r border-black/20 p-2 text-xs font-semibold text-black">{data.gate_pass_no || '---'}</td>
                        </tr>
                    </thead>
                    <tbody>
                        {sortedServiceTypes.map((serviceType, tableIndex) => {
                            const { categories, subTotal } = processedGroups[serviceType];
                            const isLastTable = tableIndex === sortedServiceTypes.length - 1;
                            const itemsInService = serviceTypeGroups[serviceType] || [];
                            const subTotalQty = itemsInService.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
                            const subTotalRate = itemsInService.reduce((sum, item) => sum + Number(item.rate || 0), 0);

                            const showCategorySubtotal = Object.keys(categories).length > 1;

                            return (
                                <React.Fragment key={serviceType}>
                                    {tableIndex > 0 && (
                                        <tr style={{ border: 'none' }} className="h-6 bg-transparent">
                                            <td colSpan={7} className="p-0 h-6 bg-transparent" style={{ border: 'none' }}></td>
                                        </tr>
                                    )}
                                    <tr className="border-b border-black/20 bg-white text-left">
                                        <td className="border-r border-black/20 p-2 font-bold text-xs">Service Type</td>
                                        <td colSpan={6} className="p-2 text-xs font-semibold text-black">{serviceType}</td>
                                    </tr>
                                    <tr className="border-b border-black/20 bg-white text-left">
                                        <td className="border-r border-black/20 p-2 font-bold text-xs">Delivery Type</td>
                                        <td colSpan={6} className="p-2 text-xs font-semibold text-black">{formatDeliveryType(data.delivery_type)}</td>
                                    </tr>
                                    {Object.keys(categories).map((categoryName) => {
                                        const catItems = categories[categoryName];
                                        const catTotalQty = catItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
                                        const catTotalRate = catItems.reduce((sum, item) => sum + Number(item.rate || 0), 0);
                                        const catTotalValue = catItems.reduce((sum, item) => sum + Number(item.orderValue || 0), 0);

                                        return (
                                            <React.Fragment key={categoryName}>
                                                <tr className="bg-white text-left border-b border-black/20">
                                                    <td colSpan={7} className="p-2 font-bold text-xs text-black">{categoryName}</td>
                                                </tr>
                                                {catItems.map((item, itemIdx) => (
                                                    <tr key={`${categoryName}-${itemIdx}`} className="border-b border-black/20 last:border-b-0 text-center bg-white text-xs">
                                                        <td className="border-r border-black/20 px-2 py-1.5 align-middle text-left font-mono">{item.corp_item_id || item.itemType?.corp_item_id || "-"}</td>
                                                        <td className="border-r border-black/20 px-2 py-1.5 align-middle text-left">{item.item_name || item.itemType?.item_type_name || "-"}</td>
                                                        <td className="border-r border-black/20 px-2 py-1.5 align-middle text-center">Pcs</td>
                                                        <td className="border-r border-black/20 px-2 py-1.5 align-middle text-center">{item.quantity}</td>
                                                        <td className="border-r border-black/20 px-2 py-1.5 align-middle text-right">{item.rate.toFixed(2)}</td>
                                                        <td className="border-r border-black/20 px-2 py-1.5 align-middle text-right">RS {item.orderValue.toFixed(2)}</td>
                                                        <td className="px-2 py-1.5 align-middle text-left">{item.remark || ""}</td>
                                                    </tr>
                                                ))}
                                                {showCategorySubtotal && (
                                                    <tr className="bg-white text-black font-normal text-xs text-center border-b border-black/20">
                                                        <td colSpan={3} className="border-r border-black/20 p-2 text-left">Sub Total ({categoryName})</td>
                                                        <td className="border-r border-black/20 p-2 text-center">{catTotalQty}</td>
                                                        <td className="border-r border-black/20 p-2 text-right"></td>
                                                        <td className="border-r border-black/20 p-2 text-right font-normal">RS {catTotalValue.toFixed(2)}</td>
                                                        <td className="p-2"></td>
                                                    </tr>
                                                )}
                                            </React.Fragment>
                                        );
                                    })}
                                    {!showCategorySubtotal && (
                                        <tr className="bg-white text-black font-normal text-xs text-center border-b border-black/20">
                                            <td colSpan={3} className="border-r border-black/20 p-2 text-left">Sub Total</td>
                                            <td className="border-r border-black/20 p-2 text-center">{subTotalQty}</td>
                                            <td className="border-r border-black/20 p-2 text-right"></td>
                                            <td className="border-r border-black/20 p-2 text-right">RS {subTotal.toFixed(2)}</td>
                                            <td className="p-2"></td>
                                        </tr>
                                    )}
                                    {isLastTable && (
                                        <>
                                            <tr style={{ border: 'none' }} className="h-4 bg-transparent">
                                                <td colSpan={7} className="p-0 h-4 bg-transparent" style={{ border: 'none' }}></td>
                                            </tr>
                                            <tr className="bg-white text-black font-normal text-xs text-center">
                                                <td colSpan={3} className="border-t border-b border-r border-black/20 p-2 text-left">Total</td>
                                                <td className="border-t border-b border-r border-black/20 p-2 text-center">{grandTotalQuantity}</td>
                                                <td className="border-t border-b border-r border-black/20 p-2 text-right"></td>
                                                <td className="border-t border-b border-r border-black/20 p-2 text-right">RS {grandTotalValue.toFixed(2)}</td>
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

    const renderGrandTotals = () => (
        <div className="border border-black/20 mt-4 text-xs font-normal text-black bg-white p-2 flex justify-between items-center rounded-sm">
            <span>Laundry Charge</span>
            <span>RS {grandTotalValue.toFixed(2)}</span>
        </div>
    );

    const renderSignatures = () => (
        <>
        <div className="border-t-2 border-[#002A74] w-full mt-4 print:mt-2" />
        <div className="grid grid-cols-3 gap-x-4 w-full mt-3 mb-3 normal-case print:mt-2 print:mb-2 text-center text-black">
            {/* Prepared By */}
            <div className="flex flex-col items-center w-full">
                {(() => {
                    const name = data.signed_by || '';
                    let dateStr = "";
                    let timeStr = "";
                    const rawDate = data.created_at || data.updated_at;
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
                    const name = data.checked_by_user || '';
                    let dateStr = "";
                    let timeStr = "";
                    if (data.checked_by_user) {
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
                    const name = data.approved_by_user || '';
                    let dateStr = "";
                    let timeStr = "";
                    if (data.approved_by_user) {
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

    const renderFooter = (pageIndex, totalPages) => (
        <div className="flex flex-row justify-end items-center w-full text-[8px] print:text-[7.5px] uppercase text-neutral-600 font-normal mt-4 print:mt-2 mb-0 shrink-0">
            <p className="font-normal text-[8px] print:text-[7.5px] tracking-tight text-right">POWERED BY CEYLONX CORPORATION</p>
        </div>
    );

    const printStyles = `
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
            #print-section {
                display: block !important;
                width: 100% !important;
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
            tfoot.print-main-tfoot {
                display: table-footer-group !important;
            }
            table.print-main-table > tbody > tr {
                page-break-inside: auto !important;
                break-inside: auto !important;
            }
            tr.print-block-row {
                page-break-inside: avoid !important;
                break-inside: avoid !important;
            }
        }
    `;

    return (
        <div ref={ref}>
            <style dangerouslySetInnerHTML={{ __html: printStyles }} />
            <div className="print:hidden flex flex-col bg-white w-full p-10 rounded-xl my-3">
                {renderHeader()}
                {renderInfoBoxes()}
                {renderGroupedTables()}
                {renderGrandTotals()}
                {renderSignatures()}
                {renderFooter(1, 1)}
            </div>

            {/* Print */}
            <div id="print-section" className="hidden print:block w-full print-container-main bg-white text-[11px] leading-tight">
                <table className="w-full border-none border-collapse print-main-table">
                    <thead className="hidden print:table-header-group print-main-thead">
                        <tr>
                            <td className="border-none p-0">
                                {renderCollectionNoteHeader(true)}
                            </td>
                        </tr>
                    </thead>
                    <tbody className="print-main-tbody">
                        <tr className="print:hidden">
                            <td className="border-none p-0">
                                {renderCollectionNoteHeader(false)}
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
                        <tr className="print-block-row">
                            <td className="border-none p-0">
                                {renderSignatures()}
                            </td>
                        </tr>
                    </tbody>
                    <tfoot className="hidden print:table-footer-group print-main-tfoot">
                        <tr>
                            <td className="border-none p-0">
                                {renderFooter(1, 1)}
                            </td>
                        </tr>
                    </tfoot>
                </table>
            </div>        </div>
    );
});

export default CorporateCollectionNote;