const io = require('socket.io-client');

class DashboardWebSocketClient {
  constructor(dashboardUrl = 'http://localhost:3000') {
    this.dashboardUrl = dashboardUrl;
    this.socket = null;
    this.isConnected = false;
  }

  connect() {
    return new Promise((resolve, reject) => {
      try {
        this.socket = io(this.dashboardUrl, {
          transports: ['websocket', 'polling'],
          reconnection: true,
          reconnectionDelay: 1000,
          reconnectionDelayMax: 5000,
          reconnectionAttempts: 5,
        });

        this.socket.on('connect', () => {
          console.log('[Bot WebSocket] Connected to dashboard');
          this.isConnected = true;
          resolve();
        });

        this.socket.on('disconnect', () => {
          console.log('[Bot WebSocket] Disconnected from dashboard');
          this.isConnected = false;
        });

        this.socket.on('error', (error) => {
          console.error('[Bot WebSocket] Error:', error);
        });
      } catch (error) {
        console.error('[Bot WebSocket] Connection failed:', error);
        reject(error);
      }
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.isConnected = false;
    }
  }

  emitEvent(eventType, data) {
    if (!this.isConnected) {
      console.warn('[Bot WebSocket] Not connected, event not sent:', eventType);
      return;
    }

    const event = {
      type: eventType,
      timestamp: Date.now(),
      userId: data.userId,
      username: data.username,
      serverId: data.serverId,
      serverName: data.serverName,
      channelId: data.channelId,
      data: data.eventData || {},
    };

    this.socket.emit('economy:event', event);
    console.log(`[Bot WebSocket] Sent event: ${eventType}`);
  }

  // Helper methods for specific events
  emitCXGame(userId, username, serverId, serverName, channelId, amount, choice, result, win) {
    this.emitEvent('cx_game', {
      userId,
      username,
      serverId,
      serverName,
      channelId,
      eventData: {
        amount,
        choice,
        result,
        win,
      },
    });
  }

  emitGiveTransfer(senderId, senderName, receiverId, receiverName, serverId, serverName, channelId, amount) {
    this.emitEvent('give_transfer', {
      userId: senderId,
      username: senderName,
      serverId,
      serverName,
      channelId,
      eventData: {
        senderId,
        senderName,
        receiverId,
        receiverName,
        amount,
      },
    });
  }

  emitWork(userId, username, serverId, serverName, channelId, amount) {
    this.emitEvent('work', {
      userId,
      username,
      serverId,
      serverName,
      channelId,
      eventData: { amount },
    });
  }

  emitDaily(userId, username, serverId, serverName, channelId, reward) {
    this.emitEvent('daily', {
      userId,
      username,
      serverId,
      serverName,
      channelId,
      eventData: { reward },
    });
  }

  emitRob(robberId, robberName, victimId, victimName, serverId, serverName, channelId, amount, success) {
    this.emitEvent('rob', {
      userId: robberId,
      username: robberName,
      serverId,
      serverName,
      channelId,
      eventData: {
        robberId,
        robberName,
        victimId,
        victimName,
        amount,
        success,
      },
    });
  }

  emitShop(userId, username, serverId, serverName, channelId, item, cost) {
    this.emitEvent('shop', {
      userId,
      username,
      serverId,
      serverName,
      channelId,
      eventData: { item, cost },
    });
  }

  emitTax(userId, username, serverId, serverName, channelId, amount) {
    this.emitEvent('tax', {
      userId,
      username,
      serverId,
      serverName,
      channelId,
      eventData: { amount },
    });
  }

  emitJail(userId, username, serverId, serverName, channelId, minutes) {
    this.emitEvent('jail', {
      userId,
      username,
      serverId,
      serverName,
      channelId,
      eventData: { minutes },
    });
  }

  emitGrant(userId, username, serverId, serverName, channelId, amount) {
    this.emitEvent('grant', {
      userId,
      username,
      serverId,
      serverName,
      channelId,
      eventData: { amount },
    });
  }

  emitDeduct(userId, username, serverId, serverName, channelId, amount) {
    this.emitEvent('deduct', {
      userId,
      username,
      serverId,
      serverName,
      channelId,
      eventData: { amount },
    });
  }
}

module.exports = DashboardWebSocketClient;
