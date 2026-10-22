import models from "../models";

const { Template } = models;

export const resolveIntakeTemplateId = async ({
  clinicId,
  activeTemplateId = null,
} = {}) => {
  if (activeTemplateId) {
    const activeTemplate = await Template.findByPk(activeTemplateId, {
      attributes: ["id", "clinicId"],
    });
    const allowed =
      activeTemplate &&
      (activeTemplate.clinicId === null ||
        (clinicId && activeTemplate.clinicId === clinicId));
    if (allowed) {
      return activeTemplate.id;
    }
  }

  if (clinicId) {
    const clinicDefault = await Template.findOne({
      where: { clinicId, isDefault: true },
      attributes: ["id"],
    });
    if (clinicDefault?.id) {
      return clinicDefault.id;
    }
  }

  const systemDefault = await Template.findOne({
    where: { clinicId: null, isDefault: true },
    attributes: ["id"],
  });
  if (systemDefault?.id) {
    return systemDefault.id;
  }

  const anySystem = await Template.findOne({
    where: { clinicId: null },
    attributes: ["id"],
    order: [["createdAt", "ASC"]],
  });

  return anySystem?.id || null;
};
