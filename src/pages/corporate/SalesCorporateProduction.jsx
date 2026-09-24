import { MdSearch } from "react-icons/md";
import { useEffect, useMemo, useState } from "react";
import { Icon } from "@iconify/react/dist/iconify.js";
import { BeatLoader } from "react-spinners";
import { Link, useLocation } from "react-router-dom";
import { getAllCorporateInPackingPickupEntries, getAllCorporateInProductionPickupEntries } from "../../services/corporate/PickupEntryServices";

const STATUS_DOT = {
    Pending: "bg-yellow-400",
    Washing: "bg-blue-500",
    Pressing: "bg-blue-500",
    "Dry Clean": "bg-purple-500",
    "Dry Cleaning": "bg-purple-500",
    Packing: "bg-blue-500",
    Packed: "bg-green-500",
    "All Packed": "bg-green-500",
    Completed: "bg-green-500",
    "No Items": "bg-red-500"
};

const STATUS_RANK = {
    "Pending": 0,
    "Washing": 1,
    "Pressing": 2,
    "Dry Clean": 3,
    "Dry Cleaning": 3,
    "Packing": 4,
    "Completed": 5
};

const StatusBadge = ({ status, onOpen }) => (
    <div className="flex flex-col items-start gap-y-0.5">
        <div className="flex flex-row items-center gap-x-1.5">
            <span className={`inline-block size-2.5 rounded-full ${STATUS_DOT[status] ?? "bg-gray-400"}`} />
            <span className="text-sm font-medium">{status}</span>
        </div>
        {/* <button
            type="button"
            onClick={onOpen}
            className="flex flex-row items-center gap-x-0.5 text-xs text-primary cursor-pointer hover:underline"
        >
            <Icon icon="lucide:external-link" className="text-xs" />
            Open
        </button> */}
    </div>
);

const TABS = [
    { id: "pending", label: "Pending" },
    { id: "packing", label: "Packing" },
];

const COOPERATE_OPTIONS = [
    { value: "", label: "Cooperate" },
];

const extractOrderRows = (data, preferredKey) => {
    const candidates = [
        data?.[preferredKey],
        data?.packing_pickup_entries,
        data?.in_packing_pickup_entries,
        data?.in_production_pickup_entries,
        data?.pickup_entries,
        data?.pickup_entry,
        data?.data,
    ];

    for (const candidate of candidates) {
        if (Array.isArray(candidate)) return candidate;
    }
    return [];
};

const getRowDate = (row) => {
    return row?.created_at ?? row?.created ?? row?.order_item_created_at ?? "";
};

