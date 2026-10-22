import sequelize from 'sequelize';
import { PAGE_SIZE } from '../../utils/constants';

const { Op } = sequelize;

export const listProvidersQuery = ({
  search,
  status,
  clinicId,
  sortColumn = 'createdAt',
  sortOrder = 'DESC',
  pageNumber = 1,
  pageSize = PAGE_SIZE,
}) => {
  const query = { where: {} };

  query.offset = (pageNumber - 1) * pageSize;
  query.limit = pageSize;

  query.distinct = true;

  if (clinicId) {
    query.where.clinicId = clinicId;
  }

  // Include users who have a provider record, regardless of their role
  // This allows clinic admins who are also providers to show up in the list
  query.attributes = ['id', 'email', 'firstName', 'lastName', 'phone', 'createdAt', 'updatedAt'];

  query.include = [
    {
      association: 'provider',
      attributes: ['id', 'specialty', 'licenseNumber', 'status', 'activeTemplateId'],
      required: true, // Only show users who have a provider record
    },
  ];

  if (status) {
    query.include[0].where = { status };
    query.include[0].required = true;
  }

  if (search) {
    const likeClause = { [Op.like]: `%${search}%` };
    query.where[Op.or] = [
      { email: likeClause },
      sequelize.literal(`CONCAT(firstName, ' ', lastName) LIKE '%${search}%'`),
    ];
  }

  if (sortColumn && sortOrder) {
    if (sortColumn === 'specialty' || sortColumn === 'status') {
      query.order = [['provider', sortColumn, sortOrder]];
    } else if (sortColumn === 'fullName') {
      query.order = [
        ['firstName', sortOrder],
        ['lastName', sortOrder],
      ];
    } else {
      query.order = [[sortColumn, sortOrder]];
    }
  }

  return query;
};
