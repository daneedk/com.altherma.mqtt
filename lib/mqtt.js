'use strict';

const { connectAsync } = require('async-mqtt');

class MqttManager {
  /**
   * @param {object} opts
   * @param {import('homey').App} opts.app
   * @param {(topic: string, payloadString: string) => void | Promise<void>} opts.onMessage
   */
  constructor({ app, onMessage }) {
    this.app = app;           // Homey App instance
    this.homey = app.homey;   // Homey object
    this.onMessage = onMessage;

    this.client = null;
    this.isConnecting = false;
    this._boundOnMessage = null;
  }

  log(...args) { this.app.log('[mqtt]', ...args); }

  error(...args) { this.app.error('[mqtt]', ...args); }

  getClient() {
    return this.client;
  }

  async reconnect() {
    this.log(`reconnect called`)
    await this.disconnect();
    await this.connect();
  }

  async disconnect() {
    if (!this.client) return;

    try {
      // End immediately, drop queued outgoing messages
      await this.client.end(true);
    } catch (e) {
      // swallow disconnect errors
    } finally {
      this.client = null;
      this.isConnecting = false;
      this._boundOnMessage = null;
    }
  }

  async connect() {
    if (this.isConnecting) this.log(`already connecting`)
    if (this.isConnecting) return;
    this.isConnecting = true;

    // IMPORTANT: settings live on homey object, but accessed from the app context
    const mqtt = this.homey.settings.get('mqtt');

    if (!mqtt) {
      this.log('MQTT information not configured yet');
      this.isConnecting = false;
      this.homey.app.sendWarning('MQTT information not configured yet, please go to the app\'s settings to configure.');
      return;
    }

    const host = mqtt.host
    const port = mqtt.port;
    const useTls = !!mqtt.tls;
    const username = mqtt.user;
    const password = mqtt.pass;
    const prefix = 'espaltherma';
    // Validate
    if (!host) {
      this.log('MQTT not configured yet (mqtt_host missing)');
      this.isConnecting = false;
      return;
    }

    // Build URL
    const protocol = useTls ? 'mqtts' : 'mqtt';
    const url = `${protocol}://${host}:${port}`;

    this.log('Connecting MQTT:', url);

    try {
      this.client = await connectAsync(url, {
        clientId: `Homey-Daikin-Altherma`,
        username,
        password,
        reconnectPeriod: 5000,
        keepalive: 30,
        clean: true,
      });

      this.client.on('error', (err) => {
        this.homey.settings.set('mqttStatus', `error:${err.code || 'unknown'}`);
        this.homey.api.realtime('com.altherma.status', 'error');
        this.error('MQTT error', err);
      });

      this.client.on('reconnect', () => {
        this.homey.settings.set('mqttStatus', 'reconnecting');
        this.homey.api.realtime('com.altherma.status','reconnecting');
        this.log('MQTT reconnecting…');
      });

      this.client.on('close', () => {
        this.homey.settings.set('mqttStatus', 'disconnected');
        this.homey.api.realtime('com.altherma.status','disconnected');
        this.log('MQTT connection closed');
      });

      await this.client.subscribe(`${prefix}/#`);

      this._boundOnMessage = async (topic, payload) => {
        try {
          await this.onMessage(topic, payload.toString('utf8'));
        } catch (err) {
          this.error(err);
        }
      };
      this.client.on('message', this._boundOnMessage);

      this.homey.settings.set('mqttStatus', 'authenticated');
      this.log('MQTT connected and subscribed.');
    } catch (err) {
      // IMPORTANT: prevents crash on ENOTFOUND / ECONNREFUSED / etc.
      this.homey.settings.set('mqttStatus', `connect_failed:${err.code || 'unknown'}`);
      this.error('MQTT connect failed', err);
      this.client = null;
    } finally {
      this.isConnecting = false;
    }

    
  }
}

module.exports = { MqttManager };
