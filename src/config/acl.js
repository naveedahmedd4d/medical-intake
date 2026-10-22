export default [
  {
    group: 'admin',
    permissions: [
      {
        resource: '*',
        methods: '*',
        action: 'allow',
      },
    ],
  },
  {
    group: 'super_admin',
    permissions: [
      {
        resource: '*',
        methods: '*',
        action: 'allow',
      },
    ],
  },
  {
    group: 'clinic_admin',
    permissions: [
      { resource: '*', methods: '*', action: 'allow' },
    ],
  },
  {
    group: 'provider',
    permissions: [{ resource: '*', methods: '*', action: 'allow' }],
  },
  {
    group: 'user',
    permissions: [
      {
        resource: '/users/profile',
        methods: ['GET', 'PUT'],
        action: 'allow',
      },
      {
        resource: '/users/dismiss-profile-prompt',
        methods: ['POST'],
        action: 'allow',
      },
      {
        resource: '/users',
        methods: ['GET'],
        action: 'allow',
      },
    ],
  },
  {
    group: 'patient',
    permissions: [
      {
        resource: '/users/profile',
        methods: 'GET',
        action: 'allow',
      },
    ],
  },
];
