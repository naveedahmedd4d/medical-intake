const user1 = {
  id: 1,
  name: 'John',
  surname: 'Doe',
  email: 'john@test.com',
  password: 'test',
};

const user2 = {
  id: 2,
  name: 'George',
  surname: 'Clooney',
  email: 'george@test.com',
  password: 'test',
};

const Users = {};

Users[user1.email] = user1;
Users[user2.email] = user2;

export default Users;
