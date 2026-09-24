import { Icon } from "@iconify/react/dist/iconify.js";
import { HiOutlineArrowCircleLeft } from "react-icons/hi";
import { useNavigate } from "react-router-dom";
import { getAllUserRoles } from "../../../services/UserServices";
import { useEffect, useState } from "react";
import { ImCheckboxChecked, ImCheckboxUnchecked } from "react-icons/im";
import Select from "react-select";
import { getCopCusWiseDailySalesReport, getItemWiseSalesReport, getPendingOrderReport, getYTDCusWiseSalesReport } from "../../../services/ReportServices";
import { BeatLoader } from "react-spinners";
import { getAllCustomers } from "../../../services/CustomerServices";
import { getAllItemTypes } from "../../../services/Retail/RetailSettingsServices";

const ItemWiseSalesReport = () => {
    const navigate = useNavigate();
    const [data, setData] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isLoadingCustomers, setIsLoadingCustomers] = useState(false);
    const [customers, setCustomers] = useState([]);
    const [selectedCustomer, setSelectedCustomer] = useState("");
    const [isLoadingItemTypes, setIsLoadingItemTypes] = useState(false);
    const [itemTypes, setItemTypes] = useState([]);
    const [selectedItemType, setSelectedItemType] = useState("");
    const [selectedStartDate, setSelectedStartDate] = useState("");
    const [selectedEndDate, setSelectedEndDate] = useState("");

    const [reportColumns, setReportColumns] = useState(
        [
            { name: "Date", state: true },
            { name: "Invoice ID", state: true },
            { name: "Customer ID", state: true },
            { name: "Company Name", state: true },
            { name: "Customer Name", state: true },
            { name: "Service Type", state: true },
            { name: "Item ID", state: true },
            { name: "Item Name", state: true },
            { name: "Category ID", state: true },
            { name: "Category Name", state: true },
            { name: "Quantity", state: true },
            { name: "Rate", state: true },
            { name: "Total Amount", state: true },
            { name: "Discount", state: true },
            { name: "Discount Amount", state: true },
            { name: "Total Bill Amount", state: true },
        ]
    );

    const selectStyles = {
        control: (base, state) => ({
            ...base,
            backgroundColor: "white",
            borderRadius: "0.75rem", // rounded-xl
            borderColor: state.isFocused ? "#1470F9" : "#d1d5db", // gray-300
            padding: "0rem 0.25rem", // py-2 px-3
            boxShadow: "none",
            "&:hover": {
                borderColor: state.isFocused ? "#1470F9" : "#d1d5db",
            },
        }),
        placeholder: (base) => ({
            ...base,
            color: "#6B7280", // gray-400
        }),
        singleValue: (base) => ({
            ...base,
            color: "#000000",
        }),
    };

    const selectFilter = (option, inputValue) => {
        const searchWords = inputValue
            .toLowerCase()
            .split(/\s*\*\s*/)
            .filter(word => word.trim().length > 0);

        const label = option.label.toLowerCase();

        return searchWords.every(word => label.includes(word));
    };

    const fetchReportData = async (month, year) => {
        try {
            setIsLoading(true);
            const payload = {
                user_id: localStorage.getItem("userId"),
            }
            const response = await getItemWiseSalesReport(payload);

            const separatedItems = response.data.data.flatMap(invoice =>
                invoice.items.map(item => ({
                    company_name: invoice.company_name,
                    customer_name: invoice.customer_name,
                    customer_id: invoice.customer_id,
                    invoice_id: invoice.invoice_id,
                    created_at: invoice.created_at.split("T")[0],
                    discount: invoice.is_discount_percentage === 1 ? `${Number(invoice.discount)}%` : Number(invoice.discount),
                    is_discount_percentage: invoice.is_discount_percentage,
                    discount_amount: invoice.is_discount_percentage === 1 ? item.amount * Number(invoice.discount) / 100 : Number(invoice.discount),
                    total_amount: invoice.is_discount_percentage === 1 ? item.amount * (100 - Number(invoice.discount)) / 100 : item.amount - Number(invoice.discount),
                    ...item,
                }))
            );

            setData(separatedItems);
        } catch (error) {
            console.error("Error fetching report data: ", error);
        } finally {
            setIsLoading(false);
        }
    };

    const fetchAllCustomers = async () => {
        try {
            setIsLoadingCustomers(true);
            const payload = {
                user_id: localStorage.getItem("userId"),
                customer_type: "Cooperate",
                branch_id: -1,
            };

            const response = await getAllCustomers(payload);
            const filtered = response.data.allCustomers.filter(customer => customer.customer_type === "Cooperate");
            setCustomers(filtered);
        } catch (error) {
            console.error("Error fetching customers: ", error);
        } finally {
            setIsLoadingCustomers(false);
        }
    };

    const fetchItemTypes = async () => {
        try {
            setIsLoadingItemTypes(true);
            const response = await getAllItemTypes(localStorage.getItem("userId"));
            setItemTypes(response.data.item_types);
        } catch (error) {
            console.error("Error fetching item types: ", error);
        } finally {
            setIsLoadingItemTypes(false);
        }
    };

    useEffect(() => {
        fetchReportData();
        fetchAllCustomers();
        fetchItemTypes();
    }, []);

    const customerOptions = customers.map(customer => ({
        label: `${customer.company_name} - ${customer.customer_name}`,
        value: customer.customer_id,
    }));

    const itemTypeOptions = itemTypes.map(item => ({
        label: item.item_type_name,
        value: item.item_type_id,
    }));

    const handleMonthSelect = (value) => {
        setMonth(value);

        const [year, month] = value.split("-");

        fetchReportData(month, year);
    };

    const handleCheckboxChange = (index) => {
        setReportColumns(prev =>
            prev.map((col, i) =>
                i === index ? { ...col, state: !col.state } : col
            )
        );
    };

    //filtering
    const filteredData = data.filter((d) => {
        const matchesCustomerFilter = selectedCustomer
            ? d.customer_id === selectedCustomer
            : true;

        const matchesItemFilter = selectedItemType
            ? d.item_id === selectedItemType
            : true;

        const matchesDateFilter = selectedStartDate && selectedEndDate
            ? d.created_at.split("T")[0] >= selectedStartDate &&
            d.created_at.split("T")[0] <= selectedEndDate
            : true;

        return matchesCustomerFilter && matchesItemFilter && matchesDateFilter;
    });

    const handleCheckAllChange = () => {
        setReportColumns(prev =>
            prev.map(col => ({ ...col, state: true }))
        );
    };

    const exportCSV = () => {
        const headers = reportColumns
            .filter(col => col.state)
            .map(col => col.name);

        const columnKeyMap = {
            "Date": data => data.created_at,
            "Invoice ID": data => data.invoice_id,
            "Customer ID": data => data.customer_id,
            "Company Name": data => data.company_name,
            "Customer Name": data => data.customer_name,
            "Service Type": data => data.service_type_name,
            "Item ID": data => data.item_id,
            "Item Name": data => data.item_name,
            "Category ID": data => data.item_category_id,
            "Category Name": data => data.item_category,
            "Quantity": data => data.quantity,
            "Rate": data => data.rate,
            "Total Amount": data => data.amount,
            "Discount": data => data.discount,
            "Discount Amount": data => data.discount_amount,
            "Total Bill Amount": data => data.total_amount,
        };

        const csvRows = [];

        filteredData.forEach(row => {
            const products = row.product && row.product.length > 0 ? row.product : [null];

            products.forEach(product => {
                const csvRow = headers.map(header => {
                    const getter = columnKeyMap[header];
                    return `"${getter ? getter(row) ?? "" : ""}"`;
                }).join(",");
                csvRows.push(csvRow);
            });
        });

        const csvContent = [headers.join(","), ...csvRows].join("\n");

        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", "Item_Wise_Sales_Report.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    //pagination
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;
    const indexOfLastItem = currentPage * itemsPerPage;
    const indexOfFirstItem = indexOfLastItem - itemsPerPage;
    const currentData = filteredData.slice(indexOfFirstItem, indexOfLastItem);
    const totalPages = Math.ceil(filteredData.length / itemsPerPage);
    const blankRows = itemsPerPage - currentData.length;

    return (
        <div className="flex flex-col">
            {/* Header Section */}
            <div className="flex flex-row gap-x-3 items-center">
                <HiOutlineArrowCircleLeft className="size-6 text-primary cursor-pointer" onClick={() => navigate(`/salesCorporate/corporate/report`)} />
                <h1 className="text-3xl text-primary font-bold">Item Wise Sales Report</h1>
            </div>
            <p className="text-black/50 text-xl mb-5">Record new laundry pickup with item counts by category.</p>

            {/* Filter Section */}
            <div className="flex flex-col rounded-xl bg-white border border-dashed py-5 px-10 gap-y-5 mb-5">
                <h2 className="text-2xl font-semibold">Filter Options</h2>

                {/* Date Filter */}
                <div className="flex flex-col gap-y-3">
                    <div className="flex flex-row items-center gap-x-2">
                        <Icon icon="mdi:calendar" className="text-xl" />
                        <p className="text-xl font-semibold">Date Range</p>
                        <button className="ms-auto hover:text-red-500" onClick={() => setSelectedCustomer("")}>Clear</button>
                    </div>

                    <div className="grid grid-cols-2 gap-x-10">
                        <div className="flex flex-col gap-y-1">
                            <label htmlFor="startDate" className="text-lg">Start Date</label>
                            <input id="startDate" type="date" className="px-4 py-1 text-xl border border-black/20 rounded-lg bg-white" onChange={(e) => setSelectedStartDate(e.target.value)} value={selectedStartDate} />
                        </div>

                        <div className="flex flex-col gap-y-1">
                            <label htmlFor="endDate" className="text-lg">End Date</label>
                            <input id="endDate" type="date" className="px-4 py-1 text-xl border border-black/20 rounded-lg bg-white" onChange={(e) => setSelectedEndDate(e.target.value)} value={selectedEndDate} />
                        </div>
                    </div>
                </div>

                {/* Customer Filter */}
                <div className="flex flex-col gap-y-3">
                    <div className="flex flex-row items-center gap-x-2">
                        <Icon icon="mingcute:search-line" className="text-xl" />
                        <p className="text-xl font-semibold">Customer Information</p>
                        <button className="ms-auto hover:text-red-500" onClick={() => setSelectedCustomer("")}>Clear</button>
                    </div>

                    <Select
                        className="col-span-3 w-full"
                        styles={selectStyles}
                        filterOption={selectFilter}
                        placeholder="Search by Customer Name or ID"
                        options={customerOptions}
                        value={customerOptions.find(
                            option => option.value === selectedCustomer
                        ) || null}
                        onChange={(option) =>
                            setSelectedCustomer(option ? option.value : "")
                        }
                    />
                </div>

                {/* Item Filter */}
                <div className="flex flex-col gap-y-3">
                    <div className="flex flex-row items-center gap-x-2">
                        <Icon icon="mingcute:search-line" className="text-xl" />
                        <p className="text-xl font-semibold">Item Information</p>
                        <button className="ms-auto hover:text-red-500" onClick={() => setSelectedItemType("")}>Clear</button>
                    </div>

                    <Select
                        className="col-span-3 w-full"
                        styles={selectStyles}
                        filterOption={selectFilter}
                        placeholder="Search by Item name or ID"
                        options={itemTypeOptions}
                        value={itemTypeOptions.find(
                            option => option.value === selectedItemType
                        ) || null}
                        onChange={(option) =>
                            setSelectedItemType(option ? option.value : "")
                        }
                    />
                </div>
            </div>

            <div className="bg-primary/10 rounded-xl py-5 mb-5">
                <div className="flex flex-row items-center gap-x-5 px-5">
                    <h3 className="text-2xl font-semibold">Report Data</h3>

                    <button className="flex flex-row items-center bg-primary text-white text-xl font-semibold ms-auto py-2 px-5 rounded-full" onClick={exportCSV}><Icon icon={'material-symbols:download'} />Export</button>
                </div>

                <div className="flex flex-col gap-x-3 text-xl px-5">
                    <h4 className="text-black font-semibold">Customize Columns</h4>

                    {reportColumns.every(col => col.state === true)
                        ? <div className="flex flex-row gap-x-2 items-center">
                            < ImCheckboxChecked
                                className="text-dashboard-green cursor-pointer size-4"
                                onClick={() => handleCheckAllChange(false)}
                            />
                            <p>All</p>
                        </div>
                        : <div className="flex flex-row gap-x-2 items-center">
                            < ImCheckboxUnchecked
                                className="text-black cursor-pointer size-4"
                                onClick={() => handleCheckAllChange(true)}
                            />
                            <p>All</p>
                        </div>
                    }

                    <div className="grid grid-cols-4">
                        {reportColumns.map((column, index) => {
                            return column.state
                                ? <div key={index} className="flex flex-row gap-x-2 items-center">
                                    < ImCheckboxChecked
                                        key={index}
                                        className="text-dashboard-green cursor-pointer size-4"
                                        onClick={() => handleCheckboxChange(index)}
                                    />
                                    <p>{column.name}</p>
                                </div>
                                : <div key={index} className="flex flex-row gap-x-2 items-center">
                                    < ImCheckboxUnchecked
                                        key={index}
                                        className="text-black cursor-pointer size-4"
                                        onClick={() => handleCheckboxChange(index)}
                                    />
                                    <p>{column.name}</p>
                                </div>
                        })}
                    </div>
                </div>
            </div>

            {/* Data Section */}
            {isLoading ?
                <div className="flex items-center justify-center py-20 bg-white border border-primary rounded-xl">
                    <BeatLoader color="#1470F9" size={20} />
                </div> :
                <div className="w-full overflow-x-auto">
                    <table className="w-full border border-primary text-base rounded-xl overflow-hidden">
                        <thead>
                            <tr className="text-xl text-white bg-primary font-semibold py-2 px-5 h-10">
                                {reportColumns.map(column =>
                                    column.state &&
                                    <th className={`px-5 text-start min-w-40 uppercase`} key={column.name}>{column.name}</th>
                                )}
                            </tr>
                        </thead>
                        <tbody>
                            {[...Array(10)].map((_, index) => {
                                const data = currentData[index];

                                return (
                                    <tr key={index} className={`text-lg py-1.5 px-5 h-10 ${index % 2 === 0 ? "bg-white" : "bg-primary/10"} items-center`}>
                                        {reportColumns[0].state && <td className="px-5 py-2">{data?.created_at}</td>}
                                        {reportColumns[1].state && <td className="px-5 py-2">{data?.invoice_id}</td>}
                                        {reportColumns[2].state && <td className="px-5 py-2">{data?.customer_id}</td>}
                                        {reportColumns[3].state && <td className="px-5 py-2">{data?.company_name}</td>}
                                        {reportColumns[4].state && <td className="px-5 py-2">{data?.customer_name}</td>}
                                        {reportColumns[5].state && <td className="px-5 py-2">{data?.service_type_name}</td>}
                                        {reportColumns[6].state && <td className="px-5 py-2">{data?.item_id}</td>}
                                        {reportColumns[7].state && <td className="px-5 py-2">{data?.item_name}</td>}
                                        {reportColumns[8].state && <td className="px-5 py-2">{data?.item_category_id}</td>}
                                        {reportColumns[9].state && <td className="px-5 py-2">{data?.item_category}</td>}
                                        {reportColumns[10].state && <td className="px-5 py-2">{data?.quantity}</td>}
                                        {reportColumns[11].state && <td className="px-5 py-2">{data?.rate ? Number(data?.rate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ""}</td>}
                                        {reportColumns[12].state && <td className="px-5 py-2">{data?.amount ? Number(data?.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ""}</td>}
                                        {reportColumns[13].state && <td className="px-5 py-2">{data?.discount}</td>}
                                        {reportColumns[14].state && <td className="px-5 py-2">{data?.discount_amount}</td>}
                                        {reportColumns[15].state && <td className="px-5 py-2">{data?.total_amount}</td>}
                                    </tr>
                                )

                            })}
                        </tbody>
                    </table>
                </div>
            }

            {/* Pagination */}
            <div className="flex flex-row justify-between items-center my-5">
                <p className="text-base text-black/50">
                    Showing {currentData.length} materials
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
        </div>
    );
};

export default ItemWiseSalesReport;