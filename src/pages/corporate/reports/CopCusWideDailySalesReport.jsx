import { Icon } from "@iconify/react/dist/iconify.js";
import { HiOutlineArrowCircleLeft } from "react-icons/hi";
import { useNavigate } from "react-router-dom";
import { getAllUserRoles } from "../../../services/UserServices";
import { useEffect, useState } from "react";
import { ImCheckboxChecked, ImCheckboxUnchecked } from "react-icons/im";
import Select from "react-select";
import { getCopCusWiseDailySalesReport } from "../../../services/ReportServices";
import { BeatLoader } from "react-spinners";

const CopCusWideDailySalesReport = () => {
    const navigate = useNavigate();
    const [month, setMonth] = useState("");
    const [data, setData] = useState([]);
    const [isLoading, setIsLoading] = useState(false);

    const [reportColumns, setReportColumns] = useState(
        [
            { name: "Customer Name", state: true },
            { name: "Customer ID", state: true },
            { name: "No of Invoices", state: true },
            { name: "Sales", state: true },
        ]
    );

    function getOrdinal(n) {
        if (n === 1) return "st";
        if (n === 2) return "nd";
        if (n === 3) return "rd";
        return "th";
    }

    const fetchReportData = async (month, year) => {
        try {
            setIsLoading(true);
            const payload = {
                user_id: localStorage.getItem("userId"),
                branch_id: 1,
                year: year,
                month: month
            }
            const response = await getCopCusWiseDailySalesReport(payload);

            const daysInMonth = new Date(year, month, 0).getDate();

            const columns = [{ name: "Customer Name", state: true }];

            let week = 1;
            for (let day = 1; day <= daysInMonth; day++) {
                columns.push({ name: `${day}`, state: true });

                // After every 7th day, add a week column
                if (day % 7 === 0 || day === daysInMonth) {
                    columns.push({ name: `${week}${getOrdinal(week)} Week`, state: true });
                    week++;
                }
            }

            setReportColumns(columns);

            // Helper function to get week number (1-based) of a day in month
            function getWeekNumber(day) {
                return Math.ceil(day / 7);
            }

            // Map sales to customer-wise structure
            const customerSales = {};

            response.data.data.forEach(({ customer_id, company_name, sale_date, daily_total }) => {
                const date = new Date(sale_date);
                const day = date.getDate();
                const total = parseFloat(daily_total);

                if (!customerSales[customer_id]) {
                    // Initialize
                    customerSales[customer_id] = {
                        customer_id,
                        company_name,
                        dailySales: Array(daysInMonth).fill(0),
                        weeklySales: Array(Math.ceil(daysInMonth / 7)).fill(0)
                    };
                }

                // Set daily sale
                customerSales[customer_id].dailySales[day - 1] += total;

                // Add to weekly sale
                const week = getWeekNumber(day);
                customerSales[customer_id].weeklySales[week - 1] += total;
            });

            // Convert object to array
            const result = Object.values(customerSales);

            const totalRow = {
                customer_id: "TOTAL",
                company_name: "Total",
                dailySales: Array(daysInMonth).fill(0),
                weeklySales: Array(Math.ceil(daysInMonth / 7)).fill(0)
            };

            // Sum daily and weekly sales across all customers
            result.forEach(cust => {
                cust.dailySales.forEach((value, idx) => {
                    totalRow.dailySales[idx] += value;
                });
                cust.weeklySales.forEach((value, idx) => {
                    totalRow.weeklySales[idx] += value;
                });
            });

            // Add totalRow at the start of the array
            result.unshift(totalRow);

            setData(result);
        } catch (error) {
            console.error("Error fetching report data: ", error);
        } finally {
            setIsLoading(false);
        }
    };

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
        const headers = reportColumns.map(col => col.name);

        // Create dynamic mapping for each column
        const columnKeyMap = {};
        headers.forEach(colName => {
            if (colName === "Customer Name") {
                columnKeyMap[colName] = row => row.company_name;
            } else if (colName.endsWith("Week")) {
                // Weekly totals
                const weekIndex = parseInt(colName) - 1; // "1st Week" -> index 0
                columnKeyMap[colName] = row => row.weeklySales[weekIndex] ?? 0;
            } else {
                // Daily sales
                const dayIndex = parseInt(colName) - 1; // "1" -> index 0
                columnKeyMap[colName] = row => row.dailySales[dayIndex] ?? 0;
            }
        });

        // Generate CSV rows
        const csvRows = data.map(row => {
            return headers.map(header => columnKeyMap[header](row));
        });

        const csvContent = [headers.join(","), ...csvRows].join("\n");

        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", "Cop_Cus_Wise_Daily_Sales.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
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
                <h1 className="text-3xl text-primary font-bold">Report/Corporate Customer Wise Daily Sales Report</h1>
            </div>
            <p className="text-black/50 text-xl mb-5">Record new laundry pickup with item counts by category.</p>

            {/* Filter Section */}
            <div className="flex flex-col rounded-xl bg-white border border-dashed py-5 px-10 gap-y-5 mb-5">
                <h2 className="text-2xl font-semibold">Filter Options</h2>
                <div className="flex flex-row items-center gap-x-2">
                    <Icon icon="mdi:calendar" className="text-xl" />
                    <p className="text-xl font-semibold">Select Month & Year</p>
                </div>
                <input
                    type="month"
                    value={month}
                    onChange={(e) => handleMonthSelect(e.target.value)}
                    className="px-4 py-1 text-xl border border-black/20 rounded-lg bg-white"
                />
            </div>

            <div className="bg-primary/10 rounded-xl py-5 mb-5">
                <div className="flex flex-row items-center gap-x-5 px-5">
                    <h3 className="text-2xl font-semibold">Report Data</h3>

                    <button className="flex flex-row items-center bg-primary text-white text-xl font-semibold ms-auto py-2 px-5 rounded-full" onClick={exportCSV}><Icon icon={'material-symbols:download'} />Export</button>
                </div>

                {/* <div className="flex flex-col gap-x-3 text-xl px-5">
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
                </div> */}
            </div>

            {/* Data Section */}
            {month === "" ?
                <div className="bg-white rounded-xl border border-primary py-5 mb-5">
                    <p className="text-center">Please select the Month & Year</p>
                </div> :
                isLoading ?
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
                                {currentData.map((data, index) => (
                                    <tr key={index} className={`text-lg py-1.5 px-5 h-10 ${index % 2 === 0 ? "bg-white" : "bg-primary/10"} items-center`}>
                                        {reportColumns[0].state && <td className="px-5 py-2">{data?.company_name}</td>}
                                        {data?.dailySales.length > 1 && <td className="px-5 py-2">{data?.dailySales[0]?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>}
                                        {data?.dailySales.length > 2 && <td className="px-5 py-2">{data?.dailySales[1]?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>}
                                        {data?.dailySales.length > 3 && <td className="px-5 py-2">{data?.dailySales[2]?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>}
                                        {data?.dailySales.length > 4 && <td className="px-5 py-2">{data?.dailySales[3]?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>}
                                        {data?.dailySales.length > 5 && <td className="px-5 py-2">{data?.dailySales[4]?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>}
                                        {data?.dailySales.length > 6 && <td className="px-5 py-2">{data?.dailySales[5]?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>}
                                        {data?.dailySales.length > 7 && <td className="px-5 py-2">{data?.dailySales[6]?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>}
                                        {data?.weeklySales.length > 1 && <td className="px-5 py-2">{data?.weeklySales[0]?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>}
                                        {data?.dailySales.length > 8 && <td className="px-5 py-2">{data?.dailySales[7]?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>}
                                        {data?.dailySales.length > 9 && <td className="px-5 py-2">{data?.dailySales[8]?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>}
                                        {data?.dailySales.length > 10 && <td className="px-5 py-2">{data?.dailySales[9]?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>}
                                        {data?.dailySales.length > 11 && <td className="px-5 py-2">{data?.dailySales[10]?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>}
                                        {data?.dailySales.length > 12 && <td className="px-5 py-2">{data?.dailySales[11]?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>}
                                        {data?.dailySales.length > 13 && <td className="px-5 py-2">{data?.dailySales[12]?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>}
                                        {data?.dailySales.length > 14 && <td className="px-5 py-2">{data?.dailySales[13]?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>}
                                        {data?.weeklySales.length > 2 && <td className="px-5 py-2">{data?.weeklySales[1]?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>}
                                        {data?.dailySales.length > 15 && <td className="px-5 py-2">{data?.dailySales[14]?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>}
                                        {data?.dailySales.length > 16 && <td className="px-5 py-2">{data?.dailySales[15]?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>}
                                        {data?.dailySales.length > 17 && <td className="px-5 py-2">{data?.dailySales[16]?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>}
                                        {data?.dailySales.length > 18 && <td className="px-5 py-2">{data?.dailySales[17]?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>}
                                        {data?.dailySales.length > 19 && <td className="px-5 py-2">{data?.dailySales[18]?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>}
                                        {data?.dailySales.length > 20 && <td className="px-5 py-2">{data?.dailySales[19]?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>}
                                        {data?.dailySales.length > 21 && <td className="px-5 py-2">{data?.dailySales[20]?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>}
                                        {data?.weeklySales.length >= 3 && <td className="px-5 py-2">{data?.weeklySales[2]?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>}
                                        {data?.dailySales.length >= 22 && <td className="px-5 py-2">{data?.dailySales[21]?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>}
                                        {data?.dailySales.length >= 23 && <td className="px-5 py-2">{data?.dailySales[22]?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>}
                                        {data?.dailySales.length >= 24 && <td className="px-5 py-2">{data?.dailySales[23]?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>}
                                        {data?.dailySales.length >= 25 && <td className="px-5 py-2">{data?.dailySales[24]?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>}
                                        {data?.dailySales.length >= 26 && <td className="px-5 py-2">{data?.dailySales[25]?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>}
                                        {data?.dailySales.length >= 27 && <td className="px-5 py-2">{data?.dailySales[26]?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>}
                                        {data?.dailySales.length >= 28 && <td className="px-5 py-2">{data?.dailySales[27]?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>}
                                        {data?.weeklySales.length >= 4 && <td className="px-5 py-2">{data?.weeklySales[3]?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>}
                                        {data?.dailySales.length >= 29 && <td className="px-5 py-2">{data?.dailySales[28]?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>}
                                        {data?.dailySales.length >= 30 && <td className="px-5 py-2">{data?.dailySales[29]?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>}
                                        {data?.dailySales.length >= 31 && <td className="px-5 py-2">{data?.dailySales[30]?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>}
                                        {data?.weeklySales.length >= 5 && <td className="px-5 py-2">{data?.weeklySales[4]?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>}
                                    </tr>
                                ))
                                }
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

export default CopCusWideDailySalesReport;