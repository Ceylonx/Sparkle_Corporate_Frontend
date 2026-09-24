import { BiPlus } from "react-icons/bi";
import { Link } from "react-router-dom";
import { Icon } from "@iconify/react/dist/iconify.js";
import DetailsCard from "../../components/ui/DetailsCard";
import { getCorporateMainSummary } from "../../services/corporate/CorporateDashboardServices";
import { useEffect, useState } from "react";
import { BeatLoader } from "react-spinners";

const SalesCorporateDashboard = () => {
    const [mainSummary, setMainSummary] = useState(null);
    const [isLoading, setIsLoading] = useState(false);

    const fetchMainSummary = async () => {
        try {
            setIsLoading(true);

            const payload = {
                user_id: localStorage.getItem("userId"),
                branch_id: ""
            }
            const response = await getCorporateMainSummary(payload);
            setMainSummary(response.data);
        } catch (error) {
            console.error("Error fetching dashboar data:", error);
        } finally {
            setIsLoading(false);
        }
    }

    useEffect(() => {
        fetchMainSummary();
    }, []);

    const emptyA = [];

    return (
        <div className="flex flex-col gap-y-5">
            {/* Header Section */}
            <div className="flex flex-row justify-between">
                <div className="flex flex-col">
                    <h1 className="text-3xl font-bold text-primary">Corporate Sales Dashboard</h1>
                    <p className="text-xl text-black/50">Manage your organization's human resources efficiently</p>
                </div>
                <Link className="flex flex-row gap-x-3 items-center bg-white h-fit text-primary font-semibold text-xl py-2 px-3 rounded-full border border-primary cursor-pointer" to={'/salesCorporate/corporate/pickup-entry/add-new-order'}><BiPlus /> Add New Pickup</Link>
            </div>

            {/* Detail Section */}
            <div className="grid grid-cols-4 gap-x-10">
                <DetailsCard
                    title={"Today’s Pickups"}
                    value={mainSummary?.todays_pickups ?? 0}
                    label1={"Monthly Total Pickups"}
                    value1={mainSummary?.monthly_pickups ?? 0}
                    label2={"Today’s Pickups Percentage"}
                    value2={`${mainSummary?.today_pickup_percentage?.toFixed(2) ?? 0}%`}
                    extraDetails={true}
                    icon={
                        <Icon icon={"streamline-ultimate:paper-write-bold"} className="text-blue-500 size-12" />
                    }
                />

                <DetailsCard
                    title={"Pending Deliveries"}
                    value={mainSummary?.pending_deliveries ?? 0}
                    label1={"Total Monthly Deliveries"}
                    value1={mainSummary?.monthly_deliveries ?? 0}
                    label2={"Pending Deliveries Percentage"}
                    value2={`${mainSummary?.pending_delivery_percentage?.toFixed(2) ?? 0}%`}
                    extraDetails={true}
                    icon={
                        <Icon icon={"material-symbols-light:delivery-truck-bolt"} className="text-red-500 size-12" />
                    }
                />

                <DetailsCard
                    title={"Overdue Invoices"}
                    value={mainSummary?.overdue_invoices ?? 0}
                    label1={"Total Monthly Invoices"}
                    value1={mainSummary?.monthly_invoices ?? 0}
                    label2={"Overdue Invoices Percentage"}
                    value2={`${mainSummary?.overdue_invoice_percentage?.toFixed(2) ?? 0}%`}
                    extraDetails={true}
                    icon={
                        <Icon icon={"mdi:invoice-schedule"} className="text-green-500 size-10" />
                    }
                />

                <DetailsCard
                    title={"Monthly Income"}
                    value={mainSummary?.monthly_income ?? 0}
                    label1={"Today’s Total Income"}
                    value1={mainSummary?.todays_income ?? 0}
                    label2={"Today’s Income Percentage"}
                    value2={`${mainSummary?.today_income_percentage?.toFixed(2) ?? 0}%`}
                    extraDetails={true}
                    icon={
                        <Icon icon={"healthicons:low-income-level-24px"} className="text-yellow-500 size-12" />
                    }
                />
            </div>

            <div className="grid grid-cols-2 gap-x-5">
                <div className="bg-white rounded-xl overflow-hidden">
                    <div className="flex flex-row justify-between pt-5 px-5 pb-3">
                        <h2 className="text-2xl text-black font-semibold">Recent Customers</h2>
                        <Icon icon={"material-symbols:refresh"} className="text-black/50 size-7 cursor-pointer" onClick={fetchMainSummary} />
                    </div>

                    <hr className="border-black/50" />

                    {isLoading ?
                        <div className="flex items-center justify-center py-10 bg-white">
                            <BeatLoader color="#1470F9" size={20} />
                        </div> :
                        mainSummary?.recent_customers?.length > 0 ?
                            <div className="flex flex-col gap-x-5 text-black/50 font-semibold text-xl  pt-3 px-5 pb-5 gap-y-3">
                                {mainSummary?.recent_customers?.map((customer, index) => (
                                    <div key={index} className="grid grid-cols-3" >
                                        <p>{customer.company_name}</p>
                                        <p className="text-center">{customer.total_quantity} Items</p>
                                        <p className="text-end">{customer.status}</p>
                                    </div>
                                ))}
                            </div>
                            : <p className="text-center text-xl py-5 ">No Recent Customers</p>
                    }
                </div>

                <div className="bg-white rounded-xl">
                    <div className="flex flex-row justify-between pt-5 px-5 pb-3">
                        <h2 className="text-2xl text-black font-semibold">Upcoming Deliveries</h2>
                        <Icon icon={"material-symbols:refresh"} className="text-black/50 size-7" />
                    </div>

                    <hr className="border-black/50" />

                    {isLoading ?
                        <div className="flex items-center justify-center py-10 bg-white">
                            <BeatLoader color="#1470F9" size={20} />
                        </div> :
                        mainSummary?.upcommingDeliveries?.length > 0 ?
                            <div className="flex flex-col text-black/50 font-semibold text-xl  pt-3 px-5 pb-5 gap-y-3">
                                {mainSummary?.upcommingDeliveries?.map((delivery, index) => (
                                    <div key={index} className="flex flex-row gap-x-5">
                                        <Icon icon={"mdi:cart"} className="text-red-500 size-7" />
                                        <p>{delivery.company_name}</p>
                                        <p className="ms-auto">{delivery.item_count} Items</p>
                                    </div>
                                ))}
                            </div>
                            : <p className="text-center text-xl py-5 ">No Upcoming Deliveries</p>
                    }
                </div>
            </div>

            {/* Production Status Section */}
            <div className="bg-white rounded-xl mb-5">
                <div className="flex flex-row justify-between pt-5 px-5 pb-3">
                    <h2 className="text-2xl text-black font-semibold">Production Status</h2>
                </div>

                <hr className="border-black/50" />

                <div className="grid grid-cols-4">
                    <div className="flex flex-col items-center border-r border-black/50">
                        <Icon icon={"solar:washing-machine-minimalistic-bold"} className="text-green-500 size-16 mt-3" />
                        <p className="text-4xl font-bold">{mainSummary?.production_status?.washing_count ?? 0}</p>
                        <p className="text-xl text-black/50 font-semibold">Washing</p>
                    </div>

                    <div className="flex flex-col items-center border-r border-black/50">
                        <Icon icon={"tabler:ironing-filled"} className="text-blue-500 size-16 mt-3" />
                        <p className="text-4xl font-bold">{mainSummary?.production_status?.pressing_count ?? 0}</p>
                        <p className="text-xl text-black/50 font-semibold">Pressing</p>
                    </div>

                    <div className="flex flex-col items-center border-r border-black/50">
                        <Icon icon={"material-symbols-light:dry-cleaning-rounded"} className="text-red-500 size-16 mt-3" />
                        <p className="text-4xl font-bold">{mainSummary?.production_status?.dry_cleaning_count ?? 0}</p>
                        <p className="text-xl text-black/50 font-semibold">Dry Clean</p>
                    </div>

                    <div className="flex flex-col items-center">
                        <Icon icon={"fluent-mdl2:completed-solid"} className="text-yellow-500 size-16 mt-3 px-2" />
                        <p className="text-4xl font-bold">{mainSummary?.production_status?.completed_count ?? 0}</p>
                        <p className="text-xl text-black/50 font-semibold">Completed</p>
                    </div>
                </div>
            </div>
        </div >
    );
};

export default SalesCorporateDashboard;