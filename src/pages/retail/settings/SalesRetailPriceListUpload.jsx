import { HiOutlineArrowCircleLeft } from "react-icons/hi";
import { useNavigate } from "react-router-dom";
import FileInput from "../../../components/ui/FileInput";
import { Icon } from "@iconify/react/dist/iconify.js";
import { useEffect, useState } from "react";
import { getPriceListHistory, uploadPriceListsRetail } from "../../../services/Retail/RetailSettingsServices";
import { getAllUsers } from "../../../services/UserServices";
import { BeatLoader } from "react-spinners";
import { usePagePermission } from "../../../utils/usePagePermission";
import PermissionDenied from "../../../components/ui/PermissionDenied";
import Swal from "sweetalert2";

const SalesRetailPriceListUpload = () => {
    const navigate = useNavigate();
    const [isLoading, setIsLoading] = useState(false);
    const [priceListHistoryEntries, setPriceListHistoryEntries] = useState(3);
    const [showPriceListUploadDialog, setShowPriceListUploadDialog] = useState(false);
    const [priceListUploadHistory, setPriceListUploadHistory] = useState([]);
    const [users, setUsers] = useState([]);
    const { allowed } = usePagePermission("SalesRetail_Settings_Price_List_Create");

    const fetchPriceListHistory = async () => {
        try {
            const response = await getPriceListHistory(localStorage.getItem("userId"));
            setPriceListUploadHistory(response.data.price_list_history);
        } catch (error) {
            console.error("Error fetching price list history: ", error);
        }
    };

    const fetchAllUsers = async () => {
        try {
            const response = await getAllUsers();
            setUsers(response.allUsers);
        } catch (error) {
            console.error("Error fetching price list history: ", error);
        }
    };

    useEffect(() => {
        fetchPriceListHistory();
        fetchAllUsers();
    }, []);

    if (!allowed) return <PermissionDenied required="SalesRetail_Settings_Price_List_Create" label="Price List Upload" />;

    const handlePriceListUpload = async (file) => {
        setIsLoading(true);
        setShowPriceListUploadDialog(true);

        try {
            const formData = new FormData();
            formData.append("user_id", localStorage.getItem("userId"));
            formData.append("file", file);
            const response = await uploadPriceListsRetail(formData);
            await Swal.fire({
                icon: "success",
                title: "Upload Successful",
                text: "The price list has been successfully uploaded.",
                confirmButtonColor: "#1470F9",
            });
            navigate("/salesCorporate/retail/settings");
        } catch (error) {
            console.error("Error when uploading price list: ", error);
            const errorMessage = error?.response?.data?.message || error?.response?.data?.error || "There was an error uploading the price list. Please try again.";
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
        <div>
            <div className="flex flex-row gap-x-3 items-center">
                <HiOutlineArrowCircleLeft className="size-6 text-primary cursor-pointer" onClick={() => navigate(`/salesCorporate/retail/settings`)} />
                <h1 className="text-3xl font-bold text-primary">Retail Settings/Price List/Upload New Price List</h1>
            </div>
            <p className="text-black/50 text-xl">Update the price list by uploading a new price list.</p>

            <div className="bg-white rounded-xl mt-5">
                <div className="flex flex-col gap-y-8 px-10 py-5">
                    <div className="flex flex-row items-center gap-x-5">
                        <div className="flex flex-col">
                            <h3 className="text-3xl font-semibold">Price List Upload</h3>
                            <p className="text-xl text-black/50">Easily upload or update your latest product or service price list. Supported formats: Excel (.xlsx) or CSV (.csv). Make sure your file follows the correct format to ensure a smooth update.</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 bg-primary/20 rounded-3xl text-black/50  text-xl px-5 py-3 gap-y-3">

                        <p className="col-span-2 text-primary font-bold text-2xl">Latest Update</p>

                        <p className="flex flex-row items-center gap-x-2">
                            <Icon
                                className="text-primary size-5"
                                icon={'mdi:file'}
                            />
                            {priceListUploadHistory[0]?.fileName}
                        </p>
                        <p className="flex flex-row items-center gap-x-2">
                            <Icon
                                className="text-primary size-5"
                                icon={'mingcute:time-fill'}
                            />
                            {new Date(priceListUploadHistory[0]?.uploaded_at).toLocaleDateString()}
                        </p>
                        <p className="flex flex-row items-center gap-x-2">
                            <Icon
                                className="text-primary size-5"
                                icon={'mdi:user'}
                            />
                            {users.find(user => user.user_id === priceListUploadHistory[0]?.uploaded_By)?.name}
                        </p>
                        <p className="flex flex-row items-center gap-x-2">
                            <Icon
                                className="text-primary size-5"
                                icon={'mdi:storage'}
                            />
                            {(priceListUploadHistory[0]?.file_size / (1024 * 1024)).toFixed(2)} MB
                        </p>
                    </div>

                    {!isLoading &&
                        <FileInput button={"Upload Price List Sheet"} onUpload={handlePriceListUpload} />
                    }

                    {isLoading &&
                        <div className="flex items-center justify-center bg-white rounded-xl py-10 border border-primary">
                            <BeatLoader color="#1470F9" size={20} />
                        </div>
                    }

                    <h4 className="text-2xl text-black/50 font-semibold -mb-5">Price List Upload History</h4>

                    <div className="border border-black/20 rounded-3xl overflow-hidden">
                        <div className="grid grid-cols-4 bg-black/30 px-10 py-2 text-2xl">
                            <p>File</p>
                            <p>Upload date</p>
                            <p>Upload by</p>
                            <p>Size</p>
                        </div>
                        {priceListUploadHistory.slice(0, priceListHistoryEntries).map((upload, index) => (
                            <div key={index} className="grid grid-cols-4 px-10 py-2 text-xl">
                                <p className="flex flex-row items-center gap-x-2 truncate">
                                    <Icon
                                        className="text-primary size-4"
                                        icon={'mdi:file'}
                                    />
                                    {upload.fileName}
                                </p>
                                <p className="flex flex-row items-center gap-x-2">
                                    <Icon
                                        className="text-primary size-4"
                                        icon={'mingcute:time-fill'}
                                    />
                                    {new Date(upload.uploaded_at).toLocaleDateString()}
                                </p>
                                <p className="flex flex-row items-center gap-x-2 truncate">
                                    <Icon
                                        className="text-primary size-4"
                                        icon={'mdi:user'}
                                    />
                                    {users.find(user => user.user_id === upload.uploaded_By)?.name || "Unknown"}
                                </p>
                                <p className="flex flex-row items-center gap-x-2">
                                    <Icon
                                        className="text-primary size-4"
                                        icon={'mdi:storage'}
                                    />
                                    {(upload.file_size / (1024 * 1024)).toFixed(2)} MB
                                </p>
                            </div>
                        ))}
                        <p
                            className="text-primary text-xl font-bold text-center cursor-pointer"
                            onClick={() => {
                                if (priceListHistoryEntries > 3) {
                                    setPriceListHistoryEntries(priceListHistoryEntries - 7);
                                } else {
                                    setPriceListHistoryEntries(priceListHistoryEntries + 7);
                                }
                            }}>{priceListHistoryEntries > 3 ? "View Less" : "View More"}</p>
                    </div>
                </div>
            </div>
        </div >
    );
};

export default SalesRetailPriceListUpload;