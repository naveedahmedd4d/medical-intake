export const paranoidDeleteCascade = (models) => async (instance, options) => {
  if (!instance.constructor.options.paranoid) {
    return;
  }

  const modelName = instance.constructor.name;

  await Promise.all(
    Object.values(models[modelName].associations).map(async (association) => {
      try {
        if (association.options.onDelete !== 'CASCADE') {
          return true;
        }

        let relationModel = association.target;
        const getOptions = { transaction: options.transaction };

        if (association.through) {
          relationModel = association.through.model;
          getOptions.include = [{ model: relationModel }];
        }

        const getterName = `get${association.as.charAt(0).toUpperCase()}${association.as.slice(1)}`;
        const instances = await instance[getterName](getOptions);

        if (Array.isArray(instances)) {
          if (instances.length === 0) {
            return true;
          }
          return await Promise.all(
            instances.map((i) => i.destroy({ ...options, individualHooks: true }))
          );
        }

        if (!instances) {
          return true;
        }
        return await instances.destroy({
          transaction: options.transaction,
          individualHooks: true,
        });
      } catch (error) {
        return true;
      }
    })
  );
};
