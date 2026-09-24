import { HiOutlineArrowCircleLeft } from "react-icons/hi";
import { useNavigate, useParams } from "react-router-dom";
import FileInput from "../../../components/ui/FileInput";
import { Icon } from "@iconify/react/dist/iconify.js";
import { useEffect, useState } from "react";
import { BeatLoader } from "react-spinners";
import { getCorporatePriceListHistory, uploadCorporateItemsList } from "../../../services/corporate/CorporateSettingsServices";
import { getAllUsers } from "../../../services/UserServices";
import Swal from "sweetalert2";

const SalesCorporatePriceListUpload = () => {
    const navigate = useNavigate();
    const { id } = useParams();
    const [isLoading, setIsLoading] = useState(false);
    const [priceListHistoryEntries, setPriceListHistoryEntries] = useState(3);
    const [priceListUploadHistory, setPriceListUploadHistory] = useState([]);
    const [users, setUsers] = useState([]);

    const fetchPriceListUploadHistory = async () => {
        try {
            const payload = {
                user_id: localStorage.getItem("userId"),
                customer_id: id
            };
            const response = await getCorporatePriceListHistory(payload);
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
        fetchPriceListUploadHistory();
        fetchAllUsers();
    }, []);

    const handlePriceListUpload = async (file) => {
        setIsLoading(true);

        try {
            const formData = new FormData();
            formData.append("user_id", localStorage.getItem("userId"));
            formData.append("customer_id", id);
            formData.append("file", file);
            const response = await uploadCorporateItemsList(formData);
            
            await Swal.fire({
                title: "Upload Successful",
                text: "The corporate items list has been uploaded successfully.",
                icon: "success",
                confirmButtonColor: "#1470F9",
            });

            navigate("/salesCorporate/corporate/settings");

        } catch (error) {
            console.error("Error when uploading price list data: ", error);
            await Swal.fire({
                title: "Upload Failed",
                text: "There was an error uploading the file. Please try again.",
                icon: "error",
                confirmButtonColor: "#1470F9",
            });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div>
            <div className="flex flex-row gap-x-3 items-center">
                <HiOutlineArrowCircleLeft className="size-6 text-primary cursor-pointer" onClick={() => navigate(`/salesCorporate/corporate/settings`)} />
                <h1 className="text-3xl font-bold text-primary">Corporate Settings/Price List/Upload New Price List</h1>
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
                            {priceListUploadHistory[0]?.uploaded_at ? new Date(priceListUploadHistory[0]?.uploaded_at).toLocaleDateString() : "-"}
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
                            {priceListUploadHistory[0]?.file_size ? `${(priceListUploadHistory[0]?.file_size / (1024 * 1024)).toFixed(2)} MB` : "0 MB"} :
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
                                <p className="flex flex-row items-center gap-x-2">
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
                                <p className="flex flex-row items-center gap-x-2">
                                    <Icon
                                        className="text-primary size-4"
                                        icon={'mdi:user'}
                                    />
                                    {users.find(user => user.user_id === upload.uploaded_By)?.name}
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

export default SalesCorporatePriceListUpload;