'use strict';

const Homey = require('homey');
const { estimatePowerWFromInvPrimaryWithFallback, integrateKwh } = require('../../lib/power');

module.exports = class Boiler extends Homey.Device {

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    this.log('Boiler has been initialized');

    this._onMqttData = this._processMqttData.bind(this);
    this.homey.app.on('sendMqttData', this._onMqttData);

    this._resetInterval = this.homey.setInterval(
      () => this.checkResets().catch(this.error),
      30 * 60 * 1000
    );    

    /*
    if (this.hasCapability('measure_power') === false) {
      await this.addCapability('measure_power');
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
    */

    this._prevTs = null;
    this._prevPowerW = 0;
    this._energyKwh = 0;
  }

  /**
   * onAdded is called when the user adds the device, called just after pairing.
   */
  async onAdded() {
    this.log('Boiler has been added');
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
    this.log('Boiler settings where changed');
  }

  /**
   * onRenamed is called when the user updates the device's name.
   * This method can be used this to synchronise the name to the device.
   * @param {string} name The new name
   */
  async onRenamed(name) {
    this.log('Boiler was renamed');
  }

  /**
   * onDeleted is called when the user deleted the device.
   */
  async onDeleted() {
    if (this._onMqttData) {
      this.homey.app.off('sendMqttData', this._onMqttData);
    }

    this.log('Boiler has been deleted');
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
    //this.log('Boiler device received:',data);
    try {
      await this.setCapabilityValue('measure_temperature.dhwtank', data.dhwTankTemp);
      await this.setCapabilityValue('measure_temperature.target_dhwtank', data.dhwSetpoint);
      await this.setCapabilityValue('powerful_dhwtank', data.powerfulDhwOn ? 'on' : 'off');

      // Code for estimated power and energy usage bast of of INV Primary Current
      const isDhwHeating = data.flowLpm > 0 && data.spaceHeatingOn === false;
      let powerW = 0;
      let deltaKWh = 0;
      if (isDhwHeating) {
        ({ powerW, deltaKWh } = this._updatePowerAndEnergy(data.invPrimaryCurrent,data.voltageL1,data.voltageL2,data.voltageL3));
        this.log('Boiler Heating seems active', powerW,'Watt,', deltaKWh,'ΔkWh')
      } else {
        // advance timestamp to avoid gaps
        this._updatePowerAndEnergy(0);
        this.log('Boiler Heating seems inactive')
      }

      await this.setCapabilityValue('measure_power', Math.round(powerW));

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
      return { powerW: 0, deltaKWh: 0 };
    }

    const dtSeconds = (now - this._prevTs) / 1000;

    const powerW = estimatePowerWFromInvPrimaryWithFallback(
      invPrimaryCurrent,
      voltageL1,
      voltageL2,
      voltageL3
    );

    const deltaKWh = integrateKwh(this._prevPowerW, powerW, dtSeconds);

    this._prevPowerW = powerW;
    this._prevTs = now;

    return { powerW, deltaKWh };
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