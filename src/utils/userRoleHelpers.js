import models from '../models';

const { User, UserRole } = models;

/**
 * Add a role to a user
 */
export const addUserRole = async (userId, roleName, transaction = null) => {
  const options = transaction ? { transaction } : {};

  // Check if role already exists
  const existingRole = await UserRole.findOne({
    where: { userId, role: roleName },
    ...options,
  });

  if (existingRole) {
    return existingRole;
  }

  return UserRole.create(
    {
      userId,
      role: roleName,
    },
    options
  );
};

/**
 * Remove a role from a user
 */
export const removeUserRole = async (userId, roleName, transaction = null) => {
  const options = transaction ? { transaction } : {};

  return UserRole.destroy({
    where: { userId, role: roleName },
    ...options,
  });
};

/**
 * Get all roles for a user
 */
export const getUserRoles = async (userId) => {
  const roles = await UserRole.findAll({
    where: { userId },
    attributes: ['role'],
  });

  return roles.map((r) => r.role);
};

/**
 * Check if user has a specific role
 */
export const userHasRole = async (userId, roleName) => {
  const role = await UserRole.findOne({
    where: { userId, role: roleName },
  });

  return !!role;
};

/**
 * Check if user has any of the specified roles
 */
export const userHasAnyRole = async (userId, roleNames) => {
  const role = await UserRole.findOne({
    where: {
      userId,
      role: roleNames,
    },
  });

  return !!role;
};

/**
 * Get user's primary role (for backward compatibility)
 * Priority: super_admin > clinic_admin > provider
 */
export const getUserPrimaryRole = async (userId) => {
  const roles = await getUserRoles(userId);

  if (roles.includes('super_admin')) {
    return 'super_admin';
  }
  if (roles.includes('clinic_admin')) {
    return 'clinic_admin';
  }
  if (roles.includes('provider')) {
    return 'provider';
  }

  return null;
};

/**
 * Replace all user roles with new ones
 */
export const setUserRoles = async (userId, roleNames, transaction = null) => {
  const options = transaction ? { transaction } : {};

  // Remove all existing roles
  await UserRole.destroy({
    where: { userId },
    ...options,
  });

  // Add new roles
  const rolePromises = roleNames.map((roleName) =>
    UserRole.create(
      {
        userId,
        role: roleName,
      },
      options
    )
  );

  return Promise.all(rolePromises);
};

/**
 * Check if clinic admin should also be a provider
 * (i.e., they have both roles or have a Provider record)
 */
export const isClinicAdminAlsoProvider = async (userId) => {
  const hasProviderRole = await userHasRole(userId, 'provider');
  if (hasProviderRole) {
    return true;
  }

  // Check if they have a Provider record
  const user = await User.findByPk(userId, {
    include: [
      {
        model: models.Provider,
        as: 'provider',
        required: false,
      },
    ],
  });

  return !!user?.provider;
};
