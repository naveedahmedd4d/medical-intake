import models from '../models';

const { Provider } = models;

/**
 * Count active providers for a clinic
 * Only counts providers with status = 'active'
 * @param {string} clinicId - Clinic UUID
 * @returns {Promise<number>} Count of active providers
 */
export const countActiveProviders = async (clinicId) => {
  const count = await Provider.count({
    where: {
      clinicId,
      status: 'active',
    },
  });
  return count;
};

/**
 * Count invited (pending) providers for a clinic
 * Only counts providers with status = 'invited'
 * @param {string} clinicId - Clinic UUID
 * @returns {Promise<number>} Count of invited providers
 */
export const countInvitedProviders = async (clinicId) => {
  const count = await Provider.count({
    where: {
      clinicId,
      status: 'invited',
    },
  });
  return count;
};

/**
 * Get provider counts summary for a clinic
 * @param {string} clinicId - Clinic UUID
 * @returns {Promise<{active: number, invited: number, total: number}>}
 */
export const getProviderCounts = async (clinicId) => {
  const active = await countActiveProviders(clinicId);
  const invited = await countInvitedProviders(clinicId);

  return {
    active,
    invited,
    total: active + invited,
  };
};
