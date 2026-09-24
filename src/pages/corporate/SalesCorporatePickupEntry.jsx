import { BiPlus } from "react-icons/bi";
import { MdSearch } from "react-icons/md";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@iconify/react/dist/iconify.js";
import { Link, useNavigate } from "react-router-dom";
import { getAllCorporateInProductionPickupEntries, updateCorporatePickupEntryDate } from "../../services/corporate/PickupEntryServices";
import { BeatLoader } from "react-spinners";
import { getAllItemTypes } from "../../services/Retail/RetailSettingsServices";
import Swal from "sweetalert2";

const ITEMS_PER_PAGE = 10;

const extractPickupEntryRows = (data) => {
    const candidates = [
        data?.in_production_pickup_entries,
        data?.pickup_entries,
        data?.pickup_entry,
        data?.data,
    ];

    for (const candidate of candidates) {
        if (Array.isArray(candidate)) {
            return candidate;
        }
    }

    return [];
};

const getPickupEntryTotalCount = (data, fallback = 0) => {
    const rawCount =
        data?.totalCount ??
        data?.total_count ??
        data?.count ??
        data?.total ??
        fallback;

    const parsedCount = Number(rawCount);
    return Number.isFinite(parsedCount) ? parsedCount : fallback;
};

const SalesCorporatePickupEntry = () => {
    const navigate = useNavigate();
    const [isLoading, setIsLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [pickupEntries, setPickupEntries] = useState([]);
    const [itemTypes, setItemTypes] = useState([]);
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");
    const [totalEntries, setTotalEntries] = useState(0);
    const [currentPage, setCurrentPage] = useState(1);
    const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
    const latestFetchRef = useRef(0);

    // Date change calendar state (every user can edit)
    const [showDateChangeCalendar, setShowDateChangeCalendar] = useState(false);
    const [selectedOrderForDateChange, setSelectedOrderForDateChange] = useState(null);
    const [selectedNewDate, setSelectedNewDate] = useState("");
    const [isUpdatingDate, setIsUpdatingDate] = useState(false);

    const handleDateChangeClick = (order) => {
        setSelectedOrderForDateChange(order);
        const currentDate = order.created_at ? new Date(order.created_at) : new Date();
        const formattedDate = currentDate.toISOString().split("T")[0];
        setSelectedNewDate(formattedDate);
        setShowDateChangeCalendar(true);
    };

    const handleDateChangeSubmit = async () => {
        if (!selectedOrderForDateChange || !selectedNewDate) return;

        const userId = localStorage.getItem("userId");
        const pickupEntryId = selectedOrderForDateChange.pickup_entry_id;

        if (!userId) {
            Swal.fire({
                icon: "error",
                title: "Error",
                text: "User ID not found. Please log in again.",
            });
            return;
        }

        if (!pickupEntryId) {
            Swal.fire({
                icon: "error",
                title: "Error",
                text: "Collection Order ID not found.",
            });
            return;
        }

        setIsUpdatingDate(true);
        try {
            const now = new Date();
            const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
            const payload = {
                user_id: userId,
                pickup_entry_id: pickupEntryId,
                new_date: `${selectedNewDate} ${currentTime}`
            };

            await updateCorporatePickupEntryDate(payload);

            Swal.fire({
                icon: "success",
                title: "Success",
                text: "Collection date updated successfully.",
            });

            // Update the order in local state
            setPickupEntries(prev => prev.map(order =>
                order.pickup_entry_id === pickupEntryId
                    ? { ...order, created_at: `${selectedNewDate}T${currentTime}` }
                    : order
            ));

            setShowDateChangeCalendar(false);
            setSelectedOrderForDateChange(null);
            setSelectedNewDate("");
        } catch (error) {
            console.error("Error updating collection date:", error);
            Swal.fire({
                icon: "error",
                title: "Error",
                text: "Failed to update collection date. Please try again.",
            });
        } finally {
            setIsUpdatingDate(false);
        }
    };

    const fetchAllPickupEntries = async (page = currentPage) => {
        const userId = localStorage.getItem("userId");
        if (!userId) {
            setPickupEntries([]);
            setTotalEntries(0);
            return;
        }

        const fetchId = ++latestFetchRef.current;

        try {
            setIsLoading(true);
            const response = await getAllCorporateInProductionPickupEntries(userId, {
                page,
                limit: ITEMS_PER_PAGE,
                search: debouncedSearchQuery,
            });
            if (fetchId !== latestFetchRef.current) return;

            const list = extractPickupEntryRows(response?.data);
            const sorted = [...list].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
            setPickupEntries(sorted);
            setTotalEntries(getPickupEntryTotalCount(response?.data, sorted.length));
        } catch (error) {
            if (fetchId !== latestFetchRef.current) return;
            console.error("Error fetching pickup entries: ", error);
            setPickupEntries([]);
            setTotalEntries(0);
        } finally {
            if (fetchId === latestFetchRef.current) {
                setIsLoading(false);
            }
        }
    };

    const fetchItemTypes = async () => {
        try {
            const response = await getAllItemTypes(localStorage.getItem("userId"));
            setItemTypes(response.data.item_types);
        } catch (error) {
            console.error("Error fetching item types: ", error);
        }
    };

    useEffect(() => {
        fetchItemTypes();
    }, []);

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearchQuery(searchQuery);
        }, 300);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    useEffect(() => {
        setCurrentPage(1);
    }, [debouncedSearchQuery, startDate, endDate]);

    useEffect(() => {
        fetchAllPickupEntries(currentPage);
    }, [currentPage, debouncedSearchQuery]);

    // Search is handled by the API; date range stays as a client-side filter on the loaded page.
    const filteredOrders = pickupEntries.filter((order) => {
        const rawDate = order.created_at || "";
        const createdDatePart = rawDate.split(" ")[0];

        const matchesDateRange = (!startDate || createdDatePart >= startDate) &&
                                 (!endDate || createdDatePart <= endDate);

        return matchesDateRange;
    });

    // Pagination
    const indexOfLastItem = currentPage * ITEMS_PER_PAGE;
    const indexOfFirstItem = indexOfLastItem - ITEMS_PER_PAGE;
    const currentOrders = filteredOrders;
    const totalPages = Math.max(
        1,
        Math.ceil(totalEntries / ITEMS_PER_PAGE)
    );
    const blankRows = ITEMS_PER_PAGE - currentOrders.length;

    const handleView = (order) => {
        navigate(`/salesCorporate/corporate/pickup-entry/view/${order.pickup_entry_id}`);
    };

    return (
        <div className="flex flex-col gap-y-5">
            {/* Header Section */}
            <div className="flex flex-row justify-between">
                <div className="flex flex-col">
                    <h1 className="text-3xl font-bold text-primary">Collection Order</h1>
                    <p className="text-xl text-black/50">Record new laundry collection with item counts by category.</p>
                </div>
                <Link
                    to={'add-new-order'}
                    className="flex flex-row gap-x-3 items-center bg-white h-fit text-primary font-semibold text-xl py-2 px-3 rounded-full border border-primary cursor-pointer"
                >
                    <BiPlus /> Add New Collection Order
                </Link>
            </div>

            <div className="w-full border-b border-primary">
                <p className="border-b-3 border-black w-fit px-1 text-2xl font-semibold">Collection Orders</p>
            </div>

            {/* Filter Section */}
            <div className="flex flex-row gap-x-5">
                <div className="flex flex-row border border-primary rounded-full h-fit w-1/2 bg-white">
                    <div className="flex justify-center items-center rounded-l-full px-5">
                        <MdSearch className="size-6 text-primary" />
                    </div>
                    <input
                        className="grow h-fit px-3 py-1 text-lg rounded-r-full border border-transparent focus:outline-none"
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search Collection Orders here..."
                    />
                </div>

                <div className="flex flex-row items-center gap-x-3">
                    <div className="flex flex-row items-center border border-primary/30 rounded-xl px-3 py-1 bg-white text-base">
                        <span className="text-black/50 font-semibold mr-2">Start Date:</span>
                        <input
                            type="date"
                            className="focus:outline-none text-black/70 font-medium cursor-pointer"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                        />
                    </div>
                    <div className="flex flex-row items-center border border-primary/30 rounded-xl px-3 py-1 bg-white text-base">
                        <span className="text-black/50 font-semibold mr-2">End Date:</span>
                        <input
                            type="date"
                            className="focus:outline-none text-black/70 font-medium cursor-pointer"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                        />
                    </div>
                    {(startDate || endDate) && (
                        <button
                            onClick={() => { setStartDate(""); setEndDate(""); }}
                            className="flex flex-row items-center gap-x-1 text-sm text-red-500 font-semibold cursor-pointer hover:underline"
                        >
                            <Icon icon="material-symbols:close-rounded" className="size-4" />
                            Clear
                        </button>
                    )}
                </div>
            </div>

            {isLoading ?
                <div className="flex items-center justify-center py-20 bg-white rounded-xl border border-primary">
                    <BeatLoader color="#1470F9" size={20} />
                </div>
                :
                <div className="rounded-xl bg-white overflow-hidden border border-primary">
                    {/* Table Header — 12 columns */}
                    <div className="text-base grid grid-cols-12 gap-x-3 text-white bg-primary font-semibold py-2 px-3">
                        <p className="col-span-1">ORDER ID</p>
                        <p className="col-span-2">CUSTOMER</p>
                        <p className="col-span-1">DELIVERY TYPE</p>
                        <p className="col-span-1">NO OF ITEMS</p>
                        <p className="col-span-1">WEIGHT</p>
                        <p className="col-span-1">COLLECTION DATE</p>
                        <p className="col-span-1">REMARK</p>
                        <p className="col-span-1">STATUS</p>
                        <p className="col-span-2">SIGNED BY</p>
                        <p className="col-span-1 text-center">ACTION</p>
                    </div>

                    {currentOrders.map((order, index) => (
                        <div
                            key={index}
                            className={`grid grid-cols-12 gap-x-3 text-base py-2 px-3 ${index % 2 === 0 ? "bg-white" : "bg-primary/10"} items-center`}
                        >
                            {/* Order ID */}
                            <p className="col-span-1 font-semibold text-primary">
                                {order.pickup_entry_id
                                    ? String(order.pickup_entry_id)
                                    : "—"}
                            </p>

                            {/* Customer */}
                            <div className="col-span-2 flex flex-col">
                                <p className="font-medium">{order.customer_company_name ?? "—"}</p>
                                <p className="text-sm text-black/60 font-medium">{order.customer_id ?? "—"}</p>
                            </div>

                            {/* Delivery Type */}
                            <p className="col-span-1 font-medium text-black/70">
                                {order.delivery_type ?? "—"}
                            </p>

                            {/* No of Items */}
                            <div className="col-span-1 flex flex-col">
                                <p className="font-medium">{(order.items ?? []).reduce((sum, item) => sum + Number(item.corp_item_quantity || 0), 0)}</p>
                                <p className="text-sm text-black/60 font-medium">
                                    {new Set((order.items ?? []).map(item => item.item_category_id)).size} Categories
                                </p>
                            </div>

                            {/* Weight */}
                            <p className="col-span-1 font-medium">
                                {(() => {
                                    const totalWeight = (order.items ?? []).reduce((sum, item) => {
                                        return sum + (Number(item.corp_item_kg_amount || 0) * Number(item.corp_item_quantity || 0));
                                    }, 0);
                                    return totalWeight ? `${totalWeight.toFixed(2)} Kg` : "—";
                                })()}
                            </p>

                            {/* Pickup Date */}
                            <p
                                className="col-span-1 font-medium cursor-pointer hover:text-primary hover:underline"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleDateChangeClick(order);
                                }}
                            >
                                {order.created_at
                                    ? new Date(order.created_at).toISOString().split("T")[0].replace(/-/g, "/")
                                    : "—"}
                            </p>

                            {/* Remark */}
                            <p className="col-span-1 font-medium text-black/70 truncate">
                                {(order.items ?? []).map((item) => item.corp_item_remark).filter(Boolean).join(", ")}
                            </p>

                            {/* Status Badge */}
                            <div className="col-span-1">
                                {(() => {
                                    if (order.status === 'Deactive') {
                                        return (
                                            <span className="text-xs font-semibold px-2 py-1 rounded-full bg-red-100 text-red-700 border border-red-300">
                                                Cancelled
                                            </span>
                                        );
                                    }
                                    const status = order.approval_status || 'Created';
                                    const badgeClass = status === 'Approved'
                                        ? 'bg-green-100 text-green-700 border border-green-300'
                                        : status === 'Checked'
                                        ? 'bg-blue-100 text-blue-700 border border-blue-300'
                                        : 'bg-yellow-50 text-yellow-700 border border-yellow-300';
                                    return (
                                        <span className={`text-xs font-semibold px-2 py-1 rounded-full ${badgeClass}`}>
                                            {status}
                                        </span>
                                    );
                                })()}
                            </div>

                            {/* Signed By */}
                            <p className="col-span-2 font-medium">{order.signed_by}</p>

                            {/* Actions */}
                            <div className="col-span-1 flex flex-row items-center justify-center gap-x-2">
                                <div
                                    className="flex flex-col items-center cursor-pointer"
                                    onClick={() => handleView(order)}
                                >
                                    <Icon icon={"mdi:eye"} className="text-blue-500 text-xl" />
                                    <p className="text-xs text-black/70">View</p>
                                </div>

                                {/* <div className="h-6 border-r border-black/30" />

                                {order.approval_status === 'Approved' ? (
                                    <div className="flex flex-col items-center opacity-30 cursor-not-allowed">
                                        <Icon icon={"iconamoon:edit-fill"} className="text-black/40 text-xl" />
                                        <p className="text-xs text-black/40">Edit</p>
                                    </div>
                                ) : (
                                    <Link
                                        to={`/salesCorporate/corporate/pickup-entry/update-order/${order.pickup_entry_id}`}
                                        className="flex flex-col items-center cursor-pointer"
                                    >
                                        <Icon icon={"iconamoon:edit-fill"} className="text-green-500 text-xl" />
                                        <p className="text-xs text-black/70">Edit</p>
                                    </Link>
                                )} */}
                            </div>
                        </div>
                    ))}

                    {/* Blank rows */}
                    {Array.from({ length: blankRows > 0 ? blankRows : 0 }).map((_, idx) => (
                        <div
                            key={`blank-${idx}`}
                            className={`grid grid-cols-12 gap-x-3 py-2 px-3 ${(currentOrders.length + idx) % 2 === 0 ? "bg-white" : "bg-primary/10"} items-center`}
                        >
                            <div className="col-span-12 h-8"></div>
                        </div>
                    ))}
                </div>
            }

            {/* Pagination */}
            <div className="flex flex-row justify-between items-center">
                <p className="text-base text-black/50">
                    Show {currentOrders.length > 0 ? indexOfFirstItem + 1 : 0} to {indexOfFirstItem + currentOrders.length} of {totalEntries} entries
                </p>

                <div className="flex justify-end gap-2 flex-wrap">
                    <button
                        onClick={() => setCurrentPage(1)}
                        disabled={currentPage === 1}
                        className="px-3 py-1 rounded-lg bg-white text-primary disabled:opacity-50 border border-primary/20 cursor-pointer"
                    >
                        First
                    </button>

                    <button
                        onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                        disabled={currentPage === 1}
                        className="px-3 py-1 rounded-lg bg-white text-primary disabled:opacity-50 border border-primary/20 cursor-pointer"
                    >
                        Previous
                    </button>

                    {(() => {
                        const pageWindow = 5;
                        const half = Math.floor(pageWindow / 2);
                        let start = Math.max(currentPage - half, 1);
                        let end = start + pageWindow - 1;

                        if (end > totalPages) {
                            end = totalPages;
                            start = Math.max(end - pageWindow + 1, 1);
                        }

                        const pages = [];

                        if (start > 1) {
                            pages.push(
                                <button key={1} onClick={() => setCurrentPage(1)}
                                    className={`px-3 py-1 rounded-lg border border-primary/20 cursor-pointer ${currentPage === 1 ? "bg-primary text-white font-bold" : "bg-white text-black/60"}`}>
                                    1
                                </button>
                            );
                            if (start > 2) pages.push(<span key="start-ellipsis">...</span>);
                        }

                        for (let i = start; i <= end; i++) {
                            pages.push(
                                <button key={i} onClick={() => setCurrentPage(i)}
                                    className={`px-3 py-1 rounded-lg border border-primary/20 cursor-pointer ${i === currentPage ? "bg-primary text-white font-bold" : "bg-white text-black/60"}`}>
                                    {i}
                                </button>
                            );
                        }

                        if (end < totalPages) {
                            if (end < totalPages - 1) pages.push(<span key="end-ellipsis">...</span>);
                            pages.push(
                                <button key={totalPages} onClick={() => setCurrentPage(totalPages)}
                                    className={`px-3 py-1 rounded-lg border border-primary/20 cursor-pointer ${currentPage === totalPages ? "bg-primary text-white font-bold" : "bg-white text-black/60"}`}>
                                    {totalPages}
                                </button>
                            );
                        }

                        return pages;
                    })()}

                    <button
                        onClick={() => setCurrentPage((prev) => (prev < totalPages ? prev + 1 : prev))}
                        disabled={currentPage === totalPages}
                        className="px-3 py-1 rounded-lg bg-white text-primary disabled:opacity-50 border border-primary/20 cursor-pointer"
                    >
                        Next
                    </button>

                    <button
                        onClick={() => setCurrentPage(totalPages)}
                        disabled={currentPage === totalPages}
                        className="px-3 py-1 rounded-lg bg-white text-primary disabled:opacity-50 border border-primary/20 cursor-pointer"
                    >
                        Last
                    </button>
                </div>
            </div>

            {/* Date Change Calendar Popup (every user can edit) */}
            {showDateChangeCalendar && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl p-6 w-96 shadow-xl">
                        <h2 className="text-xl font-semibold mb-4">Change Collection Date</h2>
                        <div className="mb-4">
                            <p className="text-sm text-gray-600 mb-2">
                                Order ID: <span className="font-medium">{selectedOrderForDateChange?.pickup_entry_id}</span>
                            </p>
                            <label className="block text-sm font-medium mb-2">Select New Date</label>
                            <input
                                type="date"
                                value={selectedNewDate}
                                onChange={(e) => setSelectedNewDate(e.target.value)}
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-primary"
                            />
                        </div>
                        <div className="flex gap-3 justify-end">
                            <button
                                type="button"
                                onClick={() => {
                                    setShowDateChangeCalendar(false);
                                    setSelectedOrderForDateChange(null);
                                    setSelectedNewDate("");
                                }}
                                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-100"
                                disabled={isUpdatingDate}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleDateChangeSubmit}
                                className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50"
                                disabled={isUpdatingDate || !selectedNewDate}
                            >
                                {isUpdatingDate ? "Updating..." : "Save"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SalesCorporatePickupEntry;
