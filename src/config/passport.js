import passport from 'passport';
import LocalStrategy from 'passport-local';
import { generateHash } from '../utils/helper';
import models from '../models';

passport.use(
  new LocalStrategy(
    {
      usernameField: 'email',
      passwordField: 'password',
    },
    async (email, passwordParam, done) => {
      const { User } = models;
      const password = generateHash(passwordParam);

      let user;
      try {
        user = await User.findOne({
          where: {
            email,
            password,
          },
        });
      } catch (error) {
        return done(null, false, { error });
      }
      if (!user) {
        return done(null, false, { errors: { account: 'Invalid credentials' } });
      }

      // Validate password
      // if ( !validatePassword(password, user.password) ) {
      // 	return done(null, false, { errors: { 'password': 'Password is invalid'}});
      // }

      return done(null, user);
    }
  )
);
