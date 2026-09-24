import { useEffect, useState } from "react";
import Input from "../../ui/Input";
import Select from "react-select";
import { getAllItemTypes, getAllPriceLists } from "../../../services/Retail/RetailSettingsServices";
import { getAllServiceTypes } from "../../../services/ServiceTypeServices";
import CreatableSelect from "react-select/creatable";

const RetailAddItemToOrderForm = ({ handleClose, addToOrder, itemTypes, serviceTypes, priceList }) => {
    const [errorMessage, setErrorMessage] = useState("");
    const [remarkInput, setRemarkInput] = useState("");
    const [formData, setFormData] = useState(
        {
            item_type_id: "",
            color: "",
            brand: "",
            service_type_id: "",
            remark: "",
            packing_option: "",
            quantity: "",
            pics_count: "",
            price: 0
        }
    );

    useEffect(() => {
        document.querySelectorAll('input[type=number]').forEach((input) => {
            input.addEventListener("wheel", function (e) {
                e.preventDefault(); // disable scroll changing value
            });
        });
    }, []);

    //dummy data
    const colourOptions = [
        { value: 'White', label: 'White' },
        { value: 'Black', label: 'Black' },
        { value: 'Blue', label: 'Blue' },
        { value: 'Navy Blue', label: 'Navy Blue' },
        { value: 'Light Blue', label: 'Light Blue' },
        { value: 'Grey', label: 'Grey' },
        { value: 'Red', label: 'Red' },
        { value: 'Maroon', label: 'Maroon' },
        { value: 'Green', label: 'Green' },
        { value: 'Olive Green', label: 'Olive Green' },
        { value: 'Pink', label: 'Pink' },
        { value: 'Peach', label: 'Peach' },
        { value: 'Mint Green', label: 'Mint Green' },
        { value: 'Beige', label: 'Beige' },
        { value: 'Khaki', label: 'Khaki' },
        { value: 'Brown', label: 'Brown' },
        { value: 'Yellow', label: 'Yellow' },
        { value: 'Mustard', label: 'Mustard' },
        { value: 'Purple', label: 'Purple' },
        { value: 'Orange', label: 'Orange' },
        { value: 'Burgundy', label: 'Burgundy' },
    ];

    const brandOptions = [
        { value: 'Levi’s', label: 'Levi’s' },
        { value: 'Tommy Hilfiger', label: 'Tommy Hilfiger' },
        { value: 'Nike', label: 'Nike' },
        { value: 'Adidas', label: 'Adidas' },
        { value: 'Puma', label: 'Puma' },
        { value: 'Marks & Spencer', label: 'Marks & Spencer' },
        { value: 'Gap', label: 'Gap' },
        { value: 'H&M', label: 'H&M' },
        { value: 'Victoria’s Secret', label: 'Victoria’s Secret' },
        { value: 'Calvin Klein', label: 'Calvin Klein' },
        { value: 'Ralph Lauren', label: 'Ralph Lauren' },
        { value: 'Next', label: 'Next' },
        { value: 'NOLIMIT', label: 'NOLIMIT' },
        { value: 'Odel', label: 'Odel' },
        { value: 'Cool Planet', label: 'Cool Planet' },
        { value: 'Hameedia', label: 'Hameedia' },
        { value: 'Emerald', label: 'Emerald' },
        { value: 'Kelly Felder', label: 'Kelly Felder' },
        { value: 'Moose Clothing', label: 'Moose Clothing' },
        { value: 'Cotton Collection', label: 'Cotton Collection' },
        { value: 'Amante', label: 'Amante' },
        { value: 'Avirate', label: 'Avirate' },
        { value: 'Bernards', label: 'Bernards' },
        { value: 'Buddhi Batiks', label: 'Buddhi Batiks' },
        { value: 'Dilly & Carlo', label: 'Dilly & Carlo' },
        { value: 'Absolute Basics', label: 'Absolute Basics' },
        { value: 'Zigzag Store', label: 'Zigzag Store' },
        { value: 'Maus', label: 'Maus' },
        { value: 'House of Lonali', label: 'House of Lonali' },
        { value: 'Nåd', label: 'Nåd' },
        { value: 'Lois London', label: 'Lois London' },
        { value: 'Carnage', label: 'Carnage' },
        { value: 'FOA', label: 'FOA' },
        { value: 'Pepper ST', label: 'Pepper ST' },
        { value: 'Deedat', label: 'Deedat' },
    ];

    const remarkOptions = [
        { value: 'FR1', label: 'FR1' },
        { value: 'FR2', label: 'FR2' },
        { value: 'FR3', label: 'FR3' },
        { value: 'FR4', label: 'FR4' },
        { value: 'FR5', label: 'FR5' },
        { value: 'BC1', label: 'BC1' },
        { value: 'BC2', label: 'BC2' },
        { value: 'BC3', label: 'BC3' },
        { value: 'BC4', label: 'BC4' },
        { value: 'BC5', label: 'BC5' },
        { value: 'BO', label: 'BO' },
        { value: 'SR', label: 'SR' },
        { value: 'SL', label: 'SL' },
        { value: 'H', label: 'H' },
        { value: 'W', label: 'W' },
        { value: 'P', label: 'P' },
        { value: 'S', label: 'S' },
        { value: 'A', label: 'A' },
        { value: 'Z', label: 'Z' },
        { value: 'L', label: 'L' },
        { value: 'M', label: 'M' },
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

    const handleInputChange = (e) => {
        setFormData(prev => ({
            ...prev,
            [e.target.name]: e.target.value
        }));
    };

    // const handleInputNumberChange = (e) => {
    //     setFormData(prev => (
    //         {
    //             ...prev,
    //             [e.target.name]: e.target.value === "" ? "" : Number(e.target.value)
    //         }
    //     ));
    // };
    ///////////////// change pieces value automatically when quantity updated.///////////////
    const handleInputNumberChange = (e) => {
    const { name, value } = e.target;
    const numValue = value === "" ? "" : Number(value);

    setFormData(prev => {
        // If Quantity changes, update both quantity and pieces
        if (name === "quantity") {
            return {
                ...prev,
                quantity: numValue,
                pics_count: numValue
            };
        }

        // If Pieces changes, update only pieces
        if (name === "pieces") {
            return {
                ...prev,
                pics_count: numValue
            };
        }

        return prev;
    });
};
    

    const handleInputPhoneChange = (e) => {
        setFormData(prev => ({
            ...prev,
            [e.target.name]: e.target.value.replace(/\D/g, '')
        }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();

        if (!formData.item_type_id) {
            setErrorMessage("Please select a product type before proceeding.");
            return;
        } else if (!formData.color) {
            setErrorMessage("Please select a color before proceeding.");
            return;
        } else if (!formData.brand) {
            setErrorMessage("Please select a brand before proceeding.");
            return;
        } else if (!formData.service_type_id) {
            setErrorMessage("Please select a service type before proceeding.");
            return;
        } else if (!formData.packing_option) {
            setErrorMessage("Please select a packing option before proceeding.");
            return;
        } else if (!formData.quantity || Number(formData.quantity) <= 0) {
            setErrorMessage("Please enter a valid quantity before proceeding.");
            return;
        } else if (!formData.pics_count || Number(formData.pics_count) <= 0) {
            setErrorMessage("Please enter a valid number of pieces before proceeding.");
            return;//pieces validation
        } else {
            setErrorMessage("");
            addToOrder(formData);
            // Reset form after successful submission
            setFormData({
                item_type_id: "",
                color: "",
                brand: "",
                service_type_id: "",
                remark: "",
                packing_option: "",
                quantity: "",
                pics_count: "",
                price: 0
            });
            setRemarkInput("");
        }
    };

    const selectFilter = (option, inputValue) => {
        const searchWords = inputValue
            .toLowerCase()
            .split(/\s*\*\s*/)
            .filter(word => word.trim().length > 0);

        const label = option.label.toLowerCase();

        return searchWords.every(word => label.includes(word));
    };

    return (
        <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-2 gap-5">
                <div className="flex flex-col gap-y-1">
                    <label htmlFor="item_type_id" className="text-xl font-semibold">Product Type</label>
                    <Select
                        name="item_type_id"
                        id="item_type_id"
                        options={itemTypes && Array.isArray(itemTypes) ? itemTypes.map(type => ({
                            value: type.item_type_id,
                            label: type.item_type_name
                        })) : []}
                        onChange={(option) => setFormData(prev => ({ ...prev, item_type_id: option.value }))}
                        styles={selectStyles}
                        filterOption={selectFilter}
                    />
                </div>
                <div className="flex gap-4">
    <div className="w-1/2">
        <Input
            classnames={"bg-white"}
            name={"quantity"}
            variant={"number"}
            step={0.01}
            min={0.01}
            label={"Quantity"}
            placeholder={"Enter quantity here..."}
            value={formData.quantity}
            onChange={handleInputNumberChange}
        />
    </div>

    <div className="w-1/2">
        <Input
            classnames={"bg-white"}
            name={"pieces"}
            variant={"number"}
            step={1}
            min={0}
            label={"Pieces"}
            placeholder={"Enter pieces here..."}
            value={formData.pics_count}
            onChange={handleInputNumberChange}
        />
    </div>
</div>
                <div className="flex flex-col gap-y-1">
                    <label htmlFor="color" className="text-xl font-semibold">Color</label>
                    <CreatableSelect
                        name="color"
                        id="color"
                        options={colourOptions}
                        onChange={(option) => setFormData(prev => ({ ...prev, color: option.value }))}
                        styles={selectStyles}
                        filterOption={selectFilter}
                    />
                </div>
                <div className="flex flex-col gap-y-1">
                    <label htmlFor="brand" className="text-xl font-semibold">Brand</label>
                    <CreatableSelect
                        name="brand"
                        id="brand"
                        options={brandOptions}
                        onChange={(option) => setFormData(prev => ({ ...prev, brand: option.value }))}
                        styles={selectStyles}
                        filterOption={selectFilter}
                    />
                </div>
                <div className="flex flex-col gap-y-1">
                    <label htmlFor="service_type_id" className="text-xl font-semibold">Service Type</label>
                    <Select
                        name="service_type_id"
                        id="service_type_id"
                        options={serviceTypes && Array.isArray(serviceTypes) ? serviceTypes.map(type => ({
                            value: type.service_type_id,
                            label: type.service_type_name
                        })) : []}
                        onChange={(option) => setFormData(prev => ({ ...prev, service_type_id: option.value }))}
                        styles={selectStyles}
                        filterOption={selectFilter}
                    />
                </div>
                <div className="flex flex-col gap-y-1">
                    <label htmlFor="remark" className="text-xl font-semibold">Special Remark</label>
                    <CreatableSelect
                        name="remark"
                        id="remark"
                        options={remarkOptions}
                        value={formData.remark ? { value: formData.remark, label: formData.remark } : null}
                        onChange={(option) => {
                            const val = option ? option.value : "";
                            setFormData(prev => ({ ...prev, remark: val }));
                            setRemarkInput(val);
                        }}
                        onInputChange={(inputValue, { action }) => {
                            if (action === "input-change") {
                                setRemarkInput(inputValue);
                            }
                        }}
                        onBlur={() => {
                            setFormData(prev => ({ ...prev, remark: remarkInput }));
                        }}
                        onCreateOption={(inputValue) => {
                            setFormData(prev => ({ ...prev, remark: inputValue }));
                            setRemarkInput(inputValue);
                        }}
                        styles={selectStyles}
                        filterOption={selectFilter}
                        placeholder="Enter remarks here..."
                        isClearable
                    />
                </div>
                <div className="flex flex-col gap-y-1">
                    <label htmlFor="packing_option" className="text-xl font-semibold">Packing Option</label>
                    <div className="flex flex-row gap-x-1 text-xl">
                        <input
                            className="cursor-pointer"
                            id="Fold" type="radio"
                            name="packing_option"
                            value="Fold"
                            onChange={(e) => setFormData(prev => ({ ...prev, packing_option: e.target.value }))}
                            checked={formData.packing_option === "Fold"}
                        />
                        <label className="cursor-pointer" htmlFor="Fold">Fold</label>

                        <input
                            className="cursor-pointer"
                            id="Hanger" type="radio"
                            name="packing_option"
                            value="Hanger"
                            onChange={(e) => setFormData(prev => ({ ...prev, packing_option: e.target.value }))}
                            checked={formData.packing_option === "Hanger"}
                        />
                        <label className="cursor-pointer" htmlFor="Hanger">Hanger</label>
                    </div>
                </div>
            </div>

            <p className="text-center text-red-500 font-medium mt-3">{errorMessage}</p>

            <div className="flex flex-row gap-x-5 px-10 text-xl mt-5">
                <button type="submit" className="font-semibold text-white bg-primary rounded-full py-2 w-full cursor-pointer">Add</button>

                <button type="button" className="font-semibold text-primary bg-white border border-primary rounded-full py-2 w-full cursor-pointer" onClick={handleClose}>Cancel</button>
            </div>
        </form>
    );
};

export default RetailAddItemToOrderForm;