import { MdSearch } from "react-icons/md";
import { useEffect, useState, useRef } from "react";
import { Icon } from "@iconify/react/dist/iconify.js";
import Swal from "sweetalert2";
import SignatureInput from "../../../components/ui/SignatureInput";
import FilterSelector from "../../../components/ui/FilterSelector";
import { HiOutlineArrowCircleLeft } from "react-icons/hi";
import { Link, useNavigate, useParams, useLocation } from "react-router-dom";
import {
    getInvoicingHistoryByCustomerId,
    getGeneratedInvoiceApprovalStatusLabel,
    getGeneratedInvoiceApprovalStatusBadgeClass,
    pickSalesCorporateInvoiceApprovalStatus,
    updateCorporateInvoiceDate,
} from "../../../services/corporate/CorporateInvoicingServices";
import {
    getCorporateCustomerById,
    unwrapCorporateCustomerGetByIdResponse,
} from "../../../services/CustomerServices";
import { hasCustomerVatNumber } from "../../../utils/corporateCollectionNotePricing";

const computeInvoiceTransportCharge = (invoice, customerProfile, isPeriod = false) => {
    if (invoice.transport_charge !== undefined && invoice.transport_charge !== null && parseFloat(invoice.transport_charge) > 0) {
        return parseFloat(invoice.transport_charge) || 0;
    }
    const items = invoice.items || [];
    let transportRate = 0;
    const locations = customerProfile?.locations ?? customerProfile?.customer?.locations ?? [];
    
    if (Array.isArray(locations) && locations.length > 0) {
        const uniqueLocations = new Set();
        
        const invoiceLoc = invoice.delivered_location || invoice.deliveredLocation || invoice.place_of_supply || invoice.placeOfSupply;
        if (invoiceLoc && String(invoiceLoc).trim() !== "") {
            uniqueLocations.add(String(invoiceLoc).trim().toLowerCase());
        }
        
        items.forEach(it => {
            const itemLoc = it.delivered_location || it.deliveredLocation || it.place_of_supply || it.placeOfSupply;
            if (itemLoc && String(itemLoc).trim() !== "") {
                uniqueLocations.add(String(itemLoc).trim().toLowerCase());
            }
        });
        
        const normalizeLocName = (name) => String(name || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");

        uniqueLocations.forEach(locName => {
            const matchedLoc = locations.find(loc => 
                normalizeLocName(loc?.location_name) === normalizeLocName(locName)
            );
            if (matchedLoc) {
                transportRate += parseFloat(matchedLoc.transport_rate) || 0;
            }
        });

        if (transportRate === 0 && locations.length === 1) {
            transportRate = parseFloat(locations[0].transport_rate) || 0;
        }
    }
    
    if (transportRate === 0) {
        transportRate = parseFloat(invoice.transport_rate_per_trip || invoice.entry_transport_rate || invoice.transport_rate || 0);
    }
    
    const tripCount = invoice.trip_count !== undefined && invoice.trip_count !== null && Number(invoice.trip_count) > 0
        ? Number(invoice.trip_count)
        : (isPeriod ? (parseFloat(customerProfile?.customer_invoicing_period || customerProfile?.customer?.customer_invoicing_period || 1) || 1) : 1);

    return transportRate * tripCount;
};

const computeInvoiceAmountFromItems = (invoice, customerProfile) => {
    const hasVat = hasCustomerVatNumber(
        customerProfile?.customer_vat_number ??
        customerProfile?.vat_number ??
        customerProfile?.vat_no ??
        (customerProfile?.customer && (customerProfile.customer.customer_vat_number ?? customerProfile.customer.vat_number)) ??
        invoice.customer_vat_number ??
        invoice.vat_no
    );

    const transportCharge = computeInvoiceTransportCharge(invoice, customerProfile, true);
    const items = invoice.items || [];

    let laundryCharges = 0;
    if (items.length > 0) {
        const ssclRate = hasVat ? 0 : 2.5;
        const vatRate = hasVat ? 0 : 18;
        const surchargePercent = Number(invoice.delivery_percentage || 0);

        const pricedLines = items.map(it => {
            const qty = Number(it.delivered_qty || it.qty || 0);
            const basePrice = Number(it.corp_item_price || it.rate || 0);
            const ssclAmount = (basePrice / 0.975) * (ssclRate / 100);
            const totalSupply = basePrice + ssclAmount;
            const vatAmount = (totalSupply * vatRate) / 100;
            const ti = Number((totalSupply + vatAmount).toFixed(2));
            const finalRate = Number((ti + (ti * surchargePercent) / 100).toFixed(2));
            return {
                orderValue: Number((qty * finalRate).toFixed(2))
            };
        });
        laundryCharges = pricedLines.reduce((sum, it) => sum + it.orderValue, 0);
    } else if (invoice.sub_total !== undefined && invoice.sub_total !== null && Number(invoice.sub_total) > 0) {
        laundryCharges = parseFloat(invoice.sub_total) || 0;
    } else {
        if (!hasVat && (invoice.total_before_sscl || invoice.sub_total)) {
            return parseFloat(invoice.total_before_sscl || invoice.sub_total);
        }
        return Number(invoice.total_amount || invoice.final_grand_total || invoice.sub_total || invoice.cash_amount || 0);
    }

    const discountPct = Number(invoice.discount || 0);
    const discountVal = Number(((laundryCharges * discountPct) / 100).toFixed(2));
    const amountAfterDiscount = Number((laundryCharges - discountVal).toFixed(2));

    const totalBeforeSscl = Number((amountAfterDiscount + transportCharge).toFixed(2));
    if (!hasVat) {
        return totalBeforeSscl;
    } else {
        const ssclRatePct = 2.5;
        const vatRatePct = 18;
        const ssclAmount = Number(((totalBeforeSscl / 0.975) * (ssclRatePct / 100)).toFixed(2));
        const totalValueOfSupply = Number((totalBeforeSscl + ssclAmount).toFixed(2));
        const vatAmount = Number(((totalValueOfSupply * vatRatePct) / 100).toFixed(2));
        return Number((totalValueOfSupply + vatAmount).toFixed(2));
    }
};

/** For a Deactive (superseded) invoice row: "Edited" when voided via Edit Invoice, else "Cancelled". */
const getDeactiveInvoiceStatusLabel = (invoice) => {
    const raw = invoice?.activity_log;
    const log = Array.isArray(raw)
        ? raw
        : typeof raw === "string"
            ? (() => { try { return JSON.parse(raw); } catch { return []; } })()
            : [];
    const last = Array.isArray(log) && log.length > 0 ? log[log.length - 1] : null;
    return last?.type === "Edited" ? "Edited" : "Cancelled";
};

const CorporatePeriodInvoiceView = () => {
    const { cus } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    // 1 = Pending, 2 = Generated. Honor the tab requested by the page that navigated here
    // (e.g. "Edit" on a generated invoice sends the user back to the Pending tab).
    const [selectedTab, setSelectedTab] = useState(location.state?.selectedTab === 2 ? 2 : 1);
    const [searchQuery, setSearchQuery] = useState("");
    const [fromDate, setFromDate] = useState("");
    const [toDate, setToDate] = useState("");
    const [history, setHistory] = useState([]);
    const [customerProfile, setCustomerProfile] = useState(null);
    const [selectedPendingIds, setSelectedPendingIds] = useState([]);
    const [showAddSignature, setShowAddSignature] = useState(false);
    const [signatureFile, setSignatureFile] = useState(null);
    const [preparedBy, setPreparedBy] = useState(localStorage.getItem("userName") || "");

    // Date change calendar state (every user can edit)
    const [showDateChangeCalendar, setShowDateChangeCalendar] = useState(false);
    const [selectedInvoiceForDateChange, setSelectedInvoiceForDateChange] = useState(null);
    const [selectedNewDate, setSelectedNewDate] = useState("");
    const [isUpdatingDate, setIsUpdatingDate] = useState(false);

    const handleDateChangeClick = (invoice) => {
        setSelectedInvoiceForDateChange(invoice);
        const currentDate = invoice.created_at ? new Date(invoice.created_at) : new Date();
        const formattedDate = currentDate.toISOString().split("T")[0];
        setSelectedNewDate(formattedDate);
        setShowDateChangeCalendar(true);
    };

    const handleDateChangeSubmit = async () => {
        if (!selectedInvoiceForDateChange || !selectedNewDate) return;

        const userId = localStorage.getItem("userId");
        const invoiceId = selectedInvoiceForDateChange.invoice_id;

        if (!userId) {
            Swal.fire({
                icon: "error",
                title: "Error",
                text: "User ID not found. Please log in again.",
            });
            return;
        }

        if (!invoiceId) {
            Swal.fire({
                icon: "error",
                title: "Error",
                text: "Invoice ID not found.",
            });
            return;
        }

        setIsUpdatingDate(true);
        try {
            const now = new Date();
            const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
            const payload = {
                user_id: userId,
                invoice_id: invoiceId,
                new_date: `${selectedNewDate} ${currentTime}`
            };

            await updateCorporateInvoiceDate(payload);

            Swal.fire({
                icon: "success",
                title: "Success",
                text: "Invoice date updated successfully.",
            });

            // Update local state list
            setHistory(prev => prev.map(inv =>
                inv.invoice_id === invoiceId
                    ? { ...inv, created_at: `${selectedNewDate}T${currentTime}` }
                    : inv
            ));

            setShowDateChangeCalendar(false);
            setSelectedInvoiceForDateChange(null);
            setSelectedNewDate("");
        } catch (error) {
            console.error("Error updating invoice date:", error);
            Swal.fire({
                icon: "error",
                title: "Error",
                text: "Failed to update invoice date. Please try again.",
            });
        } finally {
            setIsUpdatingDate(false);
        }
    };

    const handleAddSignature = (file) => {
        setSignatureFile(file);
        const reader = new FileReader();
        reader.onloadend = () => {
            sessionStorage.setItem("preparationSignature", reader.result);
        };
        reader.readAsDataURL(file);
        setShowAddSignature(false);
    };

    const invoice = {
        customer: "Grand Hotel",
        contactPerson: "John Smith",
        phone: "0716624456",
        address: "914/C, Matara",
        noOfOrders: 3,
        completed: 2,
        pending: 1,
        latestInvoiceStatus: "Pending",
        invoiceType: "Period",
    };

    const invoiceHistory = [
        {
            invoiceId: "Inv-001",
            date: "2025/08/15",
            noOfItems: 100,
            amount: "Rs 35,000.00",
            status: "Pending"
        },
        {
            invoiceId: "Inv-002",
            date: "2025/01/03",
            noOfItems: 80,
            amount: "Rs 42,500.00",
            status: "Generated"
        },
        {
            invoiceId: "Inv-003",
            date: "2025/01/02",
            noOfItems: 120,
            amount: "Rs 10,530.00",
            status: "Generated"
        }
    ];

    const statusOptions = [
        { value: 'Generated', label: 'Generated' },
        { value: 'Pending', label: 'Pending' },
    ];

    const fetchInvoiceHistoryByCustomer = async () => {
        if (!cus) return;
        try {
            // Use the correct API endpoint that matches the working endpoint
            const response = await getInvoicingHistoryByCustomerId(localStorage.getItem("userId"), cus, 0);
            // Handle the actual API response structure
            const invoiceHistory = response.data.invoice_history || [];
            
            // Transform the data to match component expectations
            const transformedHistory = invoiceHistory.map((invoice) => {
                const approvalFromApi = pickSalesCorporateInvoiceApprovalStatus(invoice);
                const pickupId =
                    invoice.pickup_entry_id != null && String(invoice.pickup_entry_id).trim() !== ""
                        ? String(invoice.pickup_entry_id).trim()
                        : null;
                return {
                ...invoice,
                created_at: invoice.created_at || invoice.date,
                // Map pickup_entry_id to invoice_id if invoice_id is missing
                invoice_id: invoice.invoice_id || invoice.pickup_entry_id || `INV-${invoice.id}`,
                pickup_entry_id: pickupId ?? invoice.pickup_entry_id,
                // STATUS column + compat: only sales_corporate_invoices.approval_status from API
                invoice_tax_approval_status: approvalFromApi,
                approval_status: approvalFromApi,
                // Calculate total_quantity from items if not provided or items array length
                total_quantity:
                    invoice.total_quantity ||
                    (invoice.items && invoice.items.length > 0
                        ? invoice.items.reduce((sum, item) => sum + (Number(item.delivered_qty) || Number(item.corp_item_quantity) || Number(item.quantity) || 0), 0)
                        : (Array.isArray(invoice.items) ? invoice.items.length : 0)) ||
                    (Array.isArray(invoice.items) ? invoice.items.length : 0),
                // Map invoice_generated to status
                status: invoice.invoice_generated === 1 ? "Generated" : "Pending",
                db_status: invoice.status,
                // Map total_amount to expected field
                total_amount: invoice.total_amount || invoice.sub_total || invoice.cash_amount || "0.00",
                final_grand_total: invoice.final_grand_total || invoice.total_amount || invoice.sub_total || "0.00",
            };
            });

            setHistory(transformedHistory);

            // "Edit Invoice" sends the user here with the delivery notes it just released
            // back to Pending — pre-check those specific rows so they don't have to hunt
            // for them again, while still letting them add/remove before re-generating.
            const preselectIds = location.state?.preselectDeliveryNoteAutoIds;
            if (Array.isArray(preselectIds) && preselectIds.length > 0) {
                const preselectSet = new Set(preselectIds.map((v) => String(v)));
                const matched = transformedHistory
                    .filter((inv) => inv.status === "Pending")
                    .map((inv) => inv.delivery_note_auto_id ?? inv.pickup_entry_id)
                    .filter((id) => id != null && preselectSet.has(String(id)));
                if (matched.length > 0) setSelectedPendingIds(matched);
            }
        } catch (error) {
            console.error("Error fetching Invoice History: ", error);
        }
    };

    useEffect(() => {
        sessionStorage.removeItem("preparationSignature");
        sessionStorage.removeItem("preparedByName");
        fetchInvoiceHistoryByCustomer();

        const fetchCustomer = async () => {
            try {
                const res = await getCorporateCustomerById({
                    user_id: localStorage.getItem("userId") || "",
                    customer_auto_id: cus,
                });
                const profile = unwrapCorporateCustomerGetByIdResponse(res);
                setCustomerProfile(profile || null);
            } catch (e) {
                console.error("Error fetching customer profile:", e);
            }
        };
        fetchCustomer();
    }, [cus]);

    const pendingInvoices = history.filter(inv => inv.status === "Pending").filter(inv => {
        if (!fromDate && !toDate) return true;
        const invDate = new Date(inv.created_at);
        const from = fromDate ? new Date(fromDate) : new Date("1900-01-01");
        const to = toDate ? new Date(toDate) : new Date("2100-01-01");
        to.setHours(23, 59, 59, 999);
        return invDate >= from && invDate <= to;
    });

    const generatedInvoices = history.filter(inv => inv.status === "Generated").filter(inv => {
        let matchesQuery = true;
        if (searchQuery) {
            const searchWords = searchQuery.toLowerCase().split(/\s*\*\s*/).filter(word => word.trim().length > 0);
            matchesQuery = searchWords.every(word => 
                (inv.invoice_id || "").toLowerCase().includes(word) ||
                (inv.pickup_entry_id || "").toLowerCase().includes(word)
            );
        }

        let matchesDateRange = true;
        if (fromDate || toDate) {
            const invDate = new Date(inv.created_at);
            const from = fromDate ? new Date(fromDate) : new Date("1900-01-01");
            const to = toDate ? new Date(toDate) : new Date("2100-01-01");
            to.setHours(23, 59, 59, 999);
            matchesDateRange = invDate >= from && invDate <= to;
        }

        return matchesQuery && matchesDateRange;
    });

    const handleSelectPending = (id) => {
        const sid = String(id);
        setSelectedPendingIds((prev) =>
            prev.some((p) => String(p) === sid) ? prev.filter((p) => String(p) !== sid) : [...prev, sid]
        );
    };

    // Group pending invoices by date
    const pendingGroupedByDate = pendingInvoices.reduce((acc, inv) => {
        const dateStr = inv.created_at ? new Date(inv.created_at).toLocaleDateString('en-CA') : "Unknown Date";
        if (!acc[dateStr]) acc[dateStr] = [];
        acc[dateStr].push(inv);
        return acc;
    }, {});

    //pagination for generated
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;
    const indexOfLastItem = currentPage * itemsPerPage;
    const indexOfFirstItem = indexOfLastItem - itemsPerPage;
    const currentInvoices = generatedInvoices.slice(indexOfFirstItem, indexOfLastItem);
    const totalPages = Math.ceil(generatedInvoices.length / itemsPerPage);
    const blankRows = itemsPerPage - currentInvoices.length;

    return (
        <div className="flex flex-col gap-y-5">
            {/* Header Section */}
            <div className="flex flex-row justify-between">
                <div className="flex flex-col">
                    <div className="flex flex-row gap-x-3 items-center">
                        <HiOutlineArrowCircleLeft className="size-6 text-primary cursor-pointer" onClick={() => navigate(`/salesCorporate/corporate/invoicing`)} />
                        <h1 className="text-3xl text-primary font-bold">Period Invoice Customers/{history[0]?.customer_company_name ?? history[0]?.company_name}</h1>
                    </div>
                    <p className="text-xl text-black/50">Record new laundry pickup with item counts by category.</p>
                </div>
            </div>

            <div className="flex flex-row gap-x-5 w-full border-b border-primary text-2xl mb-5">
                <h2 className={`hover:border-b-3 border-black cursor-pointer px-1 ${selectedTab === 1 ? 'border-b-3 font-semibold' : 'text-black/40'}`} onClick={() => setSelectedTab(1)}>Pending Invoices</h2>
                <h2 className={`hover:border-b-3 border-black cursor-pointer px-1 ${selectedTab === 2 ? 'border-b-3 font-semibold' : 'text-black/40'}`} onClick={() => setSelectedTab(2)}>Generated Invoices</h2>
            </div>

            {/* Filters */}
            {selectedTab === 1 && (
                <div className="flex flex-row gap-x-5 items-center">
                    <div className="flex flex-row border border-primary rounded-full h-fit bg-white px-5 py-1 text-lg items-center text-black/50 gap-x-3">
                        <Icon icon="mdi:calendar-month-outline" className="text-2xl" />
                        <label>From</label>
                        <input
                            type="date"
                            className="outline-none bg-transparent ml-2 text-black"
                            value={fromDate}
                            onChange={(e) => setFromDate(e.target.value)}
                        />
                    </div>
                    <div className="flex flex-row border border-primary rounded-full h-fit bg-white px-5 py-1 text-lg items-center text-black/50 gap-x-3">
                        <Icon icon="mdi:calendar-month-outline" className="text-2xl" />
                        <label>To</label>
                        <input
                            type="date"
                            className="outline-none bg-transparent ml-2 text-black"
                            value={toDate}
                            onChange={(e) => setToDate(e.target.value)}
                        />
                    </div>
                </div>
            )}

            {selectedTab === 2 && (
                <div className="flex flex-row gap-x-5 items-center">
                    <div className="flex flex-row border border-primary rounded-full h-fit w-1/3 bg-white">
                        <div className="flex justify-center items-center rounded-l-full px-5">
                            <MdSearch className="size-6 text-primary" />
                        </div>
                        <input
                            className="grow h-fit px-3 py-1 text-lg rounded-r-full border border-transparent focus:outline-none"
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search..."
                        />
                    </div>
                    <div className="flex flex-row border border-primary rounded-full h-fit bg-white px-5 py-1 text-lg items-center text-black/50 gap-x-3">
                        <Icon icon="mdi:calendar-month-outline" className="text-2xl" />
                        <label>From</label>
                        <input
                            type="date"
                            className="outline-none bg-transparent ml-2 text-black"
                            value={fromDate}
                            onChange={(e) => setFromDate(e.target.value)}
                        />
                    </div>
                    <div className="flex flex-row border border-primary rounded-full h-fit bg-white px-5 py-1 text-lg items-center text-black/50 gap-x-3">
                        <Icon icon="mdi:calendar-month-outline" className="text-2xl" />
                        <label>To</label>
                        <input
                            type="date"
                            className="outline-none bg-transparent ml-2 text-black"
                            value={toDate}
                            onChange={(e) => setToDate(e.target.value)}
                        />
                    </div>
                </div>
            )}

            {/* Pending Tab Content */}
            {selectedTab === 1 && (
                <div className="flex flex-col gap-y-5">
                    {Object.keys(pendingGroupedByDate).sort().reverse().map(date => (
                        <div key={date}>
                            <div className="w-full border-b border-primary text-xl font-medium mb-3">
                                {date.replace(/-/g, '/')}
                            </div>
                            <div className="rounded-xl bg-white overflow-hidden border border-primary">
                                <div className="text-sm grid grid-cols-7 gap-x-3 text-white bg-primary font-semibold py-3 px-3 uppercase tracking-wide text-center">
                                    <p className="text-start">Delivery ID</p>
                                    <p>ORDER ID</p>
                                    <p>Delivery Location</p>
                                    <p>DATE</p>
                                    <p>NO OF ITEMS</p>
                                    <p>INVOICE</p>
                                    <p>ACTION</p>
                                </div>

                                {pendingGroupedByDate[date].map((invoice, index) => (
                                    <div key={invoice.delivery_note_auto_id ?? invoice.pickup_entry_id} className={`grid grid-cols-7 gap-x-3 text-lg py-3 ${index % 2 === 0 ? "bg-white" : "bg-primary/5"} items-center px-3 text-center`}>
                                        <div className="flex flex-row items-center gap-x-4 text-start">
                                            <input 
                                                type="checkbox" 
                                                className="size-5 rounded border-gray-300 text-primary focus:ring-primary"
                                                checked={selectedPendingIds.some(
                                                    (p) => String(p) === String(invoice.delivery_note_auto_id)
                                                )}
                                                onChange={() => handleSelectPending(invoice.delivery_note_auto_id)}
                                            />
                                            <p className="text-base font-medium">{invoice.delivery_id || invoice.pickup_entry_id}</p>
                                        </div>
                                        <p className="text-base font-medium">{invoice.pickup_entry_id}</p>
                                        <p className="text-base font-medium">{invoice.delivered_location || invoice.place_of_supply || "-"}</p>
                                        <p className="text-base font-medium">{invoice?.created_at ? new Date(invoice?.created_at).toLocaleDateString('en-CA').replace(/-/g, '/') : ""}</p>
                                        <p className="text-base font-medium">{invoice.total_quantity || invoice.no_of_items || 0}</p>
                                        <div className="flex justify-center">
                                            <p className="font-medium bg-red-500/20 text-red-500 rounded-full text-center px-4 py-1 text-sm w-fit">Pending</p>
                                        </div>
                                        <div className="flex justify-center">
                                            {invoice.delivery_id ? (
                                                <button
                                                    type="button"
                                                    className="flex flex-row gap-x-1 cursor-pointer items-center w-fit border-0 bg-transparent p-0 text-blue-500 hover:text-blue-700 transition-colors"
                                                    onClick={() => navigate(`/salesCorporate/corporate/delivery/note/${invoice.delivery_id}`)}
                                                >
                                                    <Icon icon="lsicon:view-filled" className="text-xl" />
                                                    <p className="text-xs font-semibold">View</p>
                                                </button>
                                            ) : (
                                                <span className="text-xs text-black/30 font-semibold">No Note</span>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                    
                    {pendingInvoices.length === 0 && (
                        <div className="rounded-xl bg-white p-5 border border-primary text-center text-lg text-black/50">
                            No pending invoices found.
                        </div>
                    )}

                    {pendingInvoices.length > 0 && (
                        <>
                            <div className="mt-5">
                                <button 
                                    className="flex flex-row items-center gap-x-2 border border-primary text-primary bg-white hover:bg-primary/10 px-6 py-2 rounded-full font-semibold text-lg cursor-pointer transition-colors disabled:opacity-50"
                                    disabled={selectedPendingIds.length === 0}
                                    onClick={() => {
                                        if (selectedPendingIds.length === 0) return;
                                        const name = (preparedBy || localStorage.getItem("userName") || "Super Admin").trim();
                                        sessionStorage.setItem("preparedByName", name);

                                        const ids = selectedPendingIds.map((id) => String(id).trim()).filter(Boolean);
                                        const q = encodeURIComponent(ids.join(","));
                                        navigate(`/salesCorporate/corporate/invoicing/period/${cus}/preview?ids=${q}`);
                                    }}
                                >
                                    <Icon icon="mdi:invoice-text-send" className="text-2xl" />
                                    Invoicing Selected Orders
                                </button>
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* Generated Tab Content */}
            {selectedTab === 2 && (
                <div className="rounded-xl bg-white overflow-hidden border border-primary">
                    <div className="text-sm grid grid-cols-8 gap-x-3 text-white bg-primary font-semibold py-3 px-3 uppercase tracking-wide text-center">
                        <p className="text-start">INVOICE ID</p>
                        <p>DATE</p>
                        <p>NO OF ITEMS</p>
                        <p>TRANSPORT CHARGE</p>
                        <p>AMOUNT</p>
                        <p>INVOICE</p>
                        <p>STATUS</p>
                        <p>ACTION</p>
                    </div>

                    {currentInvoices.map((invoice, index) => {
                        const approvalStatusLabel = getGeneratedInvoiceApprovalStatusLabel(invoice);
                        return (
                        <div
                            key={`${String(invoice.invoice_id ?? "")}-${String(invoice.pickup_entry_id ?? invoice.id ?? index)}`}
                            className={`grid grid-cols-8 gap-x-3 text-lg py-3 ${index % 2 === 0 ? "bg-white" : "bg-primary/5"} items-center px-3 text-center`}
                        >
                            <p className="text-base font-medium text-start pl-4">{invoice.invoice_id}</p>
                            <p
                                className="text-base font-medium cursor-pointer hover:text-primary hover:underline"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleDateChangeClick(invoice);
                                }}
                            >
                                {invoice?.created_at ? new Date(invoice?.created_at).toLocaleDateString('en-CA').replace(/-/g, '/') : ""}
                            </p>
                            <p className="text-base font-medium">{invoice.total_quantity || (Array.isArray(invoice.items) ? invoice.items.length : 0) || invoice.no_of_items || 0}</p>
                            <p className="text-base font-medium">Rs {Number(computeInvoiceTransportCharge(invoice, customerProfile, true)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                            <p className="text-base font-medium">Rs {Number(computeInvoiceAmountFromItems(invoice, customerProfile)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                            <div className="flex justify-center">
                                <p className="font-medium bg-sky-500/15 text-sky-800 rounded-full text-center px-4 py-1 text-sm w-fit">Generated</p>
                            </div>
                            <div className="flex justify-center">
                                {invoice.db_status === "Deactive" ? (
                                    <p className="font-medium bg-red-100 text-red-700 border border-red-300 rounded-full text-center px-4 py-1 text-sm w-fit">
                                        {getDeactiveInvoiceStatusLabel(invoice)}
                                    </p>
                                ) : (
                                    <p
                                        className={`font-medium rounded-full text-center px-4 py-1 text-sm w-fit ${getGeneratedInvoiceApprovalStatusBadgeClass(
                                            approvalStatusLabel
                                        )}`}
                                    >
                                        {approvalStatusLabel}
                                    </p>
                                )}
                            </div>
                            <div className="flex justify-center">
                                <button
                                    type="button"
                                    className="flex flex-col cursor-pointer items-center w-fit border-0 bg-transparent p-0 text-blue-500"
                                    onClick={() => {
                                        const pickupe =
                                            invoice.pickup_entry_id != null &&
                                            String(invoice.pickup_entry_id).trim() !== ""
                                                ? String(invoice.pickup_entry_id).trim()
                                                : null;
                                        const invId =
                                            invoice.invoice_id != null && String(invoice.invoice_id).trim() !== ""
                                                ? String(invoice.invoice_id).trim()
                                                : null;
                                        const routeId = invId || pickupe;
                                        if (!routeId || !cus) return;
                                        const q = encodeURIComponent(routeId);
                                        navigate(`/salesCorporate/corporate/invoicing/period/${cus}/preview?ids=${q}`);
                                    }}
                                >
                                    <Icon icon="mdi:eye" className="text-2xl" />
                                    <span className="text-xs text-black/60">View</span>
                                </button>
                            </div>
                        </div>
                        );
                    })}

                    {/* Render blank rows */}
                    {Array.from({ length: blankRows > 0 ? blankRows : 0 }).map((_, idx) => (
                        <div
                            key={`blank-${idx}`}
                            className={`grid grid-cols-8 gap-x-3 text-lg py-5 ${(currentInvoices.length + idx) % 2 === 0 ? "bg-white" : "bg-primary/5"} items-center`}
                        >
                            <div className="col-span-8 h-8"></div>
                        </div>
                    ))}
                </div>
            )}

            {/* Pagination for Generated Tab */}
            {selectedTab === 2 && (
                <div className="flex flex-row justify-between items-center mt-5">
                    <p className="text-base text-black/50">
                        Showing {indexOfFirstItem + 1} to {Math.min(indexOfLastItem, generatedInvoices.length)} of {generatedInvoices.length} entries
                    </p>

                    <div className="flex justify-end gap-2 flex-wrap">
                        <button
                            onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                            disabled={currentPage === 1}
                            className="px-4 py-1 rounded bg-blue-500 text-white disabled:bg-gray-300 disabled:text-gray-500"
                        >
                            Previous
                        </button>

                        {(() => {
                            const pages = [];
                            for (let i = 1; i <= totalPages; i++) {
                                pages.push(
                                    <button
                                        key={i}
                                        onClick={() => setCurrentPage(i)}
                                        className={`px-3 py-1 rounded border ${i === currentPage
                                            ? "bg-blue-300 text-white border-blue-300"
                                            : "bg-white text-black/60 border-gray-300"
                                            }`}
                                    >
                                        {i}
                                    </button>
                                );
                            }
                            return pages;
                        })()}

                        <button
                            onClick={() =>
                                setCurrentPage((prev) => (prev < totalPages ? prev + 1 : prev))
                            }
                            disabled={currentPage >= totalPages || totalPages === 0}
                            className="px-4 py-1 rounded bg-blue-500 text-white disabled:bg-gray-300 disabled:text-gray-500"
                        >
                            Next
                        </button>
                    </div>
                </div>
            )}

            {showAddSignature && (
                <SignatureInput 
                    handleAddSignature={handleAddSignature} 
                    handleClose={() => setShowAddSignature(false)} 
                />
            )}

            {/* Date Change Calendar Popup (every user can edit) */}
            {showDateChangeCalendar && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl p-6 w-96 shadow-xl">
                        <h2 className="text-xl font-semibold mb-4">Change Invoice Date</h2>
                        <div className="mb-4">
                            <p className="text-sm text-gray-600 mb-2">
                                Invoice ID: <span className="font-medium">{selectedInvoiceForDateChange?.invoice_id}</span>
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
                                    setSelectedInvoiceForDateChange(null);
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

export default CorporatePeriodInvoiceView;