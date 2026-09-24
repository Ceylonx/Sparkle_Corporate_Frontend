import logo from "../assets/logo.png";
import cxLogo from "../assets/cx_logo.png";
import backgroundShape from "../assets/background_shape.svg";
import backgroundShapeRotate from "../assets/background_shape_rotate.svg";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Module from "../components/ui/Module";
import { Icon } from "@iconify/react/dist/iconify.js";

const SelectionScreen = () => {
    const navigate = useNavigate();
    const moduleAccess = localStorage.getItem("moduleAccess")
        ? localStorage.getItem("moduleAccess").split(",").map(m => m.trim())
        : [];
    const userRole = localStorage.getItem("role");
    const options = [
        {
            icon: "fluent:building-retail-more-20-filled",
            title: "Retail",
            description: "Manage your workforce from hiring to retirement — all in one place.",
            path: '/salesCorporate/retail/attendance',
            access: ["Retail_Sales_Module"],
        },
        {
            icon: "tdesign:cooperate-filled",
            title: "Corporate",
            description: "Manage your workforce from hiring to retirement — all in one place.",
            path: '/salesCorporate/corporate/dashboard',
            access: ["Cooperate_Sales_Module"],
        },
    ];

    const filteredOptions = options.filter((module) => {
        const hasAccess = module.access.some(acc => moduleAccess.includes(acc));

        return hasAccess;
    });

    // Restore last selected option from localStorage, default to Retail (index 0) if available
    const getInitialSelectedOption = () => {
        const lastSelected = localStorage.getItem("selectedSalesModule");
        if (lastSelected) {
            const index = filteredOptions.findIndex(opt => opt.title === lastSelected);
            if (index !== -1) return index;
        }
        // Default to Retail (index 0) if it's available in filteredOptions
        const retailIndex = filteredOptions.findIndex(opt => opt.title === "Retail");
        return retailIndex !== -1 ? retailIndex : 0;
    };

    const [selectedOption, setSelectedOption] = useState(getInitialSelectedOption);

    // Save selection to localStorage when changed
    const handleSelectOption = (index) => {
        setSelectedOption(index);
        const selectedTitle = filteredOptions[index]?.title;
        if (selectedTitle) {
            localStorage.setItem("selectedSalesModule", selectedTitle);
        }
    };

    return (
        <div className="flex flex-col relative min-h-screen">
            <img className="fixed origin-center top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-4/5 z-0 pointer-events-none" src={backgroundShape} />
            <img className="fixed origin-center top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-4/5 z-0 pointer-events-none -rotate-45" src={backgroundShapeRotate} />

            <div className="flex flex-col items-center gap-5">
                <a href={import.meta.env.VITE_APP_BASE_URL || window.location.origin} className="absolute left-8 top-5 flex flex-row gap-x-1 items-center text-primary text-3xl font-bold">
                    <Icon icon={'ion:arrow-back-circle'} />
                    <p>Back</p>
                </a>

                <img src={logo} className="w-80" />

                <h1 className="font-bold text-4xl text-primary">Sales</h1>

                <div className="grid grid-cols-2 w-2/3 mt-5 gap-5">
                    {filteredOptions.map((module, index) => (
                        <div key={index} className={`border ${selectedOption === index ? "border-solid bg-primary/20 border-2" : "border-dashed"} border-primary hover:border-solid p-5 rounded-xl w-fit mx-auto`} onClick={() => handleSelectOption(index)}>
                            <Module
                                key={index}
                                icon={module.icon}
                                title={module.title}
                                description={module.description}
                                path={module.path}
                            />
                        </div>
                    ))}
                </div>

                <button
                    className="bg-primary text-white text-3xl font-bold rounded-lg py-1 px-5 mt-3 cursor-pointer w-1/4 mt-10"
                    onClick={() => {
                        if (selectedOption < 0 || selectedOption >= filteredOptions.length) return;
                        const selectedModule = filteredOptions[selectedOption];
                        const path = selectedModule.path;
                        const role = (userRole || "").toLowerCase();
                        const isSuperAdmin = role === "superadmin";
                        
                        // Save the selection to localStorage
                        localStorage.setItem("selectedSalesModule", selectedModule.title);
                        
                        if (path === "/salesCorporate/retail/attendance") {
                            if (isSuperAdmin) {
                                localStorage.setItem("selectedBranchId", "10");
                                localStorage.setItem("selectedBranchName", "Orugodawatta");
                                localStorage.setItem("isDayStarted", "true");
                                navigate("/salesCorporate/retail/dashboard");
                            } else {
                                navigate(path);
                            }
                        } else {
                            navigate(path);
                        }
                    }}
                >
                    Next
                </button>
            </div>

            <a
                href="https://ceylonx.lk"
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-row mt-auto mb-3 ms-auto items-center gap-x-2 me-3"
            >
                <p className="text-black/50 font-bold">Powered by</p>
                <img src={cxLogo} className="h-3" />
            </a>
        </div >
    );
};

export default SelectionScreen;