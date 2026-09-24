import { useEffect, useState } from "react";
import { HiOutlineArrowCircleLeft } from "react-icons/hi";
import { useLocation, useNavigate } from "react-router-dom";
import Select from "react-select";
import { BiPlus } from "react-icons/bi";
import { Icon } from "@iconify/react/dist/iconify.js";
import Input from "../../../components/ui/Input";
import CorporateCustomerCreateDialog from "../../../components/dialogs/corporate/CorporateCustomerCreateDialog";
import SignatureInput from "../../../components/ui/SignatureInput";
import { getAllItemTypes } from "../../../services/Retail/RetailSettingsServices";
import { corporatePickupEntrySendToProduction } from "../../../services/corporate/ProductionServices";
import { BeatLoader } from "react-spinners";

const CorporateProductionSort = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const order = location.state;
    const [isLoading, setIsLoading] = useState(false);
    const [stage, setStage] = useState(1);
    const [showCreateCustomerDialog, setShowCreateCustomerDialog] = useState(false);
    const [selectedCustomer, setSelectedCustomer] = useState(null);
    const [showAddSignature, setShowAddSignature] = useState(false);
    const [itemTypes, setItemTypes] = useState([]);
    const [errorMessage, setErrorMessage] = useState("");

    document.querySelectorAll('input[type=number]').forEach((input) => {
        input.addEventListener("wheel", function (e) {
            e.preventDefault(); // disable scroll changing value
        });
    });

    const [formData, setFormData] = useState(
        {
            user_id: "",
            pickup_entry_id: "",
            items: [],
        }
    );

    const sampleData = {
        id: 1,
        customer: "Grand Hotel",
        contactPerson: "John Smith",
        phone: "0716624456",
        address: "914/C, Matara",
        noOfItems: 100,
        noOfCategories: 3,
        items: [
            {
                itemName: "Bedsheet",
                itemCategory: "King",
                qty: 20,
            },
            {
                itemName: "Pillow Cover",
                itemCategory: "King",
                qty: 60,
            },
            {
                itemName: "Duvet",
                itemCategory: "King",
                qty: 20,
            },
        ],
        date: "2025/05/03",
        remark: "",
        signedBy: "John Smith",
        status: "New",
    };

    const deliveryTypeOptions = [
        { value: "Express", label: "Express" },
        { value: "One Day", label: "One Day" },
        { value: "Normal", label: "Normal" },
    ];

    const itemOptions = [
        { value: "Bed Sheet", label: "Bed Sheet" },
        { value: "Pillow Case", label: "Pillow Case" },
        { value: "Duvet Cover", label: "Duvet Cover" },
        { value: "Blanket", label: "Blanket" },
        { value: "Bath Towel", label: "Bath Towel" },
        { value: "Hand Towel", label: "Hand Towel" },
        { value: "Face Towel", label: "Face Towel" },
        { value: "Bathrobe", label: "Bathrobe" },
        { value: "Curtains", label: "Curtains" },
        { value: "Table Cloth", label: "Table Cloth" },
        { value: "Napkin", label: "Napkin" },
        { value: "Staff Uniform", label: "Staff Uniform" },
        { value: "Guest Laundry - Shirt", label: "Guest Laundry - Shirt" },
        { value: "Guest Laundry - Trousers", label: "Guest Laundry - Trousers" },
        { value: "Guest Laundry - Dress", label: "Guest Laundry - Dress" }
    ];

    const itemCategoryOptions = [
        { value: 1, label: "King" },
        { value: 2, label: "Queen" },
        { value: 3, label: "Single" },
    ];

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

    const fetchItemTypes = async () => {
        try {
            const response = await getAllItemTypes(localStorage.getItem("userId"));
            setItemTypes(response.data.item_types);
        } catch (error) {
            console.error("Errorr fetching item types: ", error);
        }
    };

    useEffect(() => {
        fetchItemTypes()
    }, []);

    useEffect(() => {
    }, [formData.items])

    const handleSelectCustomer = (selectedOption) => {
        setSelectedCustomer(customers.find(customer => customer.id === selectedOption));
        setFormData(prev => ({
            ...prev,
            customer: selectedOption
        }));
    };

    const handleAddItemToOrder = () => {
        setOrders(prev => [...prev, orderItem]);
        setOrderItem(
            {
                itemName: "",
                itemCategory: "",
                quantity: "",
                remark: "",
            }
        );
    };

    const handleRemoveItemFromOrder = (indexToRemove) => {
        const updatedOrders = orders.filter((_, index) => index !== indexToRemove);
        setOrders(updatedOrders);
    };

    const handleInputChange = (e) => {
        setFormData(prev => (
            {
                ...prev,
                [e.target.name]: e.target.value
            }
        ));
    };

    const handleInputNumberChange = (e) => {
        setFormData(prev => (
            {
                ...prev,
                [e.target.name]: e.target.value === "" ? "" : Number(e.target.value)
            }
        ));
    };

    const handleAddQty = (service, item_id, item_category_id, qty) => {
        switch (service) {
            case "washing":
                setFormData(prev => {
                    const existingItem = prev.items.find(item => item.item_id === item_id);

                    if (existingItem) {
                        // Update existing item
                        const updatedItems = prev.items.map(item =>
                            item.item_id === item_id
                                ? { ...item, washing: qty ? Number(qty) : "" }
                                : item
                        );

                        return { ...prev, items: updatedItems };
                    } else {
                        // Add new item
                        const newItem = {
                            item_id: item_id,
                            item_category_id: item_category_id,
                            washing: Number(qty),
                            pressing: "",
                            dry_cleaning: "",
                        };
                        return { ...prev, items: [...prev.items, newItem] };
                    }
                });
                break;

            case "pressing":
                setFormData(prev => {
                    const existingItem = prev.items.find(item => item.item_id === item_id);

                    if (existingItem) {
                        // Update existing item
                        const updatedItems = prev.items.map(item =>
                            item.item_id === item_id
                                ? { ...item, pressing: qty ? Number(qty) : "" }
                                : item
                        );

                        return { ...prev, items: updatedItems };
                    } else {
                        // Add new item
                        const newItem = {
                            item_id: item_id,
                            item_category_id: item_category_id,
                            washing: "",
                            pressing: Number(qty),
                            dry_cleaning: "",
                        };
                        return { ...prev, items: [...prev.items, newItem] };
                    }
                });
                break;

            case "dry_cleaning":
                setFormData(prev => {
                    const existingItem = prev.items.find(item => item.item_id === item_id);

                    if (existingItem) {
                        // Update existing item
                        const updatedItems = prev.items.map(item =>
                            item.item_id === item_id
                                ? { ...item, dry_cleaning: qty ? Number(qty) : "" }
                                : item
                        );

                        return { ...prev, items: updatedItems };
                    } else {
                        // Add new item
                        const newItem = {
                            item_id: item_id,
                            item_category_id: item_category_id,
                            washing: "",
                            pressing: "",
                            dry_cleaning: Number(qty),
                        };
                        return { ...prev, items: [...prev.items, newItem] };
                    }
                });
                break;

            default:
                break;
        }

    };

    const handleSubmit = async () => {
        try {
            setIsLoading(true);
            const items = formData.items.map(({ item_category_id, ...rest }) => {
                // Convert all "" → Number("") → 0
                const converted = Object.fromEntries(
                    Object.entries(rest).map(([key, value]) => [key, value === "" ? 0 : Number(value)])
                );
                return converted;
            });

            const payload = {
                user_id: localStorage.getItem("userId"),
                pickup_entry_id: order.pickup_entry_id,
                items: items,
            };

            const response = await corporatePickupEntrySendToProduction(payload);
            navigate("/salesCorporate/corporate/production");
        } catch (error) {
            console.error("Error sending to production: ", error);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div>
            <div className="flex flex-row gap-x-3 items-center">
                <HiOutlineArrowCircleLeft className="size-6 text-primary cursor-pointer" onClick={() => navigate(`/salesCorporate/corporate/production`)} />
                <h1 className="text-3xl text-primary font-bold">{stage === 1 ? "Production/Sort" : "Production/Sort/Service Order"}</h1>
            </div>
            <p className="text-black/50 text-xl mb-5">Record new laundry pickup with item counts by category.</p>

            {stage === 1 &&
                <div className="flex flex-col gap-y-5">
                    <div className="flex flex-col bg-white rounded-xl p-5 gap-y-3">
                        <h2 className="text-xl font-semibold">Customer Information</h2>

                        <div className="flex flex-row gap-x-20 items-center font-medium text-lg">
                            <div className="flex flex-row gap-x-5">
                                <Icon icon={"lucide:user"} className="text-primary bg-primary/20 rounded-full size-7 my-auto p-1" />
                                <div className="flex flex-col">
                                    <p className="font-medium">{order?.company_name}</p>
                                    <p className="text-base text-black/60 font-medium">{order?.customer_name}</p>
                                </div>
                            </div>
                            <p>{order?.address}</p>
                            <p>{order?.phone_number}</p>
                            <p>{new Date(order.created).toISOString().split("T")[0]}</p>
                        </div>
                    </div>

                    <div className="rounded-xl overflow-hidden border border-black/50">
                        <div className="text-xl text-center grid grid-cols-5 gap-x-3 text-white bg-primary font-semibold py-2 px-3">
                            <p className="text-start">CATEGORY</p>
                            <p>NO OF ITEMS</p>
                            <p>WASHING</p>
                            <p>PRESSING</p>
                            <p>DRY CLEAN</p>
                        </div>

                        {order.items.map((item, index) => (
                            <div key={index} className={`grid grid-cols-5 gap-x-3 text-lg text-center py-1.5 ${index % 2 === 0 ? "bg-white" : "bg-primary/10"} items-center px-3`}>
                                <p className="text-start">{itemTypes.find(i => i.item_type_id === item.item_id)?.item_type_name} ({itemCategoryOptions.find(cat => cat.value === item.item_category_id).label})</p>
                                <p>{item.quantity}</p>
                                <input type="number" min={0} step={1} className="rounded-full border border-black/50 mx-10 text-center bg-white" onChange={(e) => handleAddQty("washing", item.item_id, item.item_category_id, e.target.value)} value={formData.items.find(i => i.item_id === item.item_id)?.washing} />
                                <input type="number" min={0} step={1} className="rounded-full border border-black/50 mx-10 text-center bg-white" onChange={(e) => handleAddQty("pressing", item.item_id, item.item_category_id, e.target.value)} value={formData.items.find(i => i.item_id === item.item_id)?.pressing} />
                                <input type="number" min={0} step={1} className="rounded-full border border-black/50 mx-10 text-center bg-white" onChange={(e) => handleAddQty("dry_cleaning", item.item_id, item.item_category_id, e.target.value)} value={formData.items.find(i => i.item_id === item.item_id)?.dry_cleaning} />
                            </div>
                        ))}
                    </div>

                    <div className="flex flex-row text-xl my-5 justify-between items-center">
                        <button type="button" className="font-semibold text-primary bg-white border border-primary rounded-full py-2 w-1/3 cursor-pointer" onClick={() => navigate("/salesCorporate/corporate/production")}>Back</button>
                        <p className="text-red-500 font-semibold text-center">{errorMessage}</p>
                        <button
                            type="button"
                            className="font-semibold text-white bg-primary rounded-full py-2 w-1/3 cursor-pointer"
                            onClick={() => {
                                const toNumber = (val) => Number(val) || 0;

                                const isValid = order.items.every(pickup => {
                                    const match = formData.items.find(d => d.item_id === pickup.item_id);
                                    if (!match) return false;

                                    const washing = toNumber(match.washing);
                                    const pressing = toNumber(match.pressing);
                                    const dryCleaning = toNumber(match.dry_cleaning);

                                    if (washing < 0 || pressing < 0 || dryCleaning < 0) {
                                        return false;
                                    }

                                    const sorted = washing + pressing + dryCleaning;

                                    return sorted === pickup.quantity;
                                });

                                if (isValid) {
                                    setStage(2);
                                    setErrorMessage("");
                                } else {
                                    setErrorMessage("Invalid quantities entered.")
                                }
                            }}
                        >Next</button>
                    </div>
                </div>
            }

            {stage === 2 &&
                <div className="flex flex-col gap-y-5">
                    {formData.items.reduce((sum, item) => sum + Number(item.washing), 0) > 0 &&
                        <div className="flex flex-col gap-y-5 bg-white rounded-xl p-5">
                            <div className="flex flex-row justify-between items-center">
                                <h2 className="text-2xl font-medium">Washing ({formData.items.reduce((sum, item) => sum + Number(item.washing), 0)} Items)</h2>
                                {/* <button className="cursor-pointer flex flex-row text-primary font-bold text-xl items-center gap-x-3 border border-primary rounded-full px-3 py-2"><Icon icon={"material-symbols:print"} /> Print Service Order</button> */}
                            </div>

                            <div className="rounded-xl overflow-hidden border border-black/50">
                                <div className="text-xl text-center grid grid-cols-3 gap-x-3 text-white bg-primary font-semibold py-2 px-3">
                                    <p className="text-start">ITEM</p>
                                    <p>QUANTITY</p>
                                    <p>SERVICE</p>
                                </div>

                                {formData.items.filter(i => Number(i.washing) > 0).map((item, index) => (
                                    <div key={index} className={`grid grid-cols-3 gap-x-3 text-lg text-center py-1.5 ${index % 2 === 0 ? "bg-white" : "bg-primary/10"} items-center px-3`}>
                                        <p className="text-start">{itemTypes.find(i => i.item_type_id === item.item_id)?.item_type_name} ({itemCategoryOptions.find(cat => cat.value === item.item_category_id)?.label})</p>
                                        <p>{item.washing}</p>
                                        <p>Washing</p>
                                    </div>
                                ))}
                            </div>
                        </div >
                    }

                    {formData.items.reduce((sum, item) => sum + Number(item.pressing), 0) > 0 &&
                        <div className="flex flex-col gap-y-5 bg-white rounded-xl p-5">
                            <div className="flex flex-row justify-between items-center">
                                <h2 className="text-2xl font-medium">Pressing ({formData.items.reduce((sum, item) => sum + Number(item.pressing), 0)} Items)</h2>
                                {/* <button className="cursor-pointer flex flex-row text-primary font-bold text-xl items-center gap-x-3 border border-primary rounded-full px-3 py-2"><Icon icon={"material-symbols:print"} /> Print Service Order</button> */}
                            </div>

                            <div className="rounded-xl overflow-hidden border border-black/50">
                                <div className="text-xl text-center grid grid-cols-3 gap-x-3 text-white bg-primary font-semibold py-2 px-3">
                                    <p className="text-start">ITEM</p>
                                    <p>QUANTITY</p>
                                    <p>SERVICE</p>
                                </div>

                                {formData.items.filter(i => Number(i.pressing) > 0).map((item, index) => (
                                    <div key={index} className={`grid grid-cols-3 gap-x-3 text-lg text-center py-1.5 ${index % 2 === 0 ? "bg-white" : "bg-primary/10"} items-center px-3`}>
                                        <p className="text-start">{itemTypes.find(i => i.item_type_id === item.item_id)?.item_type_name} ({itemCategoryOptions.find(cat => cat.value === item.item_category_id)?.label})</p>
                                        <p>{item.pressing}</p>
                                        <p>Pressing</p>
                                    </div>
                                ))}
                            </div>
                        </div >
                    }

                    {formData.items.reduce((sum, item) => sum + Number(item.dry_cleaning), 0) > 0 &&
                        <div className="flex flex-col gap-y-5 bg-white rounded-xl p-5">
                            <div className="flex flex-row justify-between items-center">
                                <h2 className="text-2xl font-medium">Dry Clean ({formData.items.reduce((sum, item) => sum + Number(item.dry_cleaning), 0)} Items)</h2>
                                {/* <button className="cursor-pointer flex flex-row text-primary font-bold text-xl items-center gap-x-3 border border-primary rounded-full px-3 py-2"><Icon icon={"material-symbols:print"} /> Print Service Order</button> */}
                            </div>

                            <div className="rounded-xl overflow-hidden border border-black/50">
                                <div className="text-xl text-center grid grid-cols-3 gap-x-3 text-white bg-primary font-semibold py-2 px-3">
                                    <p className="text-start">ITEM</p>
                                    <p>QUANTITY</p>
                                    <p>SERVICE</p>
                                </div>

                                {formData.items.filter(i => Number(i.dry_cleaning) > 0).map((item, index) => (
                                    <div key={index} className={`grid grid-cols-3 gap-x-3 text-lg text-center py-1.5 ${index % 2 === 0 ? "bg-white" : "bg-primary/10"} items-center px-3`}>
                                        <p className="text-start">{itemTypes.find(i => i.item_type_id === item.item_id)?.item_type_name} ({itemCategoryOptions.find(cat => cat.value === item.item_category_id)?.label})</p>
                                        <p>{item.dry_cleaning}</p>
                                        <p>Dry Clean</p>
                                    </div>
                                ))}
                            </div>
                        </div >
                    }

                    <div className="flex flex-row text-xl my-5 justify-between">
                        <button type="button" className="font-semibold text-primary bg-white border border-primary rounded-full py-2 w-1/3 cursor-pointer" onClick={() => setStage(1)} disabled={isLoading} >Back</button>
                        <button
                            type="button"
                            className="font-semibold text-white bg-primary rounded-full py-2 w-1/3 cursor-pointer"
                            onClick={handleSubmit}
                            disabled={isLoading}
                        >{isLoading ? <BeatLoader color="#fff" size={10} /> : "Submit"}</button>
                    </div>
                </div>
            }
        </div>
    );
};

export default CorporateProductionSort;