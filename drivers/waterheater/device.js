'use strict';

const Homey = require('homey');
const { estimatePowerWFromInvPrimaryWithFallback, integrateKwh } = require('../../lib/power');

// TODO: calibrate to actual installation, or add them to settings
const BUH_STEP1_W = 2000; // default assumption
const BUH_STEP2_W = 2000; // default assumption

module.exports = class Waterheater extends Homey.Device {

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    this.log('Water heater has been initialized');

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
    this.log('Water heater has been added');
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
    this.log('Water heater settings where changed');
  }

  /**
   * onRenamed is called when the user updates the device's name.
   * This method can be used this to synchronise the name to the device.
   * @param {string} name The new name
   */
  async onRenamed(name) {
    this.log('Water heater was renamed');
  }

  /**
   * onDeleted is called when the user deleted the device.
   */
  async onDeleted() {
    if (this._onMqttData) {
      this.homey.app.off('sendMqttData', this._onMqttData);
    }

    this.log('Water Heater has been deleted');
  }

  async checkResets() {
      const now = new Date();

      const tz = this.homey.clock.getTimezone();
      const day = now.toLocaleDateString('en-CA', { timeZone: tz });
      const month = day.slice(0, 7);
      const year = day.slice(0, 4);

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
    //this.log('Water heater device received:',data);
    try {
      await this.setCapabilityValue('measure_temperature.dhwtank', data.dhwTankTemp);
      await this.setCapabilityValue('measure_temperature.target_dhwtank', data.dhwSetpoint);
      await this.setCapabilityValue('powerful_dhwtank', data.powerfulDhwOn ? 'on' : 'off');

      // Code for estimated power and energy usage bast of of INV Primary Current
      // const isDhwHeating = data.flowLpm > 0 && data.spaceHeatingOn === false;
      // const isDhwHeating = data.spaceHeatingOn === false && data.invPrimaryCurrent > 0;
      const isDhwHeating = data.invPrimaryCurrent > 0 && data.threeWayValveDhw === true;

      // compressor electrical power
      const electricalPowerW =
        estimatePowerWFromInvPrimaryWithFallback( data.invPrimaryCurrent, data.voltageL1, data.voltageL2, data.voltageL3);

      // BUH power
      let buhPowerW = 0;
      if (data.buhStep1On) buhPowerW += BUH_STEP1_W;
      if (data.buhStep2On) buhPowerW += BUH_STEP2_W;

      // total electrical power (THIS must be integrated)
      const totalElectricalPowerW = electricalPowerW + buhPowerW;

      // always integrate (0 when inactive)
      const { deltaKWh, first } = this._updatePowerAndEnergy(totalElectricalPowerW);

      if (isDhwHeating) {
        //('Water Heater heating seems active', Math.round(totalElectricalPowerW), 'Watt,', deltaKWh, 'ΔkWh');
      } else {
        //this.log('Water Heater heating seems inactive');
      }

      if (!first) {
        await this.setCapabilityValue('measure_power', Math.round(totalElectricalPowerW));
      }


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
  _updatePowerAndEnergy(totalPowerW) {
    const now = Date.now();

    if (this._prevTs == null) {
      this._prevTs = now;
      this._prevPowerW = totalPowerW;
      return { deltaKWh: 0, first: true };
    }

    const dtSeconds = (now - this._prevTs) / 1000;
    const deltaKWh = integrateKwh(this._prevPowerW, totalPowerW, dtSeconds);

    this._prevPowerW = totalPowerW;
    this._prevTs = now;

    return { deltaKWh, first: false };
  }

};