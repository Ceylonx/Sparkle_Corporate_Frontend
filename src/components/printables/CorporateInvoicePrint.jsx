import React, { useEffect, useState } from 'react';
import logo from "../../assets/logo.png";

const CorporateInvoicePrint = React.forwardRef(({ data, itemTypes, itemCategoryOptions, priceList }, ref) => {
    const splitItems = (items, maxPerPage) => {
        const pages = [];
        for (let i = 0; i < items?.length; i += maxPerPage) {
            pages.push(items.slice(i, i + maxPerPage));
        }
        return pages;
    };

    const itemPages = splitItems(data.items, 30);
    const showSummaryOnNextPage = itemPages[itemPages?.length - 1]?.length > 25;
    const showOnNextPage = itemPages[itemPages?.length - 1]?.length > 20;

    const computedSubTotal = (data.items || []).reduce((sum, item) => {
        const qty = Number(item.quantity || item.corp_item_quantity || item.qty || 0);
        const rate = Number(item.rate || item.price || item.corp_item_price || item.unit_price || 0);
        const amt = Number(item.amount || item.total_price || item.corp_item_amount || (qty * rate) || 0);
        return sum + amt;
    }, 0);

    const discountValue = Number(data?.discount || 0);
    const computedDiscountAmount = data?.is_discount_percentage === 1 ? computedSubTotal * (discountValue / 100) : discountValue;
    const computedTotalAmount = computedSubTotal - computedDiscountAmount;

    return (
        <div ref={ref}>
            <style dangerouslySetInnerHTML={{ __html: `
                @media print {
                    @page {
                        size: A4 portrait !important;
                        margin: 8mm 8mm 8mm 8mm !important;
                    }
                    .print-page-fixed-footer {
                        padding: 10mm !important;
                        box-sizing: border-box !important;
                        display: flex !important;
                        flex-direction: column !important;
                        min-height: 96vh !important;
                    }
                    .print-footer-fixed {
                        margin-top: auto !important;
                    }
                }
            `}} />
            <div className="print:hidden flex flex-col bg-white w-full p-10 rounded-xl my-3">
                {/* Header Section */}
                <div className="flex flex-row">
                    <img src={logo} className="w-20 object-contain me-auto" />

                    <div className="flex flex-col text-xs">
                        <div className="flex flex-row gap-x-5">
                            <div className="flex flex-row gap-x-2">
                                <p className="font-semibold">Printed Date :</p>
                                <p className="">{new Date().toLocaleDateString()}</p>
                            </div>

                            <div className="flex flex-row gap-x-2">
                                <p className="font-semibold">Time :</p>
                                <p className="">{new Date().toLocaleTimeString()}</p>
                            </div>
                        </div>
                    </div>
                </div>

                <h1 className="font-bold text-center text-2xl uppercase">Invoice</h1>

                <div className='flex flex-row justify-between mt-5'>
                    <div className='border border-black/20 grid grid-cols-2 gap-x-3 p-1'>
                        <p className='font-semibold'>INVOICE NO:</p>
                        <p>{data?.invoice_id}</p>
                        <p className='font-semibold'>COMPANY NAME:</p>
                        <p className='uppercase'>{data?.company_name || data?.customer_company_name || ""}</p>
                        <p className='font-semibold'>CUSTOMER ID:</p>
                        <p className='uppercase'>{data?.customer_id}</p>
                        <p className='font-semibold'>CUSTOMER NAME:</p>
                        <p className='uppercase'>{data?.customer_name || data?.customer_contact_person || ""}</p>
                        <p className='font-semibold'>PHONE NO:</p>
                        <p>{data?.phone_number || data?.customer_phone || ""}</p>
                    </div>
                </div>

                {/* Body Section */}
                {Object.values(
                    (data.items || []).reduce((acc, item) => {
                        const id = item.pickup_entry_id || 'unknown';
                        if (!acc[id]) acc[id] = { date: item.pickup_date, items: [] };
                        acc[id].items.push(item);
                        return acc;
                    }, {})
                ).map((group, groupIndex) => (
                    <div key={groupIndex} className="mt-5 w-full uppercase">
                        <p className="text-sm font-semibold mb-1 text-black/70 text-start">
                            PICKUP DATE : {group.date ? new Date(group.date).toISOString().split('T')[0].replace(/-/g, '/') : ""}
                        </p>
                        <table className='border border-black/20 w-full text-sm text-center'>
                            <thead className='border border-black/20'>
                                <tr>
                                    <th className='border-r border-black/20 py-1'>No</th>
                                    <th className='border-r border-black/20 py-1 text-start px-2'>Item</th>
                                    <th className='border-r border-black/20 py-1'>Category</th>
                                    <th className='border-r border-black/20 py-1'>Quantity</th>
                                    <th className='border-r border-black/20 py-1'>Rate</th>
                                    <th className='border-r border-black/20 py-1'>Amount</th>
                                </tr>
                            </thead>
                            <tbody>
                                {group.items.map((item, index) => (
                                    <tr key={index} className=''>
                                        <td className='border-r border-black/20 py-1'>{(index + 1).toString().padStart(2, '0')}</td>
                                        <td className='border-r border-black/20 py-1 text-start px-2'>
                                            {`${item.item_name || item.corp_item_name || ""} ${item.service_type_id ? `(${item.service_type_id === 1 ? "W" : item.service_type_id === 2 ? "P" : "DC"})` : ""}`}
                                        </td>
                                        <td className='border-r border-black/20 py-1'>{item.item_category || item.corp_category_name || item.category || ""}</td>
                                        <td className='border-r border-black/20 py-1'>{item.quantity || item.corp_item_quantity || item.qty || 0}</td>
                                        <td className='border-r border-black/20 py-1'>{Number(item.rate || item.price || item.corp_item_price || item.unit_price || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                        <td className='border-r border-black/20 py-1'>Rs {Number(item.amount || item.total_price || item.corp_item_amount || (Number(item.quantity || item.corp_item_quantity || item.qty || 0) * Number(item.rate || item.price || item.corp_item_price || item.unit_price || 0)) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ))}

                <div className='flex flex-row justify-between mt-5'>
                    <p className='font-bold'>Sub Total</p>
                    <p>Rs. {computedSubTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                </div>
                <div className='flex flex-row justify-between'>
                    <p className='font-bold'>Discount</p>
                    <p>{data?.is_discount_percentage === 1 ? `${discountValue}%` : `Rs. ${discountValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}</p>
                </div>
                <div className='flex flex-row justify-between'>
                    <p className='font-bold'>Total Amount</p>
                    <p>Rs. {computedTotalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                </div>

                <div className='flex flex-col font-bold mt-5 text-sm'>
                    <p>SIGNED BY: <span className='font-normal'>{data?.signedBy || data?.signed_by || ""}</span></p>
                </div>

                <div className='flex flex-col mt-5 text-sm'>
                    <p className='font-bold'>NOTES</p>
                    <p>{data?.notes || data?.note || ""}</p>
                </div>

                <div className='flex flex-col text-sm'>
                    <p className='font-bold'>TERMS & CONDITIONS</p>
                    <p>{data?.terms_and_conditions || data?.terms || ""}</p>
                </div>


            </div>

            {/* Print */}
            <div ref={ref} id="print-section" className="hidden print:flex print-container flex-col w-full a4-print">
                {itemPages.map((pageItems, pageIndex) => {
                    const isLastPage = pageIndex === itemPages.length - 1;
                    return (
                        <div key={pageIndex} className="flex flex-col aspect-print-a4 h-full print-page-fixed-footer pt-3 px-3">
                            <div className="print-body-fixed flex flex-col flex-1 min-h-0">
                            {/* Header Section */}
                            < div className="flex flex-row" >
                                <img src={logo} className="w-20 object-contain me-auto" />

                                <div className="flex flex-col text-xs">
                                    <div className="flex flex-row gap-x-5">
                                        <div className="flex flex-row gap-x-2">
                                            <p className="font-semibold">Printed Date :</p>
                                            <p className="">{new Date().toLocaleDateString()}</p>
                                        </div>

                                        <div className="flex flex-row gap-x-2">
                                            <p className="font-semibold">Time :</p>
                                            <p className=""> {new Date().toLocaleTimeString()}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <h1 className="font-bold text-center text-2xl">INVOICE</h1>

                            <div className='flex flex-row justify-between mt-5 text-sm'>
                                <div className='border border-black/20 grid grid-cols-2 gap-x-3 p-1'>
                                    <p className='font-semibold'>INVOICE NO:</p>
                                    <p>{data?.invoice_id}</p>
                                    <p className='font-semibold'>COMPANY NAME:</p>
                                    <p className='uppercase'>{data?.company_name || data?.customer_company_name || ""}</p>
                                    <p className='font-semibold'>CUSTOMER ID:</p>
                                    <p className='uppercase'>{data?.customer_id}</p>
                                    <p className='font-semibold'>CUSTOMER NAME:</p>
                                    <p className='uppercase'>{data?.customer_name || data?.customer_contact_person || ""}</p>
                                    <p className='font-semibold'>PHONE NO:</p>
                                    <p>{data?.phone_number || data?.customer_phone || ""}</p>
                                </div>
                            </div>

                            {/* Body Section */}
                            {Object.values(
                                (pageItems || []).reduce((acc, item) => {
                                    const id = item.pickup_entry_id || 'unknown';
                                    if (!acc[id]) acc[id] = { date: item.pickup_date, items: [] };
                                    acc[id].items.push(item);
                                    return acc;
                                }, {})
                            ).map((group, groupIndex) => (
                                <div key={groupIndex} className="mt-5 w-full uppercase">
                                    <p className="text-sm font-semibold mb-1 text-black/70 text-start">
                                        PICKUP DATE : {group.date ? new Date(group.date).toISOString().split('T')[0].replace(/-/g, '/') : ""}
                                    </p>
                                    <table className='border border-black/20 w-full text-sm text-center'>
                                        <thead className='border border-black/20'>
                                            <tr>
                                                <th className='border-r border-black/20 py-1'>No</th>
                                                <th className='border-r border-black/20 py-1 text-start px-2'>Item</th>
                                                <th className='border-r border-black/20 py-1'>Category</th>
                                                <th className='border-r border-black/20 py-1'>Quantity</th>
                                                <th className='border-r border-black/20 py-1'>Rate</th>
                                                <th className='border-r border-black/20 py-1'>Amount</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {group.items.map((item, index) => {
                                                // Calculate overall index inside the order to display consistent numbers even across pages
                                                const overallIndex = data.items.filter(i => i.pickup_entry_id === item.pickup_entry_id).indexOf(item);
                                                return (
                                                    <tr key={index} className=''>
                                                        <td className='border-r border-black/20 py-1'>{(overallIndex + 1).toString().padStart(2, '0')}</td>
                                                        <td className='border-r border-black/20 py-1 text-start px-2'>
                                                            {`${item.item_name || item.corp_item_name || ""} ${item.service_type_id ? `(${item.service_type_id === 1 ? "W" : item.service_type_id === 2 ? "P" : "DC"})` : ""}`}
                                                        </td>
                                                        <td className='border-r border-black/20 py-1'>{item.item_category || item.corp_category_name || item.category || ""}</td>
                                                        <td className='border-r border-black/20 py-1'>{item.quantity || item.corp_item_quantity || item.qty || 0}</td>
                                                        <td className='border-r border-black/20 py-1'>{Number(item.rate || item.price || item.corp_item_price || item.unit_price || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                                        <td className='border-r border-black/20 py-1'>Rs {Number(item.amount || item.total_price || item.corp_item_amount || (Number(item.quantity || item.corp_item_quantity || item.qty || 0) * Number(item.rate || item.price || item.corp_item_price || item.unit_price || 0)) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            ))}

                            {isLastPage && pageItems.length < 26 &&
                                <div className='mt-5'>
                                    <div className='flex flex-row justify-between mt-5'>
                                        <p className='font-bold'>Sub Total</p>
                                        <p>Rs. {computedSubTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                    </div>
                                    <div className='flex flex-row justify-between'>
                                        <p className='font-bold'>Discount</p>
                                        <p>{data?.is_discount_percentage === 1 ? `${discountValue}%` : `Rs. ${discountValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}</p>
                                    </div>
                                    <div className='flex flex-row justify-between'>
                                        <p className='font-bold'>Total Amount</p>
                                        <p>Rs. {computedTotalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                    </div>

                                    <div className='flex flex-col font-bold mt-5 text-sm'>
                                        <p>SIGNED BY: <span className='font-normal'>{data?.signedBy || data?.signed_by || ""}</span></p>
                                    </div>

                                    {isLastPage && pageItems.length < 21 && (
                                        <div>
                                            <div className='flex flex-col mt-5 text-sm'>
                                                <p className='font-bold'>NOTES</p>
                                                <p>{data?.notes || data?.note || ""}</p>
                                            </div>

                                            <div className='flex flex-col text-sm'>
                                                <p className='font-bold'>TERMS & CONDITIONS</p>
                                                <p>{data?.terms_and_conditions || data?.terms || ""}</p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            }

                            </div>
                        </div>
                    );
                })}

                {showOnNextPage &&
                    <div className="flex flex-col aspect-print-a4 h-full print-page-fixed-footer pt-3 px-3">
                        <div className="print-body-fixed flex flex-col flex-1 min-h-0">
                        {/* Header Section */}
                        <div className="flex flex-row">
                            <img src={logo} className="w-20 object-contain me-auto" />

                            <div className="flex flex-col text-xs">
                                <div className="flex flex-row gap-x-5">
                                    <div className="flex flex-row gap-x-2">
                                        <p className="font-semibold">Printed Date :</p>
                                        <p className="">{new Date().toLocaleDateString()}</p>
                                    </div>

                                    <div className="flex flex-row gap-x-2">
                                        <p className="font-semibold">Time :</p>
                                        <p className=""> {new Date().toLocaleTimeString()}</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <h1 className="font-bold text-center text-2xl">INVOICE</h1>

                        <div className='flex flex-row justify-between mt-5'>
                            <div className='border border-black/20 grid grid-cols-2 gap-x-3 p-1'>
                                <p className='font-semibold'>INVOICE NO:</p>
                                <p>{data?.invoice_id}</p>
                                <p className='font-semibold'>COMPANY NAME:</p>
                                <p className='uppercase'>{data?.company_name || data?.customer_company_name || ""}</p>
                                <p className='font-semibold'>CUSTOMER ID:</p>
                                <p className='uppercase'>{data?.customer_id}</p>
                                <p className='font-semibold'>CUSTOMER NAME:</p>
                                <p className='uppercase'>{data?.customer_name || data?.customer_contact_person || ""}</p>
                                <p className='font-semibold'>PHONE NO:</p>
                                <p>{data?.phone_number || data?.customer_phone || ""}</p>
                            </div>
                        </div>

                        {showSummaryOnNextPage &&
                            <div className='mt-5'>
                                <div className='flex flex-row justify-between'>
                                    <p className='font-bold'>Sub Total</p>
                                    <p>Rs. {computedSubTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                </div>
                                <div className='flex flex-row justify-between'>
                                    <p className='font-bold'>Discount</p>
                                    <p>{data?.is_discount_percentage === 1 ? `${discountValue}%` : `Rs. ${discountValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}</p>
                                </div>
                                <div className='flex flex-row justify-between'>
                                    <p className='font-bold'>Total Amount</p>
                                    <p>Rs. {computedTotalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                </div>
                            </div>
                        }

                        <div>
                            <div className='flex flex-col mt-5 text-sm'>
                                <p className='font-bold'>NOTES</p>
                                <p>{data?.notes || data?.note || ""}</p>
                            </div>

                            <div className='flex flex-col text-sm'>
                                <p className='font-bold'>TERMS & CONDITIONS</p>
                                <p>{data?.terms_and_conditions || data?.terms || ""}</p>
                            </div>
                        </div>

                        </div>
                    </div>
                }
            </div >
        </div >
    );
});

export default CorporateInvoicePrint;