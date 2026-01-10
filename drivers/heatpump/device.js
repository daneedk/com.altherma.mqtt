'use strict';

const Homey = require('homey');
const {estimatePowerWFromInvPrimary,estimatePowerWFromInvPrimaryWithFallback, integrateKwh, } = require('../../lib/power');


module.exports = class Heatpump extends Homey.Device {
  _deltaTBuffer = [];

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    this.log('Heatpump has been initialized');

    this._onMqttData = this._processMqttData.bind(this);
    this.homey.app.on('sendMqttData', this._onMqttData);

    this._resetInterval = this.homey.setInterval(
      () => this.checkResets().catch(this.error),
      30 * 60 * 1000
    );

if (this.hasCapability('measure_power.guess') === false) {
  await this.addCapability('measure_power.guess');
}

    if (this.hasCapability('meter_power.day') === false) {
      await this.addCapability('meter_power.day');
    }
    if (this.hasCapability('meter_power.month') === false) {
      await this.addCapability('meter_power.month');
    }
    if (this.hasCapability('meter_power.year') === false) {
      await this.addCapability('meter_power.year');
    }

    this._prevTs = null;
    this._prevPowerW = 0;
    this._energyKwh = 0;
  }

  /**
   * onAdded is called when the user adds the device, called just after pairing.
   */
  async onAdded() {
    this.log('Heatpump has been added');
  }

  /**
   * onSettings is called when the user updates the device's settings.
   * @param {object} event the onSettings event data
   * @param {object} event.oldSettings The old settings object
   * @param {object} event.newSettings The new settings object
   * @param {string[]} event.changedKeys An array of keys changed since the previous version
   * @returns {Promise<string|void>} return a custom message that will be displayed
   */
  async onSettings({ oldSettings, newSettings, changedKeys }) {
    this.log('Heatpump settings where changed');
  }

  /**
   * onRenamed is called when the user updates the device's name.
   * This method can be used this to synchronise the name to the device.
   * @param {string} name The new name
   */
  async onRenamed(name) {
    this.log('Heatpump was renamed');
  }

  /**
   * onDeleted is called when the user deleted the device.
   */
  async onDeleted() {
    if (this._onMqttData) {
      this.homey.app.off('sendMqttData', this._onMqttData);
    }

    this.log('Heatpump has been deleted');
  }

  async checkResets() {
    const now = new Date();

    const yyyy = String(now.getFullYear());
    const mm = String(now.getMonth() + 1).padStart(2, '0'); // local month (1-12)
    const dd = String(now.getDate()).padStart(2, '0');      // local day

    const day = `${yyyy}-${mm}-${dd}`;
    const month = `${yyyy}-${mm}`;
    const year = yyyy;

    if (this.getStoreValue('lastDailyReset') !== day) {
      await this.setCapabilityValue('meter_power.day', 0);
      await this.setStoreValue('lastDailyReset', day);
    }

    if (this.getStoreValue('lastMonthlyReset') !== month) {
      await this.setCapabilityValue('meter_power.month', 0);
      await this.setStoreValue('lastMonthlyReset', month);
    }

    if (this.getStoreValue('lastYearlyReset') !== year) {
      await this.setCapabilityValue('meter_power.year', 0);
      await this.setStoreValue('lastYearlyReset', year);
    }
  }

  async _processMqttData(data) {
    //this.log('Heatpump device received:',data);
    try {
      await this.setCapabilityValue('operation_mode', data.operationMode);
      await this.setCapabilityValue('thermostat_on_off',data.thermostatOn ? 'on' : 'off');
      await this.setCapabilityValue('space_heating',data.spaceHeatingOn ? 'on' : 'off');
      await this.setCapabilityValue('measure_temperature.outdoor', data.outdoorAirTemp);
      await this.setCapabilityValue('measure_temperature.leavingWater', data.leavingWaterTemp);
      await this.setCapabilityValue('measure_temperature.returningWater', data.inletWaterTemp);

      const leaving = data.leavingWaterTemp;
      const returning = data.inletWaterTemp;

      if (
        typeof leaving === 'number' &&
        typeof returning === 'number'
      ) {
        const rawDeltaT = leaving - returning;
        const smoothedDeltaT = this._getSmoothedDeltaT(rawDeltaT);
        if (smoothedDeltaT !== null) {
          await this.setCapabilityValue('measure_temperature.deltaT', smoothedDeltaT);
        }

      }

      await this.setCapabilityValue('measure_temperature.lwSetPoint', data.lwSetpointMain);      
      await this.setCapabilityValue('measure_temperature.target', data.rtSetpoint);
      await this.setCapabilityValue('measure_water', data.flowLpm);

      // Code for Smart Meter, when it's installed:
      /*
      await this.setCapabilityValue('measure_power', data.measurePower);
      const deltaKWh = data.pulseDelta / data.pulsePerKWh;
      */
      // Code for estimated power and energy usage bast of of INV Primary Current
      const isSpaceHeating = data.spaceHeatingOn === true && data.powerfulDhwOn === false && data.invPrimaryCurrent > 0;;

      let powerW = 0;
let powerG = 0; //power Guess, to compare power with a set voltage of 230V against a real voltage      
      let deltaKWh = 0;
      let first = false;
      if (isSpaceHeating) {
        //({ powerW, deltaKWh } = this._updatePowerAndEnergy(data.invPrimaryCurrent,data.voltageL1,data.voltageL2,data.voltageL3));
        //this.log('Space Heating seems active', powerW,'Watt', deltaKWh,'ΔkWh')
({ powerW, powerG, deltaKWh, first } = this._updatePowerAndEnergy(data.invPrimaryCurrent,data.voltageL1,data.voltageL2,data.voltageL3));
this.log('Space Heating active', Math.round(powerW), 'Watt,', Math.round(powerG), 'Watt,', deltaKWh, 'ΔkWh')
      } else {
        // still advance timestamp to avoid time gaps
        this._updatePowerAndEnergy(0);
        this.log('Space Heating is inactive')
      }

      this.log('Data received', {
        Mode: data.operationMode,
        Heating: data.spaceHeatingOn,
        Thermostat: data.thermostatOn,
        I: data.invPrimaryCurrent,
        V1: data.voltageL1,
        V2: data.voltageL2,
        V3: data.voltageL3,
        dhwTemp: data.dhwTankTemp,
        dhwSet: data.dhwSetpoint,
        flow: data.flowLpm,
        powerW,
        deltaKWh,
      });

      if (!first) {
        await this.setCapabilityValue('measure_power', Math.round(powerW));
await this.setCapabilityValue('measure_power.guess', Math.round(powerG));
      }
      // Common code
      await this.checkResets();
      await this.setCapabilityValue('meter_power.day', (this.getCapabilityValue('meter_power.day') || 0) + deltaKWh);
      await this.setCapabilityValue('meter_power.month', (this.getCapabilityValue('meter_power.month') || 0) + deltaKWh);
      await this.setCapabilityValue('meter_power.year', (this.getCapabilityValue('meter_power.year') || 0) + deltaKWh);

    } catch (error) {
      const wrappedError = new Error('device.js _processMqttData error',{ cause: error });

      this.log(wrappedError);
      throw wrappedError;
    } 
    
  }

  // helper
  _updatePowerAndEnergy(invPrimaryCurrent, voltageL1, voltageL2, voltageL3) {
    const now = Date.now();

    if (this._prevTs == null) {
      this._prevTs = now;
      this._prevPowerW = 0;
      return { powerW: 0, deltaKWh: 0, first: true };
    }

    const dtSeconds = (now - this._prevTs) / 1000;

    const powerW = estimatePowerWFromInvPrimaryWithFallback(
      invPrimaryCurrent,
      voltageL1,
      voltageL2,
      voltageL3
    );

const powerG = estimatePowerWFromInvPrimary(invPrimaryCurrent);

    const deltaKWh = integrateKwh(this._prevPowerW, powerW, dtSeconds);

    this._prevPowerW = powerW;
    this._prevTs = now;

    //return { powerW, deltaKWh };
return { powerW, powerG, deltaKWh, first: false };
  }

  // helper
  _getSmoothedDeltaT(rawDeltaT) {
    const MAX_SAMPLES = 5; // ~2.3 minutes @ 28s

    // filter / clamp invalid values
    if (typeof rawDeltaT !== 'number') return null;

    const clampedDeltaT = Math.max(0, rawDeltaT);

    this._deltaTBuffer.push(clampedDeltaT);
    if (this._deltaTBuffer.length > MAX_SAMPLES) {
      this._deltaTBuffer.shift();
    }

    const avg =
      this._deltaTBuffer.reduce((sum, v) => sum + v, 0) /
      this._deltaTBuffer.length;

    return Math.round(avg * 10) / 10; // 1 decimal
  }

};