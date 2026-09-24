import { Icon } from "@iconify/react/dist/iconify.js";
import { HiOutlineArrowCircleLeft } from "react-icons/hi";
import { useNavigate } from "react-router-dom";
import { getAllUserRoles } from "../../../services/UserServices";
import { useEffect, useState } from "react";
import { ImCheckboxChecked, ImCheckboxUnchecked } from "react-icons/im";
import Select from "react-select";

const Report = () => {
    const navigate = useNavigate();
    const [userRoles, setUserRoles] = useState([]);

    const selectStyles = {
        control: (base, state) => ({
            ...base,
            backgroundColor: "white",
            borderRadius: "0.75rem", // rounded-xl
            borderColor: state.isFocused ? "#1470F9" : "#d1d5db", // gray-300
            padding: "0rem 0.25rem", // py-2 px-3
            boxShadow: "none",
            "&:hover": {
                borderColor: state.isFocused ? "#1470F9" : "#d1d5db",
            },
        }),
        placeholder: (base) => ({
            ...base,
            color: "#6B7280", // gray-400
        }),
        singleValue: (base) => ({
            ...base,
            color: "#000000",
        }),
    };

    const selectFilter = (option, inputValue) => {
        const searchWords = inputValue
            .toLowerCase()
            .split(/\s*\*\s*/)
            .filter(word => word.trim().length > 0);

        const label = option.label.toLowerCase();

        return searchWords.every(word => label.includes(word));
    };

    const [attendanceStatus, setAttendanceStatus] = useState([
        {
            name: "Present",
            isSelected: false,
        },
        {
            name: "Absent",
            isSelected: false,
        },
        {
            name: "Late",
            isSelected: false,
        },
        {
            name: "Half Day",
            isSelected: false,
        },
        {
            name: "On Leave",
            isSelected: false,
        },
    ]);

    const fetchAllUserRoles = async () => {
        const response = await getAllUserRoles();
        const filteredRoles = response.allRoles.filter(role => role.is_active === true);
        const updatedRoles = filteredRoles.map(role => ({
            role_name: role.role_name,
            role_id: role.role_id,
            isSelected: false
        }));
        setUserRoles(updatedRoles);
    };

    useEffect(() => {
        fetchAllUserRoles();
    }, []);

    const toggleRoleFilter = (roleId) => {
        setUserRoles(prev =>
            prev.map(r =>
                r.role_id === roleId
                    ? { ...r, isSelected: !r.isSelected }
                    : r
            )
        );
    };

    const currentData = [];
    const itemsPerPage = 10;
    const blankRows = itemsPerPage - currentData.length;

    return (
        <div className="flex flex-col">
            {/* Header Section */}
            <div className="flex flex-row gap-x-3 items-center">
                <HiOutlineArrowCircleLeft className="size-6 text-primary cursor-pointer" onClick={() => navigate(`/salesCorporate/corporate/report`)} />
                <h1 className="text-3xl text-primary font-bold">Report/Example</h1>
            </div>
            <p className="text-black/50 text-xl mb-5">Record new laundry pickup with item counts by category.</p>

            {/* Filter Section */}
            <div className="flex flex-col rounded-xl bg-white border border-dashed py-5 px-10 gap-y-5 mb-5">
                <h2 className="text-2xl font-semibold">Filter Options</h2>

                {/* Date Filter */}
                <div className="flex flex-col gap-y-3">
                    <div className="flex flex-row items-center gap-x-2">
                        <Icon icon="mdi:calendar" className="text-xl" />
                        <p className="text-xl font-semibold">Date Range</p>
                    </div>

                    <div className="grid grid-cols-2 gap-x-10">
                        <div className="flex flex-col gap-y-1">
                            <label htmlFor="startDate" className="text-lg">Start Date</label>
                            <input id="startDate" type="date" className="px-4 py-1 text-xl border border-black/20 rounded-lg bg-white" />
                        </div>

                        <div className="flex flex-col gap-y-1">
                            <label htmlFor="endDate" className="text-lg">End Date</label>
                            <input id="endDate" type="date" className="px-4 py-1 text-xl border border-black/20 rounded-lg bg-white" />
                        </div>
                    </div>
                </div>

                {/* User Role Filter */}
                <div className="flex flex-col gap-y-3">
                    <div className="flex flex-row items-center gap-x-2">
                        <Icon icon="solar:user-bold" className="text-xl" />
                        <p className="text-xl font-semibold">User Role</p>
                    </div>

                    <div className="grid grid-cols-5 gap-x-5 gap-y-2 flex-wrap">
                        {userRoles.map((role, index) => (
                            <div key={index} className="flex flex-row items-center gap-x-2 cursor-pointer hover:text-primary text-black" onClick={() => toggleRoleFilter(role.role_id)}>
                                {role.isSelected ? (
                                    <ImCheckboxChecked
                                        className="text-primary min-w-5 w-5"
                                    />
                                ) : (
                                    <ImCheckboxUnchecked
                                        className="min-w-5 w-5"
                                    />
                                )}
                                <p>{role.role_name}</p>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Employee Filter */}
                <div className="flex flex-col gap-y-3">
                    <div className="flex flex-row items-center gap-x-2">
                        <Icon icon="mingcute:search-line" className="text-xl" />
                        <p className="text-xl font-semibold">Employee Information</p>
                    </div>

                    <Select
                        className="col-span-3 w-full"
                        styles={selectStyles}
                        filterOption={selectFilter}
                        placeholder="Search by Employee Name or ID"
                    />
                </div>

                {/* Department Filter */}
                <div className="flex flex-col gap-y-3">
                    <div className="flex flex-row items-center gap-x-2">
                        <Icon icon="mingcute:search-line" className="text-xl" />
                        <p className="text-xl font-semibold">Department Information</p>
                    </div>

                    <Select
                        className="col-span-3 w-full"
                        styles={selectStyles}
                        filterOption={selectFilter}
                        placeholder="Search by Employee Name or ID"
                    />
                </div>

                {/* Attendance Filter */}
                <div className="flex flex-col gap-y-3">
                    <div className="flex flex-row items-center gap-x-2">
                        <Icon icon="solar:user-bold" className="text-xl" />
                        <p className="text-xl font-semibold">Attendance Status</p>
                    </div>

                    <div className="grid grid-cols-5 gap-x-5 gap-y-2 flex-wrap">
                        {attendanceStatus.map((status, index) => (
                            <div key={index} className="flex flex-row items-center gap-x-2 cursor-pointer hover:text-primary text-black" onClick={() => toggleRoleFilter(status.name)}>
                                {status.isSelected ? (
                                    <ImCheckboxChecked
                                        className="text-primary min-w-5 w-5"
                                    />
                                ) : (
                                    <ImCheckboxUnchecked
                                        className="min-w-5 w-5"
                                    />
                                )}
                                <p>{status.name}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Data Section */}
            <div className="rounded-xl bg-white overflow-hidden mb-5 border border-primary">
                <div className="text-xl grid grid-cols-9 gap-x-3 text-white bg-primary font-semibold py-2">
                    <p></p>
                    <p className="col-span-2">CUSTOMER</p>
                    <p className="col-span-2">CONTACT DETAILS</p>
                    <p>NO OF ITEMS</p>
                    <p>DELIVERED</p>
                    <p>REMAINING</p>
                    {/* <p>LAST DELIVER DATE</p> */}
                    <p className="text-center">ACTION</p>
                </div>

                {currentData.map((delivery, index) => (
                    <div key={index} className={`grid grid-cols-9 gap-x-3 text-lg py-1.5 ${index % 2 === 0 ? "bg-white" : "bg-primary/10"} items-center`}>
                        <Icon icon={"lucide:user"} className="text-primary bg-primary/20 rounded-full size-7 my-auto mx-auto p-1" />
                        <div className="col-span-2 flex flex-col">
                            <p className="font-medium">{delivery.company_name}</p>
                            <p className="text-base text-black/60 font-medium">{delivery.customer_name}</p>
                        </div>
                        <div className="col-span-2 flex flex-col">
                            <p className="font-medium">{delivery.phone_number}</p>
                            <p className="text-base text-black/60 font-medium">{delivery.address}</p>
                        </div>
                        <div className="flex flex-col">
                            <p className="font-medium">{delivery?.items?.reduce((sum, item) => sum + item.quantity, 0)}</p>
                            <p className="text-base text-black/60 font-medium">{new Set(delivery.items.map(item => item.item_category_id)).size} Categories</p>
                        </div>
                        <div className="flex flex-col">
                            <p className="font-medium">{delivery?.items?.reduce((sum, item) => sum + item.delivered_qty, 0)}</p>
                            <p className="text-base text-black/60 font-medium">{new Set(delivery.items.filter(item => item.delivered_qty > 0).map(item => item.item_category_id)).size} Categories</p>
                        </div>
                        <div className="flex flex-col">
                            <p className="font-medium">{delivery?.items?.reduce((sum, item) => sum + item.quantity, 0) - delivery.items.reduce((sum, item) => sum + item.delivered_qty, 0)}</p>
                            <p className="text-base text-black/60 font-medium">{new Set(delivery.items.filter(item => (item.quantity - item.delivered_qty) > 0).map(item => item.item_category_id)).size} Categories</p>
                        </div>
                        {/* <p className="font-medium">{delivery.lastDate}</p> */}
                        <div className="flex flex-row gap-x-1 justify-center">
                            <Link to={`${delivery.pickup_entry_id}`} className="flex flex-col cursor-pointer items-center">
                                <Icon icon={"lsicon:view-filled"} className="text-blue-500" />
                                <p className="text-sm">View</p>
                            </Link>

                            {selectedTab === 1 &&
                                <div className="min-h-max border border-black/50 my-1" />
                            }
                            {selectedTab === 1 &&
                                <Link to={`entry/${delivery.pickup_entry_id}`} state={delivery} className="flex flex-col cursor-pointer items-center">
                                    <Icon icon={"material-symbols-light:delivery-truck-bolt"} className="text-green-500" />
                                    <p className="text-sm">Deliver</p>
                                </Link>
                            }
                        </div>
                    </div>
                ))}

                {/* Render blank rows */}
                {Array.from({ length: blankRows > 0 ? blankRows : 0 }).map((_, idx) => (
                    <div
                        key={`blank-${idx}`}
                        className={`grid grid-cols-11 gap-x-3 text-lg py-1.5 ${(currentData.length + idx) % 2 === 0 ? "bg-white" : "bg-primary/10"
                            } items-center`}
                    >
                        <div className="col-span-11 h-8"></div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default Report;