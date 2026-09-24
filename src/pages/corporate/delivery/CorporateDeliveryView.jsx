import { useEffect, useState } from "react";
import { HiOutlineArrowCircleLeft } from "react-icons/hi";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import Select from "react-select";
import { BiPlus } from "react-icons/bi";
import { Icon } from "@iconify/react/dist/iconify.js";
import Input from "../../../components/ui/Input";
import CorporateCustomerCreateDialog from "../../../components/dialogs/corporate/CorporateCustomerCreateDialog";
import SignatureInput from "../../../components/ui/SignatureInput";
import { getCorporateDeliveryById } from "../../../services/corporate/CorporateDeliveryServices";
import { getAllItemTypes } from "../../../services/Retail/RetailSettingsServices";
import { BeatLoader } from "react-spinners";

const CorporateDeliveryView = () => {
    const navigate = useNavigate();
    const { id } = useParams();
    const location = useLocation();
    const [stage, setStage] = useState(1);
    const [showCreateCustomerDialog, setShowCreateCustomerDialog] = useState(false);
    const [selectedCustomer, setSelectedCustomer] = useState(null);
    const [showAddSignature, setShowAddSignature] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [order, setOrder] = useState(null);
    const [itemTypes, setItemTypes] = useState([]);

    document.querySelectorAll('input[type=number]').forEach((input) => {
        input.addEventListener("wheel", function (e) {
            e.preventDefault(); // disable scroll changing value
        });
    });

    const itemCategoryOptions = [
        { value: 1, label: "King" },
        { value: 2, label: "Queen" },
        { value: 3, label: "Single" },
    ];

    const fetchDeliveryById = async () => {
        try {
            setIsLoading(true);

            const payload = {
                user_id: localStorage.getItem("userId"),
                pickup_entry_id: id
            };

            const response = await getCorporateDeliveryById(payload);
            setOrder(response?.data?.in_delivery_pickup_entry?.[0] ?? null);
        } catch (error) {
            console.error("Error fetching delivery logs: ", error);
        } finally {
            setIsLoading(false);
        }
    };

    const fetchItemTypes = async () => {
        try {
            const response = await getAllItemTypes(localStorage.getItem("userId"));
            setItemTypes(response.data.item_types);
        } catch (error) {
            console.error("Errorr fetching item types: ", error);
        }
    };

    useEffect(() => {
        setOrder(null);
        fetchDeliveryById();
        fetchItemTypes();
    }, [id]);

    return (
        <div>
            <div className="flex flex-row gap-x-3 items-center">
                <HiOutlineArrowCircleLeft className="size-6 text-primary cursor-pointer" onClick={() => navigate(`/salesCorporate/corporate/delivery`)} />
                <h1 className="text-3xl text-primary font-bold">Delivery/{order?.customer_company_name ?? order?.company_name ?? location.state?.customer_company_name ?? location.state?.company_name}</h1>
            </div>
            <p className="text-black/50 text-xl mb-2">Record new laundry pickup with item counts by category.</p>

            {/* Order Tabs */}
            {location.state?.all_order_ids?.length > 1 && (
                <div className="flex flex-row gap-x-3 w-full overflow-x-auto pb-2 mb-5 mt-2 whitespace-nowrap scrollbar-none">
                    {location.state.all_order_ids.map((orderId) => (
                        <button
                            key={orderId}
                            className={`cursor-pointer px-5 py-2 text-lg rounded-full font-bold transition-all ${
                                id === orderId
                                    ? 'bg-primary text-white shadow-md shadow-primary/20 scale-105'
                                    : 'bg-white text-black/60 border border-black/15 hover:bg-primary/5 hover:text-primary'
                            }`}
                            onClick={() => navigate(`/salesCorporate/corporate/delivery/${orderId}`, { state: location.state })}
                        >
                            {orderId}
                        </button>
                    ))}
                </div>
            )}

            {isLoading && order === null ?
                <div className="flex items-center justify-center bg-white rounded-xl py-10 border border-primary">
                    <BeatLoader color="#1470F9" size={20} />
                </div> :
                <div className="flex flex-col gap-y-5">
                    <div className="w-full border-b border-primary">
                        <p className="border-b-3 border-black w-fit px-1 text-2xl font-semibold">Order Information</p>
                    </div>

                    <div className="flex flex-col bg-white rounded-xl p-5 gap-y-3">

                        <div className="grid grid-cols-7 gap-x-5 gap-y-4 items-start font-medium text-lg">
                            <div className="flex flex-row gap-x-5">
                                <Icon icon={"lucide:user"} className="text-primary bg-primary/20 rounded-full size-7 my-auto p-1" />
                                <div className="flex flex-col">
                                    <p className="font-medium">{order?.customer_company_name ?? order?.company_name}</p>
                                    <p className="text-base text-black/60 font-medium">{order?.customer_id ?? order?.customer_name}</p>
                                </div>
                            </div>
                            <div className="flex flex-col">
                                <p className="font-medium">Order ID</p>
                                <p className="text-base text-black/60 font-medium">{order?.pickup_entry_id}</p>
                            </div>
                            <div className="flex flex-col">
                                <p className="font-medium">Date of collection</p>
                                <p className="text-base text-black/60 font-medium">
                                    {(order?.created_at ?? order?.created)
                                        ? new Date(order?.created_at ?? order?.created).toISOString().split("T")[0]
                                        : ""}
                                </p>
                            </div>
                            <div className="flex flex-col">
                                <p className="font-medium">Location</p>
                                <p className="text-base text-black/60 font-medium">{(order?.customer_address ?? order?.address) || "—"}</p>
                            </div>
                            <div className="flex flex-col">
                                <p className="font-medium">Room No</p>
                                <p className="text-base text-black/60 font-medium">{order?.room_no || "—"}</p>
                            </div>
                            <div className="flex flex-col">
                                <p className="font-medium">Gate Pass No</p>
                                <p className="text-base text-black/60 font-medium">{order?.gate_pass_no || "—"}</p>
                            </div>
                            <div className="flex flex-col">
                                <p className="font-medium">Place of Supply</p>
                                <p className="text-base text-black/60 font-medium">{order?.place_of_supply || "---"}</p>
                            </div>
                            <div className="flex flex-col">
                                <p className="font-medium">Invoice Type</p>
                                <p className="text-base text-black/60 font-medium">
                                    {order?.invoice_details?.invoice_type ?? order?.customer_invoice_type}
                                </p>
                            </div>
                            <div className="flex flex-col">
                                <p className="font-medium">Credit Period</p>
                                <p className="text-base text-black/60 font-medium">
                                    {order?.invoice_details?.payment_period ?? order?.customer_payment_period}
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="rounded-xl overflow-hidden border border-black/50">
                        <div className="text-xl text-center grid grid-cols-4 gap-x-3 text-white bg-primary font-semibold py-2 px-3">
                            <p className="text-start">ITEM TYPE</p>
                            <p>TOTAL COUNT</p>
                            <p>ALREADY DELIVERED</p>
                            <p>PENDING</p>
                        </div>

                        {order?.items?.filter(item => ((Number(item.final_packed_qty || 0) + Number(item.damaged_qty || 0)) - Number(item.delivered_qty || 0)) > 0).map((item, index) => (
                            <div key={index} className={`grid grid-cols-4 gap-x-3 text-lg text-center py-1.5 ${index % 2 === 0 ? "bg-white" : "bg-primary/10"} items-center px-3`}>
                                <p className="text-start">
                                    {(item.corp_item_name ?? itemTypes.find(type => type.item_type_id === item.item_id)?.item_type_name)}
                                    {" "}
                                    (
                                    {item.item_category_name ?? itemCategoryOptions.find(cat => cat.value === item.item_category_id)?.label}
                                    )
                                </p>
                                <p>{(Number(item.final_packed_qty || 0) + Number(item.damaged_qty || 0))}</p>
                                <p>{item.delivered_qty ?? 0}</p>
                                <p>{(Number(item.final_packed_qty || 0) + Number(item.damaged_qty || 0)) - (item.delivered_qty || 0)}</p>
                            </div>
                        ))}
                    </div>
                </div>
            }
        </div>
    );
};

export default CorporateDeliveryView;