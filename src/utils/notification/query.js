import models from '../../models';

const { Group } = models;

export const getResourceBySlug = ({ slug }) => ({
  where: {
    slug,
  },
  attributes: ['id'],
});
export const getUserAdminQuery = () => ({
  where: {
    isAdmin: true,
  },
  attributes: ['id'],
});

export const getGroupPermissionByResourceId = ({ resourceId }) => {
  const query = { where: { resourceId } };
  query.attributes = ['id', 'permission'];
  query.include = [
    {
      model: Group,
      as: 'group',
      attributes: ['id'],
    },
  ];
  return query;
};

export const getUsersByGroupIdQuery = ({ groupIds }) => {
  const query = { where: { groupId: groupIds } };
  query.attributes = ['id', 'userId'];
  return query;
};
