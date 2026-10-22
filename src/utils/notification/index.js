/* eslint-disable import/named */
import { isEqual, uniq } from 'lodash';
import models from '../../models';
import { PERMISSIONS } from '../constants';
import {
  getResourceBySlug,
  getGroupPermissionByResourceId,
  getUsersByGroupIdQuery,
  getUserAdminQuery,
} from './query';

const { Resource, UserGroup, GroupPermission, User } = models;

export const getGroupUsersByResource = async ({
  slug,
  isAdmin = true,
  permission = PERMISSIONS.WRITE,
}) => {
  const slugQuery = getResourceBySlug({ slug });
  const resource = await Resource.findOne(slugQuery);
  const groupPermissionQuery = getGroupPermissionByResourceId({ resourceId: resource.id });
  const groups = await GroupPermission.findAll(groupPermissionQuery);

  const groupIds = [];
  groups.forEach((group) => {
    if (isEqual(group?.permission, permission)) {
      groupIds.push(group.group.id);
    }
  });
  const groupUserQuery = getUsersByGroupIdQuery({ groupIds });
  const groupUsers = await UserGroup.findAll(groupUserQuery);
  const userIds = groupUsers?.map(({ userId }) => userId) || [];
  if (isAdmin) {
    const superAdmin = await User.findOne(getUserAdminQuery());
    if (superAdmin?.id && !userIds.includes(superAdmin?.id)) {
      userIds.push(superAdmin.id);
    }
  }
  const uniqueUserIds = uniq(userIds);
  return uniqueUserIds;
};
