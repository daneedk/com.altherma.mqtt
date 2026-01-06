'use strict';

const Homey = require('homey');

module.exports = class Boiler extends Homey.Device {

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    this.log('Boiler has been initialized');

    this._onMqttData = this._processMqttData.bind(this);
    this.homey.app.on('sendMqttData', this._onMqttData);
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

  async _processMqttData(data) {
    //this.log('Boiler device received:',data);
    try {
      await this.setCapabilityValue('measure_temperature.dhwtank', data.dhwTankTemp);
      await this.setCapabilityValue('measure_temperature.target_dhwtank', data.dhwSetpoint);
      await this.setCapabilityValue('powerful_dhwtank', data.powerfulDhwOn);

    } catch (error) {
      const wrappedError = new Error('device.js _processMqttData error',{ cause: error });

      this.log(wrappedError);
      throw wrappedError;
    } 
    
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