import { useNavigate } from "react-router-dom";
import { useEffect, useRef } from "react";

const INACTIVITY_LIMIT = 15 * 60 * 1000;

export const useSessionTimoutRetail = () => {
    const navigate = useNavigate();
    const timer = useRef(null);

    const resetTimer = () => {
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => {
            clearLocalStoragePreservingAttendance();
            window.location.href = `${import.meta.env.VITE_APP_BASE_URL || window.location.origin}/login`;
        }, INACTIVITY_LIMIT);
    };

    useEffect(() => {
        const events = ["mousemove", "keydown", "click", "scroll", "touchstart"];

        events.forEach((event) => window.addEventListener(event, resetTimer))

        resetTimer();

        return () => {
            events.forEach((event) => window.removeEventListener(event, resetTimer));
            if (timer.current) clearTimeout(timer.current);
        }
    }, []);
};