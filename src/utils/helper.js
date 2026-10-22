import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import AWS from 'aws-sdk';
import sequelize from 'sequelize';
import debugObj from 'debug';
import { AWS_CONFIG, STATUS_CODES } from './constants';
import { BadRequest, NotFound } from '../error';
import { getTokenFromSocketHeaders } from '../middlewares/auth';
import models from '../models';
import { getUserByIdWithGroups } from '../routes/user/query';
import WebSocket from '../lib/webSocket';

const { Op } = sequelize;
const { User } = models;
const debug = debugObj('api:webSocket');
const userMap = new WebSocket();

const s3 = new AWS.S3({
  accessKeyId: AWS_CONFIG.AWS_ACCESS_KEY,
  secretAccessKey: AWS_CONFIG.AWS_SECRET_KEY,
});

const validatePassword = (password, hashedPassword) => password === hashedPassword;

const generateHash = (password) =>
  crypto.pbkdf2Sync(password, process.env.SALT, 10000, 64, 'sha512').toString('hex');

export const getByIdQuery = ({ id, ...props }) => ({
  where: id && { id },
  ...props,
});

const generateJWT = ({ id, email, role, roles, clinicId }) => {
  // Support both single role (backward compatibility) and multiple roles
  const roleData = roles || (role ? [role] : []);

  return jwt.sign(
    {
      id,
      email,
      role, // Keep for backward compatibility
      roles: roleData,
      clinicId,
    },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  );
};

const getErrorMessages = (joiErrorObject) => joiErrorObject.error.details.map((e) => e.message);

const getPassportErrorMessage = (errorObject) => errorObject.errors && errorObject.errors.account;

const BadRequestError = (message, code, data) => {
  throw new BadRequest(message, code, data);
};

const NotFoundError = (message, code) => {
  throw new NotFound(message, code);
};

const SuccessResponse = (res, data) => {
  res.status(200).json({
    data,
  });
};

const generatePreSignedUrlForGetObject = (key) =>
  s3.getSignedUrl('getObject', {
    Bucket: AWS_CONFIG.BUCKET,
    Key: key,
    Expires: 60 * 60 * 24,
  });

const makeLikeCondition = (columnName, searchValue) => {
  const condition = {};
  condition[columnName] = { [Op.iLike]: `%${searchValue}%` };
  return condition;
};

const makeEqualityCondition = (columnName, searchValue) => {
  const condition = {};
  const isArray = typeof searchValue === 'object';
  const equlaityCondition = {
    [Op.eq]: `${searchValue}`,
  };
  const value = isArray ? searchValue : equlaityCondition;
  condition[columnName] = value;
  return condition;
};

const isJson = (data) => {
  try {
    JSON.parse(JSON.stringify(data));
  } catch (e) {
    return false;
  }
  return typeof data === 'object' && data !== null;
};

const flattenPermission = (groups) =>
  groups?.map((value) => {
    let group = value;
    const isGroupJSON = isJson(value);
    if (!isGroupJSON) {
      group = group.toJSON();
    }
    const resources = group.resources.map((val) => {
      const resource = val;
      resource.permissions = resource?.resourcePermission?.permission;
      delete resource.resourcePermission;
      return resource;
    });
    group.resources = resources;
    return group;
  });

export const updateUserLastActive = async ({ userId }) => {
  const lastActivity = new Date();
  const userUpdateParams = { lastActivity };
  await User.update(userUpdateParams, getByIdQuery({ id: userId }));
};

const handleVerifyWsClient = async (info, done) => {
  try {
    const token = getTokenFromSocketHeaders(info.req);
    const { id: userId } = jwt.verify(token, process.env.JWT_SECRET);
    if (!userId) {
      done(false, STATUS_CODES.INVALID_INPUT, 'Invalid Token');
    }
    const user = await User.findOne(getUserByIdWithGroups({ id: userId }));
    const groups = flattenPermission(user?.groups);
    const userInfo = {
      ...user.toJSON(),
      groups,
    };
    info.req.user = userInfo;
    done(true);
  } catch (error) {
    done(false, STATUS_CODES.INVALID_INPUT, 'Invalid Token');
  }
};

const createWebSocketPing = () => {
  const userSockets = new WebSocket();

  setInterval(() => {
    userSockets.getAll().forEach(function each(user) {
      user.ws.forEach((ws) => {
        if (ws.isAlive === false) {
          return ws.terminate();
        }
        ws.isAlive = false;
        debug(`Sending ping to user`);
        ws.ping();
      });
    });
  }, 10000);
};

const handleWsClose = ({ user, ws }) => {
  const { fullName, id: userId } = user;
  debug(`Wss on close. Closing websocket for user: ${fullName} with id: ${userId}`);
  if (userMap.hasUser(userId)) {
    const { ws: closeWsArr } = userMap.getUser(userId);
    closeWsArr?.forEach((closeWs, index) => {
      if (closeWs === ws) {
        closeWs.close();
        closeWsArr.splice(index, 1);
      }
    });
    if (closeWsArr?.length > 0) {
      user.ws = closeWsArr;
      userMap.setUser(userId, user);
    } else {
      userMap.deleteUser(userId);
    }
  }
};

const handleWsMessage = ({ data }) => {
  const message = JSON.parse(data);
  debug(`Received message ${message} `);
};

const handleWsConnection = (webSocket) => {
  const ws = webSocket;
  ws.on('pong', function pong() {
    debug(`Recieved pong from user`);
    this.isAlive = true;
  });
  ws.on('message', (data) => handleWsMessage({ data, userId: 1, fullName: 'Super Admin' }));
  ws.on('close', () => handleWsClose({ user: { id: 1, fullName: 'Super Admin' }, ws }));
};

export function checkPermission({ user, resource, isFlattend = true }) {
  if (user.isAdmin) {
    return true;
  }
  const resourcePermission = resource?.split('-');
  const resourceName = resourcePermission[0];
  const permission = resourcePermission[1];
  const can = [];
  const userGroups = isFlattend ? user?.groups : flattenPermission(user?.groups);
  userGroups?.forEach(({ resources }) =>
    resources?.forEach(({ slug, permissions }) => {
      if (slug === resourceName) {
        permissions?.forEach((groupPermission) => {
          if (groupPermission === permission) {
            return can.push(true);
          }
          return false;
        });
      }
      return false;
    })
  );
  return can.length > 0;
}

export {
  generateHash,
  validatePassword,
  generateJWT,
  getErrorMessages,
  getPassportErrorMessage,
  BadRequestError,
  NotFoundError,
  SuccessResponse,
  generatePreSignedUrlForGetObject,
  makeLikeCondition,
  makeEqualityCondition,
  handleVerifyWsClient,
  handleWsConnection,
  flattenPermission,
  createWebSocketPing,
  isJson,
};
