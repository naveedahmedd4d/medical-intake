import sequelize from 'sequelize';
import { PAGE_SIZE } from '../../utils/constants';

const { Op } = sequelize;

export const listClinicsQuery = ({
  search,
  planType,
  status,
  sortColumn = 'createdAt',
  sortOrder = 'DESC',
  pageNumber = 1,
  pageSize = PAGE_SIZE,
}) => {
  const query = { where: {} };

  query.offset = (pageNumber - 1) * pageSize;
  query.limit = pageSize;

  query.distinct = true;
  query.subQuery = false;

  query.attributes = [
    'id',
    'clinicName',
    'practiceType',
    'subscriptionStatus',
    'createdAt',
    'updatedAt',
  ];

  if (status) {
    query.where.subscriptionStatus = status;
  }
  if (planType) {
    query.where[Op.and] = query.where[Op.and] || [];
    query.where[Op.and].push(
      sequelize.literal(
        `EXISTS (SELECT 1 FROM Subscriptions WHERE Subscriptions.clinicId = Clinic.id AND Subscriptions.planType = '${planType}')`
      )
    );
  }

  query.include = [
    {
      association: 'users',
      attributes: ['id', 'email', 'firstName', 'lastName'],
      where: { role: 'clinic_admin' },
      required: false,
    },
    {
      association: 'locations',
      attributes: [
        'id',
        'city',
        'state',
        'addressLine1',
        'addressLine2',
        'zipCode',
        'phone',
        'isPrimary',
      ],
      required: false,
    },
    {
      association: 'subscriptions',
      attributes: [
        'id',
        'planType',
        'status',
        'providerCount',
        'currentPeriodEnd',
        'createdAt',
      ],
      required: false,
      separate: true,
      order: [['createdAt', 'DESC']],
      limit: 1,
    },
  ];

  if (search) {
    const likeClause = { [Op.like]: `%${search}%` };
    query.where[Op.or] = [
      { clinicName: likeClause },
      { '$users.email$': likeClause },
      { '$locations.city$': likeClause },
    ];
  }

  if (sortColumn && sortOrder) {
    query.order = [[sortColumn, sortOrder]];
  }

  return query;
};

export const getClinicByIdQuery = (id) => {
  const query = {
    where: { id },
    include: [
      {
        association: 'users',
        attributes: ['id', 'email', 'firstName', 'lastName', 'phone'],
        where: { role: 'clinic_admin' },
        required: false,
      },
      {
        association: 'locations',
        attributes: [
          'id',
          'city',
          'state',
          'addressLine1',
          'addressLine2',
          'zipCode',
          'phone',
          'isPrimary',
        ],
        required: false,
      },
      {
        association: 'subscriptions',
        attributes: [
          'id',
          'planType',
          'status',
          'providerCount',
          'currentPeriodStart',
          'currentPeriodEnd',
          'stripeSubscriptionId',
          'createdAt',
        ],
        required: false,
        separate: true,
        order: [['createdAt', 'DESC']],
        limit: 1,
      },
    ],
  };

  return query;
};

export const getClinicProfileQuery = (clinicId) => {
  const query = {
    where: { id: clinicId },
    include: [
      {
        association: 'users',
        attributes: ['id', 'email', 'firstName', 'lastName', 'phone'],
        where: { role: 'clinic_admin' },
        required: false,
      },
      {
        association: 'locations',
        attributes: [
          'id',
          'city',
          'state',
          'addressLine1',
          'addressLine2',
          'zipCode',
          'phone',
          'isPrimary',
        ],
        required: false,
        order: [
          ['isPrimary', 'DESC'],
          ['createdAt', 'ASC'],
        ],
      },
      {
        association: 'subscriptions',
        attributes: [
          'id',
          'planType',
          'status',
          'providerCount',
          'stripeSubscriptionId',
          'currentPeriodStart',
          'currentPeriodEnd',
        ],
        required: false,
        separate: true,
        order: [['createdAt', 'DESC']],
        limit: 1,
      },
    ],
  };

  return query;
};
