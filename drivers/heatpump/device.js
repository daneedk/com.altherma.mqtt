'use strict';

const Homey = require('homey');
const { estimatePowerWFromInvPrimaryWithFallback, integrateKwh, } = require('../../lib/power');

module.exports = class Heatpump extends Homey.Device {
  _deltaTBuffer = [];
  _thermalValid = false;
  _lastThermalPowerKW = 0;
  _lastCop = 0;

  async onInit() {
    this.log('Heat Pump has been initialized');

    this._onMqttData = this._processMqttData.bind(this);
    this.homey.app.on('sendMqttData', this._onMqttData);

    this._resetInterval = this.homey.setInterval(
      () => this.checkResets().catch(this.error),
      30 * 60 * 1000
    );

if (this.hasCapability('measure_power.guess') === true) {
  await this.removeCapability('measure_power.guess');
}

    this._prevTs = null;
    this._prevPowerW = 0;
    this._energyKwh = 0;
  }

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

  async onDeleted() {
    if (this._onMqttData) {
      this.homey.app.off('sendMqttData', this._onMqttData);
    }

    this.log('Heatpump has been deleted');
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
    //this.log('Heatpump device received:',data);
    try {
      
      let operationMode = data.IUoperationMode;
      if (data.invPrimaryCurrent === 0) {
        operationMode = 'fanonly';
      }
      await this.setCapabilityValue('operation_mode', operationMode);

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

      await this.checkResets();

      // Code for Smart Meter, when it's installed:
      /*
      await this.setCapabilityValue('measure_power', data.measurePower);
      const deltaKWh = data.pulseDelta / data.pulsePerKWh;
      */
      // Code for estimated power and energy usage bast of of INV Primary Current
      const isSpaceHeating = data.invPrimaryCurrent > 0 && data.threeWayValveDhw === false;

      //if (isSpaceHeating) {
        const electricalPowerW = estimatePowerWFromInvPrimaryWithFallback(data.invPrimaryCurrent, data.voltageL1, data.voltageL2, data.voltageL3);

        let buhPowerW = 0;
        if (data.buhStep1On) buhPowerW += this.homey.app.getBuhStep1W();
        if (data.buhStep2On) buhPowerW += this.homey.app.getBuhStep2W();

        const totalElectricalPowerW = electricalPowerW + buhPowerW;
        const { deltaKWh, first } = this._updatePowerAndEnergy(totalElectricalPowerW, data.receivedAt);
        const { thermalPowerKW, cop } = this._calculateThermalPowerAndCop(data, electricalPowerW);

        //this.log('Space Heating seems active', Math.round(totalElectricalPowerW), 'Watt', deltaKWh, 'ΔkWh');
      //} else {
      //  ({ deltaKWh, first } = this._updatePowerAndEnergy(0, data.receivedAt));
        //this.log('Space Heating is inactive');
      //}

      if (first) {
        console.log('Timestamp,OperationMode,IUoperationMode,Thermostat,threeWayValveDhw,Defrost,buhStep1On,buhStep2On,dhwSet,dhwTemp,lwSetpointMain,rtSetpoint,outdoorAirTemp,LeavingWaterTemp,InletWaterTemp,flow,invPrimaryCurrent,electricalPowerW,totalElectricalPowerW,thermalPowerKW,COP,deltaKWh');        
      }

      if (isSpaceHeating) {
        if (!first) {
          await this.setCapabilityValue('measure_power', Math.round(totalElectricalPowerW));
          await this.setCapabilityValue('measure_cop', Math.round(cop * 10) / 10);
        }

        await this.setCapabilityValue('meter_power.day', (this.getCapabilityValue('meter_power.day') || 0) + deltaKWh);
        await this.setCapabilityValue('meter_power.month', (this.getCapabilityValue('meter_power.month') || 0) + deltaKWh);
        await this.setCapabilityValue('meter_power.year', (this.getCapabilityValue('meter_power.year') || 0) + deltaKWh);
      } else {
        if (this.getCapabilityValue('measure_power') !== 0) await this.setCapabilityValue('measure_power', 0);
        if (this.getCapabilityValue('measure_cop') !== 0) await this.setCapabilityValue('measure_cop', 0);
      }

      console.log(new Date().toISOString()+','+
        data.operationMode + ',' +
        data.IUoperationMode + ',' +
        data.thermostatOn + ',' +
        data.threeWayValveDhw + ',' +
        data.defrostOperation + ',' +
        data.buhStep1On + ',' +
        data.buhStep2On + ',' +
        data.dhwSetpoint + ',' +   
        data.dhwTankTemp + ',' +
        data.lwSetpointMain + ',' +
        data.rtSetpoint + ',' +
        data.outdoorAirTemp + ',' +
        data.leavingWaterTempBeforeBUH + ',' +
        data.inletWaterTemp + ',' +
        data.flowLpm + ',' +
        data.invPrimaryCurrent + ',' +
        electricalPowerW + ',' +
        totalElectricalPowerW + ',' +
        thermalPowerKW + ',' +
        cop + ',' +
        deltaKWh
      );

    } catch (error) {
      const wrappedError = new Error('device.js _processMqttData error',{ cause: error });

      this.log(wrappedError);
      throw wrappedError;
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

  // helper
  _calculateThermalPowerAndCop(data, electricalPowerW) {
    let thermalPowerKW = 0;
    let cop = 0;

    const flowLpm = Number(data.flowLpm);
    const lwtBefore = Number(data.leavingWaterTempBeforeBUH);
    const inlet = Number(data.inletWaterTemp);
    const elecW = Number(electricalPowerW);

    // hysteresis thresholds
    const DT_ON  = 0.40;
    const DT_OFF = 0.20;

    const running = Number.isFinite(elecW) && elecW > 50;

    const inputsOk =
      running &&
      Number.isFinite(flowLpm) && flowLpm > 0 &&
      Number.isFinite(lwtBefore) &&
      Number.isFinite(inlet);

    if (!inputsOk) {
      this._thermalValid = false;
      return { thermalPowerKW: 0, cop: 0 };
    }

    const flowM3h = flowLpm * 0.06;
    const deltaT = lwtBefore - inlet;

    // update validity using hysteresis
    if (!this._thermalValid && deltaT >= DT_ON) this._thermalValid = true;
    if ( this._thermalValid && deltaT <= DT_OFF) this._thermalValid = false;

    if (this._thermalValid && Number.isFinite(deltaT) && deltaT > 0) {
      thermalPowerKW = 1.16 * flowM3h * deltaT;
      cop = thermalPowerKW / (elecW / 1000);

      this._lastThermalPowerKW = thermalPowerKW;
      this._lastCop = cop;
    } else {
      thermalPowerKW = 0;
      cop = 0;
    }

    return { thermalPowerKW, cop };
  }

  // helper
  _getSmoothedDeltaT(rawDeltaT) {
    const MAX_SAMPLES = 5; // ~2.3 minutes @ 28s

    if (typeof rawDeltaT !== 'number') return null;

    // allow negative deltaT, but clamp extreme nonsense
    const clampedDeltaT = Math.max(-30, Math.min(30, rawDeltaT));

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


// Old loging code:
      /*
      this.log('Data received', {
        OperationMode: data.operationMode,
        IUoperationMode: data.IUoperationMode,
        SpaceHeating: data.spaceHeatingOn,
        Thermostat: data.thermostatOn,
        threeWayValveDhw: data.threeWayValveDhw,
        Defrost: data.defrostOperation,
        buhStep1On: data.buhStep1On,
        buhStep2On: data.buhStep2On,
        dhwSet: data.dhwSetpoint,        
        dhwTemp: data.dhwTankTemp,
        lwSetpointMain: data.lwSetpointMain,
        rtSetpoint: data.rtSetpoint,
        outdoorAirTemp: data.outdoorAirTemp,        
        LeavingWaterTemp: data.leavingWaterTempBeforeBUH,
        InletWaterTemp: data.inletWaterTemp,
        flow: data.flowLpm,
        invPrimaryCurrent: data.invPrimaryCurrent,
        V1: data.voltageL1,
        V2: data.voltageL2,
        V3: data.voltageL3,        
        electricalPowerW,
        totalElectricalPowerW,
        thermalPowerKW,
        COP: cop,
        deltaKWh
      });
      */