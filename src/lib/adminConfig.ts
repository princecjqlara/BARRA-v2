// Admin configuration
export const ADMIN_EMAIL = 'cjlara032107@gmail.com';

export function isAdminEmail(email: string | undefined | null): boolean {
    return email === ADMIN_EMAIL;
}
