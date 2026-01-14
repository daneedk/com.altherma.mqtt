'use strict';

const Homey = require('homey');
const { MqttManager } = require('./lib/mqtt');

// !!!! remove next lines before publishing !!!!
const LogToFile = require('homey-log-to-file'); // https://github.com/robertklep/homey-log-to-file
let prevWarning

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

    // get Actual voltages when configured in the app settings
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

    // set the mqtt connection, is in lib/mqtt.js
    await this.mqtt.connect();

    // flowcards
    this._triggerAppError = this.homey.flow.getTriggerCard('app_error_occurred');
    this._triggerAppError.registerRunListener();

    this._triggerAppWarning = this.homey.flow.getTriggerCard('app_warning_occurred');
    this._triggerAppWarning.registerRunListener();

    // catch all errors and send them to the log and flowcard
    const original = console.error;

    console.error = (...args) => {
        let errorText;

        errorText = args.map(arg => {
            if (arg instanceof Error) {
                return arg.stack || arg.toString();
            }
            return typeof arg === 'object' ? JSON.stringify(arg) : String(arg);
        }).join(' ');

        this.homey.app.writeLog(errorText);
        const tokens = { error: errorText };
        this._triggerAppError.trigger(tokens);

        original(...args);
    };

    // MQTT watchdog to inform user when no MQTT messages are received for ~ 3-5 minutes
    this._lastMqttMessageAt = Date.now();

    this._mqttWatchdog = setInterval(() => {
      const gapMs = Date.now() - this._lastMqttMessageAt;

      if (gapMs >= 3 * 60 * 1000) {
        const mins = Math.floor(gapMs / 60000);
        this.sendWarning("No MQTT data received for", `${mins} minutes`);
      } else {
        this.clearWarning();
      }
    }, 2 * 60 * 1000);

    // finished onInit()
    let logLine = "===============================================================================================";
    this.writeLog(logLine);
    logLine = "app.js || onInit || --------- " + `${Homey.manifest.id} ${Homey.manifest.version} started ---------`;
    this.writeLog(logLine);
    this.log('AlthermaMQTTApp has been initialized');
  }

  async onUninit() {
    // remove the MQTT watchdog
    if (this._mqttWatchdog) clearInterval(this._mqttWatchdog);
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
    this._lastMqttMessageAt = Date.now();

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
    const IUopModeRaw = (raw['I/U operation mode'] || '').toString().trim().toUpperCase();

    // send warning is a low battery is detected (at least for M5StickC)
    const v = parseFloat(raw?.M5BatV);
    if (Number.isFinite(v) && v < 5) {
      this.sendWarning("Voltage low warning", raw.M5BatV); // or v
    } else {
      this.clearWarning();
    }

    return {
      // operation / status
      operationMode:
        opModeRaw === 'FAN ONLY' ? 'fanonly' :
        opModeRaw === 'HEATING'  ? 'heating'  :
        null,

      IUoperationMode:
        IUopModeRaw === 'DHW'? 'dhw':
        IUopModeRaw === 'HEATING'? 'heating':
        IUopModeRaw === 'HEATING + DHW'? 'heatingdhw':
        null,

      thermostatOn: raw['Thermostat ON/OFF'] === 'ON',
      defrostOperation:  raw['Defrost Operation'] === 'ON',
      spaceHeatingOn: raw['Space heating Operation ON/OFF'] === 'ON',
      powerfulDhwOn: raw['Powerful DHW Operation. ON/OFF'] === 'ON',

      // errors
      errorType: raw['Error type'],
      errorCode: Number(raw['Error Code']?.trim()),

      // temperatures (°C)
      outdoorAirTemp: raw['R1T-Outdoor air temp.'],
      leavingWaterTempBeforeBUH: raw['Leaving water temp. before BUH (R1T)'],
      leavingWaterTemp: raw['Leaving water temp. after BUH (R2T)'],
      inletWaterTemp: raw['Inlet water temp.(R4T)'],
      dhwTankTemp: raw['DHW tank temp. (R5T)'],

      // power related information
      invPrimaryCurrent: raw['INV primary current (A)'],
      
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

      // 3 way valve DHW heating or Space heating
      threeWayValveDhw: raw['3way valve(On:DHW_Off:Space)'] === 'ON',

      // backup heater
      buhStep1On: raw['BUH Step1'] === 'ON',
      buhStep2On: raw['BUH Step2'] === 'ON',

      // flow
      flowLpm: raw['Flow sensor (l/min)'],

      // electrical
      measurePower: raw['Power Usage'],
      pulseDelta: raw['Pulse Delta'],
      pulsePerKWh: raw ['Pulses per kWh'],
      cop: raw.BE_COP,

      // system / diagnostics
      batteryVoltage: raw?.M5BatV,
      wifiRssi: raw.WifiRSSI,
      freeMem: raw.FreeMem,
    };
  }


  sendWarning(text, value) {
    if (text === this.prevWarning) return;

    const warningText = value == null || value === ""
      ? text
      : `${text} | ${value}`;

    const tokens = { warning: warningText };
    this._triggerAppWarning.trigger(tokens);
    this.prevWarning = text;
  }

  clearWarning() {
    this.prevWarning = null;
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