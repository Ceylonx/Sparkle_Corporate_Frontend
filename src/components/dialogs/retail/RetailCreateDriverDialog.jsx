import React, { useState } from "react";
import { BeatLoader } from "react-spinners";
import { createRetailDriver } from "../../../services/Retail/RetailDriverServices";
import Swal from "sweetalert2";

const RetailCreateDriverDialog = ({ handleClose, refreshDrivers }) => {
    const [name, setName] = useState("");
    const [nic, setNic] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    const handleNicChange = (e) => {
        const input = e.target.value;
        let filtered = "";
        for (let i = 0; i < input.length; i++) {
            const char = input[i];
            if (i < 9) {
                if (/^\d$/.test(char)) {
                    filtered += char;
                }
            } else if (i === 9) {
                if (/^[\dvV]$/.test(char)) {
                    filtered += char.toUpperCase();
                }
            } else {
                const tenthChar = filtered[9];
                if (tenthChar !== "V" && /^\d$/.test(char)) {
                    filtered += char;
                }
            }
        }
        if (filtered[9] === "V") {
            filtered = filtered.substring(0, 10);
        } else {
            filtered = filtered.substring(0, 12);
        }
        setNic(filtered);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!name.trim() || !nic.trim()) return;

        const cleanNic = nic.trim();
        if (cleanNic.length === 10) {
            const regexOld = /^\d{9}V$/;
            if (!regexOld.test(cleanNic)) {
                Swal.fire({
                    icon: "warning",
                    title: "Invalid NIC",
                    text: "Old NIC format must be 9 digits followed by 'V'."
                });
                return;
            }
        } else if (cleanNic.length === 12) {
            const regexNew = /^\d{12}$/;
            if (!regexNew.test(cleanNic)) {
                Swal.fire({
                    icon: "warning",
                    title: "Invalid NIC",
                    text: "New NIC format must contain exactly 12 digits."
                });
                return;
            }
        } else {
            Swal.fire({
                icon: "warning",
                title: "Invalid NIC",
                text: "NIC must be either 10 characters (Old version) or 12 digits (New version)."
            });
            return;
        }

        try {
            setIsLoading(true);
            const res = await createRetailDriver({ name: name.trim(), nic: cleanNic });
            if (res && res.success) {
                Swal.fire({
                    icon: "success",
                    title: "Success",
                    text: "Driver added successfully!",
                    timer: 2000,
                    showConfirmButton: false
                });
                refreshDrivers();
                handleClose();
            } else {
                Swal.fire({
                    icon: "error",
                    title: "Error",
                    text: res?.message || "Failed to add driver"
                });
            }
        } catch (error) {
            console.error("Error creating driver:", error);
            Swal.fire({
                icon: "error",
                title: "Error",
                text: "An error occurred while creating driver"
            });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="absolute top-0 left-0 h-screen w-screen z-50 backdrop-blur-sm bg-black/10">
            <div className="relative top-1/2 left-1/2 transform -translate-y-1/2 -translate-x-1/2 bg-canvas rounded-3xl w-1/3 h-fit max-h-[90%] overflow-y-auto flex flex-col p-5">
                <h1 className="text-primary text-3xl font-bold text-center mb-2">Add New Driver</h1>
                <p className="text-black/50 text-center mb-5">Save driver name and NIC number details.</p>

                <form onSubmit={handleSubmit} className="flex flex-col gap-y-5">
                    <div className="flex flex-col gap-y-1">
                        <label className="font-semibold text-lg">Driver Name</label>
                        <input
                            type="text"
                            required
                            placeholder="Enter driver name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="px-4 py-2 border border-black/20 rounded-xl focus:outline-none focus:border-primary text-lg bg-transparent"
                        />
                    </div>

                    <div className="flex flex-col gap-y-1">
                        <label className="font-semibold text-lg">NIC Number</label>
                        <input
                            type="text"
                            required
                            placeholder="Enter NIC number"
                            value={nic}
                            onChange={handleNicChange}
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
                            {isLoading ? <BeatLoader color="#fff" size={8} /> : "Save"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default RetailCreateDriverDialog;
