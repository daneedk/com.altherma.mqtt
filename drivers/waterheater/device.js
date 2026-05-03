'use strict';

const Homey = require('homey');
const { estimatePowerWFromInvPrimaryWithFallback, integrateKwh } = require('../../lib/power');

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

module.exports = class Waterheater extends Homey.Device {

  async onInit() {
    this.log('Water heater has been initialized');

    this._onMqttData = this._processMqttData.bind(this);
    this.homey.app.on('sendMqttData', this._onMqttData);

    this._resetInterval = this.homey.setInterval(
      () => this.checkResets().catch(this.error),
      30 * 60 * 1000
    );    

    this._prevTs = null;
    this._prevPowerW = 0;
    this._energyKwh = 0;

    // temporary code for getting the correct capabilities
    if (!this.hasCapability('target_temperature_dhw')) {
      await this.addCapability('target_temperature_dhw');
    }
    if (this.hasCapability('measure_temperature.target_dhwtank')) {
      await this.removeCapability('measure_temperature.target_dhwtank');
    }
    if (!this.hasCapability('meter_power')) {
      await this.addCapability('meter_power');
    }
    if (this.hasCapability('meter_power.day')) {
      await this.removeCapability('meter_power.day');
    }

    // Reorder the capabilties once
    const reorderDHWCapabilities = this.homey.settings.get('reorderDHWCapabilities');
    if (!reorderDHWCapabilities) {
      this.log ('- reordering capabilites Water Heater');
      await this.removeCapability("measure_temperature.dhwtank");
      await this.removeCapability("target_temperature_dhw");
      await this.removeCapability("powerful_dhwtank");
      await this.removeCapability("measure_power");
      await this.removeCapability("meter_power");
      await this.removeCapability("meter_power.month");
      await this.removeCapability("meter_power.year");

      delay(500)
      await this.addCapability("measure_temperature.dhwtank");
      delay(500)
      await this.addCapability("target_temperature_dhw");
      delay(500)
      await this.addCapability("powerful_dhwtank");
      delay(500)
      await this.addCapability("measure_power");
      delay(500)
      await this.addCapability("meter_power");
      delay(500)
      await this.addCapability("meter_power.month");
      delay(500)
      await this.addCapability("meter_power.year");

      this.homey.settings.set('reorderDHWCapabilities', true);
      this.log ('- reordering done');
    }
  }



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

    /*
    if (this.getStoreValue('lastDailyReset') !== day) {
      await this.setCapabilityValue('meter_power', 0);
      await this.setStoreValue('lastDailyReset', day);
    }
    */

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
1
      await this.setCapabilityValue('powerful_dhwtank', data.powerfulDhwOn ? 'on' : 'off');

      await this.checkResets();

      const isDhwHeating = data.invPrimaryCurrent > 0 && data.threeWayValveDhw === true;

      let electricalPowerW = 0;
      let buhPowerW = 0;
      let totalElectricalPowerW = 0;
      let deltaKWh = 0;
      let first = false;

      if (isDhwHeating) {
        electricalPowerW = estimatePowerWFromInvPrimaryWithFallback(data.invPrimaryCurrent, data.voltageL1, data.voltageL2, data.voltageL3);

        if (data.buhStep1On) buhPowerW += this.homey.app.getBuhStep1W();
        if (data.buhStep2On) buhPowerW += this.homey.app.getBuhStep2W();

        totalElectricalPowerW = electricalPowerW + buhPowerW;

        ({ deltaKWh, first } = this._updatePowerAndEnergy(totalElectricalPowerW, data.receivedAt));
        
        //this.log('DHW heating seems active', Math.round(totalElectricalPowerW), 'Watt', deltaKWh, 'ΔkWh');
      } else {
        ({ deltaKWh, first } = this._updatePowerAndEnergy(0, data.receivedAt));

      }

      if (!first) {
        await this.setCapabilityValue('measure_power', Math.round(totalElectricalPowerW));
      }

      await this.setCapabilityValue(
        'meter_power',
        (this.getCapabilityValue('meter_power') || 0) + deltaKWh
      );
      await this.setCapabilityValue(
        'meter_power.month',
        (this.getCapabilityValue('meter_power.month') || 0) + deltaKWh
      );
      await this.setCapabilityValue(
        'meter_power.year',
        (this.getCapabilityValue('meter_power.year') || 0) + deltaKWh
      );
    } catch (error) {
      this.error('device.js _processMqttData error', error)
      throw error;
    }
  }

  // helper
  _updatePowerAndEnergy(totalPowerW, ts) {
    const now = ts ?? Date.now();

    if (this._prevTs == null) {
      this._prevTs = now;
      this._prevPowerW = totalPowerW;
      return { deltaKWh: 0, first: true };
    }

    const dtSeconds = (now - this._prevTs) / 1000;

    if (dtSeconds <= 0) {
      this._prevTs = now;
      this._prevPowerW = totalPowerW;
      return { deltaKWh: 0, first: false };
    }

    const deltaKWh = integrateKwh(this._prevPowerW, totalPowerW, dtSeconds);

    this._prevPowerW = totalPowerW;
    this._prevTs = now;

    return { deltaKWh, first: false };
  }

  /*
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
  */

};