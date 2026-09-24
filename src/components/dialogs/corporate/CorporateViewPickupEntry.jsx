import { useRef, useState } from "react";
import { useReactToPrint } from "react-to-print";
import { BeatLoader } from "react-spinners";
import { deactivateRetailOrder } from "../../../services/Retail/RetailOrderServices";
import CorporateCollectionNote from "../../printables/CorporateCollectionNote";

const CorporateViewPickupEntry = ({ handleClose, refreshOrders, orderItems, data, customer, itemTypes }) => {
    const [isLoading, setIsLoading] = useState(false);
    const collectionNoteRef = useRef(null);

    const itemCategoryOptions = [
        { value: 1, label: "King" },
        { value: 2, label: "Queen" },
        { value: 3, label: "Single" },
    ];

    const handlePrint = useReactToPrint({
        contentRef: collectionNoteRef
    });

    const handleDeactivate = async () => {
        try {
            setIsLoading(true);
            const payload = {
                user_id: localStorage.getItem("userId"),
                order_id: data.order_id
            };
            const response = await deactivateRetailOrder(payload);
            handleClose();
            refreshOrders();
        } catch (error) {
            console.error("Error deactivating order: ", error);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="absolute top-0 left-0 h-screen w-screen z-50 backdrop-blur-sm bg-black/10">
            <div className="relative top-1/2 left-1/2 transform -translate-y-1/2 -translate-x-1/2 bg-canvas rounded-3xl w-2/3 h-fit max-h-[90%] overflow-y-auto flex flex-col p-5">
                <h1 className="text-primary text-3xl font-bold text-center mb-2">View Order</h1>

                <CorporateCollectionNote ref={collectionNoteRef} orderItems={orderItems} data={data} customer={customer} itemTypes={itemTypes} itemCategories={itemCategoryOptions} />

                <div className="flex flex-row">
                    <button className="cursor-pointer bg-primary text-white font-bold w-fit px-20 py-1 mx-auto rounded-xl text-xl" onClick={handlePrint} disabled={isLoading}>Print</button>
                    {/* <button className="cursor-pointer bg-red-500 text-white font-bold w-fit px-20 py-1 mx-auto rounded-xl text-xl" onClick={handleDeactivate} disabled={isLoading}>{isLoading ? <BeatLoader color="#fff" size={10} /> : "Cancel Order"}</button> */}
                    <button className="cursor-pointer bg-black/50 text-white font-bold w-fit px-20 py-1 mx-auto rounded-xl text-xl" onClick={handleClose} disabled={isLoading}>Close</button>
                </div>
            </div>
        </div>
    );
};

export default CorporateViewPickupEntry;