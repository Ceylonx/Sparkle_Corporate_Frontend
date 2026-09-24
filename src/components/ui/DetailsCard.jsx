const DetailsCard = ({ title, icon, value, label1, value1, label2, value2, extraDetails, onClick }) => {
    return (
        <div
            className={`flex flex-col bg-white rounded-2xl p-5 gap-y-2 justify-center ${onClick ? "cursor-pointer" : ""}`}
            onClick={onClick}
        >
            <div className="flex flex-row justify-between items-center">
                <p className="text-xl text-black/50 font-semibold">{title}</p>
                {icon}
            </div>

            <p className="text-2xl font-semibold">{value}</p>

            {extraDetails &&
                <div>
                    <hr className="border-black/20" />

                    <div>
                        <div className="flex flex-row justify-between items-center text-base">
                            <p className="text-black/50">{label1}</p>
                            <p >{value1}</p>
                        </div>

                        <div className="flex flex-row justify-between items-center text-base">
                            <p className="text-black/50">{label2}</p>
                            <p>{value2}</p>
                        </div>
                    </div>
                </div>
            }
        </div>
    );
};

export default DetailsCard;