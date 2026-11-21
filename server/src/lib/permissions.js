/* What each admin role may do, in one place. The server checks these (requirePerm); the admin panel
   receives the list for the signed-in admin and hides what they can't use.
   Nobody, whatever their role, can see a customer's password or an OTP, or skip mobile verification. */
export const PERMISSIONS = {
  "customers.view":   { label: "View customers", roles: ["owner", "manager", "staff"] },
  "customers.status": { label: "Suspend or reactivate customer accounts", roles: ["owner", "manager"] },
  "templates.edit":   { label: "Edit email templates and sender details", roles: ["owner", "manager"] },
  "sms.settings":     { label: "Change OTP / SMS settings", roles: ["owner"] },
  "provider.config":  { label: "Manage the SMS provider (test messages)", roles: ["owner"] },
  "logs.view":        { label: "View email and SMS delivery logs", roles: ["owner", "manager"] },
  "logs.export":      { label: "Export delivery logs (CSV)", roles: ["owner", "manager"] },
  "logs.pii":         { label: "See full mobile numbers in the SMS log", roles: ["owner"] },
};

export const can = (admin, perm) => !!admin && !!PERMISSIONS[perm]?.roles.includes(admin.role);
export const permissionsFor = (admin) => Object.keys(PERMISSIONS).filter((p) => can(admin, p));
