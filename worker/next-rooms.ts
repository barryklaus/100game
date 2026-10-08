// This separate script gives 100next its own room storage and alarms.
export { GameRoom } from './index';
export { AccountStore } from './accounts';

export default {
  fetch(): Response {
    return Response.json({ error: 'Use the 100next game to open a room.' }, { status: 404 });
  },
};
