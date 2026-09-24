import { BiPlus } from "react-icons/bi";
import DetailsCard from "../../components/ui/DetailsCard";
import { MdSearch } from "react-icons/md";
import { useEffect, useState } from "react";
import FilterSelector from "../../components/ui/FilterSelector";
import { Icon } from "@iconify/react/dist/iconify.js";
import RetailCustomerCreateDialog from "../../components/dialogs/retail/RetailCustomerCreateDialog";
import RetailCustomerUpdateDialog from "../../components/dialogs/retail/RetailCustomerUpdateDialog";
import { activateCustomer, deactivateCustomer, getAllCustomers } from "../../services/CustomerServices";
import axios from "axios";
import { BeatLoader } from "react-spinners";
import ConfirmationDialog from "../../components/dialogs/ConfirmationDialog";
import { getRetailDashboardNewCustomersToday, getRetailDashboardTopCustomers, getRetailDashboardTotalCustomers } from "../../services/Retail/RetailDashboardServices";
import { hasPermission } from "../../utils/permissionHelper";
import DateRangeFilter from "../../components/ui/DateRangeFilter";
import { isDateRangeFilterActive, isDateWithinRange } from "../../utils/dateRange";

const SalesRetailCustomers = () => {
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
    const [totalCustomers, setTotalCustomers] = useState(null);
    const [newCustomers, setNewCustomers] = useState(null);
    const [topCustomers, setTopCustomers] = useState(null);
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");
    const isTodaySelected = isDateRangeFilterActive(startDate, endDate);

    const statusOptions = [
        { value: 'Active', label: 'Activate' },
        { value: 'Deactive', label: 'Deactivate' },
    ];

    const fetchAllCustomers = async () => {
        try {
            setIsLoading(true);
            const payload = {
                user_id: localStorage.getItem("userId"),
                customer_type: "Retail",
                branch_id: 1,
            };

            const response = await getAllCustomers(payload);
            const filtered = response.data.allCustomers.filter(customer => customer.customer_type === "Retail");
            setCustomers(filtered);
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
                branch_id: 1,
            };
            const response = await getRetailDashboardTotalCustomers(payload);
            setTotalCustomers(response);
        } catch (error) {
            console.error("Error fetching total customers: ", error);
        }
    };

    const fetchNewCustomers = async () => {
        try {
            const payload = {
                user_id: localStorage.getItem("userId"),
                branch_id: 1,
            };
            const response = await getRetailDashboardNewCustomersToday(payload);
            setNewCustomers(response);
        } catch (error) {
            console.error("Error fetching new customers: ", error);
        }
    };

    const fetchTopCustomers = async () => {
        try {
            const payload = {
                user_id: localStorage.getItem("userId"),
                branch_id: 1,
            };
            const response = await getRetailDashboardTopCustomers(payload);
            setTopCustomers(response);
        } catch (error) {
            console.error("Error fetching top customers: ", error);
        }
    };

    useEffect(() => {
        fetchAllCustomers();
        fetchTotalCustomers();
        fetchNewCustomers();
        fetchTopCustomers();
    }, []);

    const handleStatusFilterChange = (e) => {
        setStatusFilter(e.target.value);
        setCurrentPage(1);
    };

    const handleSearchChange = (e) => {
        setSearchQuery(e.target.value);
        setCurrentPage(1);
    };

    const handleStartDateChange = (value) => {
        setStartDate(value);
        setCurrentPage(1);
    };

    const handleEndDateChange = (value) => {
        setEndDate(value);
        setCurrentPage(1);
    };

    //filtering
    const filteredCustomers = customers.filter((customer) => {
        const matchesQuery = (field) => {
            if (!searchQuery || field === undefined || field === null) return false;

            const fieldStr = field.toString().toLowerCase();
            const searchWords = searchQuery
                .toLowerCase()
                .split(/\s*\*\s*/) // split by `*` with optional spaces
                .filter(word => word.trim().length > 0);

            return searchWords.every(word => fieldStr.includes(word));
        };

        const matchesSearch = searchQuery
            ? matchesQuery(customer.customer_id) ||
            matchesQuery(customer.customer_name) ||
            matchesQuery(customer.email) ||
            matchesQuery(customer.phone_number)
            : true;

        const matchesStatusFilter = statusFilter
            ? customer.account_status === statusFilter
            : true;

        const matchesTodayFilter = !isTodaySelected || isDateWithinRange(customer.created_at, startDate, endDate);

        return matchesSearch && matchesStatusFilter && matchesTodayFilter;
    });

    //pagination
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;
    const indexOfLastItem = currentPage * itemsPerPage;
    const indexOfFirstItem = indexOfLastItem - itemsPerPage;
    const currentCustomers = filteredCustomers.slice(indexOfFirstItem, indexOfLastItem);
    const totalPages = Math.ceil(filteredCustomers.length / itemsPerPage);
    const blankRows = itemsPerPage - currentCustomers.length;

    const handleEditClick = (customer) => {
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
            fetchAllCustomers();
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
            fetchAllCustomers();
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
                {hasPermission("SalesRetail_Customer_Create") && (
                    <button className="flex flex-row gap-x-3 items-center bg-white h-fit text-primary font-semibold text-xl py-2 px-3 rounded-full border border-primary cursor-pointer" onClick={() => setShowCreateCustomerDialog(true)}><BiPlus /> Add New Customer</button>
                )}
            </div>

            {/* Detail Section */}
            <div className="grid grid-cols-4 gap-x-10">
                <DetailsCard
                    title={"Total Customers"}
                    value={totalCustomers?.total_customers ?? 0}
                    label1={"Orders Placed Today"}
                    value1={totalCustomers?.order_placed_today_customers ?? 0}
                    label2={"Orders Placed Percentage"}
                    value2={`${totalCustomers?.order_placed_percentage.toFixed(2) ?? 0} %`}
                    extraDetails={true}
                />

                <DetailsCard
                    title={"New Customers Today"}
                    value={newCustomers?.today_new_customers ?? 0}
                    label1={"Orders Placed Today"}
                    value1={newCustomers?.new_customers_orders ?? 0}
                    label2={"Orders Placed Percentage"}
                    value2={`${newCustomers?.today_new_customers_percentage.toFixed(2) ?? 0} %`}
                    extraDetails={true}
                />

                <DetailsCard
                    title={"Top Customers"}
                    value={topCustomers?.top_customers ?? 0}
                    label1={"Total Customers"}
                    value1={topCustomers?.total_customers ?? 0}
                    label2={"Top Percentage"}
                    value2={`${topCustomers?.top_customers_percentage.toFixed(2) ?? 0} %`}
                    extraDetails={true}
                />

                <DetailsCard
                    title={"Frequent Visitors"}
                    value={"5"}
                    label1={"Total Customers"}
                    value1={"2000"}
                    label2={"Frequent Percentage"}
                    value2={"6%"}
                    extraDetails={true}
                />
            </div>

            <div className="w-full border-b border-primary">
                <p className="border-b-3 border-black w-fit px-1 text-2xl font-semibold">Customers</p>
            </div>

            {/* Filter Section */}
            <div className="flex flex-row flex-wrap gap-x-5 gap-y-3">
                <div className="flex flex-row border border-primary rounded-full h-fit w-1/2 bg-white">
                    <div className="flex justify-center items-center rounded-l-full px-5">
                        <MdSearch className="size-6 text-primary" />
                    </div>

                    <input
                        className={`grow h-fit px-3 py-1 text-lg rounded-r-full border border-transparent focus:outline-none`}
                        type="text"
                        value={searchQuery}
                        onChange={handleSearchChange}
                        placeholder="Search Customers here..."
                    />
                </div>

                <div className="basis-full h-0" aria-hidden="true" />

                <DateRangeFilter
                    startDate={startDate}
                    endDate={endDate}
                    onStartDateChange={handleStartDateChange}
                    onEndDateChange={handleEndDateChange}
                    isActive={isTodaySelected}
                />

                <FilterSelector
                    options={statusOptions}
                    value={statusFilter}
                    onChange={handleStatusFilterChange}
                />
            </div>

            {isLoading ?
                <div className="flex items-center justify-center py-20 bg-white rounded-xl">
                    <BeatLoader color="#1470F9" size={20} />
                </div> :
                <div className="rounded-xl bg-white overflow-hidden">
                    <div className="text-sm grid grid-cols-11 gap-x-3 text-white bg-primary font-semibold py-2 [&>p]:text-center [&>p]:px-1">
                        <p></p>
                        <p className="col-span-1">ID</p>
                        <p className="col-span-2 !text-start">NAME</p>
                        <p className="col-span-2 !text-start">EMAIL</p>
                        <p>PHONE</p>
                        <p className="col-span-2">ADDRESS</p>
                        <p className="col-span-2">ACTION</p>
                    </div>

                    {currentCustomers.map((customer, index) => (
                        <div key={index} className={`grid grid-cols-11 gap-x-3 text-xs py-1.5 ${index % 2 === 0 ? "bg-white" : "bg-primary/10"} items-center`}>
                            <Icon icon={"lucide:user"} className="text-primary bg-primary/20 rounded-full size-7 my-auto mx-auto p-1" />
                            <p className="col-span-1 text-center">{customer.customer_id}</p>
                            <p className="col-span-2">{customer.customer_name}</p>
                            <p className="col-span-2">{customer.email}</p>
                            <p className="text-center">{customer.phone_number}</p>
                            <p className="col-span-2 text-center">{customer.address}</p>
                            <div className="col-span-2 flex flex-row gap-x-2 justify-center items-center">
                                {hasPermission("SalesRetail_Customer_Edit") && customer.account_status === "Active" &&
                                    <div
                                        className="flex flex-row items-center gap-x-1 cursor-pointer"
                                        onClick={() => {
                                            setSelectedCustomer(customer);
                                            setShowDeactivateConfirmationDialog(true);
                                        }}
                                    >
                                        <div className="flex flex-row bg-green-400 rounded-full p-0.5 w-6">
                                            <div className="h-2.5 w-2.5 rounded-full bg-white ms-auto"></div>
                                        </div>
                                        <p className="text-sm">Active</p>
                                    </div>
                                }

                                {hasPermission("SalesRetail_Customer_Edit") && customer.account_status === "Deactive" &&
                                    <div
                                        className="flex flex-row items-center gap-x-1 cursor-pointer"
                                        onClick={() => {
                                            setSelectedCustomer(customer);
                                            setShowActivateConfirmationDialog(true);
                                        }}
                                    >
                                        <div className="flex flex-row bg-red-400 rounded-full p-0.5 w-6">
                                            <div className="h-2.5 w-2.5 rounded-full bg-white me-auto"></div>
                                        </div>
                                        <p className="text-sm">Deactive</p>
                                    </div>
                                }

                                {hasPermission("SalesRetail_Customer_Edit") && (
                                    <>
                                        <div className="h-5 border border-black/50" />
                                        <div className="flex flex-row items-center gap-x-1 cursor-pointer" onClick={() => handleEditClick(customer)}>
                                            <Icon icon={"iconamoon:edit-fill"} className="text-green-500 text-base" />
                                            <p className="text-sm">Edit</p>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    ))}

                    {/* Render blank rows */}
                    {Array.from({ length: blankRows > 0 ? blankRows : 0 }).map((_, idx) => (
                        <div
                            key={`blank-${idx}`}
                            className={`grid grid-cols-11 gap-x-3 text-xs py-1.5 ${(currentCustomers.length + idx) % 2 === 0 ? "bg-white" : "bg-primary/10"
                                } items-center`}
                        >
                            <div className="col-span-11 h-8"></div>
                        </div>
                    ))}
                </div>
            }

            {/* Pagination */}
            <div className="flex flex-row justify-between items-center">
                <p className="text-base text-black/50">
                    Showing {currentCustomers.length} materials
                </p>

                <div className="flex justify-end gap-2 flex-wrap">
                    <button
                        onClick={() => setCurrentPage(1)}
                        disabled={currentPage === 1}
                        className="px-3 py-1 rounded-lg bg-white text-primary disabled:opacity-50 border border-primary/20"
                    >
                        First
                    </button>

                    <button
                        onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                        disabled={currentPage === 1}
                        className="px-3 py-1 rounded-lg bg-white text-primary disabled:opacity-50 border border-primary/20"
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
                                    className={`px-3 py-1 rounded-lg border border-primary/20 ${currentPage === 1
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
                                    className={`px-3 py-1 rounded-lg border border-primary/20 ${i === currentPage
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
                                    className={`px-3 py-1 rounded-lg border border-primary/20 ${currentPage === totalPages
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
                        className="px-3 py-1 rounded-lg bg-white text-primary disabled:opacity-50 border border-primary/20"
                    >
                        Next
                    </button>

                    <button
                        onClick={() => setCurrentPage(totalPages)}
                        disabled={currentPage === totalPages}
                        className="px-3 py-1 rounded-lg bg-white text-primary disabled:opacity-50 border border-primary/20"
                    >
                        Last
                    </button>
                </div>
            </div>

            {showCreateCustomerDialog &&
                <RetailCustomerCreateDialog
                    handleClose={() => {
                        setShowCreateCustomerDialog(false);
                        fetchAllCustomers();
                    }}
                />
            }

            {showUpdateCustomerDialog &&
                <RetailCustomerUpdateDialog customer={selectedCustomer}
                    handleClose={() => {
                        setShowUpdateCustomerDialog(false);
                        fetchAllCustomers();
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

export default SalesRetailCustomers;