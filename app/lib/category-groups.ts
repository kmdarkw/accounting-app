export const categoryGroups = [
  { id: "customerClassification", label: "تصنيف العميل" },
  { id: "customerStage", label: "مرحلة العميل" },
  { id: "companyExpense", label: "مصروفات الشركة" },
  { id: "clientExpense", label: "مصروفات للعميل" },
  { id: "clientReceipt", label: "مقبوضات العميل" },
  { id: "account", label: "الحساب" },
] as const;

export type CategoryGroupId = (typeof categoryGroups)[number]["id"];

export const CUSTOMER_CLASSIFICATION_GROUP_ID: CategoryGroupId =
  "customerClassification";
export const CUSTOMER_STAGE_GROUP_ID: CategoryGroupId = "customerStage";
export const COMPANY_EXPENSE_GROUP_ID: CategoryGroupId = "companyExpense";
export const CLIENT_EXPENSE_GROUP_ID: CategoryGroupId = "clientExpense";
export const CLIENT_RECEIPT_GROUP_ID: CategoryGroupId = "clientReceipt";
export const ACCOUNT_GROUP_ID: CategoryGroupId = "account";
