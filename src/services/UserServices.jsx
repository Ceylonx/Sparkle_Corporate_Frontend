import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_SERVER_API_ADMIN;

export async function getAllUsers(id) {
    const response = await axios.get(`${API_BASE_URL}/user/getAllUsers`);

    if (response && response.status === 200) {
        return response.data;
    } else {
        console.error("Error fetching all users");
    }
};

export async function getUserById(id) {
    const response = await axios.get(`${API_BASE_URL}/user/getUserByID/${id}`);

    if (response && response.status === 200) {
        return response.data;
    } else {
        console.error("Error fetching user");
    }
};

export async function getUserRoleById(id) {
    try {
        const response = await axios.get(`${API_BASE_URL}/role/getRoleDetails/${id}`);

        if (response && response.status === 200) {
            return response;
        } else {
            console.error("Error fetching user role");
        }
    } catch (error) {
        console.error("Error fetching fetching user role:", error);
        throw error;
    }
};

export async function getAllUserRoles() {
    const response = await axios.get(`${API_BASE_URL}/role/getAllRoles`);

    if (response && response.status === 200) {
        return response.data;
    } else {
        console.error("Error fetching all user roles");
    }
};