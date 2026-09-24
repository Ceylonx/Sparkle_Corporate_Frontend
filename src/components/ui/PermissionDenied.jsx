import { Icon } from "@iconify/react/dist/iconify.js";

const PermissionDenied = ({ label = "this page" }) => {
    return (
        <div className="flex flex-col gap-y-3 items-center justify-center min-h-[70vh] px-4 text-center mx-auto max-w-xl">
            <Icon icon="mdi:lock-outline" className="text-black/30 size-16" />
            <p className="text-xl font-semibold text-black/70">You don't have access to {label}.</p>
            <p className="text-base text-black/50">Please contact your administrator if you need access to this section.</p>
            <p className="text-sm text-black/40">If your access was recently changed, log out and log back in (or refresh) to pick up the update.</p>
        </div>
    );
};

export default PermissionDenied;
