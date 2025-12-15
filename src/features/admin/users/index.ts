/**
 * Admin Users Feature - Public API
 * Central export point for backward compatibility
 */

// Components - Note: Components remain in their original location for now
// Export them from the original paths
export { default as UsersManagement } from "@/components/admin/UsersManagement";
export { default as UserDetailModal } from "@/components/admin/UserDetailModal";
export { default as UserStatsCard } from "@/components/admin/UserStatsCard";

// Hooks
export { useUsers, useUserSearch } from "./hooks/useUsers";
export { useUserDetail } from "./hooks/useUserDetail";
export { useUpdateUser, useUserActions, useDeleteUser } from "./hooks/useUserActions";

// Services
export { getUsers, getUserById, searchUsers } from "./services/usersService";
export { updateUser, executeUserAction, deleteUser } from "./services/userActionsService";

// Validators
export { adminUserUpdateSchema } from "./validators/userUpdateSchema";
export { userActionSchema } from "./validators/userActionSchema";

// Utils
export {
  formatCurrency,
  formatDate,
  getPackageIconImage,
  getPackageColorScheme,
  getGradientColor,
  getSubscriptionBadgeConfig,
  getUserStatusBadgeConfig,
} from "./utils/userHelpers";



