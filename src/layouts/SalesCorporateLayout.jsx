import { Outlet } from "react-router-dom";
import backgroundShape from "../assets/background_shape.svg";
import backgroundShapeRotate from "../assets/background_shape_rotate.svg";
import Topbar from "../components/ui/topbar/Topbar";
import SalesCorporateSidebar from "../components/ui/sidebar/corporate/SalesCorporateSidebar";

const SalesCorporateLayout = () => {
    return (
        <div className="flex flex-row w-screen h-screen bg-canvas">
            <img className="fixed origin-center top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-4/5 z-0 pointer-events-none" src={backgroundShape} />
            <img className="fixed origin-center top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-4/5 z-0 pointer-events-none -rotate-45" src={backgroundShapeRotate} />

            <SalesCorporateSidebar />

            <div className="flex flex-col flex-1 min-h-0 overflow-hidden z-10">
                <Topbar />
                <div id="main-content" className="flex-1 min-h-0 overflow-auto px-5">
                    <Outlet />
                </div>
            </div>
        </div>
    );
};

export default SalesCorporateLayout;