import { MdSearch } from "react-icons/md";
import { useEffect, useState, useMemo } from "react";
import { Icon } from "@iconify/react/dist/iconify.js";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { BeatLoader } from "react-spinners";
import { getAllCorporateInDeliveryPickupEntries } from "../../services/corporate/PickupEntryServices";
import { getAllDeliveryNotes, updateCorporateDeliveryNoteDate } from "../../services/corporate/CorporateDeliveryServices";
import Swal from "sweetalert2";

const extractDeliveryRows = (data) => {
    const candidates = [
        data?.in_delivery_pickup_entries,
        data?.delivery_pickup_entries,
        data?.in_production_pickup_entries,
        data?.pickup_entries,
        data?.data,
    ];
    for (const candidate of candidates) {
        if (Array.isArray(candidate)) return candidate;
    }
    return [];
};

const getRowCreatedDate = (row) => row?.created_at ?? row?.created ?? "";

const getOrderItems = (order) => (Array.isArray(order?.items) ? order.items : []);

const getTotalItemQty = (items) =>
    items.reduce((sum, item) => sum + (Number(item.corp_item_quantity ?? item.final_packed_qty ?? item.quantity) || 0) + (Number(item.damaged_qty) || 0), 0);

const itemDeliveredQty = (item) => {
    if (item.delivered_qty !== undefined) {
        return Number(item.delivered_qty) || 0;
    }
    const qty = Number(item.corp_item_quantity ?? item.quantity) || 0;
    const rd = item.received_to_delivery;
    if (rd === true || rd === 1) return qty;
    if (typeof rd === "number" && rd > 1) return Math.min(rd, qty);
    return Number(item.delivered_qty) || 0;
};

const getDeliveredItemQty = (items) => items.reduce((sum, item) => sum + itemDeliveredQty(item), 0);

const categoryCountFromItems = (items) =>
    new Set(items.map((i) => i.item_category_id ?? i.item_category_name).filter(Boolean)).size;

const formatLastDeliverDate = (order) => {
    const raw = order.delivery_date ?? order.lastDate ?? order.last_deliver_date;
    if (!raw) return "—";
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? String(raw) : d.toISOString().split("T")[0];
};

