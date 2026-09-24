import { Icon } from "@iconify/react/dist/iconify.js";

// Replaces the old single "Today" toggle with a Start Date / End Date range.
// Both inputs default to blank; the filter only takes effect once the caller
// detects both dates have been picked (see isDateRangeFilterActive).
const DateRangeFilter = ({ startDate, endDate, onStartDateChange, onEndDateChange, isActive }) => {
    return (
        <div className="flex flex-row items-center gap-x-2">
            <div className={`flex flex-row items-center rounded-xl bg-white text-lg gap-x-2 px-4 border cursor-pointer ${isActive ? "text-primary border-primary" : "text-black/50 border-black/50"}`}>
                <Icon icon={"lets-icons:date-fill"} />
                <input
                    type="date"
                    className="bg-transparent outline-none font-semibold cursor-pointer"
                    value={startDate}
                    max={endDate || undefined}
                    onChange={(e) => onStartDateChange(e.target.value)}
                    aria-label="Start date"
                />
            </div>
            <span className="text-black/40 font-semibold">to</span>
            <div className={`flex flex-row items-center rounded-xl bg-white text-lg gap-x-2 px-4 border cursor-pointer ${isActive ? "text-primary border-primary" : "text-black/50 border-black/50"}`}>
                <Icon icon={"lets-icons:date-fill"} />
                <input
                    type="date"
                    className="bg-transparent outline-none font-semibold cursor-pointer"
                    value={endDate}
                    min={startDate || undefined}
                    onChange={(e) => onEndDateChange(e.target.value)}
                    aria-label="End date"
                />
            </div>
        </div>
    );
};

export default DateRangeFilter;
