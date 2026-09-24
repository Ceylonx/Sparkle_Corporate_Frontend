import { Icon } from "@iconify/react/dist/iconify.js";
import { Link } from "react-router-dom";

const reportCards = [
    {
        title: "Corporate Customer Wise Sales Report",
        subtitle: "( Amount / Weight / Pcs )",
        icon: "mdi:clock-outline",
        color: "border-blue-400",
        iconColor: "text-blue-500",
        path: "/salesCorporate/corporate/report/cop-cus-wise-daily-sales-report",
    },
    {
        title: "Corporate Customer Wise Sales Report",
        subtitle: "Summary ( Amount / Weight / Pcs )",
        icon: "mdi:calendar",
        color: "border-green-400",
        iconColor: "text-green-500",
        path: "/salesCorporate/corporate/report/ytd-cus-wise-sales-report",
    },
    {
        title: "Corporate Customer Wise / Item Wise Sales Report",
        subtitle: "",
        icon: "mdi:file-document-outline",
        color: "border-purple-400",
        iconColor: "text-purple-500",
        path: "/salesCorporate/corporate/report/item-wise-sales-report",
    },
    {
        title: "YTD Corporates Revenue",
        subtitle: "",
        icon: "mdi:clock-outline",
        color: "border-red-400",
        iconColor: "text-red-500",
        path: "/salesCorporate/corporate/report/ytd-revenue",
    },
    {
        title: "Item Wise Sales Report",
        subtitle: "",
        icon: "mdi:calendar-month-outline",
        color: "border-orange-400",
        iconColor: "text-orange-500",
        path: "/salesCorporate/corporate/report/item-wise-sales-report",
    },
    {
        title: "Item Wise Sales Order Report",
        subtitle: "",
        icon: "mdi:file-outline",
        color: "border-blue-500",
        iconColor: "text-blue-500",
        path: "/salesCorporate/corporate/report/item-wise-sales-order",
    },
    {
        title: "Invoice Wise Sales Report",
        subtitle: "",
        icon: "mdi:email-outline",
        color: "border-pink-400",
        iconColor: "text-pink-500",
        path: "/salesCorporate/corporate/report/invoice-wise-sales-report",
    },
    {
        title: "Invoice Wise Sales Order Report",
        subtitle: "",
        icon: "mdi:wrench-outline",
        color: "border-gray-400",
        iconColor: "text-gray-700",
        path: "/salesCorporate/corporate/report/invoice-wise-sales-order",
    },
    {
        title: "Pending Order Repot – Corporate",
        subtitle: "",
        icon: "mdi:file-document-outline",
        color: "border-purple-300",
        iconColor: "text-purple-500",
        path: "/salesCorporate/corporate/report/pending-order-report",
    },
    {
        title: "Delivery Date Report",
        subtitle: "",
        icon: "mdi:email-outline",
        color: "border-pink-400",
        iconColor: "text-pink-500",
        path: "/salesCorporate/corporate/report/delivery-date-report",
    },
];

const SalesCorporateReport = () => {
    return (
        <div className="flex flex-col gap-y-6">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold text-primary">Report</h1>
                <p className="text-xl text-black/50">
                    Record new laundry pickup with item counts by category
                </p>
            </div>

            {/* Cards */}
            <div className="grid grid-cols-3 gap-6">
                {reportCards.map((card, index) => (
                    <Link
                        key={index}
                        to={card.path}
                        className={`flex items-center gap-5 bg-white rounded-2xl px-6 py-8 border-1 ${card.color} shadow-sm hover:shadow-md transition`}
                    >
                        <Icon
                            icon={card.icon}
                            className={`${card.iconColor} size-10`}
                        />

                        <div className="flex flex-col">
                            <h2 className="text-xl font-semibold leading-snug">
                                {card.title}
                            </h2>
                            {card.subtitle && (
                                <p className="text-sm text-black/50">
                                    {card.subtitle}
                                </p>
                            )}
                        </div>
                    </Link>
                ))}
            </div>
        </div>
    );
};

export default SalesCorporateReport;