import { v4 as uuidv4 } from 'uuid';
import { generateHash } from '../utils/helper';

export default {
  up: async (queryInterface) => {
    await queryInterface.bulkInsert('Users', [
      {
        id: uuidv4(),
        firstName: 'System',
        lastName: 'Administrator',
        email: 'superadmin@mira.com',
        password: generateHash('SuperAdmin123!'),
        phone: null,
        clinicId: null,
        role: 'super_admin',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
  },

  down: async (queryInterface) => {
    await queryInterface.bulkDelete('Users', {
      email: 'superadmin@mira.com',
    });
  },
};
