import React from 'react';
import logo from "../../assets/logo.png";
import { QRCodeCanvas } from 'qrcode.react';
import { getAllRetailDrivers } from "../../services/Retail/RetailDriverServices";
import { getAllRetailVehicles } from "../../services/Retail/RetailVehicleServices";

const RetailBulkServiceOrder = React.forwardRef(({
    orders,
    settings,
    transaction,
    state,
    dispatchNoteOnly = false,
    stickersOnly = false,
    dispatchNoteNo,
    driver,
    vehicle,
    onDriverChange,
    onVehicleChange
}, ref) => {
    const [drivers, setDrivers] = React.useState([]);
    const [vehicles, setVehicles] = React.useState([]);
    const [internalDriver, setInternalDriver] = React.useState("");
    const [internalVehicle, setInternalVehicle] = React.useState("");

    const selectedDriver = driver !== undefined ? driver : internalDriver;
    const selectedVehicle = vehicle !== undefined ? vehicle : internalVehicle;

    const handleDriverSelect = (val) => {
        if (onDriverChange) {
            onDriverChange(val);
        }
        setInternalDriver(val);
    };

    const handleVehicleSelect = (val) => {
        if (onVehicleChange) {
            onVehicleChange(val);
        }
        setInternalVehicle(val);
    };

    React.useEffect(() => {
        const loadDriversAndVehicles = async () => {
            try {
                const [driverRes, vehicleRes] = await Promise.all([
                    getAllRetailDrivers(),
                    getAllRetailVehicles()
                ]);
                if (driverRes && driverRes.success) {
                    setDrivers(driverRes.drivers || []);
                }
                if (vehicleRes && vehicleRes.success) {
                    setVehicles(vehicleRes.vehicles || []);
                }
            } catch (err) {
                console.error("Error loading drivers/vehicles:", err);
            }
        };
        loadDriversAndVehicles();
    }, []);

    // Get sticker count per page from settings (default to 6)
    const stickersPerPage = settings?.sticker_count_per_page
        ? Number(settings.sticker_count_per_page) || 6
        : 6;

    // Get bag count (items per bag) from settings (default to 8)
    const bagCount = settings?.bag_count || 8;

    // Same as Transfer Note: calculate bags per order for the dispatch note table
    const calculateBags = (order) => {
        const totalItems = order.items?.length || 0;
        return Math.max(1, Math.ceil(totalItems / bagCount));
    };

    // Ensure orders is always an array
    const orderList = React.useMemo(() => {
        if (!orders) return [];
        if (Array.isArray(orders)) return orders;
        // If it's a single object, wrap it in an array
        if (typeof orders === 'object' && orders.order_id) return [orders];
        return [];
    }, [orders]);
    
    console.log(`[DEBUG RetailBulkServiceOrder] Received orders prop:`, orders, `orderList length:`, orderList.length, `orderList:`, orderList.map(o => o?.order_id));
    const destinationPlant = orderList[0]?.delivery_outlet || (typeof localStorage !== "undefined" ? localStorage.getItem("selectedBranchName") : null) || "N/A";
    const totalBags = orderList.reduce((sum, order) => sum + calculateBags(order), 0);
    const totalOrders = orderList.length;
    
    // Debug: Log what will be rendered in dispatch note table
    console.log(`[DEBUG Dispatch Note Table] Will render ${orderList.length} rows:`, orderList.map((o, i) => `${i + 1}. ${o?.order_id}`));

    // Generate a flat list of all stickers to be printed across all orders and service types
    const allStickers = [];

    const serviceTypes = [
        { id: 1, label: "WASHING" },
        { id: 2, label: "PRESSING" },
        { id: 3, label: "DRY CLEAN" }
    ];

    (orders || []).forEach(order => {
        serviceTypes.forEach(serviceType => {
            // Filter items for this specific order and service type
            const itemsForService = (order.items || []).filter((item) => {
                if (item.service_type_id) return Number(item.service_type_id) === serviceType.id;
                
                // Fallback for search views where service_type_id might be missing
                const typeName = item.service_type_name?.toLowerCase() || "";
                if (serviceType.id === 1 && typeName.includes("wash")) return true;
                if (serviceType.id === 2 && typeName.includes("press")) return true;
                if (serviceType.id === 3 && typeName.includes("dry")) return true;
                
                return false;
            });

            if (itemsForService.length > 0) {
                // Calculate packet count for this specific service group within this order
                const totalItems = itemsForService.length;
                const packetCount = Math.ceil(totalItems / bagCount);

                itemsForService.forEach((item, index) => {
                    // Calculate packet number for this item
                    // index is 0-based, so item 1 is index 0. user wants 1-based "Packet 1 of X"
                    const currentPacketNumber = Math.ceil((index + 1) / bagCount);

                    allStickers.push({
                        orderId: order.order_id,
                        deliveryType: order.delivery_type || "",
                        serviceTypeLabel: serviceType.label,
                        packingLabel: item.packing_option, // "Fold" or "Hanger"
                        packetCount: packetCount, // Total packets for this service group
                        currentPacketNumber: currentPacketNumber, // Current packet number
                        uniqueKey: `${order.order_id}-${serviceType.id}-${item.order_item_id || index}`
                    });
                });
            }
        });
    });

    // Split items into pages based on stickersPerPage
    const splitIntoPages = (items, perPage) => {
        const pages = [];
        for (let i = 0; i < items.length; i += perPage) {
            pages.push(items.slice(i, i + perPage));
        }
        return pages;
    };

    const stickerPages = splitIntoPages(allStickers, stickersPerPage);
    
    console.log(`[DEBUG Stickers] dispatchNoteOnly=${dispatchNoteOnly}, stickersOnly=${stickersOnly}, allStickers.length=${allStickers.length}, stickerPages.length=${stickerPages.length}, shouldShowStickers=${(!dispatchNoteOnly || stickersOnly)}`);

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
                @media print {
                    .dispatch-note-page {
                        display: block !important;
                        padding: 0.75rem 1.25rem !important;
                        box-sizing: border-box !important;
                        page-break-inside: avoid !important;
                    }
                }
            `}</style>
            <div className="a5-print" ref={ref}>
                {/* Preview Version - Show dispatch note only (no stickers) */}
                {dispatchNoteOnly && (
                    <div className="print:hidden flex flex-col bg-white w-full p-8 rounded-xl my-2">
                        <div className="flex flex-row">
                            <img src={logo} className="w-20 object-contain me-auto" alt="Logo" />
                            <div className="flex flex-col text-xs">
                                <div className="flex flex-row gap-x-5">
                                    <div className="flex flex-row gap-x-2">
                                        <p className="font-semibold">Printed Date :</p>
                                        <p>{new Date().toISOString().split("T")[0]}</p>
                                    </div>
                                    <div className="flex flex-row gap-x-2">
                                        <p className="font-semibold">Time :</p>
                                        <p>{new Date().toLocaleTimeString()}</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <h1 className="font-bold text-center text-2xl uppercase mt-2">DISPATCH NOTE</h1>

                        <div className='flex flex-row justify-between mt-3'>
                            <div className='border border-black/20 grid grid-cols-2 gap-x-3 p-1 text-sm'>
                                {dispatchNoteNo && (
                                    <>
                                        <p className='font-semibold'>Dispatch Note No</p>
                                        <p className='uppercase font-bold'>{dispatchNoteNo}</p>
                                    </>
                                )}
                                <p className='font-semibold'>Location</p>
                                <p className='uppercase'>{transaction || "Plant-Orugodawatta"}</p>
                                <p className='font-semibold'>Trans</p>
                                <p className='uppercase'>{destinationPlant}</p>
                                <p className='font-semibold'>State</p>
                                <p className='uppercase'>{state || "Transfer washing plant"}</p>
                                <p className='font-semibold'>Orders</p>
                                <p>{totalOrders}</p>
                            </div>
                        </div>

                        <table className="border border-black/20 mt-4 uppercase w-full text-sm">
                            <thead className='border border-black/20'>
                                <tr>
                                    <th className='border-r border-black/20 py-1 px-2'>No</th>
                                    <th className='border-r border-black/20 py-1 px-2'>Collection Order No</th>
                                    <th className='border-r border-black/20 py-1 px-2'>Number of bags</th>
                                    <th className='border-r border-black/20 py-1 px-2'>ITEM QTY</th>
                                    <th className='border-r border-black/20 py-1 px-2'>DELIVERY DATE</th>
                                </tr>
                            </thead>
                            <tbody>
                                {orderList.map((order, index) => (
                                    <tr key={index} className='text-center'>
                                        <td className='border-r border-black/20 py-1.5 px-2'>{index + 1}</td>
                                        <td className='border-r border-black/20 py-1.5 px-2'>{order.order_id}</td>
                                        <td className='border-r border-black/20 py-1.5 px-2'>{calculateBags(order)}</td>
                                        <td className='border-r border-black/20 py-1.5 px-2'>{order.items?.length || order.quantity || 0}</td>
                                        <td className='border-r border-black/20 py-1.5 px-2'>{order.delivery_date ? new Date(order.delivery_date).toISOString().split("T")[0] : "—"}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        <div className='flex flex-col font-bold mt-4 text-sm border-t border-black/20 pt-3'>
                            <div className='grid grid-cols-2 gap-x-5'>
                                <div>
                                    <p className='mb-1'>Driver:</p>
                                    <select
                                        value={selectedDriver}
                                        onChange={(e) => handleDriverSelect(e.target.value)}
                                        className='w-full border border-black/30 rounded-lg p-1.5 font-normal focus:outline-none focus:border-primary text-sm bg-white'
                                    >
                                        <option value="">Select Driver</option>
                                        {drivers.map((d) => (
                                            <option key={d.id} value={d.name}>
                                                {d.name} {d.nic ? `(${d.nic})` : ''}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <p className='mb-1'>Vehicle:</p>
                                    <select
                                        value={selectedVehicle}
                                        onChange={(e) => handleVehicleSelect(e.target.value)}
                                        className='w-full border border-black/30 rounded-lg p-1.5 font-normal focus:outline-none focus:border-primary text-sm bg-white'
                                    >
                                        <option value="">Select Vehicle</option>
                                        {vehicles.map((v) => (
                                            <option key={v.id} value={v.vehicle_number}>
                                                {v.vehicle_number}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Print */}
                <div
                    id="print-section"
                    className="hidden print:flex print-container flex-col w-full a5-print"
                    style={{ pageBreakAfter: 'always' }}
                >
                    {/* First page: DISPATCH NOTE - Only show if not stickersOnly */}
                    {!stickersOnly && (
                    <div
                        className="dispatch-note-page flex flex-col w-full p-6"
                        style={{
                            pageBreakAfter: 'always',
                            pageBreakInside: 'avoid'
                        }}
                    >
                        <div className="flex flex-row">
                            <img src={logo} className="w-20 object-contain me-auto" alt="Logo" />
                            <div className="flex flex-col text-xs">
                                <div className="flex flex-row gap-x-5">
                                    <div className="flex flex-row gap-x-2">
                                        <p className="font-semibold">Printed Date :</p>
                                        <p>{new Date().toISOString().split("T")[0]}</p>
                                    </div>
                                    <div className="flex flex-row gap-x-2">
                                        <p className="font-semibold">Time :</p>
                                        <p>{new Date().toLocaleTimeString()}</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <h1 className="font-bold text-center text-2xl uppercase mt-2">DISPATCH NOTE</h1>

                        <div className='flex flex-row justify-between mt-3'>
                            <div className='border border-black/20 grid grid-cols-2 gap-x-3 p-1 text-sm'>
                                {dispatchNoteNo && (
                                    <>
                                        <p className='font-semibold'>Dispatch Note No</p>
                                        <p className='uppercase font-bold'>{dispatchNoteNo}</p>
                                    </>
                                )}
                                <p className='font-semibold'>Location</p>
                                <p className='uppercase'>{transaction || "Plant-Orugodawatta"}</p>
                                <p className='font-semibold'>Trans</p>
                                <p className='uppercase'>{destinationPlant}</p>
                                <p className='font-semibold'>State</p>
                                <p className='uppercase'>{state || "Transfer washing plant"}</p>
                                <p className='font-semibold'>Orders</p>
                                <p>{totalOrders}</p>
                            </div>
                        </div>

                        <table className="border border-black/20 mt-4 uppercase w-full text-sm">
                            <thead className='border border-black/20'>
                                <tr>
                                    <th className='border-r border-black/20 py-1 px-2'>No</th>
                                    <th className='border-r border-black/20 py-1 px-2'>Collection Order No</th>
                                    <th className='border-r border-black/20 py-1 px-2'>Number of bags</th>
                                    <th className='border-r border-black/20 py-1 px-2'>ITEM QTY</th>
                                    <th className='border-r border-black/20 py-1 px-2'>DELIVERY DATE</th>
                                </tr>
                            </thead>
                            <tbody>
                                {orderList.map((order, index) => (
                                    <tr key={index} className='text-center'>
                                        <td className='border-r border-black/20 py-1.5 px-2'>{index + 1}</td>
                                        <td className='border-r border-black/20 py-1.5 px-2'>{order.order_id}</td>
                                        <td className='border-r border-black/20 py-1.5 px-2'>{calculateBags(order)}</td>
                                        <td className='border-r border-black/20 py-1.5 px-2'>{order.items?.length || order.quantity || 0}</td>
                                        <td className='border-r border-black/20 py-1.5 px-2'>{order.delivery_date ? new Date(order.delivery_date).toISOString().split("T")[0] : "—"}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        <div className='flex flex-col font-bold mt-4 text-sm border-t border-black/20 pt-3'>
                            <div className='grid grid-cols-2 gap-x-5'>
                                <div>
                                    <p className='mb-1'>Driver Name:</p>
                                    <div className='border-b border-black/20 min-h-[26px] flex items-center font-normal uppercase'>
                                        {selectedDriver || '—'}
                                    </div>
                                    <div className='mt-3'>
                                        <p className='mb-1'>Driver's Signature:</p>
                                        <div className='border-b border-dotted border-black/50 min-h-[30px]' />
                                    </div>
                                </div>
                                <div>
                                    <p className='mb-1'>Vehicle Number:</p>
                                    <div className='border-b border-black/20 min-h-[26px] flex items-center font-normal uppercase'>
                                        {selectedVehicle || '—'}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    )}

                    {(!dispatchNoteOnly || stickersOnly) && stickerPages.length > 0 && stickerPages.map((pageItems, pageIndex) => {
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
                                    {stickersForThisPage.map((sticker, itemIndex) => {
                                        return (
                                            <div key={sticker.uniqueKey} className="w-full h-full min-h-0" style={{ fontSize: 'clamp(8px, 1.2vw, 12px)' }}>
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
                                                            {sticker.orderId}
                                                        </p>
                                                    </div>

                                                    {/* Cell 3: Packed Date - Right column, top row */}
                                                    <div className="border-b border-black flex flex-col items-center justify-center text-center overflow-hidden" style={{ padding: '2%' }}>
                                                        <p className="font-bold uppercase" style={{ fontSize: '1em', lineHeight: '1.2', marginBottom: '2px' }}>
                                                            Packed Date
                                                        </p>
                                                        <p className="font-bold uppercase" style={{ fontSize: '1em', lineHeight: '1.2', wordBreak: 'break-word' }}>
                                                            {new Date().toISOString().split("T")[0]}
                                                        </p>
                                                    </div>

                                                    {/* Cell 4 & 5: Middle column, second row - Packet Count and Service Type side by side */}
                                                    <div className="border-r border-black border-b flex flex-row overflow-hidden">
                                                        {/* Cell 4: Packet Count - left side */}
                                                        <div className="flex-1 flex flex-col items-center justify-center text-center border-r border-black overflow-hidden" style={{ padding: '2%' }}>
                                                            <p className="font-bold uppercase" style={{ fontSize: '1em', lineHeight: '1.2', marginBottom: '2px' }}>Packet Count</p>
                                                            <p className="font-bold uppercase" style={{ fontSize: '1em', lineHeight: '1.2', wordBreak: 'break-word' }}>
                                                                {sticker.packetCount}
                                                            </p>
                                                        </div>
                                                        {/* Cell 5: Service Type - right side */}
                                                        <div className="flex-1 flex flex-col items-center justify-center text-center overflow-hidden" style={{ padding: '2%' }}>
                                                            <p className="font-bold uppercase" style={{ fontSize: '1em', lineHeight: '1.2', marginBottom: '2px' }}>Service Type</p>
                                                            <p className="font-bold uppercase" style={{ fontSize: '1em', lineHeight: '1.2', wordBreak: 'break-word' }}>{sticker.deliveryType}</p>
                                                        </div>
                                                    </div>

                                                    {/* Cell 6 & 7: Right column, second row - Washing/Pressing/Dry cleaning and Fold/Hanger side by side */}
                                                    <div className="border-b border-black flex flex-row overflow-hidden">
                                                        {/* Cell 6: Washing/Pressing/Dry cleaning - left side */}
                                                        <div className="flex-1 flex flex-col items-center justify-center text-center border-r border-black overflow-hidden" style={{ padding: '2%' }}>
                                                            <p className="font-bold uppercase" style={{ fontSize: '1em', lineHeight: '1.2', marginBottom: '2px' }}>
                                                                washing/pressing/Dry cleaning
                                                            </p>
                                                            <p className="font-bold uppercase" style={{ fontSize: '1em', lineHeight: '1.2', wordBreak: 'break-word' }}>{sticker.serviceTypeLabel}</p>
                                                        </div>
                                                        {/* Cell 7: Fold/Hanger - right side */}
                                                        <div className="flex-1 flex flex-col items-center justify-center text-center overflow-hidden" style={{ padding: '2%' }}>
                                                            <p className="font-bold uppercase" style={{ fontSize: '1em', lineHeight: '1.2', marginBottom: '2px', wordBreak: 'break-word' }}>Fold/Hanger</p>
                                                            <p className="font-bold uppercase" style={{ fontSize: '1em', lineHeight: '1.2', wordBreak: 'break-word' }}>{sticker.packingLabel}</p>
                                                        </div>
                                                    </div>

                                                    {/* Cell 8: QR Code - Left column, bottom row (tall rectangle, same size as logo) */}
                                                    <div className="border-r border-black flex items-center justify-center overflow-hidden" style={{ paddingTop: '5%', paddingBottom: '5%', paddingLeft: '1%', paddingRight: '1%' }}>
                                                        <div className="qr-code-wrapper" style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                            <QRCodeCanvas
                                                                value={sticker.orderId}
                                                                size={450}
                                                                level="M"
                                                            />
                                                        </div>
                                                    </div>

                                                    {/* Cell 9: SERVICE ORDER NO - Middle + Right columns, bottom row (spans 2 columns) */}
                                                    <div className="col-span-2 flex flex-col items-center justify-center text-center overflow-hidden" style={{ padding: '2%' }}>
                                                        <p className="font-bold uppercase" style={{ fontSize: '1em', lineHeight: '1.2', marginBottom: '2px', wordBreak: 'break-word' }}>SERVICE ORDER NO</p>
                                                        <p className="font-bold" style={{ fontSize: '1.4em', lineHeight: '1.2', wordBreak: 'break-word', letterSpacing: '0.1em' }}>
                                                            {sticker.orderId}
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

export default RetailBulkServiceOrder;
