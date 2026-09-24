import { BiPlus } from "react-icons/bi";
import { MdSearch } from "react-icons/md";
import { useEffect, useState } from "react";
import FilterSelector from "../../components/ui/FilterSelector";
import { Icon } from "@iconify/react/dist/iconify.js";
import DetailsCard from "../../components/ui/DetailsCard";
import CorporateCustomerCreateDialog from "../../components/dialogs/corporate/CorporateCustomerCreateDialog";
import CorporateCustomerUpdateDialog from "../../components/dialogs/corporate/CorporateCustomerUpdateDialog";
import CorporateCustomerPriceListDialog from "../../components/dialogs/corporate/CorporateCustomerPriceListDialog";
import CorporateCustomerViewDialog from "../../components/dialogs/corporate/CorporateCustomerViewDialog";
import { activateCustomer, deactivateCustomer, getAllCorporateCustomers } from "../../services/CustomerServices";
import { BeatLoader } from "react-spinners";
import ConfirmationDialog from "../../components/dialogs/ConfirmationDialog";
import { getCorporateDailyPeriodCustomers, getCorporateNewCustomersToday, getTopCorporateCustomers, getTotalCorporateCustomers } from "../../services/corporate/CorporateDashboardServices";

const SalesCorporateCustomers = () => {
    const [isLoading, setIsLoading] = useState(false);
    const [isLoadingDeactivate, setIsLoadingDeactivate] = useState(false);
    const [isLoadingActivate, setIsLoadingActivate] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState("");
    const [showCreateCustomerDialog, setShowCreateCustomerDialog] = useState(false);
    const [showUpdateCustomerDialog, setShowUpdateCustomerDialog] = useState(false);
    const [selectedCustomer, setSelectedCustomer] = useState(null);
    const [customers, setCustomers] = useState([]);
    const [showDeactivateConfirmationDialog, setShowDeactivateConfirmationDialog] = useState(false);
    const [showActivateConfirmationDialog, setShowActivateConfirmationDialog] = useState(false);
    const [showPriceListDialog, setShowPriceListDialog] = useState(false);
    const [showViewCustomerDialog, setShowViewCustomerDialog] = useState(false);
    const [selectedCustomerForPriceList, setSelectedCustomerForPriceList] = useState(null);
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");
    const [totalCardData, setTotalCardData] = useState(null);
    const [newCardData, setNewCardData] = useState(null);
    const [topCardData, setTopCardData] = useState(null);
    const [periodCardData, setPeriodCardData] = useState(null);
    const [totalCustomers, setTotalCustomers] = useState(0);
    const [currentPage, setCurrentPage] = useState(1);
    const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");

    const statusOptions = [
        { value: 'Active', label: 'Active' },
        { value: 'Deactive', label: 'Deactive' },
    ];

    const fetchAllCustomers = async (page = currentPage) => {
        try {
            setIsLoading(true);
            const userId = localStorage.getItem("userId");
            const isFiltering = searchQuery.trim() !== "" || statusFilter !== "" || startDate !== "" || endDate !== "";
            const offset = isFiltering ? undefined : (page - 1) * 10;
            const response = await getAllCorporateCustomers(userId, offset);
            const list = response?.data?.customers
                || response?.data?.corporate_customers
                || response?.data?.allCustomers
                || response?.data?.data
                || [];
            setCustomers(Array.isArray(list) ? list : []);
            const totalCount = response?.data?.totalCount ?? 0;
            setTotalCustomers(totalCount);
        } catch (error) {
            console.error("Error fetching customers: ", error);
        } finally {
            setIsLoading(false);
        }
    };

    const fetchTotalCustomers = async () => {
        try {
            const payload = {
                user_id: localStorage.getItem("userId"),
                branch_id: -1,
            };
            const response = await getTotalCorporateCustomers(payload);
            setTotalCardData(response.data);
        } catch (error) {
            console.error("Error fetching total customer data: ", error);
        }
    };

    const fetchNewCustomers = async () => {
        try {
            const payload = {
                user_id: localStorage.getItem("userId"),
                branch_id: -1,
            };
            const response = await getCorporateNewCustomersToday(payload);
            setNewCardData(response.data);
        } catch (error) {
            console.error("Error fetching new customer data: ", error);
        }
    };

    const fetchTopCustomers = async () => {
        try {
            const payload = {
                user_id: localStorage.getItem("userId"),
                branch_id: -1,
            };
            const response = await getTopCorporateCustomers(payload);
            setTopCardData(response.data);
        } catch (error) {
            console.error("Error fetching top customer data: ", error);
        }
    };

    const fetchAllSettings = async () => {
        try {
            const payload = {
                user_id: localStorage.getItem("userId"),
                branch_id: -1,
            };
            const response = await getCorporateDailyPeriodCustomers(payload);
            setPeriodCardData(response.data);
        } catch (error) {
            console.error("Error fetching period and daily customer data: ", error);
        }
    };

    useEffect(() => {
        fetchTotalCustomers();
        fetchNewCustomers();
        fetchTopCustomers();
        fetchAllSettings();
    }, []);

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearchQuery(searchQuery);
        }, 300);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    useEffect(() => {
        setCurrentPage(1);
    }, [debouncedSearchQuery, statusFilter, startDate, endDate]);

    useEffect(() => {
        fetchAllCustomers(currentPage);
    }, [currentPage, debouncedSearchQuery, statusFilter, startDate, endDate]);

    const handleStatusFilterChange = (e) => {
        setStatusFilter(e.target.value);
    };

    const filteredCustomers = customers.filter((customer) => {
        const matchesQuery = (field) => {
            if (!searchQuery || !field) return false;

            const fieldStr = field.toString().toLowerCase();
            const searchWords = searchQuery
                .toLowerCase()
                .split(/\s*\*\s*/)
                .filter(word => word.trim().length > 0);

            return searchWords.every(word => fieldStr.includes(word));
        };

        const matchesSearch = searchQuery
            ? matchesQuery(customer.customer_name) ||
            matchesQuery(customer.company_name) ||
            matchesQuery(customer.customer_phone) ||
            matchesQuery(customer.customer_address)
            : true;

        const matchesStatusFilter = !statusFilter 
            ? true 
            : statusFilter.toLowerCase() === "deactive"
                ? String(customer.status || "").toLowerCase() === "deactive" || String(customer.status || "").toLowerCase() === "inactive"
                : String(customer.status || "").toLowerCase() === statusFilter.toLowerCase();

        const rawDate = customer.customer_created_at || customer.created_at || "";
        const createdDatePart = rawDate.split(" ")[0]; // Extracts "YYYY-MM-DD"

        const matchesDateRange = (!startDate || createdDatePart >= startDate) &&
                                 (!endDate || createdDatePart <= endDate);

        return matchesSearch && matchesStatusFilter && matchesDateRange;
    });

    const isFiltering = searchQuery.trim() !== "" || statusFilter !== "" || startDate !== "" || endDate !== "";
    const itemsPerPage = 10;
    const indexOfLastItem = currentPage * itemsPerPage;
    const indexOfFirstItem = indexOfLastItem - itemsPerPage;
    const currentCustomers = isFiltering
        ? filteredCustomers.slice(indexOfFirstItem, indexOfLastItem)
        : filteredCustomers;
    const totalPages = Math.max(
        1,
        isFiltering
            ? Math.ceil(filteredCustomers.length / itemsPerPage)
            : Math.ceil(totalCustomers / itemsPerPage)
    );
    const blankRows = itemsPerPage - currentCustomers.length;

    const renderCustomerStatus = (status) => {
        const normalized = String(status || "").toLowerCase();
        switch (normalized) {
            case 'new':
                return (
                    <div className="flex flex-row rounded-full text-green-500 bg-green-500/20 items-center justify-center gap-x-3 h-fit">
                        <p className="text-lg font-semibold">New</p>
                    </div>
                );
            case 'top':
                return (
                    <div className="flex flex-row rounded-full text-amber-500 bg-amber-500/20 items-center justify-center gap-x-3 h-fit">
                        <p className="text-lg font-semibold">Top</p>
                    </div>
                );
            case 'frequent':
                return (
                    <div className="flex flex-row rounded-full text-blue-500 bg-blue-500/20 items-center justify-center gap-x-3 h-fit">
                        <p className="text-lg font-semibold">Frequent</p>
                    </div>
                );
            case 'active':
                return (
                    <div className="flex flex-row rounded-full text-green-600 bg-green-500/20 items-center justify-center gap-x-3 h-fit">
                        <p className="text-lg font-semibold">Active</p>
                    </div>
                );
            case 'deactive':
            case 'inactive':
                return (
                    <div className="flex flex-row rounded-full text-red-600 bg-red-500/20 items-center justify-center gap-x-3 h-fit">
                        <p className="text-lg font-semibold">{normalized === "inactive" ? "Inactive" : "Deactive"}</p>
                    </div>
                );
            default:
                return (
                    <div className="flex flex-row rounded-full text-black/70 bg-black/10 items-center justify-center gap-x-3 h-fit px-2">
                        <p className="text-sm font-semibold">{status || "-"}</p>
                    </div>
                );
        }
    };

    const handleEditClick = (customer) => {
        setSelectedCustomer(customer);
        setShowUpdateCustomerDialog(true);
    };

    const handleViewClick = (customer) => {
        setSelectedCustomer(customer);
        setShowViewCustomerDialog(true);
    };

    const handleEditClickFromView = (customer) => {
        setShowViewCustomerDialog(false);
        setSelectedCustomer(customer);
        setShowUpdateCustomerDialog(true);
    };

    const handleDeactivateCustomer = async () => {
        const payload = {
            user_id: localStorage.getItem("userId"),
            customer_id: selectedCustomer.customer_id,
            customer_type: "Retail"
        };

        try {
            setIsLoadingDeactivate(true);
            const response = await deactivateCustomer(payload);
            setShowDeactivateConfirmationDialog(false);
            fetchAllCustomers(currentPage);
        } catch (error) {
            console.error("Error deactivating customer: ", error);
        } finally {
            setIsLoadingDeactivate(false);
        }
    };

    const handleActivateCustomer = async () => {
        const payload = {
            user_id: localStorage.getItem("userId"),
            customer_id: selectedCustomer.customer_id,
            customer_type: "Retail"
        };

        try {
            setIsLoadingActivate(true);
            const response = await activateCustomer(payload);
            setShowActivateConfirmationDialog(false);
            fetchAllCustomers(currentPage);
        } catch (error) {
            console.error("Error activating customer: ", error);
        } finally {
            setIsLoadingActivate(false);
        }
    };

    return (
        <div className="flex flex-col gap-y-5">
            {/* Header Section */}
            <div className="flex flex-row justify-between">
                <div className="flex flex-col">
                    <h1 className="text-3xl font-bold text-primary">Customer Management</h1>
                    <p className="text-xl text-black/50">Manage your organization's customer resources efficiently.</p>
                </div>
                <button
                    className="flex flex-row gap-x-3 items-center bg-white h-fit text-primary font-semibold text-xl py-2 px-3 rounded-full border border-primary cursor-pointer"
                    onClick={() => setShowCreateCustomerDialog(true)}
                >
                    <BiPlus /> Add New Customer
                </button>
            </div>

            {/* Detail Section */}
            <div className="grid grid-cols-4 gap-x-10">
                <DetailsCard
                    title={"Total Customers"}
                    value={totalCardData?.total_customers ?? 0}
                    label1={"Orders Placed Today"}
                    value1={totalCardData?.order_placed_today_customers ?? 0}
                    label2={"Orders Placed Percentage"}
                    value2={totalCardData?.order_placed_percentage ? `${totalCardData?.order_placed_percentage.toFixed(2)}%` : "0%"}
                    extraDetails={true}
                />
                <DetailsCard
                    title={"New Customers Today"}
                    value={newCardData?.today_new_customers ?? 0}
                    label2={"New Customers Percentage"}
                    value2={newCardData?.today_new_customers_percentage ? `${newCardData?.today_new_customers_percentage.toFixed(2)}%` : "0%"}
                    extraDetails={true}
                />
                <DetailsCard
                    title={"Top Customers"}
                    value={topCardData?.top_customers ?? 0}
                    label1={"Total Customers"}
                    value1={topCardData?.total_customers ?? 0}
                    label2={"Top Percentage"}
                    value2={topCardData?.top_customers_percentage ? `${topCardData?.top_customers_percentage.toFixed(2)}%` : "0%"}
                    extraDetails={true}
                />
                <DetailsCard
                    title={"Period Invoice Customers"}
                    value={periodCardData?.period_invoice_customers ?? 0}
                    label1={"Daily Invoice Customers"}
                    value1={periodCardData?.daily_invoice_customers ?? 0}
                    label2={"Period Customers Percentage"}
                    value2={periodCardData?.period_customers_percentage ? `${periodCardData?.period_customers_percentage.toFixed(2)}%` : "0%"}
                    extraDetails={true}
                />
            </div>

            <div className="w-full border-b border-primary">
                <p className="border-b-3 border-black w-fit px-1 text-2xl font-semibold">Customers</p>
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
                        placeholder="Search Customers here..."
                    />
                </div>

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

                <FilterSelector
                    options={statusOptions}
                    value={statusFilter}
                    onChange={handleStatusFilterChange}
                />
            </div>

            {isLoading ?
                <div className="flex items-center justify-center py-20 bg-white rounded-xl border border-primary">
                    <BeatLoader color="#1470F9" size={20} />
                </div> :
                <div className="rounded-xl bg-white overflow-hidden border border-primary">
                    {/* Table Header — 13 columns */}
                    <div className="text-base grid grid-cols-13 gap-x-2 text-white bg-primary font-semibold py-2 px-2">
                        <p className="col-span-1"></p>
                        <p className="col-span-2">CUSTOMER</p>
                        <p className="col-span-2">CONTACT DETAILS</p>
                        <p className="col-span-1">VAT NO</p>
                        <p className="col-span-2">INVOICE</p>
                        <p className="col-span-2">CREDIT PERIOD</p>
                        <p className="col-span-1">STATUS</p>
                        <p className="col-span-2 text-center">ACTION</p>
                    </div>

                    {currentCustomers.map((customer, index) => (
                        <div
                            key={index}
                            className={`grid grid-cols-13 gap-x-2 text-base py-1.5 px-2 ${index % 2 === 0 ? "bg-white" : "bg-primary/10"} items-center`}
                        >
                            {/* Icon */}
                            <div className="col-span-1 flex justify-center">
                                <Icon icon={"lucide:user"} className="text-primary bg-primary/20 rounded-full size-7 p-1" />
                            </div>

                            {/* Customer */}
                            <div className="col-span-2 flex flex-col">
                                <p className="font-medium truncate">{customer.company_name}</p>
                                <p className="text-sm text-black/60 font-medium truncate">{customer.customer_name}</p>
                                <p className="text-sm text-black/60 font-medium truncate uppercase">{customer.customer_id}</p>
                            </div>

                            {/* Contact */}
                            <div className="col-span-2 flex flex-col">
                                <p className="font-medium truncate">{customer.customer_phone || "-"}</p>
                                <p className="text-sm text-black/60 font-medium truncate">{customer.customer_address || "-"}</p>
                            </div>

                            {/* VAT */}
                            <p className="col-span-1 font-medium truncate">{customer.customer_vat_number || "-"}</p>

                            {/* Invoice */}
                            <div className="col-span-2 flex flex-col">
                                <p className="font-medium">{customer.customer_invoice_type || "-"}</p>
                                <p className="text-sm text-black/60 font-medium">{customer.customer_invoicing_period ? `${customer.customer_invoicing_period} Days` : "-"}</p>
                            </div>

                            {/* Payment Period */}
                            <p className="col-span-2 font-medium">{customer.customer_payment_period ? `${customer.customer_payment_period} Days` : "-"}</p>

                            {/* Status */}
                            <div className="col-span-1">
                                {renderCustomerStatus(customer.status)}
                            </div>

                            {/* Actions */}
                            <div className="col-span-2 flex flex-row items-center justify-center gap-x-2">
                                {/* View */}
                                <div 
                                    className="flex flex-col items-center cursor-pointer"
                                    onClick={() => handleViewClick(customer)}
                                >
                                    <Icon icon={"mdi:eye"} className="text-blue-500 text-xl" />
                                    <p className="text-xs text-black/70">View</p>
                                </div>

                                <div className="h-6 border-r border-black/30"></div>

                                {/* Edit */}
                                <div
                                    className="flex flex-col items-center cursor-pointer"
                                    onClick={() => handleEditClick(customer)}
                                >
                                    <Icon icon={"iconamoon:edit-fill"} className="text-green-500 text-xl" />
                                    <p className="text-xs text-black/70">Edit</p>
                                </div>

                                <div className="h-6 border-r border-black/30"></div>

                                {/* View Price List */}
                                <div
                                    className="flex flex-col items-center cursor-pointer"
                                    onClick={() => {
                                        setSelectedCustomerForPriceList(customer);
                                        setShowPriceListDialog(true);
                                    }}
                                >
                                    <Icon icon={"mdi:format-list-bulleted"} className="text-pink-500 text-xl" />
                                    <p className="text-xs text-black/70">Price List</p>
                                </div>
                            </div>
                        </div>
                    ))}

                    {/* Blank rows */}
                    {Array.from({ length: blankRows > 0 ? blankRows : 0 }).map((_, idx) => (
                        <div
                            key={`blank-${idx}`}
                            className={`grid grid-cols-13 gap-x-2 py-1.5 px-2 ${(currentCustomers.length + idx) % 2 === 0 ? "bg-white" : "bg-primary/10"} items-center`}
                        >
                            <div className="col-span-13 h-8"></div>
                        </div>
                    ))}
                </div>
            }

            {/* Pagination */}
            <div className="flex flex-row justify-between items-center">
                <p className="text-base text-black/50">
                    Showing {currentCustomers.length} customers
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
                                    className={`px-3 py-1 rounded-lg border border-primary/20 cursor-pointer ${currentPage === 1 ? "bg-primary text-white font-bold" : "bg-white text-black/60"}`}
                                >
                                    1
                                </button>
                            );
                            if (start > 2) pages.push(<span key="start-ellipsis">...</span>);
                        }

                        for (let i = start; i <= end; i++) {
                            pages.push(
                                <button
                                    key={i}
                                    onClick={() => setCurrentPage(i)}
                                    className={`px-3 py-1 rounded-lg border border-primary/20 cursor-pointer ${i === currentPage ? "bg-primary text-white font-bold" : "bg-white text-black/60"}`}
                                >
                                    {i}
                                </button>
                            );
                        }

                        if (end < totalPages) {
                            if (end < totalPages - 1) pages.push(<span key="end-ellipsis">...</span>);
                            pages.push(
                                <button
                                    key={totalPages}
                                    onClick={() => setCurrentPage(totalPages)}
                                    className={`px-3 py-1 rounded-lg border border-primary/20 cursor-pointer ${currentPage === totalPages ? "bg-primary text-white font-bold" : "bg-white text-black/60"}`}
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

            {showCreateCustomerDialog &&
                <CorporateCustomerCreateDialog
                    handleClose={() => {
                        setShowCreateCustomerDialog(false);
                        fetchAllCustomers(currentPage);
                    }}
                />
            }

            {showUpdateCustomerDialog &&
                <CorporateCustomerUpdateDialog
                    customer={selectedCustomer}
                    handleClose={() => {
                        setShowUpdateCustomerDialog(false);
                        fetchAllCustomers(currentPage);
                    }}
                />
            }

            {showDeactivateConfirmationDialog &&
                <ConfirmationDialog
                    title={"Deactivate Customer"}
                    text={"Are you sure to deactivate the customer"}
                    item={selectedCustomer?.customer_name}
                    onClose={() => {
                        setShowDeactivateConfirmationDialog(false);
                        setSelectedCustomer(null);
                    }}
                    onSubmit={handleDeactivateCustomer}
                    isLoading={isLoadingDeactivate}
                />
            }

            {showPriceListDialog && selectedCustomerForPriceList ? (
                <CorporateCustomerPriceListDialog
                    customer={selectedCustomerForPriceList}
                    onClose={() => {
                        setShowPriceListDialog(false);
                        setSelectedCustomerForPriceList(null);
                    }}
                />
            ) : null}

            {showViewCustomerDialog && selectedCustomer &&
                <CorporateCustomerViewDialog
                    customerId={selectedCustomer?.customer_auto_id ?? selectedCustomer?.id ?? null}
                    handleClose={() => {
                        setShowViewCustomerDialog(false);
                        setSelectedCustomer(null);
                        fetchAllCustomers(currentPage);
                    }}
                    onEdit={handleEditClickFromView}
                />
            }

            {showActivateConfirmationDialog &&
                <ConfirmationDialog
                    title={"Activate Customer"}
                    text={"Are you sure to activate the customer"}
                    item={selectedCustomer?.customer_name}
                    onClose={() => {
                        setShowActivateConfirmationDialog(false);
                        setSelectedCustomer(null);
                    }}
                    onSubmit={handleActivateCustomer}
                    isLoading={isLoadingActivate}
                />
            }
        </div>
    );
};

export default SalesCorporateCustomers;