import logo from "../../../../assets/logo.png";
import backgroundShape from "../../../../assets/background_shape.svg";
import sidebarShape from "../../../../assets/sidebar_shape.svg";
import sidebarElipse from "../../../../assets/sidebar_elipse.svg";
import { useEffect, useState } from "react";
import { Icon } from "@iconify/react/dist/iconify.js";
import { Link, useLocation } from "react-router-dom";
import { useCorporateMenuItems } from "./SalesCorporateMenuItems";

const SalesCorporateSidebar = () => {
    const menuItems = useCorporateMenuItems();
    const filteredMenuItems = menuItems.filter(item =>
        item.available === true
    );
    const [selected, setSelected] = useState(-1);
    const location = useLocation();

    useEffect(() => {
        const index = filteredMenuItems.findIndex(item => location.pathname.startsWith(item.page));
        if (index !== -1) {
            setSelected(index);
        }
    }, [location.pathname, menuItems]);

    return (
        <div className="relative bg-white lg:min-w-44 z-10 flex flex-col h-screen pt-3 pb-5 overflow-hidden">
            <img src={backgroundShape} className="absolute top-0 -left-5 -rotate-15 z-0" />
            <img src={sidebarShape} className="absolute top-2 left-5 w-20 z-0" />
            <img src={sidebarElipse} className="absolute top-1/2 left-0 transform -translate-y-1/2 w-20 z-0" />
            <img src={sidebarElipse} className="absolute -bottom-10 right-0 transform scale-x-[-1] w-20 z-0" />

            <div className="flex flex-col lg:flex-row items-center lg:items-end z-10">
                <img src={logo} className="w-12 lg:w-24" />
                <p className="text-primary text-lg lg:text-2xl font-bold">SALES</p>
            </div>

            <div className="flex flex-col z-10 mt-10">
                {filteredMenuItems
                    .map((item, index) => (
                        <Link to={item.page} className={`flex flex-row px-5 items-center py-3 gap-x-2 border-l-3 ${index === selected ? "border-primary bg-gradient-to-r from-primary/60 to-transparent" : "border-transparent"}`} key={index}>
                            <Icon icon={item.icon} className={`size-5 ${index === selected ? "text-primary" : "text-black"}`} />
                            <p className={`hidden lg:block font-bold text-xl ${index === selected ? "text-primary" : "text-black/50"}`}>{item.name}</p>
                        </Link>
                    ))}
            </div>

            <a href={import.meta.env.VITE_APP_BASE_URL || window.location.origin} className="flex flex-row items-center px-5 mt-auto gap-x-2 text-black/50 hover:text-red-500">
                <Icon icon={"mdi:logout"} className="size-5" />
                <p className="hidden lg:block font-bold text-xl">Back to Apps</p>
            </a>
        </div>
    );
};

export default SalesCorporateSidebar;