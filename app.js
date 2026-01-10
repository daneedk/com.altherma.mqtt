'use strict';

const Homey = require('homey');
const { MqttManager } = require('./lib/mqtt');

// !!!! remove next lines before publishing !!!!
const LogToFile = require('homey-log-to-file'); // https://github.com/robertklep/homey-log-to-file

module.exports = class AlthermaMQTTApp extends Homey.App {

  /**
   * onInit is called when the app is initialized.
   */
  async onInit() {

  // !!!! remove next lines before publishing !!!!    
    await LogToFile();
    // log at: http://192.168.1.39:8008

    this.log('AlthermaMQTTApp initializing');
    this.mqtt = new MqttManager({
      app: this,
      onMessage: this._handleMqttMessage.bind(this),
    });

    this.currentPowerW = null;

    this._voltageL1 = 230;
    this._voltageL2 = 230;
    this._voltageL3 = 230;

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

    this.powerTopics = this.homey.settings.get('powerTopics');
    if (!this.powerTopics) {
      this.powerTopics = {
        voltage1: 'espaltherma/grid/voltage1',
        voltage2: 'espaltherma/grid/voltage2',
        voltage3: 'espaltherma/grid/voltage3',
      };
      this.homey.settings.set('powerTopics',this.powerTopics);
    }

    let isExternalVoltageEnabled = this.homey.settings.get('isExternalVoltageEnabled'); 
    if (!isExternalVoltageEnabled) {
      this.isExternalVoltageEnabled = false;
    } else {
      this.isExternalVoltageEnabled = true;
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
    if (name == 'mqtt') {
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
    else if (name === 'isExternalVoltageEnabled') {
      this.isExternalVoltageEnabled = this.homey.settings.get(name);
      let logLine = "Using external voltage is: " + this.isExternalVoltageEnabled;
      this.writeLog(logLine);
    }
    else if (name === 'powerTopics') {
      this.powerTopics = this.homey.settings.get(name);
    }
  }

  async _handleMqttMessage(topic, msg) {
    if (this.isExternalVoltageEnabled === true) {

      const v = Number(msg);

      if (v >= 207 && v <= 253) {
        if (topic === this.powerTopics.voltage1) this._voltageL1 = v;
        if (topic === this.powerTopics.voltage2) this._voltageL2 = v;
        if (topic === this.powerTopics.voltage3) this._voltageL3 = v;
      }

      if (
        topic === this.powerTopics.voltage1 ||
        topic === this.powerTopics.voltage2 ||
        topic === this.powerTopics.voltage3
      ) {
        return;
      }
    }

    if (topic === 'LWT' && msg !== 'Online') {
      this.log('LWT:', msg);
      this.writeLog('LWT:', msg);
    }
    if (topic !== 'espaltherma/ATTR') return;

    this.writeLog(msg);

    const raw = this._parseJson(msg);
    if (!raw || typeof raw !== 'object') return;

    if ( raw['Operation Mode'] != 'Fan Only' && raw['Operation Mode'] != 'Heating' ) {
      this.log('Operation Mode:',raw['Operation Mode'])
    }

    const normalized = this._normalizeAttr(raw);
    normalized.voltageL1 = this._voltageL1;
    normalized.voltageL2 = this._voltageL2;
    normalized.voltageL3 = this._voltageL3;
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