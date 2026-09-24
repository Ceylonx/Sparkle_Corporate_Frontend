import { BiPlus } from "react-icons/bi";
import DetailsCard from "../../components/ui/DetailsCard";
import { Link, useNavigate } from "react-router-dom";
import { Icon } from "@iconify/react/dist/iconify.js";
import { useEffect, useState } from "react";
import { getRetailDashboardExpressOrders, getRetailDashboardInvoiceSummaries, getRetailDashboardOrderTypeCounts, getRetailDashboardPendingOrders, getRetailDashboardReadyForPickupOrders, getRetailDashboardRecentActivity, getRetailDashboardReleaseTodayOrders, getRetailDashboardTodaySummary } from "../../services/Retail/RetailDashboardServices";
import { hasPermission } from "../../utils/permissionHelper";

const SalesRetailDashboard = () => {
    const navigate = useNavigate();
    const [pendingOrders, setPendingOrders] = useState(null);
    const [readyForPickupOrders, setReadyForPickupOrders] = useState(null);
    const [releaseTodayOrders, setReleaseTodayOrders] = useState(null);
    const [expressOrders, setExpressOrders] = useState(null);
    const [todaySummary, setTodaySummary] = useState(null);
    const [recentActivities, setRecentActivities] = useState([]);
    const [invoiceSummaries, setInvoiceSummaries] = useState(null);
    const [orderTypeCounts, setOrderTypeCounts] = useState(null);

    const fetchPendingOrders = async () => {
        try {
            const payload = {
                user_id: localStorage.getItem("userId"),
                branch_id: 1,
            };
            const response = await getRetailDashboardPendingOrders(payload);
            setPendingOrders(response);
        } catch (error) {
            console.error("Error fetching pending orders: ", error);
        }
    };

    const fetchReadyForPickupOrders = async () => {
        try {
            const payload = {
                user_id: localStorage.getItem("userId"),
                branch_id: 1,
            };
            const response = await getRetailDashboardReadyForPickupOrders(payload);
            setReadyForPickupOrders(response);
        } catch (error) {
            console.error("Error fetching ready for pickup orders: ", error);
        }
    };

    const fetchReleaseTodayOrders = async () => {
        try {
            const payload = {
                user_id: localStorage.getItem("userId"),
                branch_id: 1,
            };
            const response = await getRetailDashboardReleaseTodayOrders(payload);
            setReleaseTodayOrders(response);
        } catch (error) {
            console.error("Error fetching release today orders: ", error);
        }
    };

    const fetchExpressOrders = async () => {
        try {
            const payload = {
                user_id: localStorage.getItem("userId"),
                branch_id: 1,
            };
            const response = await getRetailDashboardExpressOrders(payload);
            setExpressOrders(response);
        } catch (error) {
            console.error("Error fetching express orders: ", error);
        }
    };

    const fetchTodaySummary = async () => {
        try {
            const payload = {
                user_id: localStorage.getItem("userId"),
                branch_id: 1,
            };
            const response = await getRetailDashboardTodaySummary(payload);
            setTodaySummary(response);
        } catch (error) {
            console.error("Error fetching today summary: ", error);
        }
    };

    const fetchRecentActivities = async () => {
        try {
            const payload = {
                user_id: localStorage.getItem("userId"),
                branch_id: 1,
            };
            const response = await getRetailDashboardRecentActivity(payload);
            setRecentActivities(response.recent_activities);
        } catch (error) {
            console.error("Error fetching recent activities: ", error);
        }
    };

    const fetchInvoiceSummaries = async () => {
        try {
            const payload = {
                user_id: localStorage.getItem("userId"),
                branch_id: 1,
            };
            const response = await getRetailDashboardInvoiceSummaries(payload);
            setInvoiceSummaries(response);
        } catch (error) {
            console.error("Error fetching invoice summary: ", error);
        }
    };

    const fetchOrderTypeCounts = async () => {
        try {
            const payload = {
                user_id: localStorage.getItem("userId"),
                branch_id: 1,
            };
            const response = await getRetailDashboardOrderTypeCounts(payload);
            setOrderTypeCounts(response);
        } catch (error) {
            console.error("Error fetching order type counts: ", error);
        }
    };

    const handlePendingOrdersClick = () => {
        navigate("/salesCorporate/retail/back-to-outlet", { state: { tab: 1, todayFilter: true } });
    };

    useEffect(() => {
        fetchPendingOrders();
        fetchReadyForPickupOrders();
        fetchReleaseTodayOrders();
        fetchExpressOrders();
        fetchTodaySummary();
        fetchRecentActivities();
        fetchInvoiceSummaries();
        fetchOrderTypeCounts();
    }, []);

    if (!hasPermission("SalesRetail_Dashboard_View")) {
        return (
            <div className="flex justify-center items-center h-[70vh]">
                <div className="text-center">
                    <Icon icon="mdi:lock" className="text-red-500 text-4xl mx-auto mb-4" />
                    <p className="text-lg text-red-500 font-semibold">Access Denied</p>
                    <p className="text-sm text-black/50">You don't have permission to view the dashboard</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-y-5">
            {/* Header Section */}
            <div className="flex flex-row justify-between">
                <div className="flex flex-col">
                    <h1 className="text-3xl font-bold text-primary">Retail Sales Dashboard</h1>
                    <p className="text-xl text-black/50">Manage your organization's human resources efficiently</p>
                </div>
                {hasPermission("SalesRetail_Order_Create") && (
                    <Link className="flex flex-row gap-x-3 items-center bg-white h-fit text-primary font-semibold text-xl py-2 px-3 rounded-full border border-primary cursor-pointer" to={'/salesCorporate/retail/order-entry/add-new-order'}><BiPlus /> Add New Order</Link>
                )}
            </div>

            {/* Detail Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-x-10">
                <DetailsCard
                    title={"Pending Orders"}
                    value={pendingOrders?.pending_orders ?? 0}
                    label1={"Orders Placed Today"}
                    value1={pendingOrders?.today_total_orders ?? 0}
                    label2={"Orders Placed Percentage"}
                    value2={`${pendingOrders?.pending_order_percentage.toFixed(2) ?? 0} %`}
                    extraDetails={true}
                    onClick={handlePendingOrdersClick}
                    icon={
                        <Icon icon={"uim:process"} className="text-blue-500 size-12" />
                    }
                />

                {/* Ready for Pickup card temporarily hidden — not needed yet, re-enable when ready to use.
                <DetailsCard
                    title={"Ready for Pickup"}
                    value={readyForPickupOrders?.pickup_ready_orders ?? 0}
                    label1={"Total Ready Orders Today"}
                    value1={readyForPickupOrders?.total_pickup_ready_orders_today ?? 0}
                    label2={"Waiting Pickup Percentage"}
                    value2={`${readyForPickupOrders?.waiting_pickup_percentage.toFixed(2) ?? 0} %`}
                    extraDetails={true}
                    icon={
                        <Icon icon={"lets-icons:done-ring-round-fill"} className="text-green-500 size-12" />
                    }
                />
                */}

                {/* Release Today card temporarily hidden — not needed yet, re-enable when ready to use.
                <DetailsCard
                    title={"Release Today"}
                    value={releaseTodayOrders?.today_released_orders ?? 0}
                    label1={"Total Orders"}
                    value1={releaseTodayOrders?.today_total_orders ?? 0}
                    label2={"Release Percentage"}
                    value2={`${releaseTodayOrders?.release_percentage.toFixed(2) ?? 0} %`}
                    extraDetails={true}
                    icon={
                        <Icon icon={"streamline:give-gift-remix"} className="text-yellow-500 size-10" />
                    }
                />
                */}

                <DetailsCard
                    title={"Express Orders"}
                    value={expressOrders?.today_express_orders ?? 0}
                    label1={"Total Pending Orders"}
                    value1={expressOrders?.today_pending_orders ?? 0}
                    label2={"Urgent Percentage"}
                    value2={`${expressOrders?.urgent_percentage.toFixed(2) ?? 0} %`}
                    extraDetails={true}
                    icon={
                        <Icon icon={"material-symbols-light:delivery-truck-bolt"} className="text-red-500 size-12" />
                    }
                />
            </div>

            <div className="grid grid-cols-2 gap-5 mb-5">
                <div className="bg-white rounded-xl col-span-2">
                    <div className="flex flex-row justify-between pt-5 px-5 pb-3">
                        <h2 className="text-2xl text-black font-semibold">Invoice Summary</h2>
                        <Icon icon={"material-symbols:refresh"} className="text-black/50 size-7 cursor-pointer" onClick={fetchInvoiceSummaries} />
                    </div>

                    <hr className="border-black/50" />

                    <div className="grid grid-cols-2 gap-x-5 text-black/50 font-semibold text-xl  pt-3 px-5 pb-5 gap-y-3">
                        <p>Card Total</p>
                        <p>Rs. {(Number(invoiceSummaries?.card_collected ?? 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>

                        <p>Cash Total</p>
                        <p>Rs. {(Number(invoiceSummaries?.cash_collected ?? 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>

                        <p>Total Revenue</p>
                        <p>Rs. {(Number(invoiceSummaries ? invoiceSummaries.total_revenue : 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>

                        <p>Total Advanced</p>
                        <p>Rs. {(Number(invoiceSummaries ? invoiceSummaries.total_advanced : 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>

                        <p>Discounts Given</p>
                        <p>Rs. {(Number(invoiceSummaries ? invoiceSummaries.discounts_given : 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                    </div>
                </div>

                <div className="bg-white rounded-xl">
                    <div className="flex flex-row justify-between pt-5 px-5 pb-3">
                        <h2 className="text-2xl text-black font-semibold">Total Summary</h2>
                        <Icon icon={"material-symbols:refresh"} className="text-black/50 size-7 cursor-pointer" onClick={fetchTodaySummary} />
                    </div>

                    <hr className="border-black/50" />

                    <div className="grid grid-cols-2 gap-x-5 text-black/50 font-semibold text-xl  pt-3 px-5 pb-5 gap-y-3">
                        <p>New Orders</p>
                        <p>{todaySummary?.new_orders ?? 0}</p>

                        <p>Express Orders</p>
                        <p>{todaySummary?.express_orders ?? 0}</p>

                        <p>Release Orders</p>
                        <p>{todaySummary?.release_orders ?? 0}</p>

                        <p>Pending Orders</p>
                        <p>{todaySummary?.pending_orders ?? 0}</p>

                        <p>Dispatch Note</p>
                        <p>{todaySummary?.back_to_outlet ?? 0}</p>

                        <p>Total Revenue</p>
                        <p>{`Rs. ${Number(todaySummary ? todaySummary?.total_revenue : 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? 0}`}</p>
                    </div>
                </div>

                <div className="bg-white rounded-xl">
                    <div className="flex flex-row justify-between pt-5 px-5 pb-3">
                        <h2 className="text-2xl text-black font-semibold">Recent Activity</h2>
                        <Icon icon={"material-symbols:refresh"} className="text-black/50 size-7 cursor-pointer" onClick={fetchRecentActivities} />
                    </div>

                    <hr className="border-black/50" />

                    {recentActivities.slice(0, 5).map((activity, index) => (
                        <div key={index} className="flex flex-row items-center gap-x-5 text-black/50 font-semibold text-xl  pt-3 px-5 pb-5 gap-y-3">
                            <Icon icon={"mdi:cart"} className="text-red-500 min-w-6 w-6" />
                            <p className="col-span-4">{activity.details}</p>
                            <div className="flex flex-col ms-auto text-base">
                                <p className="whitespace-nowrap">{new Date(activity.created_at).toLocaleDateString()}</p>
                                <p className="whitespace-nowrap">{new Date(activity.created_at).toLocaleTimeString()}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <div className="bg-white rounded-xl mb-5">
                <div className="flex flex-row justify-between pt-5 px-5 pb-3">
                    <h2 className="text-2xl text-black font-semibold">Order Counts by Delivery Type</h2>
                    <Icon icon={"material-symbols:refresh"} className="text-black/50 size-7 cursor-pointer" onClick={fetchOrderTypeCounts} />
                </div>

                <hr className="border-black/50" />

                <div className="grid grid-cols-5 gap-x-5 text-black/50 font-semibold text-xl text-center pt-3 px-5 pb-5">
                    <div>
                        <p>{orderTypeCounts?.oneDay?.order_count ?? 0}</p>
                        <p className="text-base">One Day</p>
                    </div>
                    <div>
                        <p>{orderTypeCounts?.twoDay?.order_count ?? 0}</p>
                        <p className="text-base">Two Day</p>
                    </div>
                    <div>
                        <p>{orderTypeCounts?.express?.order_count ?? 0}</p>
                        <p className="text-base">Express</p>
                    </div>
                    <div>
                        <p>{orderTypeCounts?.normal?.order_count ?? 0}</p>
                        <p className="text-base">Normal</p>
                    </div>
                    <div>
                        <p>{orderTypeCounts?.urgent?.order_count ?? 0}</p>
                        <p className="text-base">Urgent</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SalesRetailDashboard;