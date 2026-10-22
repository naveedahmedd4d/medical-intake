import debugObj from 'debug';
import { WS_MESSAGES } from '../../utils/constants';

const debug = debugObj('api:websocketclass');

class WebSocket {
  constructor() {
    // make this class singleton
    if (!this.constructor.instance) {
      this.constructor.instance = this;
    }

    this.webSockets = new Map();

    return this.constructor.instance;
  }

  getAll() {
    return this.webSockets;
  }

  hasUser(userId) {
    return this.webSockets.has(userId);
  }

  getUser(userId) {
    return this.webSockets.get(userId);
  }

  setUser(userId, user) {
    this.webSockets.set(userId, user);
  }

  deleteUser(userId) {
    this.webSockets.delete(userId);
  }

  sendMessage(userId, message) {
    const user = this.getUser(userId);
    const stringifiedMessage = JSON.stringify(message);
    const superAdminPermissionUpdate = user?.isAdmin && message === WS_MESSAGES.GROUP_PERMISSION;
    if (user?.ws && !superAdminPermissionUpdate) {
      user.ws.forEach((userWs) => {
        userWs.send(stringifiedMessage);
        debug(`Message sent to user: ${user?.fullName} with id: ${user?.id}`);
      });
    } else if (superAdminPermissionUpdate) {
      debug(
        `Super admin permissions update does not matter, user: ${user?.fullName} with id: ${userId} while sending message ${stringifiedMessage}`
      );
    } else {
      debug(
        `Websocket not found for user: ${user?.fullName} with id: ${userId} while sending message ${stringifiedMessage}`
      );
    }
  }
}

export default WebSocket;
