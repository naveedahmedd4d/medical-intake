import sequelize from 'sequelize';

const { Op, fn, cast, col } = sequelize;

export const birthdayQuery = (date) => {
  const query = {
    where: {
      [Op.and]: [
        sequelize.where(
          fn('DATEPART', 'day', sequelize.col('dob')),
          fn('DATEPART', 'day', cast(date, 'date'))
        ),
        sequelize.where(
          fn('DATEPART', 'month', sequelize.col('dob')),
          fn('DATEPART', 'month', cast(date, 'date'))
        ),
      ],
    },
  };
  query.attributes = ['id', 'firstName', 'lastName', 'dob', 'avatar', 'fullName'];
  return query;
};

export const anniversaryQuery = (date) => {
  const query = {
    where: {
      [Op.and]: [
        sequelize.where(
          fn('DATEPART', 'day', sequelize.col('joiningDate')),
          fn('DATEPART', 'day', cast(date, 'date'))
        ),
        sequelize.where(
          fn('DATEPART', 'month', sequelize.col('joiningDate')),
          fn('DATEPART', 'month', cast(date, 'date'))
        ),
        sequelize.where(
          fn(
            'DATEPART',
            'year',
            fn('DATEDIFF', 'year', sequelize.col('joiningDate'), cast(date, 'date'))
          ),
          {
            [Op.gt]: 0,
          }
        ),
      ],
    },
  };
  query.attributes = ['id', 'firstName', 'lastName', 'joiningDate', 'avatar', 'fullName'];
  query.group = ['id', 'firstName', 'lastName', 'joiningDate', 'avatar'];
  return query;
};

export const listQuery = ({
  status,
  searchString,
  name,
  sortColumn,
  sortOrder,
  pageNumber = 1,
  pageSize,
  detail,
  isPagination = false,
}) => {
  const query = { where: {} };
  detail = detail ? JSON.parse(detail) : false;

  if (Number(isPagination)) {
    query.offset = (pageNumber - 1) * pageSize;
    query.limit = pageSize;
  }

  query.distinct = true;
  query.attributes = detail
    ? { exclude: ['password', 'createdAt', 'updatedAt', 'deletedAt'] }
    : ['id', 'firstName', 'lastName', 'fullName', 'isAdmin', 'email', 'role', 'status'];

  if (status) {
    query.where[Op.and] = [{ status }];
  }

  if (searchString) {
    const likeClause = { [Op.like]: `%${searchString}%` };
    query.where[Op.or] = [
      sequelize.where(fn('concat', col('firstName'), ' ', col('lastName')), likeClause),
      {
        email: likeClause,
      },
    ];
    const integerValue = parseInt(searchString, 10);
    if (integerValue > 0) {
      query.where[Op.or].push({
        id: integerValue,
      });
    }
  } else if (name) {
    query.where[Op.and] = query.where[Op.and] || [];
    query.where[Op.and].push(
      sequelize.where(fn('concat', col('firstName'), ' ', col('lastName')), {
        [Op.like]: `%${name}%`,
      })
    );
  }

  if (sortColumn && sortOrder) {
    query.order = [[sortColumn, sortOrder]];
  }

  return query;
};

export const getUserByIdQuery = ({ id }) => {
  const query = {
    where: {
      id,
    },
  };
  query.attributes = {
    exclude: ['password', 'createdAt', 'updatedAt', 'deletedAt'],
  };
  return query;
};

export const getLoggedUserQuery = (id) => ({
  where: {
    id,
  },
  attributes: [
    'id',
    'loginTime',
    'firstName',
    'lastName',
    'email',
    'isAdmin',
    'role',
    'status',
    'avatar',
  ],
});

export const findOrCreateGoogleUserQuery = ({ email, avatar, firstName, lastName }) => ({
  where: {
    email,
  },
  defaults: {
    status: 'active',
    avatar,
    firstName,
    lastName,
    password: '',
  },
});

export const updateUserQuery = ({ id }) => {
  const query = {
    where: {
      id,
    },
  };
  return query;
};

export const userExistQuery = (id) => ({
  where: {
    id,
  },
});

export const getUserByIdWithGroups = ({ id }) => ({
  where: {
    id,
  },
  attributes: {
    exclude: ['password', 'createdAt', 'updatedAt', 'deletedAt'],
  },
});
