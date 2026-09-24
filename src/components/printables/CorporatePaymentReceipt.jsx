import React, { useEffect, useState } from 'react';
import logo from "../../assets/logo.png";

const CorporatePaymentReceipt = React.forwardRef(({ data }, ref) => {
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

    return (
        <div ref={ref}>
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

                <h1 className="font-bold text-center text-2xl uppercase">Payment Receipt</h1>

                <div className='flex flex-row justify-between mt-5'>
                    <div className='border border-black/20 grid grid-cols-2 gap-x-3 p-1'>
                        <p className='font-semibold'>INVOICE NO:</p>
                        <p>{data?.invoice_id}</p>
                        <p className='font-semibold'>COMPANY NAME:</p>
                        <p className='uppercase'>{data?.company_name}</p>
                        <p className='font-semibold'>CUSTOMER ID:</p>
                        <p className='uppercase'>{data?.customer_id}</p>
                        <p className='font-semibold'>CUSTOMER NAME:</p>
                        <p className='uppercase'>{data?.customer_name}</p>
                        <p className='font-semibold'>PHONE NO:</p>
                        <p>{data?.phone_number}</p>
                    </div>
                </div>

                {/* Body Section */}
                <table className='border border-black/20 mt-5 uppercase'>
                    <thead className='border border-black/20'>
                        <tr>
                            <th className='border-r border-black/20'>No</th>
                            <th className='border-r border-black/20'>Item</th>
                            <th className='border-r border-black/20'>Category</th>
                            <th className='border-r border-black/20'>Quantity</th>
                            <th className='border-r border-black/20'>Rate</th>
                            <th className='border-r border-black/20'>Amount</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.items?.map((item, index) => (
                            <tr key={index} className='text-center'>
                                <td className='border-r border-black/20'>{index + 1}</td>
                                <td className='border-r border-black/20'>
                                    {`${item.item_name} (${item.service_type_id === 1 ?
                                        "W" :
                                        item.service_type_id === 2 ?
                                            "P" :
                                            "DC"
                                        })`}
                                </td>
                                <td className='border-r border-black/20'>{item.item_category}</td>
                                <td className='border-r border-black/20'>{item.quantity}</td>
                                <td className='border-r border-black/20'>{item.rate.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                <td className='border-r border-black/20'>{item.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {/* Summary Section */}
                <div className='flex flex-row justify-between mt-5'>
                    <p>Payment Status</p>
                    <p>{data.cash_amount === data.total_amount || data.card_amount === data.total_amount ? "Full Payment" : "Partial Payment"}</p>
                </div>
                <div className='flex flex-row justify-between'>
                    <p>Sub Total</p>
                    <p>Rs. {data.items?.reduce((sum, item) => { return sum + Number(item.amount || 0); }, 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                </div>
                <div className='flex flex-row justify-between'>
                    <p>Discount</p>
                    <p>{data?.is_discount_percentage === 1 ? `${data?.discount}%` : `Rs. ${data?.discount?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}</p>
                </div>
                <div className='flex flex-row justify-between'>
                    <p>Amount Paid</p>
                    <p>Rs. {data.payment_method === "CASH"
                        ? Number(data.cash_amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                        : Number(data.card_amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                    }</p>
                </div>
                <div className='flex flex-row justify-between'>
                    <p>Payment Method</p>
                    <p>{data.payment_method === "CASH"
                        ? "Cash"
                        : "Card"
                    }</p>
                </div>
                {data.previously_paid > 0 &&
                    <div className='flex flex-row justify-between'>
                        <p>Previously Paid</p>
                        <p>Rs. {data.previously_paid.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                    </div>
                }
                <div className='flex flex-row justify-between'>
                    <p>Total Amount</p>
                    <p>Rs. {(Number(data.total_amount)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                </div>
                <div className='flex flex-row justify-between font-bold'>
                    <p>Balance Due</p>
                    <p>Rs. {data.payment_method === "CASH"
                        ? (Number(data.cash_amount) - Number(data.total_amount)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                        : (Number(data.card_amount) - Number(data.total_amount)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                    }</p>
                </div>

                <div className='flex flex-col mt-5 text-sm'>
                    <p className='font-bold'>NOTES</p>
                    <p>{data.notes}</p>
                </div>

                <div className='flex flex-col text-sm'>
                    <p className='font-bold'>TERMS & CONDITIONS</p>
                    <p>{data.terms_and_conditions}</p>
                </div>

                {/* Footer Section */}
                <div className='flex flex-col text-xs items-center'>
                    <p className='font-semibold'>"THIS IS SYSTEM GENERATED"</p>
                    <p className='font-semibold text-sm'>Sparkle Laundry (PVT) LTD</p>
                    <p className='uppercase'>NO 391, Avissawealla Road, Wellampitiya</p>
                    <div className='flex flex-row'>
                        <p>TEL : 94 114 701 566 , EMAIL : info@sparklelaundry.lk , WEB : www.sparklelaundry.lk</p>
                    </div>
                    <div className='flex flex-row justify-between w-full'>
                        <p></p>
                        <p className="ms-auto">POWERED BY CEYLONX CORPORATION</p>
                    </div>
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

                            <h1 className="font-bold text-center text-2xl">PAYMENT RECEIPT</h1>

                            <div className='flex flex-row justify-between mt-5 text-sm'>
                                <div className='border border-black/20 grid grid-cols-2 gap-x-3 p-1'>
                                    <p className='font-semibold'>INVOICE NO:</p>
                                    <p>{data?.invoice_id}</p>
                                    <p className='font-semibold'>COMPANY NAME:</p>
                                    <p className='uppercase'>{data?.company_name}</p>
                                    <p className='font-semibold'>CUSTOMER ID:</p>
                                    <p className='uppercase'>{data?.customer_id}</p>
                                    <p className='font-semibold'>CUSTOMER NAME:</p>
                                    <p className='uppercase'>{data?.customer_name}</p>
                                    <p className='font-semibold'>PHONE NO:</p>
                                    <p>{data?.phone_number}</p>
                                </div>
                            </div>

                            {/* Body Section */}
                            <table className='border border-black/20 mt-5 uppercase text-sm'>
                                <thead className='border border-black/20'>
                                    <tr>
                                        <th className='border-r border-black/20'>No</th>
                                        <th className='border-r border-black/20'>Item</th>
                                        <th className='border-r border-black/20'>Category</th>
                                        <th className='border-r border-black/20'>Quantity</th>
                                        <th className='border-r border-black/20'>Rate</th>
                                        <th className='border-r border-black/20'>Amount</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {pageItems.map((item, index) => (
                                        <tr key={index} className='text-center'>
                                            <td className='border-r border-black/20'>{(pageIndex * 30) + index + 1}</td>
                                            <td className='border-r border-black/20'>
                                                {`${item.item_name} (${item.service_type_id === 1 ?
                                                    "W" :
                                                    item.service_type_id === 2 ?
                                                        "P" :
                                                        "DC"
                                                    })`}
                                            </td>
                                            <td className='border-r border-black/20'>{item.item_category}</td>
                                            <td className='border-r border-black/20'>{item.quantity}</td>
                                            <td className='border-r border-black/20'>{item.rate.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                            <td className='border-r border-black/20'>{item.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>

                            {isLastPage && pageItems.length < 26 &&
                                <div className='mt-5'>
                                    {/* Summary Section */}
                                    <div className='flex flex-row justify-between'>
                                        <p>Payment Status</p>
                                        <p>{data.cash_amount === data.total_amount || data.card_amount === data.total_amount ? "Full Payment" : "Partial Payment"}</p>
                                    </div>
                                    <div className='flex flex-row justify-between'>
                                        <p>Sub Total</p>
                                        <p>Rs. {data.items?.reduce((sum, item) => { return sum + Number(item.amount || 0); }, 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                    </div>
                                    <div className='flex flex-row justify-between'>
                                        <p>Discount</p>
                                        <p>{data?.is_discount_percentage ? `${data?.discount}%` : `Rs. ${data?.discount?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}</p>
                                    </div>
                                    <div className='flex flex-row justify-between'>
                                        <p>Amount Paid</p>
                                        <p>Rs. {data.payment_method === "CASH"
                                            ? Number(data.cash_amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                                            : Number(data.card_amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                                        }</p>
                                    </div>
                                    <div className='flex flex-row justify-between'>
                                        <p>Payment Method</p>
                                        <p>{data.payment_method === "CASH"
                                            ? "Cash"
                                            : "Card"
                                        }</p>
                                    </div>
                                    {data.previously_paid > 0 &&
                                        <div className='flex flex-row justify-between'>
                                            <p>Previously Paid</p>
                                            <p>Rs. {data.previously_paid.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                        </div>
                                    }
                                    <div className='flex flex-row justify-between'>
                                        <p>Total Amount</p>
                                        <p>Rs. {data.total_amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                    </div>
                                    <div className='flex flex-row justify-between font-bold'>
                                        <p>Balance Due</p>
                                        <p>Rs. {data.payment_method === "CASH"
                                            ? (Number(data.cash_amount) - Number(data.total_amount)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                                            : (Number(data.card_amount) - Number(data.total_amount)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                                        }</p>
                                    </div>

                                    {isLastPage && pageItems.length < 21 && (
                                        <div>
                                            <div className='flex flex-col mt-5 text-sm'>
                                                <p className='font-bold'>NOTES</p>
                                                <p>{data.notes}</p>
                                            </div>

                                            <div className='flex flex-col text-sm'>
                                                <p className='font-bold'>TERMS & CONDITIONS</p>
                                                <p>{data.terms_and_conditions}</p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            }

                            {/* Footer Section */}
                            </div>
                            <div className='print-footer-fixed mt-auto flex flex-col text-xs items-center'>
                                <p className='font-semibold'>"THIS IS SYSTEM GENERATED"</p>
                                <p className='font-semibold text-sm'>Sparkle Laundry (PVT) LTD</p>
                                <p className='uppercase'>NO 391, Avissawealla Road, Wellampitiya</p>
                                <div className='flex flex-row'>
                                    <p>TEL : 94 114 701 566 , EMAIL : info@sparklelaundry.lk , WEB : www.sparklelaundry.lk</p>
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

                        <h1 className="font-bold text-center text-2xl">PAYMENT RECEIPT</h1>

                        <div className='flex flex-row justify-between mt-5'>
                            <div className='border border-black/20 grid grid-cols-2 gap-x-3 p-1'>
                                <p className='font-semibold'>INVOICE NO:</p>
                                <p>{data?.invoice_id}</p>
                                <p className='font-semibold'>COMPANY NAME:</p>
                                <p className='uppercase'>{data?.company_name}</p>
                                <p className='font-semibold'>CUSTOMER ID:</p>
                                <p className='uppercase'>{data?.customer_id}</p>
                                <p className='font-semibold'>CUSTOMER NAME:</p>
                                <p className='uppercase'>{data?.customer_name}</p>
                                <p className='font-semibold'>PHONE NO:</p>
                                <p>{data?.phone_number}</p>
                            </div>
                        </div>

                        {showSummaryOnNextPage &&
                            <div className='mt-5'>
                                {/* Summary Section */}
                                <div className='flex flex-row justify-between'>
                                    <p>Payment Status</p>
                                    <p>{data.cash_amount === data.total_amount || data.card_amount === data.total_amount ? "Full Payment" : "Partial Payment"}</p>
                                </div>
                                <div className='flex flex-row justify-between'>
                                    <p>Sub Total</p>
                                    <p>Rs. {data.items?.reduce((sum, item) => { return sum + Number(item.amount || 0); }, 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                </div>
                                <div className='flex flex-row justify-between'>
                                    <p>Discount</p>
                                    <p>{data?.is_discount_percentage ? `${data?.discount}%` : `Rs. ${data?.discount?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}</p>
                                </div>
                                <div className='flex flex-row justify-between'>
                                    <p>Amount Paid</p>
                                    <p>Rs. {data.payment_method === "CASH"
                                        ? Number(data.cash_amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                                        : Number(data.card_amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                                    }</p>
                                </div>
                                <div className='flex flex-row justify-between'>
                                    <p>Payment Method</p>
                                    <p>{data.payment_method === "CASH"
                                        ? "Cash"
                                        : "Card"
                                    }</p>
                                </div>
                                {data.previously_paid > 0 &&
                                    <div className='flex flex-row justify-between'>
                                        <p>Previously Paid</p>
                                        <p>Rs. {data.previously_paid.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                    </div>
                                }
                                <div className='flex flex-row justify-between'>
                                    <p>Total Amount</p>
                                    <p>Rs. {data.total_amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                </div>
                                <div className='flex flex-row justify-between font-bold'>
                                    <p>Balance Due</p>
                                    <p>Rs. {data.payment_method === "CASH"
                                        ? (Number(data.cash_amount) - Number(data.total_amount)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                                        : (Number(data.card_amount) - Number(data.total_amount)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                                    }</p>
                                </div>
                            </div>
                        }

                        <div>
                            <div className='flex flex-col mt-5 text-sm'>
                                <p className='font-bold'>NOTES</p>
                                <p>{data.notes}</p>
                            </div>

                            <div className='flex flex-col text-sm'>
                                <p className='font-bold'>TERMS & CONDITIONS</p>
                                <p>{data.terms_and_conditions}</p>
                            </div>
                        </div>

                        {/* Footer Section */}
                        </div>
                        <div className='print-footer-fixed mt-auto flex flex-col text-xs items-center'>
                            <p className='font-semibold'>"THIS IS SYSTEM GENERATED"</p>
                            <p className='font-semibold text-sm'>Sparkle Laundry (PVT) LTD</p>
                            <p className='uppercase'>NO 391, Avissawealla Road, Wellampitiya</p>
                            <div className='flex flex-row'>
                                <p>TEL : 94 114 701 566 , EMAIL : info@sparklelaundry.lk , WEB : www.sparklelaundry.lk</p>
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

export default CorporatePaymentReceipt;