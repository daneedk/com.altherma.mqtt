# Daikin Altherma

Get all information from your Daikin Altherma.

The information is obtained over MQTT from an ESPAltherma device (see: https://github.com/daneedk/ESPAltherma which is a fork of: https://github.com/raomin/ESPAltherma)

```Important, everything is read only, it is and will not be possible to control your heat pump with this app!```

This app will expose 2 devices, a Heat Pump and a Domestic Home Water (DHW) device.

### Heat pump capabiltities
* Operation Mode Heating/Fan Only
* Thermostat On/Off
* Space Heating On/Off
* Outdoor temperature
* Leaving Water temperature
* Returning Water temperature
* ΔT (flow–return)
* Target temperature
* Water flow
* Power
* Energy Today
* Energy this Month
* Energy this Year

### DHW
* DHW tank temperature
* DHW tank target temperature
* Powerful mode On/Off
* Power
* Energy Today
* Energy this Month
* Energy this Year

The folowing information is needed from ESPAltherma, make sure to uncomment the corresponding line in the definition file for you particular device model

````
'Operation Mode': 'Heating',
'Thermostat ON/OFF': 'ON',
'R1T-Outdoor air temp.': -2.4,
'INV primary current (A)': 5.3,
'DHW setpoint': 45,
'LW setpoint (main)': 39.4,
'Leaving water temp. after BUH (R2T)': 42.4,
'Inlet water temp.(R4T)': 32,
'DHW tank temp. (R5T)': 55.5,
'Powerful DHW Operation. ON/OFF': 'OFF',
'Space heating Operation ON/OFF': 'ON',
'RT setpoint': 21,
'Main RT Heating': 'OFF',
'Flow sensor (l/min)': 15.5,
````

As the Daikin Althermas returns no good measurement for power consumption other then the used current at the DC part of the device the power and energy comsumption are calculated values based on assumptions, so keep that in mind. (The grid voltage is assumed to be 230v and the efficiency in converting AC to DC is assumed to be 90%)

In a future version, these readings will be made more accurate, but that will require additional hardware in the form of a smart meter that measures the actual usage of your heat pump, or making the actual grid voltage available over MQTT.