const SalesCorporateProduction = () => {
    const [isLoading, setIsLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [cooperateFilter, setCooperateFilter] = useState("");
    const [inProductionOrders, setInProductionOrders] = useState([]);
    const [inPackingOrders, setInPackingOrders] = useState([]);
    const location = useLocation();
    const [selectedTab, setSelectedTab] = useState(location.state?.tab || "pending");
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");
    const [totalEntries, setTotalEntries] = useState(0);
    const [currentPage, setCurrentPage] = useState(1);
    const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");

    const fetchInProductionEntries = async (page = currentPage) => {
        try {
            setIsLoading(true);
            const isFiltering = searchQuery.trim() !== "" || startDate !== "" || endDate !== "";
            const offset = isFiltering ? undefined : (page - 1) * 10;
            const response = await getAllCorporateInProductionPickupEntries(localStorage.getItem("userId"), offset, true);
            const rows = extractOrderRows(response?.data, "in_production_pickup_entries");
            const data = isFiltering
                ? rows.sort((a, b) => new Date(getRowDate(b)) - new Date(getRowDate(a)))
                : rows;
            setInProductionOrders(data);
            setTotalEntries(response?.data?.totalCount ?? 0);
        } catch (error) {
            console.error("Error fetching in-production entries:", error);
            setInProductionOrders([]);
        } finally {
            setIsLoading(false);
        }
    };

    const fetchInPackingEntries = async () => {
        try {
            setIsLoading(true);
            const response = await getAllCorporateInPackingPickupEntries(localStorage.getItem("userId"));
            const rows = extractOrderRows(response?.data, "in_packing_pickup_entries");
            const data = rows.sort((a, b) => new Date(getRowDate(b)) - new Date(getRowDate(a)));
            setInPackingOrders(data);
        } catch (error) {
            console.error("Error fetching in-packing entries:", error);
            setInPackingOrders([]);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearchQuery(searchQuery);
        }, 300);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    useEffect(() => {
        if (selectedTab === "pending") {
            setCurrentPage(1);
        }
    }, [debouncedSearchQuery, startDate, endDate]);

    useEffect(() => {
        if (selectedTab === "pending") {
            fetchInProductionEntries(currentPage);
        } else if (selectedTab === "packing") {
            fetchInPackingEntries();
        }
    }, [currentPage, debouncedSearchQuery, startDate, endDate, selectedTab]);

const checkItemHasService = (item, stageName) => {
    if (!item || !stageName) return false;
    const normName = String(stageName).toLowerCase();

    // 1. Direct string check
    const primary = String(item?.service_type || item?.service_type_name || item?.service_name || "").toLowerCase();
    if (normName.includes("dry")) {
        if (primary.includes("dry")) return true;
    } else if (normName.includes("wash")) {
        if (primary.includes("wash")) return true;
    } else if (normName.includes("press")) {
        if (primary.includes("press")) return true;
    } else if (primary === normName) {
        return true;
    }

    // 2. Check service_types array or JSON string
    let parsedTypes = item?.service_types;
    if (typeof parsedTypes === 'string') {
        try { parsedTypes = JSON.parse(parsedTypes); } catch (_) { parsedTypes = []; }
    }
    if (Array.isArray(parsedTypes) && parsedTypes.length > 0) {
        return parsedTypes.some((s) => {
            const sName = String(s?.service_type_name ?? s?.name ?? "").toLowerCase();
            const sId = Number(s?.service_type_id ?? s?.id ?? 0);
            if (normName.includes("dry")) {
                return sName.includes("dry") || sId === 3;
            } else if (normName.includes("wash")) {
                return sName.includes("wash") || sId === 1;
            } else if (normName.includes("press")) {
                return sName.includes("press") || sId === 2;
            }
            return sName === normName;
        });
    }

    return false;
};

    const getServiceCount = (order, serviceTypeName) => {
        return (order.items ?? []).reduce((sum, item) => {
            const hasService = checkItemHasService(item, serviceTypeName);
            return sum + (hasService ? Number(item.corp_item_quantity || 0) : 0);
        }, 0);
    };

    const getServiceStatus = (order, serviceTypeName) => {
        const count = getServiceCount(order, serviceTypeName);
        if (count === 0) return "No Items";

        const targetRank = STATUS_RANK[serviceTypeName] ?? 0;
        const itemsWithThisService = (order.items ?? []).filter((item) =>
            checkItemHasService(item, serviceTypeName)
        );

        if (itemsWithThisService.length === 0) return "No Items";

        const itemStatuses = itemsWithThisService.map(item => {
            const currentStatus = item.production_status || "Pending";
            const currentRank = STATUS_RANK[currentStatus] ?? 0;

            if (currentRank > targetRank) return "Completed";
            if (currentRank === targetRank) return serviceTypeName;
            return "Pending";
        });

        if (itemStatuses.some(s => s === serviceTypeName)) return serviceTypeName;
        if (itemStatuses.some(s => s === "Pending")) return "Pending";
        return "Completed";
    };

    const activeOrders = selectedTab === "packing" ? inPackingOrders : inProductionOrders;

    const filteredOrders = useMemo(() => {
        return activeOrders.filter((order) => {
            const matchesQuery = (field) => {
                if (!searchQuery || field == null) return false;
                const fieldStr = String(field).toLowerCase();
                const searchWords = searchQuery.toLowerCase().split(/\s*\*\s*/).filter((w) => w.trim().length > 0);
                return searchWords.every((w) => fieldStr.includes(w));
            };

            const matchesSearch = !searchQuery
                ? true
                : matchesQuery(order.id) ||
                matchesQuery(order.pickup_entry_id) ||
                matchesQuery(order.customer_company_name) ||
                matchesQuery(order.customer_id);

            const rawDate = order.created_at || "";
            const createdDatePart = rawDate.split(" ")[0]; // Extracts "YYYY-MM-DD"
            const matchesDateRange = (!startDate || createdDatePart >= startDate) &&
                                     (!endDate || createdDatePart <= endDate);

            return matchesSearch && matchesDateRange;
        });
    }, [activeOrders, startDate, endDate, searchQuery]);

    const isFiltering = searchQuery.trim() !== "" || startDate !== "" || endDate !== "";
    const itemsPerPage = 10;
    const indexOfLastItem = currentPage * itemsPerPage;
    const indexOfFirstItem = indexOfLastItem - itemsPerPage;
    const currentOrders = (selectedTab === "pending" && !isFiltering)
        ? filteredOrders
        : filteredOrders.slice(indexOfFirstItem, indexOfLastItem);
    const totalPages = Math.max(
        1,
        (selectedTab === "pending" && !isFiltering)
            ? Math.ceil(totalEntries / itemsPerPage)
            : Math.ceil(filteredOrders.length / itemsPerPage)
    );
    const blankRows = itemsPerPage - currentOrders.length;

    const showStart = currentOrders.length > 0 ? indexOfFirstItem + 1 : 0;
    const showEnd = (selectedTab === "pending" && !isFiltering)
        ? indexOfFirstItem + currentOrders.length
        : Math.min(indexOfLastItem, filteredOrders.length);
    const showTotal = (selectedTab === "pending" && !isFiltering)
        ? totalEntries
        : filteredOrders.length;

    return (
        <div className="flex flex-col gap-y-5">
            <div className="flex flex-col">
                <h1 className="text-3xl font-bold text-primary">Production</h1>
                <p className="text-xl text-black/50">Record new laundry pickup with item counts by category.</p>
            </div>

            <div className="flex flex-row gap-x-5 w-full border-b border-primary text-xl">
                {TABS.map(tab => (
                    <h2
                        key={tab.id}
                        className={`cursor-pointer px-2 pb-1 ${selectedTab === tab.id ? "border-b-2 border-black font-semibold" : "text-black/50 hover:text-black"}`}
                        onClick={() => { setSelectedTab(tab.id); setCurrentPage(1); }}
                    >
                        {tab.label}
                    </h2>
                ))}
            </div>

            <div className="flex flex-row gap-x-3">
                <div className="flex flex-row border border-gray-300 rounded-full h-fit w-1/2 bg-white items-center px-4 py-1.5 gap-x-2">
                    <MdSearch className="size-5 text-gray-400" />
                    <input
                        className="grow text-base focus:outline-none bg-transparent"
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search..."
                    />
                </div>

                <div className="flex flex-row items-center gap-x-3">
                    <div className="flex flex-row items-center border border-gray-300 rounded-full px-5 py-1 bg-white text-base">
                        <span className="text-black/50 font-semibold mr-2">Start Date:</span>
                        <input
                            type="date"
                            className="focus:outline-none text-black/70 font-medium cursor-pointer"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                        />
                    </div>
                    <div className="flex flex-row items-center border border-gray-300 rounded-full px-5 py-1 bg-white text-base">
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
                            type="button"
                            onClick={() => { setStartDate(""); setEndDate(""); }}
                            className="flex flex-row items-center gap-x-1 text-sm text-red-500 font-semibold cursor-pointer hover:underline"
                        >
                            <Icon icon="material-symbols:close-rounded" className="size-4" />
                            Clear
                        </button>
                    )}
                </div>

                {/* <div className="relative">
                    <select
                        value={cooperateFilter}
                        onChange={(e) => setCooperateFilter(e.target.value)}
                        className="appearance-none bg-white border border-gray-300 rounded-full px-5 py-1.5 pr-9 text-base font-medium focus:outline-none cursor-pointer"
                    >
                        {COOPERATE_OPTIONS.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                    </select>
                    <Icon icon="mdi:chevron-down" className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                </div> */}
            </div>

            {isLoading ? (
                <div className="flex items-center justify-center py-20 bg-white rounded-xl">
                    <BeatLoader color="#1470F9" size={20} />
                </div>
            ) : (
                <div className="rounded-xl bg-white overflow-hidden border border-gray-200">
                    {selectedTab === "packing" ? (
                        <div className="grid grid-cols-9 gap-x-3 text-white bg-primary font-semibold py-2.5 px-3 text-md">
                            <p className="col-span-1">ORDER ID</p>
                            <p className="col-span-2">CUSTOMER</p>
                            <p className="col-span-2 text-center">WASHING | PRESSING | DRY CLEAN</p>
                            <p className="col-span-1 text-center">PICKUP TOTAL</p>
                            <p className="col-span-1 text-center">READY TO PACK</p>
                            <p className="col-span-1 text-center">PENDING</p>
                            <p className="col-span-1 text-center">ACTION</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-10 gap-x-3 text-white bg-primary font-semibold py-2.5 px-3 text-md">
                            <p className="col-span-1">ORDER ID</p>
                            <p className="col-span-2">CUSTOMER</p>
                            <p className="col-span-2 text-center">WASHING | PRESSING | DRY CLEAN</p>
                            <p className="col-span-1 text-center">PICKUP DATE</p>
                            <p className="col-span-1">WASHING STATUS</p>
                            <p className="col-span-1">PRESSING STATUS</p>
                            <p className="col-span-1">DRY CLEAN STATUS</p>
                            <p className="col-span-1 text-center">ACTION</p>
                        </div>
                    )}

                    {currentOrders.map((order, index) => {
                        const washing = getServiceCount(order, "Washing");
                        const pressing = getServiceCount(order, "Pressing");
                        const dryCleaning = getServiceCount(order, "Dry Cleaning");
                        const pickupTotal = (order.items ?? []).reduce((sum, item) => sum + Number(item.corp_item_quantity || 0), 0);
                        const readyToPack = (order.items ?? []).reduce((sum, item) => sum + Number(item.packing_qty || 0), 0);
                        const finalPackedQty = (order.items ?? []).reduce((sum, item) => sum + Number(item.final_packed_qty || 0), 0);
                        const pendingQty = Math.max(pickupTotal - readyToPack - finalPackedQty, 0);
                        const orderProductionStatus = (() => {
                            if (order.production_status) return order.production_status;
                            if (!order.items?.length) return "Pending";

                            const itemStatuses = order.items.map((it) => String(it.production_status || "").toLowerCase());
                            const allDone = itemStatuses.every((s) => s === "completed" || s === "packed");

                            if (selectedTab === "packing") {
                                return allDone ? "All Packed" : "Packing";
                            }

                            const uniqueStatuses = [...new Set(order.items.map((it) => it.production_status).filter(Boolean))];
                            return uniqueStatuses.join(", ") || "Pending";
                        })();

                        return (
                            <div
                                key={index}
                                className={`${selectedTab === "packing" ? "grid-cols-9" : "grid-cols-10"} grid gap-x-3 text-sm py-2.5 px-3 ${index % 2 === 0 ? "bg-white" : "bg-primary/5"} items-center`}
                            >
                                {/* Order ID */}
                                <p className="col-span-1 font-semibold text-primary">
                                    {order.pickup_entry_id ?? "—"}
                                </p>

                                {/* Customer */}
                                <div className="col-span-2 flex flex-col">
                                    <p className="font-medium truncate">{order.customer_company_name ?? "—"}</p>
                                    <p className="text-xs text-black/50 truncate">{order.customer_id ?? "—"}</p>
                                </div>

                                {/* Washing | Pressing | Dry Clean */}
                                <div className="col-span-2 flex flex-row gap-x-6 justify-center font-medium">
                                    <span>{washing}</span>
                                    <span className="text-black/30">|</span>
                                    <span>{pressing}</span>
                                    <span className="text-black/30">|</span>
                                    <span>{dryCleaning}</span>
                                </div>

                                {selectedTab === "packing" ? (
                                    <>
                                        <p className="col-span-1 text-center font-medium">{pickupTotal}</p>
                                        <p className="col-span-1 text-center font-medium">{readyToPack}</p>
                                        <p className="col-span-1 text-center font-medium">{pendingQty}</p>
                                        <div className="col-span-1 flex flex-row items-center justify-center gap-x-3">
                                            {String(orderProductionStatus).toLowerCase().includes("completed") ? (
                                                <Link to={`/salesCorporate/corporate/production/service-order/${order.pickup_entry_id}`} className="flex flex-col items-center cursor-pointer">
                                                    <Icon icon="mdi:eye" className="text-blue-500 text-xl" />
                                                    <p className="text-xs text-black/60">View</p>
                                                </Link>
                                            ) : (
                                                <Link to={`/salesCorporate/corporate/production/packing/${order.pickup_entry_id}`} state={order} className="flex flex-col items-center cursor-pointer">
                                                    <Icon icon="material-symbols:package-2" className="text-green-500 text-xl" />
                                                    <p className="text-xs text-black/60">Packing</p>
                                                </Link>
                                            )}
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <p className="col-span-1 text-center font-medium">
                                            {order.created_at
                                                ? new Date(order.created_at).toISOString().split("T")[0].replace(/-/g, "/")
                                                : "—"}
                                        </p>
                                        <div className="col-span-1">
                                            <StatusBadge status={getServiceStatus(order, "Washing")} onOpen={() => { }} />
                                        </div>
                                        <div className="col-span-1">
                                            <StatusBadge status={getServiceStatus(order, "Pressing")} onOpen={() => { }} />
                                        </div>
                                        <div className="col-span-1">
                                            <StatusBadge status={getServiceStatus(order, "Dry Clean")} onOpen={() => { }} />
                                        </div>
                                        <div className="col-span-1 flex flex-row items-center justify-center gap-x-3">
                                            <Link to={`/salesCorporate/corporate/production/service-order/${order.pickup_entry_id}`} className="flex flex-col items-center cursor-pointer">
                                                <Icon icon="mdi:eye" className="text-blue-500 text-xl" />
                                                <p className="text-xs text-black/60">View</p>
                                            </Link>
                                        </div>
                                    </>
                                )}
                            </div>
                        );
                    })}

                    {/* Blank rows */}
                    {Array.from({ length: blankRows > 0 ? blankRows : 0 }).map((_, idx) => (
                        <div
                            key={`blank-${idx}`}
                            className={`h-10 ${(currentOrders.length + idx) % 2 === 0 ? "bg-white" : "bg-primary/5"}`}
                        />
                    ))}
                </div>
            )}

            {/* Pagination */}
            <div className="flex flex-row justify-between items-center">
                <p className="text-sm text-black/50">
                    Show {showStart} to {showEnd} of {showTotal} entries
                </p>

                <div className="flex justify-end gap-2 flex-wrap">
                    <button
                        onClick={() => setCurrentPage(1)}
                        disabled={currentPage === 1}
                        className="px-3 py-1 rounded-lg bg-white text-primary disabled:opacity-50 border border-primary/20 cursor-pointer text-sm font-medium"
                    >
                        First
                    </button>

                    <button
                        onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                        disabled={currentPage === 1}
                        className="px-3 py-1 rounded-lg bg-white text-primary disabled:opacity-50 border border-primary/20 cursor-pointer text-sm font-medium"
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
                                <button
                                    key={1}
                                    onClick={() => setCurrentPage(1)}
                                    className={`px-3 py-1 rounded-lg border border-primary/20 cursor-pointer text-sm font-medium ${currentPage === 1 ? "bg-primary text-white font-bold" : "bg-white text-black/60"}`}
                                >
                                    1
                                </button>
                            );
                            if (start > 2) pages.push(<span key="start-ellipsis" className="self-center">...</span>);
                        }

                        for (let i = start; i <= end; i++) {
                            pages.push(
                                <button
                                    key={i}
                                    onClick={() => setCurrentPage(i)}
                                    className={`px-3 py-1 rounded-lg border border-primary/20 cursor-pointer text-sm font-medium ${i === currentPage ? "bg-primary text-white font-bold" : "bg-white text-black/60"}`}
                                >
                                    {i}
                                </button>
                            );
                        }

                        if (end < totalPages) {
                            if (end < totalPages - 1) pages.push(<span key="end-ellipsis" className="self-center">...</span>);
                            pages.push(
                                <button
                                    key={totalPages}
                                    onClick={() => setCurrentPage(totalPages)}
                                    className={`px-3 py-1 rounded-lg border border-primary/20 cursor-pointer text-sm font-medium ${currentPage === totalPages ? "bg-primary text-white font-bold" : "bg-white text-black/60"}`}
                                >
                                    {totalPages}
                                </button>
                            );
                        }

                        return pages;
                    })()}

                    <button
                        onClick={() => setCurrentPage((prev) => (prev < totalPages ? prev + 1 : prev))}
                        disabled={currentPage === totalPages}
                        className="px-3 py-1 rounded-lg bg-white text-primary disabled:opacity-50 border border-primary/20 cursor-pointer text-sm font-medium"
                    >
                        Next
                    </button>
                    
                    <button
                        onClick={() => setCurrentPage(totalPages)}
                        disabled={currentPage === totalPages}
                        className="px-3 py-1 rounded-lg bg-white text-primary disabled:opacity-50 border border-primary/20 cursor-pointer text-sm font-medium"
                    >
                        Last
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SalesCorporateProduction;
