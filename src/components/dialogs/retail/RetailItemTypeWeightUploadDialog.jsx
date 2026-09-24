import { Icon } from "@iconify/react/dist/iconify.js";
import { useState } from "react";
import { BeatLoader } from "react-spinners";
import Swal from "sweetalert2";
import FileInput from "../../ui/FileInput";
import { uploadItemTypeWeights } from "../../../services/Retail/RetailSettingsServices";

const RetailItemTypeWeightUploadDialog = ({ onClose, onUploaded }) => {
    const [isLoading, setIsLoading] = useState(false);

    const handleUpload = async (file) => {
        if (!file) return;
        setIsLoading(true);
        try {
            const formData = new FormData();
            formData.append("user_id", localStorage.getItem("userId"));
            formData.append("file", file);
            await uploadItemTypeWeights(formData);
            await Swal.fire({
                icon: "success",
                title: "Upload Successful",
                text: "Item weights have been updated successfully.",
                confirmButtonColor: "#1470F9",
            });
            onUploaded?.();
            onClose?.();
        } catch (error) {
            console.error("Error uploading item type weights:", error);
            const errorMessage = error?.response?.data?.message || "There was an error updating the item weights. Please try again.";
            await Swal.fire({
                icon: "error",
                title: "Upload Failed",
                text: errorMessage,
                confirmButtonColor: "#1470F9",
            });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="absolute top-0 left-0 h-screen w-screen z-[90] backdrop-blur-sm bg-black/20">
            <div className="relative top-1/2 left-1/2 w-[90%] max-w-2xl transform -translate-x-1/2 -translate-y-1/2 bg-canvas rounded-2xl p-8">
                <div className="flex items-start justify-between">
                    <div>
                        <h2 className="text-3xl font-bold text-primary">Edit Item Weights</h2>
                        <p className="text-black/50 text-lg mt-1">
                            Update the weight of existing item types by uploading the filled-in file template.
                        </p>
                    </div>
                    <button className="cursor-pointer rounded-full bg-primary/20 p-3 text-primary" onClick={onClose} aria-label="Close">
                        <Icon icon={"mdi:close"} className="size-7" />
                    </button>
                </div>

                <div className="mt-5">
                    {isLoading
                        ? <div className="flex items-center justify-center bg-white rounded-xl py-10 border border-primary">
                            <BeatLoader color="#1470F9" size={20} />
                        </div>
                        : <FileInput button={"Upload Item Weights Sheet"} onUpload={handleUpload} />
                    }
                </div>
            </div>
        </div>
    );
};

export default RetailItemTypeWeightUploadDialog;
