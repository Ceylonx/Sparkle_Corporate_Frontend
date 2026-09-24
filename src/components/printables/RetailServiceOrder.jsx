import React from 'react';
import logo from "../../assets/logo.png";
import { QRCodeCanvas } from 'qrcode.react';

const RetailServiceOrder = React.forwardRef(({ order, serviceType, itemTypes, foldType, settings, isBulk = false }, ref) => {
    // Items for the selected service + (optionally) packing option
    // If foldType is not provided, include all packing options for that service type
    const filteredOrders = order?.items?.filter(
        (item) => {
            let matchType = false;
            if (serviceType === "ALL") {
                matchType = true;
            } else if (item.service_type_id) {
                matchType = Number(item.service_type_id) === serviceType;
            } else if (item.service_type_name) {
                const typeName = item.service_type_name.toLowerCase();
                if (serviceType === 1 && typeName.includes("wash")) matchType = true;
                if (serviceType === 2 && typeName.includes("press")) matchType = true;
                if (serviceType === 3 && typeName.includes("dry")) matchType = true;
            }
            return matchType && (!foldType || item.packing_option === foldType);
        }
    ) ?? [];

    // Get sticker count per page from settings (default to 6)
    // Ensure it's a valid number, default to 6 if invalid or missing
    const stickersPerPage = settings?.sticker_count_per_page
        ? Number(settings.sticker_count_per_page) || 6
        : 6;

    // Get bag count (items per bag) from settings (default to 8)
    const bagCount = settings?.bag_count || 8;

    // Calculate packet count based on total items and bag count
    const totalItems = filteredOrders.length;
    const packetCount = Math.ceil(totalItems / bagCount);

    // Split items into pages based on stickersPerPage
    const splitIntoPages = (items, perPage) => {
        const pages = [];
        for (let i = 0; i < items.length; i += perPage) {
            pages.push(items.slice(i, i + perPage));
        }
        return pages;
    };

    // One sticker per item, grouped into pages
    const stickerPages = splitIntoPages(filteredOrders, stickersPerPage);

    const getServiceTypeLabel = (st, item) => {
        if (st) {
            return Number(st) === 1 ? "WASHING" : Number(st) === 2 ? "PRESSING" : "DRY CLEAN";
        }
        if (item?.service_type_name) {
            const typeName = item.service_type_name.toLowerCase();
            if (typeName.includes("wash")) return "WASHING";
            if (typeName.includes("press")) return "PRESSING";
            if (typeName.includes("dry")) return "DRY CLEAN";
        }
        return "";
    };

    const packingLabel = foldType;

    // Get delivery type from order (Normal, Two Day, One Day, Express, or Urgent)
    const deliveryTypeLabel = order?.delivery_type || "";

    return (
        <>
            <style>{`
                .qr-code-wrapper {
                    display: flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    width: 100% !important;
                    height: 100% !important;
                }
                .qr-code-wrapper canvas {
                    width: auto !important;
                    height: auto !important;
                    max-width: 100% !important;
                    max-height: 100% !important;
                    object-fit: contain !important;
                }
            `}</style>
            <div className={`a5-print ${isBulk ? 'w-full' : ''}`} ref={!isBulk ? ref : null}>
                {/* Print */}
                <div
                    ref={isBulk ? ref : null}
                    id="print-section"
                    className={`${isBulk ? 'flex' : 'hidden print:flex'} print-container flex-col w-full a5-print`}
                    style={{ pageBreakAfter: isBulk ? 'auto' : 'always' }}
                >
                    {stickerPages.map((pageItems, pageIndex) => {
                        // Ensure only stickersPerPage stickers per page
                        const stickersForThisPage = pageItems.slice(0, stickersPerPage);

                        return (
                            <div
                                key={pageIndex}
                                className="flex flex-col items-center justify-center w-full p-2 gap-2"
                                style={{
                                    height: '100vh',
                                    pageBreakAfter: pageIndex < stickerPages.length - 1 ? 'always' : 'auto',
                                    pageBreakInside: 'avoid',
                                    overflow: 'hidden'
                                }}
                            >
                                {/* Stickers grid - 2 columns, dynamic rows based on stickersPerPage */}
                                <div className="w-full h-full grid grid-cols-2 gap-2" style={{ gridTemplateRows: `repeat(${Math.ceil(stickersPerPage / 2)}, 1fr)`, maxHeight: '100%' }}>
                                    {stickersForThisPage.map((item, itemIndex) => {
                                        // Calculate packet number for this specific item based on its position in the full filtered list
                                        const globalItemIndex = pageIndex * stickersPerPage + itemIndex;
                                        const packetNumber = Math.ceil((globalItemIndex + 1) / bagCount);

                                        return (
                                            <div key={itemIndex} className="w-full h-full min-h-0" style={{ fontSize: 'clamp(8px, 1.2vw, 12px)' }}>
                                                {/* Sticker container - New structure: 3 columns, 3 rows */}
                                                <div className="w-full h-full border border-black bg-white grid grid-cols-3 items-stretch overflow-hidden" style={{ gridTemplateRows: '1fr 1fr 1fr' }}>
                                                    {/* Cell 1: Logo - Left column, spans rows 1-2 (tall rectangle) */}
                                                    <div className="row-span-2 border-r border-black border-b flex flex-col items-center justify-center overflow-hidden" style={{ padding: '2%' }}>
                                                        <img src={logo} style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }} alt="Logo" />
                                                    </div>

                                                    {/* Cell 2: Collection Order Number - Middle column, top row */}
                                                    <div className="border-r border-black border-b flex flex-col items-center justify-center text-center overflow-hidden" style={{ padding: '2%' }}>
                                                        <p className="font-bold uppercase" style={{ fontSize: '1em', lineHeight: '1.2', marginBottom: '2px' }}>
                                                            Collection Order Number
                                                        </p>
                                                        <p className="font-bold uppercase" style={{ fontSize: '1em', lineHeight: '1.2', wordBreak: 'break-word' }}>
                                                            {order?.order_id || ""}
                                                        </p>
                                                    </div>

                                                    {/* Cell 3: Packed Date - Right column, top row */}
                                                    <div className="border-b border-black flex flex-col items-center justify-center text-center overflow-hidden" style={{ padding: '2%' }}>
                                                        <p className="font-bold uppercase" style={{ fontSize: '1em', lineHeight: '1.2', marginBottom: '2px' }}>
                                                            Packed Date
                                                        </p>
                                                        <p className="font-bold uppercase" style={{ fontSize: '1em', lineHeight: '1.2', wordBreak: 'break-word' }}>
                                                            {order?.created_at ? new Date(order.created_at).toISOString().split("T")[0] : new Date().toISOString().split("T")[0]}
                                                        </p>
                                                    </div>

                                                    {/* Cell 4 & 5: Middle column, second row - Packet Count and Service Type side by side */}
                                                    <div className="border-r border-black border-b flex flex-row overflow-hidden">
                                                        {/* Cell 4: Packet Count - left side */}
                                                        <div className="flex-1 flex flex-col items-center justify-center text-center border-r border-black overflow-hidden" style={{ padding: '2%' }}>
                                                            <p className="font-bold uppercase" style={{ fontSize: '1em', lineHeight: '1.2', marginBottom: '2px' }}>Packet Count</p>
                                                            <p className="font-bold uppercase" style={{ fontSize: '1em', lineHeight: '1.2', wordBreak: 'break-word' }}>
                                                                {packetCount}
                                                            </p>
                                                        </div>
                                                        {/* Cell 5: Service Type - right side */}
                                                        <div className="flex-1 flex flex-col items-center justify-center text-center overflow-hidden" style={{ padding: '2%' }}>
                                                            <p className="font-bold uppercase" style={{ fontSize: '1em', lineHeight: '1.2', marginBottom: '2px' }}>Service Type</p>
                                                            <p className="font-bold uppercase" style={{ fontSize: '1em', lineHeight: '1.2', wordBreak: 'break-word' }}>{deliveryTypeLabel}</p>
                                                        </div>
                                                    </div>

                                                    {/* Cell 6 & 7: Right column, second row - Washing/Pressing/Dry cleaning and Fold/Hanger side by side */}
                                                    <div className="border-b border-black flex flex-row overflow-hidden">
                                                        {/* Cell 6: Washing/Pressing/Dry cleaning - left side */}
                                                        <div className="flex-1 flex flex-col items-center justify-center text-center border-r border-black overflow-hidden" style={{ padding: '2%' }}>
                                                            <p className="font-bold uppercase" style={{ fontSize: '1em', lineHeight: '1.2', marginBottom: '2px' }}>
                                                                washing/pressing/Dry cleaning
                                                            </p>
                                                            <p className="font-bold uppercase" style={{ fontSize: '1em', lineHeight: '1.2', wordBreak: 'break-word' }}>{getServiceTypeLabel(item.service_type_id, item)}</p>
                                                        </div>
                                                        {/* Cell 7: Fold/Hanger - right side */}
                                                        <div className="flex-1 flex flex-col items-center justify-center text-center overflow-hidden" style={{ padding: '2%' }}>
                                                            <p className="font-bold uppercase" style={{ fontSize: '1em', lineHeight: '1.2', marginBottom: '2px', wordBreak: 'break-word' }}>Fold/Hanger</p>
                                                            <p className="font-bold uppercase" style={{ fontSize: '1em', lineHeight: '1.2', wordBreak: 'break-word' }}>{item.packing_option || packingLabel || ""}</p>
                                                        </div>
                                                    </div>

                                                    {/* Cell 8: QR Code - Left column, bottom row (tall rectangle, same size as logo) */}
                                                    <div className="border-r border-black flex items-center justify-center overflow-hidden" style={{ paddingTop: '5%', paddingBottom: '5%', paddingLeft: '1%', paddingRight: '1%' }}>
                                                        <div className="qr-code-wrapper" style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                            <QRCodeCanvas
                                                                value={order?.order_id || ""}
                                                                size={450}
                                                                level="M"
                                                            />
                                                        </div>
                                                    </div>

                                                    {/* Cell 9: SERVICE ORDER NO - Middle + Right columns, bottom row (spans 2 columns) */}
                                                    <div className="col-span-2 flex flex-col items-center justify-center text-center overflow-hidden" style={{ padding: '2%' }}>
                                                        <p className="font-bold uppercase" style={{ fontSize: '1em', lineHeight: '1.2', marginBottom: '2px', wordBreak: 'break-word' }}>SERVICE ORDER NO</p>
                                                        <p className="font-bold" style={{ fontSize: '1.4em', lineHeight: '1.2', wordBreak: 'break-word', letterSpacing: '0.1em' }}>
                                                            {order?.order_id || ""}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        )
                                    })}
                                    {/* Fill empty slots if less than stickersPerPage stickers */}
                                    {Array.from({ length: stickersPerPage - stickersForThisPage.length }).map((_, emptyIndex) => (
                                        <div key={`empty-${emptyIndex}`} className="w-full h-full" style={{ visibility: 'hidden' }}></div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </>
    );
});

export default RetailServiceOrder;