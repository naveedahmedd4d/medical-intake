import models from '../models';

const { Clinic, User } = models;

export const generateSlug = (text) =>
  text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');

export const generateUniqueClinicSlug = async (clinicName, excludeClinicId = null) => {
  const baseSlug = generateSlug(clinicName);
  let slug = baseSlug;
  let counter = 1;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    // eslint-disable-next-line no-await-in-loop
    const existingClinic = await Clinic.findOne({
      where: { clinicSlug: slug },
      paranoid: false,
    });

    if (!existingClinic || (excludeClinicId && existingClinic.id === excludeClinicId)) {
      return slug;
    }

    counter += 1;
    slug = `${baseSlug}-${counter}`;
  }
};

export const generateUniqueProviderSlug = async (firstName, lastName, excludeUserId = null) => {
  const fullName = `${firstName} ${lastName}`;
  const baseSlug = generateSlug(fullName);
  let slug = baseSlug;
  let counter = 1;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    // eslint-disable-next-line no-await-in-loop
    const existingUser = await User.findOne({
      where: { providerSlug: slug },
      paranoid: false,
    });

    if (!existingUser || (excludeUserId && existingUser.id === excludeUserId)) {
      return slug;
    }

    counter += 1;
    slug = `${baseSlug}-${counter}`;
  }
};

export const resolveIntakeSlugs = async (clinicSlug, providerSlug) => {
  const clinic = await Clinic.findOne({
    where: { clinicSlug },
    attributes: ['id', 'clinicName', 'logoUrl'],
  });

  if (!clinic) {
    throw new Error(`Clinic not found with slug: ${clinicSlug}`);
  }

  const user = await User.findOne({
    where: { providerSlug },
    attributes: ['id', 'firstName', 'lastName', 'clinicId'],
    include: [
      {
        model: models.Provider,
        as: 'provider',
        attributes: ['id', 'status'],
        required: true,
      },
    ],
  });

  if (!user || !user.provider) {
    throw new Error(`Provider not found with slug: ${providerSlug}`);
  }

  if (user.clinicId !== clinic.id) {
    throw new Error(`Provider ${providerSlug} does not belong to clinic ${clinicSlug}`);
  }

  if (user.provider.status !== 'active') {
    throw new Error(`Provider ${providerSlug} is not active`);
  }

  return {
    clinicId: clinic.id,
    providerId: user.provider.id,
    clinic: {
      id: clinic.id,
      name: clinic.clinicName,
      logoUrl: clinic.logoUrl,
    },
    provider: {
      id: user.provider.id,
      name: `${user.firstName} ${user.lastName}`,
    },
  };
};
