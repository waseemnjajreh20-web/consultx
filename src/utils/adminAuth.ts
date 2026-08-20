import { AUTH_CONFIG, isAdminEmail } from "@/config/auth";
export { isAdminEmail };
export const ADMIN_EMAILS = [...AUTH_CONFIG.adminEmails] as readonly string[];
