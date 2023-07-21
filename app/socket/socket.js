import { Server } from 'socket.io';
import { CLIENT_URL, HOSTED_CLIENT_URL } from '../../config';
import { SOCKET_EVENT } from '../../constants/socket_event';
import { roomService } from '../services/room';
import { issueService } from '../services/issue';

export const attachIO = (server) => {
  const io = new Server(server, {
    cors: {
      origin: [CLIENT_URL, HOSTED_CLIENT_URL],
      methods: ['GET', 'POST'],
    },
  });

  io.on(SOCKET_EVENT.CONNECTION, (socket) => {
    socket.on(SOCKET_EVENT.USER.JOIN, async (data) => {
      const { userId, username, roomId } = data;
      const users = await roomService.addUserToRoom(userId, username, roomId);
      socket.userId = userId;
      socket.roomId = roomId;
      socket.join(roomId);
      io.to(roomId).emit(SOCKET_EVENT.USER.JOIN, users);
    });

    socket.on(SOCKET_EVENT.USER.VOTE, (data) => {
      const { voteValue } = data;
      roomService.nominateVote({
        roomId: socket.roomId,
        userId: socket.userId,
        vote: voteValue,
      });
      io.to(socket.roomId).emit(SOCKET_EVENT.USER.VOTE, {
        userId: socket.userId,
        voteValue,
      });
    });

    socket.on(SOCKET_EVENT.USER.NAME_CHANGE, (data) => {
      roomService.handleUserUpdate(socket.userId, data.name, socket.roomId);
      io.to(socket.roomId).emit(SOCKET_EVENT.USER.NAME_CHANGE, {
        userId: socket.userId,
        name: data.name,
      });
    });

    socket.on(SOCKET_EVENT.USER.SPECTATOR_MODE, (data) => {
      roomService.setSpecMode(socket.roomId, socket.userId, data.specMode);
      io.to(socket.roomId).emit(SOCKET_EVENT.USER.SPECTATOR_MODE, {
        userId: socket.userId,
        specMode: data.specMode,
      });
    });

    socket.on(SOCKET_EVENT.ROOM.START, (resetIssue) => {
      roomService.clearRoomVoting(socket.roomId, resetIssue);
      io.to(socket.roomId).emit(SOCKET_EVENT.ROOM.START, resetIssue);
    });

    socket.on(SOCKET_EVENT.ROOM.REVEAL, async () => {
      const history = await roomService.saveHistory(socket.roomId);
      io.to(socket.roomId).emit(SOCKET_EVENT.ROOM.REVEAL, history);
    });

    socket.on(SOCKET_EVENT.ROOM.NAME_CHANGE, (data) => {
      roomService.changeRoomName(socket.roomId, data.name);
      io.to(socket.roomId).emit(SOCKET_EVENT.ROOM.NAME_CHANGE, data);
    });

    socket.on(SOCKET_EVENT.ROOM.SET_TIMER, (data) => {
      socket.to(socket.roomId).emit(SOCKET_EVENT.ROOM.SET_TIMER, data);
    });

    socket.on(SOCKET_EVENT.ISSUE.NEW, (data) => {
      socket.to(socket.roomId).emit(SOCKET_EVENT.ISSUE.NEW, data);
    });

    socket.on(SOCKET_EVENT.ISSUE.REMOVE, (data) => {
      socket.to(socket.roomId).emit(SOCKET_EVENT.ISSUE.REMOVE, data);
    });

    socket.on(SOCKET_EVENT.ISSUE.NAME_CHANGE, (data) => {
      issueService.changeIssueName(data._id, data.name);
      socket.to(socket.roomId).emit(SOCKET_EVENT.ISSUE.NAME_CHANGE, data);
    });

    socket.on(SOCKET_EVENT.ISSUE.SELECT, (data) => {
      roomService.setSelectedIssue(socket.roomId, data ? data._id : null);
      socket.to(socket.roomId).emit(SOCKET_EVENT.ISSUE.SELECT, data);
    });

    socket.on(SOCKET_EVENT.USER.LEAVE, async () => {
      socket.leave(socket.roomId);
      await roomService.removeUserFromRoom(socket.userId, socket.roomId);
      io.to(socket.roomId).emit(SOCKET_EVENT.USER.LEAVE, {
        userId: socket.userId,
      });
      [socket.userId, socket.roomId] = [null, null];
    });

    socket.on(SOCKET_EVENT.DISCONNECTION, async () => {
      if (socket.roomId && socket.userId) {
        roomService.removeUserFromRoom(socket.userId, socket.roomId);
        io.to(socket.roomId).emit(SOCKET_EVENT.USER.LEAVE, {
          userId: socket.userId,
        });
      }
    });
  });
};
