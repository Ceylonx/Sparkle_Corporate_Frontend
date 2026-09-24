import React from "react";
import logo from "../../assets/logo.png";
import { getAllRetailDrivers } from "../../services/Retail/RetailDriverServices";
import { getAllRetailVehicles } from "../../services/Retail/RetailVehicleServices";

// Transfer Note component for retail outlet to production
// Shows order IDs, laundry plant, number of bags, transaction, state, and driver/vehicle fields
const RetailTransferNote = React.forwardRef(({ orders, settings, transaction, state }, ref) => {
    const [drivers, setDrivers] = React.useState([]);
    const [vehicles, setVehicles] = React.useState([]);
    const [selectedDriver, setSelectedDriver] = React.useState("");
    const [selectedVehicle, setSelectedVehicle] = React.useState("");

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

    if (!orders || orders.length === 0) return null;

    const bagCount = settings?.bag_count || 8;
    const printedDate = new Date();

    // Calculate total bags for one order.
    // Packing rule: each item type is counted separately (and by packing option).
    const calculateBags = (order) => {
        const items = order.items || [];
        if (items.length === 0) return 0;

        const maxItemsPerBag = Math.max(1, Number(bagCount) || 8);
        const groups = new Map();

        items.forEach((item) => {
            const serviceKey = String(item?.service_type_id || item?.service_id || "UnknownService");
            const packingKey = String(item?.packing_option || "UnknownPacking");
            const groupKey = `${serviceKey}__${packingKey}`;
            groups.set(groupKey, (groups.get(groupKey) || 0) + 1);
        });

        let totalBags = 0;
        groups.forEach((count) => {
            totalBags += Math.ceil(count / maxItemsPerBag);
        });

        return totalBags;
    };

    // Split orders into pages based on bag_count (max orders per page)
    const splitOrders = (orders, maxPerPage) => {
        const pages = [];
        for (let i = 0; i < orders.length; i += maxPerPage) {
            pages.push(orders.slice(i, i + maxPerPage));
        }
        return pages;
    };

    // Maximum orders per page equals the bag_count setting
    const maxOrdersPerPage = bagCount;
    const orderPages = splitOrders(orders, maxOrdersPerPage);

    const destinationPlant = orders[0]?.delivery_outlet || localStorage.getItem("selectedBranchName") || "N/A";
    const totalBags = orders.reduce((sum, order) => sum + calculateBags(order), 0);
    const totalOrders = orders.length;

    // Render a single page
    const renderPage = (pageOrders, pageIndex, isPrint = false) => {
        const startOrderNumber = pageIndex * maxOrdersPerPage;
        const isLastPage = pageIndex === orderPages.length - 1;
        
        return (
            <div 
                key={pageIndex} 
                className={isPrint ? "hidden print:block w-full p-8" : "print:hidden flex flex-col bg-white w-full p-10 rounded-xl my-3"}
                style={isPrint ? { 
                    pageBreakAfter: isLastPage ? 'auto' : 'always',
                    pageBreakInside: 'avoid'
                } : {}}
            >
                {/* Header Section */}
                <div className="flex flex-row">
                    <img src={logo} className="w-20 object-contain me-auto" />

                    <div className="flex flex-col text-xs">
                        <div className="flex flex-row gap-x-5">
                            <div className="flex flex-row gap-x-2">
                                <p className="font-semibold">Printed Date :</p>
                                <p className="">{new Date().toISOString().split("T")[0]}</p>
                            </div>

                            <div className="flex flex-row gap-x-2">
                                <p className="font-semibold">Time :</p>
                                <p className="">{new Date().toLocaleTimeString()}</p>
                            </div>
                        </div>
                    </div>
                </div>

                <h1 className="font-bold text-center text-2xl uppercase mt-3">Transfer Note</h1>

                <div className='flex flex-row justify-between mt-5'>
                    <div className='border border-black/20 grid grid-cols-2 gap-x-3 p-1'>
                        <p className='font-semibold'>Location</p>
                        <p className='uppercase'>{destinationPlant}</p>
                        <p className='font-semibold'>Trans</p>
                        <p className='uppercase'>{transaction || "Plant-Orugodawatta"}</p>
                        <p className='font-semibold'>State</p>
                        <p className='uppercase'>{state || "Transfer washing plant"}</p>
                        <p className='font-semibold'>Orders</p>
                        <p>{totalOrders}</p>
                    </div>
                </div>

                {/* Service Order Table */}
                <table className={`border border-black/20 mt-5 uppercase ${isPrint ? 'w-full' : ''}`}>
                    <thead className='border border-black/20'>
                        <tr>
                            <th className='border-r border-black/20'>No</th>
                            <th className='border-r border-black/20'>Collection Order No</th>
                            <th className='border-r border-black/20'>Number of bags</th>
                            <th className='border-r border-black/20'>DELIVERY DATE</th>
                        </tr>
                    </thead>
                    <tbody>
                        {pageOrders.map((order, index) => (
                            <tr key={index} className='text-center'>
                                <td className='border-r border-black/20'>{startOrderNumber + index + 1}</td>
                                <td className='border-r border-black/20'>{order.order_id}</td>
                                <td className='border-r border-black/20'>{calculateBags(order)}</td>
                                <td className='border-r border-black/20'>{order.delivery_date ? new Date(order.delivery_date).toISOString().split("T")[0] : "—"}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {/* Driver Section */}
                <div className='flex flex-col font-bold mt-5 text-sm border-t border-black/20 pt-5'>
                    <div className='grid grid-cols-2 gap-x-5 mb-3'>
                        <div>
                            <p className='mb-2'>Driver Name:</p>
                            {isPrint ? (
                                <>
                                    <div className='border-b border-black/20 min-h-[30px] flex items-center font-normal uppercase'>{selectedDriver || '—'}</div>
                                    <div className='mt-3'>
                                        <p className='mb-1'>Driver's Signature:</p>
                                        <div className='border-b border-dotted border-black/50 min-h-[30px]' />
                                    </div>
                                </>
                            ) : (
                                <select
                                    value={selectedDriver}
                                    onChange={(e) => setSelectedDriver(e.target.value)}
                                    className='w-full border border-black/30 rounded-lg p-2 font-normal focus:outline-none focus:border-primary text-sm bg-white'
                                >
                                    <option value="">Select Driver</option>
                                    {drivers.map((d) => (
                                        <option key={d.id} value={d.name}>
                                            {d.name} {d.nic ? `(${d.nic})` : ''}
                                        </option>
                                    ))}
                                </select>
                            )}
                        </div>
                        <div>
                            <p className='mb-2'>Vehicle Number:</p>
                            {isPrint ? (
                                <div className='border-b border-black/20 min-h-[30px] flex items-center font-normal uppercase'>{selectedVehicle || '—'}</div>
                            ) : (
                                <select
                                    value={selectedVehicle}
                                    onChange={(e) => setSelectedVehicle(e.target.value)}
                                    className='w-full border border-black/30 rounded-lg p-2 font-normal focus:outline-none focus:border-primary text-sm bg-white'
                                >
                                    <option value="">Select Vehicle</option>
                                    {vehicles.map((v) => (
                                        <option key={v.id} value={v.vehicle_number}>
                                            {v.vehicle_number}
                                        </option>
                                    ))}
                                </select>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div ref={ref}>
            {/* Preview Version - Show first page only */}
            {orderPages.length > 0 && renderPage(orderPages[0], 0, false)}
            
            {/* Print Version - Show all pages */}
            {orderPages.map((pageOrders, pageIndex) => renderPage(pageOrders, pageIndex, true))}
        </div>
    );
});

export default RetailTransferNote;

