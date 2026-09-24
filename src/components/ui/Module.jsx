import { Icon } from "@iconify/react/dist/iconify.js";
import { Link } from "react-router-dom";

const Module = ({ icon, title, description, path }) => {
    return (
        <Link to={path} className="flex flex-col items-center mx-auto cursor-pointer">
            {/* Ring + Icon wrapper */}
            <div className="relative w-32 h-32 rounded-full">
                {/* Ring layer */}
                <div
                    className="absolute inset-0 rounded-full"
                    style={{
                        background:
                            "conic-gradient(from -15deg, transparent 0% 2%, #1470F933 2% 10%, transparent 10% 15%, #1470F933 15% 20%, transparent 20% 22%, #1470F9 22% 100%)",
                        WebkitMask:
                            "radial-gradient(farthest-side, transparent calc(100% - 20px), black calc(100% - 19px))"
                    }}
                ></div>

                {/* Icon layer */}
                <Icon
                    icon={icon}
                    className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 size-8 z-10 text-primary"
                />
            </div>

            {/* Text under ring */}
            <p className="text-xl font-semibold">{title}</p>
            <p className="text-center">{description}</p>
        </Link>
    );
};

export default Module;