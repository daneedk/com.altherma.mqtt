'use strict';

const Homey = require('homey');
const { MqttManager } = require('./lib/mqtt');

module.exports = class AlthermaMQTTApp extends Homey.App {

  /**
   * onInit is called when the app is initialized.
   */
  async onInit() {
    this.log('AlthermaMQTTApp initializing');
    this.mqtt = new MqttManager({
      app: this,
      onMessage: this._handleMqttMessage.bind(this),
    });

    this.currentPowerW = null;

    this.isDebugEnabled = !!(await this.homey.settings.get('isDebugEnabled'));

    // On first run, inform user to go to the apps settings to configure the app.
    const warned = this.homey.settings.get('setup_notified');
    if (!warned) {
      await this.homey.notifications.createNotification({
        excerpt: this.homey.__('setup.notification'),
      });
      this.homey.settings.set('mqttStatus', 'notauthenticated');
      this.homey.settings.set('setup_notified', true);
    }

// todo Comment next line before publishing:    
// this.homey.settings.set('setup_notified', false);

    // Act when settings change
    this.homey.settings.on('set', (name) => this._onSetSettings(name));

    await this.mqtt.connect();

    let logLine = "===============================================================================================";
    this.writeLog(logLine);
    logLine = "app.js || onInit || --------- " + `${Homey.manifest.id} ${Homey.manifest.version} started ---------`;
    this.writeLog(logLine);
    this.log('AlthermaMQTTApp has been initialized');
  }

  _onSetSettings(name) {
    if (name== 'mqtt') {
      this.log('MQTT settings changed, reconnecting…');
      this.mqtt.reconnect().catch(this.error);
    }
    else if (name === 'isDebugEnabled') {
      const isDebugEnabled = this.homey.settings.get(name)
      this.isDebugEnabled = isDebugEnabled;
      if (!isDebugEnabled) {
        //this.homey.settings.set('mqttLog', '' );
      } else {
        let logLine = "===============================================================================================";
        this.writeLog(logLine);
        logLine = "app.js || _onSetSettings || --------- Debug logging is enabled from settings ------------------";
        this.writeLog(logLine);
      }
    }
  }

  async _handleMqttMessage(topic, msg) {
    if (topic === 'LWT' && msg !== 'Online') {
      this.log('LWT:', msg);
      this.writeLog('LWT:', msg);
    }
    if (topic !== 'espaltherma/ATTR') return;

    this.writeLog(msg);

    const raw = this._parseJson(msg);
    if (!raw || typeof raw !== 'object') return;

    const normalized = this._normalizeAttr(raw);
    this.emit('sendMqttData', normalized);
  }

  _parseJson(msg) {
    try {
      return JSON.parse(msg);
    } catch (e) {
      return null;
    }
  }

  _normalizeAttr(raw) {

    const onOff = v => (v === 'ON' ? 'on' : 'off');
    const opModeRaw = (raw['Operation Mode'] || '').toString().trim().toUpperCase();

    return {
      // operation / status
      operationMode:
        opModeRaw === 'FAN ONLY' ? 'fanonly' :
        opModeRaw === 'HEATING'  ? 'heating'  :
        null,

      thermostatOn: raw['Thermostat ON/OFF'] === 'ON',
      spaceHeatingOn: raw['Space heating Operation ON/OFF'] === 'ON',
      powerfulDhwOn: raw['Powerful DHW Operation. ON/OFF'] === 'ON',

      // errors
      errorType: raw['Error type'],
      errorCode: Number(raw['Error Code']?.trim()),

      // temperatures (°C)
      outdoorAirTemp: raw['R1T-Outdoor air temp.'],
      invPrimaryCurrent: raw['INV primary current (A)'],
      leavingWaterTemp: raw['Leaving water temp. after BUH (R2T)'],
      inletWaterTemp: raw['Inlet water temp.(R4T)'],
      dhwTankTemp: raw['DHW tank temp. (R5T)'],

      // room temperatures (°C)
      mainRtHeating:
        raw['Main RT Heating'] === 'OFF'
          ? null
          : Number(raw['Main RT Heating']),

      // setpoints (°C)
      dhwSetpoint: raw['DHW setpoint'],
      lwSetpointMain: raw['LW setpoint (main)'],

      // room setpoint (°C)
      rtSetpoint: Number(raw['RT setpoint']),

      // backup heater
      buhStep1On: onOff(raw['BUH Step1']),
      buhStep2On: onOff(raw['BUH Step2']),

      // flow
      flowLpm: raw['Flow sensor (l/min)'],

      // electrical
      measurePower: raw['Power Usage'],
      pulseDelta: raw['Pulse Delta'],
      pulsePerKWh: raw ['Pulses per kWh'],
      cop: raw.BE_COP,

      // system / diagnostics
      batteryVoltage: raw.M5BatV,
      wifiRssi: raw.WifiRSSI,
      freeMem: raw.FreeMem,
    };
  }

  // Called from device.js
  getCurrentPower() {
    return this.currentPowerW;
  }

  // Write information to the mqttlog and cleanup 20% when history above 2000 lines
  // - Called from multiple places
  async writeLog(logLine) {
      if (!this.isDebugEnabled) return;

      let savedHistory = this.homey.settings.get('mqttLog');
      if ( savedHistory != undefined ) {
          // cleanup history
          let lineCount = savedHistory.split(/\r\n|\r|\n/).length;
          if ( lineCount > 200 ) {
              let deleteItems = parseInt( lineCount * 0.2 );
              let savedHistoryArray = savedHistory.split(/\r\n|\r|\n/);
              let cleanUp = savedHistoryArray.splice(-1*deleteItems, deleteItems, "" );
              savedHistory = savedHistoryArray.join('\n');
          }
          // end cleanup
          logLine = this.getDateTime() + logLine + "\n" + savedHistory;
      } else {
          this.log("writeLog: savedHistory is undefined!")
      }
      this.homey.settings.set('mqttLog', logLine );

      logLine = "";
  }

  // Returns a date timestring including milliseconds to be used in loglines
  // - Called from writeLog()
  getDateTime() {
      let timezone = this.homey.clock.getTimezone()
      let date = new Date(new Date().toLocaleString("en-US", {timeZone: timezone}));
      let dateMsecs = new Date();

      let hour = date.getHours();
      hour = (hour < 10 ? "0" : "") + hour;
      let min  = date.getMinutes();
      min = (min < 10 ? "0" : "") + min;
      let sec  = date.getSeconds();
      sec = (sec < 10 ? "0" : "") + sec;
      let msec = ("00" + dateMsecs.getMilliseconds()).slice(-3)
      let year = date.getFullYear();
      let month = date.getMonth() + 1;
      month = (month < 10 ? "0" : "") + month;
      let day  = date.getDate();
      day = (day < 10 ? "0" : "") + day;
      return day + "-" + month + "-" + year + "  ||  " + hour + ":" + min + ":" + sec + "." + msec + "  ||  ";
  }

};
