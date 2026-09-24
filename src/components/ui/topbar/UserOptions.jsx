import { BiCog, BiEdit, BiLogOut } from "react-icons/bi";
import { FaUserPlus, FaUsers } from "react-icons/fa";
import { Icon } from "@iconify/react/dist/iconify.js";

const UserOptions = ({ handleLogout, handleDayEnd, branchName }) => {
    const nameToShow = branchName || localStorage.getItem("selectedBranchName") || "";
    return (
        <div className="absolute z-50 flex flex-col top-1 right-1 bg-white rounded-2xl p-3 gap-y-1">
            <div className="flex flex-row gap-x-5 items-center">
                <div className="flex flex-col text-black/70 font-bold">
                    <p className="text-2xl">{localStorage.getItem("userName") || "User"}</p>
                    <p className="text-xl">{localStorage.getItem("role") || "Role"}</p>
                    {nameToShow && (
                        <p className="text-lg text-black/50 mt-1">{nameToShow}</p>
                    )}
                </div>
                <div className="relative">
                    <Icon icon={"mdi:user"} className="bg-primary/20 text-primary rounded-full p-1 size-10"/>
                </div>
            </div>

            <hr className="border-primary/50 my-3" />

            {/* <div className="flex flex-row gap-x-5 items-center hover:bg-primary/20 rounded-2xl px-3 py-1 group cursor-pointer" >
                <BiCog className="size-10 bg-primary/20 group-hover:bg-transparent text-primary rounded-full p-2" />
                <p className="text-2xl text-black/50 font-semibold">Settings</p>
            </div> */}

            <div className="flex flex-row gap-x-5 items-center hover:bg-orange-500/20 rounded-2xl px-3 py-1 group cursor-pointer" onClick={handleDayEnd}>
                <Icon icon={"mdi:weather-sunset"} className="size-8 bg-orange-500/20 group-hover:bg-transparent text-orange-500 rounded-full p-1.5" />
                <p className="text-xl text-black/50 font-semibold">Day End</p>
            </div>

            <div className="flex flex-row gap-x-5 items-center hover:bg-primary/20 rounded-2xl px-3 py-1 group cursor-pointer" onClick={handleLogout}>
                <BiLogOut className="size-8 bg-primary/20 group-hover:bg-transparent text-primary rounded-full p-1.5" />
                <p className="text-xl text-black/50 font-semibold">Sign Out</p>
            </div>

            {/* <hr className="border-primary/50 my-3" />

            <div className="flex flex-row gap-x-5 items-center hover:bg-primary/20 rounded-2xl px-3 py-1 group cursor-pointer" onClick={handleUserCreate} >
                <FaUserPlus className="size-10 bg-primary/20 group-hover:bg-transparent text-primary rounded-full p-2" />
                <p className="text-2xl text-black/50 font-semibold">Create New User</p>
            </div>

            <div className="flex flex-row gap-x-5 items-center hover:bg-primary/20 rounded-2xl px-3 py-1 group cursor-pointer" onClick={handleViewUsers}>
                <FaUsers className="size-10 bg-primary/20 group-hover:bg-transparent text-primary rounded-full p-2" />
                <p className="text-2xl text-black/50 font-semibold">View All Users</p>
            </div> */}
        </div>
    );
};

export default UserOptions;