const SalesCorporateDelivery = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const [isLoading, setIsLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedTab, setSelectedTab] = useState(location.state?.initialTab ?? 1);
    const [pending, setPending] = useState([]);
    /** All delivery notes (Created / Checked / Approved) — Created Delivery Notes tab */
    const [deliveryNotes, setDeliveryNotes] = useState([]);
    /** Approved-only — Delivered tab */
    const [approvedDeliveryNotes, setApprovedDeliveryNotes] = useState([]);
    const [allNotesList, setAllNotesList] = useState([]);
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");

    // Date change calendar state (every user can edit)
    const [showDateChangeCalendar, setShowDateChangeCalendar] = useState(false);
    const [selectedNoteForDateChange, setSelectedNoteForDateChange] = useState(null);
    const [selectedNewDate, setSelectedNewDate] = useState("");
    const [isUpdatingDate, setIsUpdatingDate] = useState(false);

    const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
    const [totalNotesCount, setTotalNotesCount] = useState(0);
    const [currentPage, setCurrentPage] = useState(1);
    const notesPageCache = useState(() => ({ current: {} }))[0];

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearchQuery(searchQuery);
        }, 300);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    useEffect(() => {
        setCurrentPage(1);
    }, [selectedTab, debouncedSearchQuery, startDate, endDate]);

    useEffect(() => {
        // Clear cache on route re-navigation to get fresh data
        notesPageCache.current = {};
    }, [location.key]);

    const handleDateChangeClick = (note) => {
        setSelectedNoteForDateChange(note);
        const currentDate = note.created_at ? new Date(note.created_at) : new Date();
        const formattedDate = currentDate.toISOString().split("T")[0];
        setSelectedNewDate(formattedDate);
        setShowDateChangeCalendar(true);
    };

    const handleDateChangeSubmit = async () => {
        if (!selectedNoteForDateChange || !selectedNewDate) return;

        const userId = localStorage.getItem("userId");
        const deliveryId = selectedNoteForDateChange.delivery_id || selectedNoteForDateChange.delivery_note_id;

        if (!userId) {
            Swal.fire({
                icon: "error",
                title: "Error",
                text: "User ID not found. Please log in again.",
            });
            return;
        }

        if (!deliveryId) {
            Swal.fire({
                icon: "error",
                title: "Error",
                text: "Delivery ID not found.",
            });
            return;
        }

        setIsUpdatingDate(true);
        try {
            const now = new Date();
            const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
            const payload = {
                user_id: userId,
                delivery_id: deliveryId,
                new_date: `${selectedNewDate} ${currentTime}`
            };

            await updateCorporateDeliveryNoteDate(payload);

            Swal.fire({
                icon: "success",
                title: "Success",
                text: "Delivery note date updated successfully.",
            });

            const updateDateInNotes = (prev) => prev.map(note =>
                (note.delivery_id === deliveryId || note.delivery_note_id === deliveryId)
                    ? { ...note, created_at: `${selectedNewDate}T${currentTime}` }
                    : note
            );

            // Invalidate/update cache
            notesPageCache.current = {};

            // Update the state lists
            setDeliveryNotes(updateDateInNotes);
            setApprovedDeliveryNotes(updateDateInNotes);
            setAllNotesList(updateDateInNotes);

            setShowDateChangeCalendar(false);
            setSelectedNoteForDateChange(null);
            setSelectedNewDate("");
        } catch (error) {
            console.error("Error updating delivery note date:", error);
            Swal.fire({
                icon: "error",
                title: "Error",
                text: "Failed to update delivery note date. Please try again.",
            });
        } finally {
            setIsUpdatingDate(false);
        }
    };

    const fetchAllPending = async () => {
        try {
            setIsLoading(true);
            const response = await getAllCorporateInDeliveryPickupEntries(localStorage.getItem("userId"));
            const rows = extractDeliveryRows(response?.data);
            const sorted = rows.sort(
                (a, b) => new Date(getRowCreatedDate(b)) - new Date(getRowCreatedDate(a))
            );
            setPending(sorted);
        } catch (error) {
            console.error("Error fetching pending deliveries: ", error);
            setPending([]);
        } finally {
            setIsLoading(false);
        }
    };

    const fetchDeliveryNotes = async (page = 1, search = debouncedSearchQuery) => {
        const cacheKey = `${selectedTab}_${(search || "").trim().toLowerCase()}_${page}`;
        if (notesPageCache.current[cacheKey]) {
            const cached = notesPageCache.current[cacheKey];
            if (selectedTab === 2) {
                setDeliveryNotes(cached.notes);
            } else if (selectedTab === 3) {
                setApprovedDeliveryNotes(cached.notes);
            }
            setTotalNotesCount(cached.totalCount);
            setIsLoading(false);
            return;
        }

        try {
            setIsLoading(true);
            const userId = localStorage.getItem("userId");
            const offset = (page - 1) * 10;
            const status = selectedTab === 2 ? "created" : "approved";

            const response = await getAllDeliveryNotes(userId, offset, {
                status,
                limit: 10,
                search
            });

            const notes = response?.data?.delivery_notes ?? [];
            const totalCount = response?.data?.totalCount ?? notes.length;

            notesPageCache.current[cacheKey] = {
                notes,
                totalCount
            };

            if (selectedTab === 2) {
                setDeliveryNotes(notes);
            } else if (selectedTab === 3) {
                setApprovedDeliveryNotes(notes);
            }
            setTotalNotesCount(totalCount);
        } catch (error) {
            console.error("Error fetching delivery notes: ", error);
            if (selectedTab === 2) setDeliveryNotes([]);
            if (selectedTab === 3) setApprovedDeliveryNotes([]);
            setTotalNotesCount(0);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (selectedTab === 1) {
            fetchAllPending();
        }
    }, [selectedTab, location.key]);

    useEffect(() => {
        if (selectedTab === 2 || selectedTab === 3) {
            fetchDeliveryNotes(currentPage, debouncedSearchQuery);
        }
    }, [selectedTab, currentPage, debouncedSearchQuery, location.key]);

    const aggregatedPending = useMemo(() => {
        if (selectedTab !== 1) return [];
        
        const groups = new Map();
        pending.forEach(order => {
            const cid = order.customer_id;
            if (!groups.has(cid)) {
                groups.set(cid, {
                    ...order,
                    all_pickup_entry_ids: [order.pickup_entry_id],
                    original_orders: [order]
                });
            } else {
                const group = groups.get(cid);
                group.all_pickup_entry_ids.push(order.pickup_entry_id);
                group.original_orders.push(order);
                
                // Compare created_at to keep the latest details as base
                const currentCreated = getRowCreatedDate(group);
                const orderCreated = getRowCreatedDate(order);
                if (orderCreated && (!currentCreated || new Date(orderCreated) > new Date(currentCreated))) {
                    // Update base info to latest
                    Object.assign(group, {
                        ...order,
                        all_pickup_entry_ids: group.all_pickup_entry_ids,
                        original_orders: group.original_orders
                    });
                }
            }
        });

        return Array.from(groups.values()).map(group => {
            let totalQtySum = 0;
            let deliveredQtySum = 0;
            let lastDate = null;

            group.original_orders.forEach(order => {
                const items = getOrderItems(order);
                const legacyItems = Array.isArray(order?.items) ? order.items : [];
                const useCorpItems = items.length > 0 && (items[0].corp_item_quantity != null || items[0].corp_item_id != null);

                if (useCorpItems) {
                    totalQtySum += getTotalItemQty(items);
                    deliveredQtySum += getDeliveredItemQty(items);
                } else {
                    totalQtySum += legacyItems.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
                    deliveredQtySum += legacyItems.reduce((sum, item) => sum + (Number(item.delivered_qty) || 0), 0);
                }

                const d = order.delivery_date ?? order.lastDate ?? order.last_deliver_date;
                if (d && (!lastDate || new Date(d) > new Date(lastDate))) {
                    lastDate = d;
                }
            });

            return {
                ...group,
                total_qty_aggregated: totalQtySum,
                delivered_qty_aggregated: deliveredQtySum,
                order_count: group.original_orders.length,
                aggregated_last_date: lastDate
            };
        });
    }, [pending, selectedTab]);

    // Filtering for Tab 1 (Pending)
    const filteredPending = useMemo(() => {
        if (selectedTab !== 1) return [];
        return aggregatedPending.filter((order) => {
            const matchesQuery = (field) => {
                if (!debouncedSearchQuery || !field) return false;

                const fieldStr = field.toString().toLowerCase();
                const searchWords = debouncedSearchQuery
                    .toLowerCase()
                    .split(/\s*\*\s*/) // split by `*` with optional spaces
                    .filter(word => word.trim().length > 0);

                return searchWords.every(word => fieldStr.includes(word));
            };

            const matchesSearch = debouncedSearchQuery
                ? matchesQuery(order.customer_company_name) ||
                matchesQuery(order.customer_id) ||
                matchesQuery(order.customer_phone) ||
                matchesQuery(order.phone_number) ||
                matchesQuery(order.pickup_entry_id)
                : true;

            const rawDate = getRowCreatedDate(order) || order.created || "";
            const createdDatePart = String(rawDate).split(" ")[0]; // Extracts "YYYY-MM-DD"

            const matchesDateRange = (!startDate || createdDatePart >= startDate) &&
                                     (!endDate || createdDatePart <= endDate);

            return matchesSearch && matchesDateRange;
        });
    }, [aggregatedPending, selectedTab, debouncedSearchQuery, startDate, endDate]);

    // Pagination calculations
    const itemsPerPage = 10;
    const indexOfLastItem = currentPage * itemsPerPage;
    const indexOfFirstItem = indexOfLastItem - itemsPerPage;

    const currentDeliveries = selectedTab === 1
        ? filteredPending.slice(indexOfFirstItem, indexOfLastItem)
        : (selectedTab === 2 ? deliveryNotes : approvedDeliveryNotes);

    const totalPages = selectedTab === 1
        ? Math.max(1, Math.ceil(filteredPending.length / itemsPerPage))
        : Math.max(1, Math.ceil(totalNotesCount / itemsPerPage));

    const totalEntriesDisplay = selectedTab === 1 ? filteredPending.length : totalNotesCount;
    const blankRows = itemsPerPage - currentDeliveries.length;

    return (
        <div className="flex flex-col gap-y-5">
            {/* Header Section */}
            <div className="flex flex-row justify-between">
                <div className="flex flex-col">
                    <h1 className="text-3xl font-bold text-primary">Delivery</h1>
                    <p className="text-xl text-black/50">Record new laundry pickup with item counts by category.</p>
                </div>
            </div>

            <div className="flex flex-row gap-x-5 w-full border-b border-primary text-2xl mb-5">
                <h2 className={`hover:border-b-3 border-black cursor-pointer px-1 ${selectedTab === 1 ? 'border-b-3 font-semibold' : ''}`} onClick={() => setSelectedTab(1)}>Pending</h2>
                <h2 className={`hover:border-b-3 border-black cursor-pointer px-1 ${selectedTab === 2 ? 'border-b-3 font-semibold' : ''}`} onClick={() => setSelectedTab(2)}>Created Delivery Notes</h2>
                <h2 className={`hover:border-b-3 border-black cursor-pointer px-1 ${selectedTab === 3 ? 'border-b-3 font-semibold' : ''}`} onClick={() => setSelectedTab(3)}>Delivered</h2>
            </div>

            {/* Filter Section */}
            <div className="flex flex-row gap-x-5">
                <div className="flex flex-row border border-primary rounded-full h-fit w-1/2 bg-white">
                    <div className="flex justify-center items-center rounded-l-full px-5">
                        <MdSearch className="size-6 text-primary" />
                    </div>

                    <input
                        className={`grow h-fit px-3 py-1 text-lg rounded-r-full border border-transparent focus:outline-none`}
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder={
                            selectedTab === 1
                                ? "Search pickup entries here..."
                                : "Search delivery notes (ID, customer, collection order)..."
                        }
                    />
                </div>

                {selectedTab === 1 && (
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
                            type="button"
                            onClick={() => { setStartDate(""); setEndDate(""); }}
                            className="flex flex-row items-center gap-x-1 text-sm text-red-500 font-semibold cursor-pointer hover:underline"
                        >
                            <Icon icon="material-symbols:close-rounded" className="size-4" />
                            Clear
                        </button>
                    )}
                </div>
                )}
            </div>

            {isLoading ?
                <div className="flex items-center justify-center py-20 bg-white border border-primary rounded-xl">
                    <BeatLoader color="#1470F9" size={20} />
                </div> :
                <div className="rounded-xl bg-white overflow-hidden border border-primary">
                    {/* Pending tab: per-order columns */}
                    {selectedTab === 1 && (
                        <div className="text-lg grid grid-cols-10 gap-x-3 text-white bg-primary font-semibold py-2 px-3">
                            <p className="col-span-1"></p>
                            <p className="col-span-2">CUSTOMER</p>
                            <p className="col-span-2">CONTACT DETAILS</p>
                            <p className="col-span-1 text-center">NO OF ITEMS</p>
                            <p className="col-span-1 text-center">DELIVERED</p>
                            <p className="col-span-1 text-center">LAST DELIVER DATE</p>
                            <p className="col-span-2 text-center">ACTION</p>
                        </div>
                    )}

                    {/* Created Delivery Notes + Delivered (approved notes only) — same columns */}
                    {(selectedTab === 2 || selectedTab === 3) && (
                        <div className="text-lg grid grid-cols-12 gap-x-3 text-white bg-primary font-semibold py-2 px-3">
                            <p className="col-span-3">DELIVERY ID</p>
                            <p className="col-span-2">CUSTOMER</p>
                            <p className="col-span-2">COLLECTION ORDER</p>
                            <p className="col-span-2">CREATED DATE</p>
                            <p className="col-span-1 text-center">ITEMS</p>
                            <p className="col-span-1 text-center">STATUS</p>
                            <p className="col-span-1 text-center">ACTION</p>
                        </div>
                    )}

                    {selectedTab === 1 && currentDeliveries.map((delivery, index) => {
                        const totalQty = delivery.total_qty_aggregated;
                        const deliveredQty = delivery.delivered_qty_aggregated;
                        const remainingQty = totalQty - deliveredQty;

                        const items = getOrderItems(delivery);
                        const legacyItems = Array.isArray(delivery?.items) ? delivery.items : [];
                        const useCorpItems = items.length > 0 && (items[0].corp_item_quantity != null || items[0].corp_item_id != null);

                        const totalCategories = useCorpItems
                            ? categoryCountFromItems(items)
                            : new Set(legacyItems.map((item) => item.item_category_id).filter(Boolean)).size;

                        const deliveredCategories = useCorpItems
                            ? categoryCountFromItems(items.filter((item) => itemDeliveredQty(item) > 0))
                            : new Set(
                                legacyItems.filter((item) => (Number(item.delivered_qty) || 0) > 0).map((item) => item.item_category_id)
                            ).size;

                        const remainingCategories = useCorpItems
                            ? categoryCountFromItems(
                                items.filter((item) => {
                                    const qty = Number(item.corp_item_quantity ?? item.quantity) || 0;
                                    return qty - itemDeliveredQty(item) > 0;
                                })
                            )
                            : new Set(
                                legacyItems
                                    .filter((item) => (Number(item.quantity) || 0) - (Number(item.delivered_qty) || 0) > 0)
                                    .map((item) => item.item_category_id)
                            ).size;

                        const lastDateDisplay = delivery.aggregated_last_date 
                            ? new Date(delivery.aggregated_last_date).toISOString().split("T")[0]
                            : "—";

                        const companyPrimary = delivery.customer_company_name ?? delivery.company_name ?? "—";
                        const companySecondary = delivery.customer_id ?? delivery.customer_name ?? "";
                        const phoneDisplay = delivery.customer_phone ?? delivery.phone_number ?? "—";
                        const addressDisplay = delivery.customer_address ?? delivery.address ?? "";
                        const orderCount = delivery.order_count;

                        return (
                            <div key={delivery.pickup_entry_id ?? index} className={`grid grid-cols-10 gap-x-3 text-lg py-1.5 px-3 ${index % 2 === 0 ? "bg-white" : "bg-primary/10"} items-center`}>
                                <div className="col-span-1 flex justify-center">
                                    <Icon icon="lucide:user" className="text-primary bg-primary/20 rounded-full size-7 p-1" />
                                </div>
                                <div className="col-span-2 flex flex-col">
                                    <div className="flex flex-row items-center gap-x-2">
                                        <p className="font-medium truncate">{companyPrimary}</p>
                                        {orderCount > 1 && (
                                            <span className="bg-primary/20 text-primary text-xs px-1.5 py-0.5 rounded-full font-bold">
                                                {orderCount}
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-base text-black/60 font-medium truncate">{companySecondary}</p>
                                </div>
                                <div className="col-span-2 flex flex-col">
                                    <p className="font-medium truncate">{phoneDisplay}</p>
                                    <p className="text-base text-black/60 font-medium truncate">{addressDisplay}</p>
                                </div>
                                <div className="col-span-1 flex flex-col items-center">
                                    <p className="font-medium">{totalQty}</p>
                                </div>
                                <div className="col-span-1 flex flex-col items-center">
                                    <p className="font-medium">{deliveredQty}</p>
                                </div>
                                <p className="col-span-1 font-medium text-center">{lastDateDisplay}</p>
                                <div className="col-span-2 flex flex-row gap-x-3 justify-center items-center">
                                    <Link to={`${delivery.pickup_entry_id}`} state={{ ...delivery, all_order_ids: delivery.all_pickup_entry_ids }} className="flex flex-col cursor-pointer items-center">
                                        <Icon icon={"lsicon:view-filled"} className="text-blue-500" />
                                        <p className="text-sm">View</p>
                                    </Link>
                                    <div className="h-6 border-r border-black/30"></div>
                                    <Link to={`entry/${delivery.pickup_entry_id}`} state={{ ...delivery, all_order_ids: delivery.all_pickup_entry_ids }} className="flex flex-col cursor-pointer items-center">
                                        <Icon icon={"material-symbols-light:delivery-truck-bolt"} className="text-green-500" />
                                        <p className="text-sm">Deliver</p>
                                    </Link>
                                </div>
                            </div>
                        );
                    })}

                    {/* Delivery note rows: all statuses (tab 2) or approved only (tab 3) */}
                    {(selectedTab === 2 || selectedTab === 3) && currentDeliveries.map((note, index) => {
                        const approvalStatus = note.approval_status || 'Created';
                        const isCancelled = note.status === 'Deactive';
                        const badgeClass = isCancelled
                            ? 'bg-red-100 text-red-700 border border-red-300'
                            : approvalStatus === 'Approved'
                            ? 'bg-green-100 text-green-700 border border-green-300'
                            : approvalStatus === 'Checked'
                            ? 'bg-blue-100 text-blue-700 border border-blue-300'
                            : 'bg-yellow-50 text-yellow-700 border border-yellow-300';
                        const statusText = isCancelled ? 'Cancelled' : approvalStatus;
                        const createdDate = note.created_at
                            ? new Date(note.created_at).toISOString().split('T')[0]
                            : '—';
                        const totalItems = (note.items || []).reduce((s, i) => s + Number(i.delivered_qty || i.delivery_quantity || 0), 0);
                        const noteId = note.delivery_id || note.delivery_note_id;
                        const pickupOrderIds = note.items && note.items.length > 0
                            ? [...new Set(note.items.map(item => item.pickup_entry_id).filter(Boolean))].join(", ")
                            : "—";

                        return (
                            <div key={noteId ?? index} className={`grid grid-cols-12 gap-x-3 text-base py-2 px-3 ${index % 2 === 0 ? "bg-white" : "bg-primary/10"} items-center`}>
                                <div className="col-span-3">
                                    <p className="font-semibold text-primary text-sm truncate">{noteId}</p>
                                </div>
                                <div className="col-span-2 flex flex-col">
                                    <p className="font-medium truncate">{note.customer_company_name ?? '—'}</p>
                                    <p className="text-xs text-black/50 truncate">{note.customer_id}</p>
                                </div>
                                <div className="col-span-2">
                                    <p className="font-medium text-sm truncate">{pickupOrderIds}</p>
                                </div>
                                <p
                                    className="col-span-2 font-medium text-sm cursor-pointer hover:text-primary hover:underline"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleDateChangeClick(note);
                                    }}
                                >
                                    {createdDate}
                                </p>
                                <p className="col-span-1 font-medium text-center">{totalItems}</p>
                                <div className="col-span-1 flex justify-center">
                                    <span className={`text-xs font-semibold px-2 py-1 rounded-full ${badgeClass}`}>{statusText}</span>
                                </div>
                                <div className="col-span-1 flex justify-center">
                                    <div
                                        className="flex flex-col items-center cursor-pointer"
                                        onClick={() => navigate(`/salesCorporate/corporate/delivery/note/${noteId}`)}
                                    >
                                        <Icon icon={"lsicon:view-filled"} className="text-blue-500 text-xl" />
                                        <p className="text-xs">View</p>
                                    </div>
                                </div>
                            </div>
                        );
                    })}

                    {(selectedTab === 2 || selectedTab === 3) && currentDeliveries.length === 0 && !isLoading && (
                        <div className="py-10 text-center text-black/40 text-lg bg-white">
                            {selectedTab === 2
                                ? "No delivery notes found."
                                : "No approved delivery notes yet."}
                        </div>
                    )}
                    {Array.from({ length: blankRows > 0 ? blankRows : 0 }).map((_, idx) => (
                        <div
                            key={`blank-${idx}`}
                            className={`${selectedTab === 1 ? "grid grid-cols-10" : "grid grid-cols-12"} gap-x-3 py-2.5 px-3 ${(currentDeliveries.length + idx) % 2 === 0 ? "bg-white" : "bg-primary/5"} items-center`}
                        >
                            <div className={`${selectedTab === 1 ? "col-span-10" : "col-span-12"} h-8`}></div>
                        </div>
                    ))}
                </div>
            }

            {/* Pagination */}
            <div className="flex flex-row justify-between items-center">
                <p className="text-base text-black/50">
                    Showing {currentDeliveries.length} entries of {totalEntriesDisplay}
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
                                <button
                                    key={1}
                                    onClick={() => setCurrentPage(1)}
                                    className={`px-3 py-1 rounded-lg border border-primary/20 cursor-pointer ${currentPage === 1
                                        ? "bg-primary text-white font-bold"
                                        : "bg-white text-black/60"
                                        }`}
                                >
                                    1
                                </button>
                            );

                            if (start > 2) {
                                pages.push(<span key="start-ellipsis">...</span>);
                            }
                        }

                        for (let i = start; i <= end; i++) {
                            pages.push(
                                <button
                                    key={i}
                                    onClick={() => setCurrentPage(i)}
                                    className={`px-3 py-1 rounded-lg border border-primary/20 cursor-pointer ${i === currentPage
                                        ? "bg-primary text-white font-bold"
                                        : "bg-white text-black/60"
                                        }`}
                                >
                                    {i}
                                </button>
                            );
                        }

                        if (end < totalPages) {
                            if (end < totalPages - 1) {
                                pages.push(<span key="end-ellipsis">...</span>);
                            }

                            pages.push(
                                <button
                                    key={totalPages}
                                    onClick={() => setCurrentPage(totalPages)}
                                    className={`px-3 py-1 rounded-lg border border-primary/20 cursor-pointer ${currentPage === totalPages
                                        ? "bg-primary text-white font-bold"
                                        : "bg-white text-black/60"
                                        }`}
                                >
                                    {totalPages}
                                </button>
                            );
                        }

                        return pages;
                    })()}

                    <button
                        onClick={() =>
                            setCurrentPage((prev) => (prev < totalPages ? prev + 1 : prev))
                        }
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
                        <h2 className="text-xl font-semibold mb-4">Change Delivery Note Date</h2>
                        <div className="mb-4">
                            <p className="text-sm text-gray-600 mb-2">
                                Delivery Note ID: <span className="font-medium">{selectedNoteForDateChange?.delivery_id || selectedNoteForDateChange?.delivery_note_id}</span>
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
                                    setSelectedNoteForDateChange(null);
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

export default SalesCorporateDelivery;