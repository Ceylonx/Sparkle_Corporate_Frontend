import { Icon } from "@iconify/react/dist/iconify.js";
import { HiOutlineArrowCircleLeft } from "react-icons/hi";
import { useNavigate } from "react-router-dom";
import { getAllUserRoles } from "../../../services/UserServices";
import { useEffect, useState } from "react";
import { ImCheckboxChecked, ImCheckboxUnchecked } from "react-icons/im";
import Select from "react-select";
import { getCopCusWiseDailySalesReport, getPendingOrderReport, getYTDCusWiseSalesReport } from "../../../services/ReportServices";
import { BeatLoader } from "react-spinners";

const PendingOrderReport = () => {
    const navigate = useNavigate();
    const [data, setData] = useState([]);
    const [isLoading, setIsLoading] = useState(false);

    const [reportColumns, setReportColumns] = useState(
        [
            { name: "Customer Name", state: true },
            { name: "Customer ID", state: true },
            { name: "Pending Orders", state: true },
            { name: "Pending Total", state: true },
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
            const response = await getPendingOrderReport(payload);

            setData(response.data.pending_orders);
        } catch (error) {
            console.error("Error fetching report data: ", error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchReportData();
    }, []);

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

    const handleCheckAllChange = () => {
        setReportColumns(prev =>
            prev.map(col => ({ ...col, state: true }))
        );
    };

    const exportCSV = () => {
        const quotationStatusHeaders = reportColumns
            .filter(col => col.state)
            .map(col => col.name);

        const quotationStatusColumnKeyMap = {
            "Customer Name": data => data.company_name,
            "Customer ID": data => data.customer_id,
            "Pending Orders": data => data.pending_orders,
            "Pending Total": data => data.pending_total,
        };

        const quotationStatusCsvRows = [];

        data.forEach(row => {
            const products = row.product && row.product.length > 0 ? row.product : [null];

            products.forEach(product => {
                const csvRow = quotationStatusHeaders.map(header => {
                    const getter = quotationStatusColumnKeyMap[header];

                    if (header === "Product Description" && product) {
                        return `"${product.item}"`; // individual product
                    } else if (header === "Quantity" && product) {
                        return `"${product.quantity}"`; // optional per product quantity
                    } else {
                        return `"${getter ? getter(row) ?? "" : ""}"`; // repeat quotation info
                    }
                }).join(",");
                quotationStatusCsvRows.push(csvRow);
            });
        });

        const quotationStatusCsvContent = [quotationStatusHeaders.join(","), ...quotationStatusCsvRows].join("\n");

        const quotationStatusBlob = new Blob([quotationStatusCsvContent], { type: "text/csv;charset=utf-8;" });
        const quotationStatusUrl = URL.createObjectURL(quotationStatusBlob);
        const quotationStatusLink = document.createElement("a");
        quotationStatusLink.setAttribute("href", quotationStatusUrl);
        quotationStatusLink.setAttribute("download", "Pending_Orders.csv");
        document.body.appendChild(quotationStatusLink);
        quotationStatusLink.click();
        document.body.removeChild(quotationStatusLink);
    };

    //pagination
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;
    const indexOfLastItem = currentPage * itemsPerPage;
    const indexOfFirstItem = indexOfLastItem - itemsPerPage;
    const currentData = data.slice(indexOfFirstItem, indexOfLastItem);
    const totalPages = Math.ceil(data.length / itemsPerPage);
    const blankRows = itemsPerPage - currentData.length;

    return (
        <div className="flex flex-col">
            {/* Header Section */}
            <div className="flex flex-row gap-x-3 items-center">
                <HiOutlineArrowCircleLeft className="size-6 text-primary cursor-pointer" onClick={() => navigate(`/salesCorporate/corporate/report`)} />
                <h1 className="text-3xl text-primary font-bold">Pending Order Report</h1>
            </div>
            <p className="text-black/50 text-xl mb-5">Record new laundry pickup with item counts by category.</p>

            {/* Filter Section */}
            <div className="flex flex-col rounded-xl bg-white border border-dashed py-5 px-10 gap-y-5 mb-5">
                <h2 className="text-2xl font-semibold">Filter Options</h2>

                {/* Customer Filter */}
                <div className="flex flex-col gap-y-3">
                    <div className="flex flex-row items-center gap-x-2">
                        <Icon icon="mingcute:search-line" className="text-xl" />
                        <p className="text-xl font-semibold">Customer Information</p>
                    </div>

                    <Select
                        className="col-span-3 w-full"
                        styles={selectStyles}
                        filterOption={selectFilter}
                        placeholder="Search by Customer Name or ID"
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
                                        {reportColumns[0].state && <td className="px-5 py-2">{data?.company_name}</td>}
                                        {reportColumns[1].state && <td className="px-5 py-2">{data?.customer_id}</td>}
                                        {reportColumns[2].state && <td className="px-5 py-2">{data?.pending_orders}</td>}
                                        {reportColumns[3].state && <td className="px-5 py-2">{data?.pending_total ? Number(data?.pending_total).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ""}</td>}
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

export default PendingOrderReport;