import React, { useState } from "react";
import { BeatLoader } from "react-spinners";
import { updateRetailVehicle } from "../../../services/Retail/RetailVehicleServices";
import Swal from "sweetalert2";

const RetailUpdateVehicleDialog = ({ vehicle, handleClose, refreshVehicles }) => {
    const [vehicleNumber, setVehicleNumber] = useState(vehicle?.vehicle_number || "");
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!vehicleNumber.trim()) return;

        try {
            setIsLoading(true);
            const res = await updateRetailVehicle(vehicle.id, {
                vehicle_number: vehicleNumber.trim().toUpperCase()
            });
            if (res && res.success) {
                Swal.fire({
                    icon: "success",
                    title: "Success",
                    text: "Vehicle updated successfully!",
                    timer: 2000,
                    showConfirmButton: false
                });
                refreshVehicles();
                handleClose();
            } else {
                Swal.fire({
                    icon: "error",
                    title: "Error",
                    text: res?.message || "Failed to update vehicle"
                });
            }
        } catch (error) {
            console.error("Error updating vehicle:", error);
            Swal.fire({
                icon: "error",
                title: "Error",
                text: "An error occurred while updating vehicle"
            });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="absolute top-0 left-0 h-screen w-screen z-50 backdrop-blur-sm bg-black/10">
            <div className="relative top-1/2 left-1/2 transform -translate-y-1/2 -translate-x-1/2 bg-canvas rounded-3xl w-1/3 h-fit max-h-[90%] overflow-y-auto flex flex-col p-5">
                <h1 className="text-primary text-3xl font-bold text-center mb-2">Edit Vehicle Details</h1>
                <p className="text-black/50 text-center mb-5">Modify vehicle number details.</p>

                <form onSubmit={handleSubmit} className="flex flex-col gap-y-5">
                    <div className="flex flex-col gap-y-1">
                        <label className="font-semibold text-lg">Vehicle Number</label>
                        <input
                            type="text"
                            required
                            placeholder="e.g. WP CAA-1234"
                            value={vehicleNumber}
                            onChange={(e) => setVehicleNumber(e.target.value)}
                            className="px-4 py-2 border border-black/20 rounded-xl focus:outline-none focus:border-primary text-lg bg-transparent"
                        />
                    </div>

                    <div className="flex flex-row justify-end gap-x-3 mt-3">
                        <button
                            type="button"
                            onClick={handleClose}
                            className="px-5 py-2 font-bold rounded-xl border border-red-500 text-red-500 bg-white hover:bg-red-50 cursor-pointer"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="px-5 py-2 font-bold rounded-xl bg-primary text-white hover:bg-primary-dark disabled:opacity-50 cursor-pointer"
                        >
                            {isLoading ? <BeatLoader color="#fff" size={8} /> : "Save Changes"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default RetailUpdateVehicleDialog;
